import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, matchesGlob, relative, resolve, sep } from "node:path";

import glob from "fast-glob";
import { po, type GetTextTranslations } from "gettext-parser";
import { z } from "zod";

import type { LaneFinding } from "../core/report.js";
import type { GateLane, LaneContext, LaneResult, TriggerContext } from "../core/types.js";
import { compareIcuMessages, inspectIcuMessage, type IcuInspection } from "./i18n-icu.js";

export interface I18nLaneOptions {
  readonly format?: "po" | "json";
  readonly catalogGlob?: string;
  readonly sourceLocale?: string;
  readonly allowlistPath?: string;
}

interface ResolvedI18nOptions {
  readonly format: "po" | "json";
  readonly catalogGlob: string;
  readonly sourceLocale: string;
  readonly allowlistPath: string;
}

interface CatalogMessage {
  readonly file: string;
  readonly id: string;
  readonly context: string;
  readonly forms: readonly string[];
  readonly pluralId: string | undefined;
}

interface LoadedCatalog {
  readonly file: string;
  readonly locale: string;
  readonly messages: ReadonlyMap<string, CatalogMessage>;
  readonly pluralFormCount: number | undefined;
}

type JsonCatalogValue = string | { readonly [key: string]: JsonCatalogValue };

interface AllowlistEntry {
  readonly locale: string;
  readonly id: string;
  readonly context: string;
  readonly reason: string;
}

interface LoadedAllowlist {
  readonly entries: ReadonlyMap<string, AllowlistEntry>;
  readonly findings: readonly LaneFinding[];
}

type AllowlistPayload = z.infer<typeof allowlistSchema>;

const DEFAULT_OPTIONS: ResolvedI18nOptions = {
  format: "po",
  catalogGlob: "apps/web/src/locales/*/messages.po",
  sourceLocale: "en",
  allowlistPath: "gates/i18n-allowlist.json",
};

const jsonCatalogValueSchema: z.ZodType<JsonCatalogValue> = z.lazy(() =>
  z.union([z.string(), z.record(z.string(), jsonCatalogValueSchema)]),
);
const jsonCatalogSchema = z.record(z.string(), jsonCatalogValueSchema);

const allowlistSchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z.array(
      z
        .object({
          locale: z.string().trim().min(1),
          id: z.string().trim().min(1),
          context: z.string().optional(),
          reason: z.string().trim().min(1),
        })
        .strict(),
    ),
  })
  .strict();

const arabicCardinalCategories = ["zero", "one", "two", "few", "many", "other"] as const;
const arabicOrdinalCategories = new Intl.PluralRules("ar", { type: "ordinal" }).resolvedOptions()
  .pluralCategories;

function finding(file: string, rule: string, message: string): LaneFinding {
  return { file, rule, message };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function messageKey(locale: string, id: string, context: string): string {
  return JSON.stringify([locale, context, id]);
}

function isArabicLocale(locale: string): boolean {
  const normalized = locale.toLowerCase();
  return normalized === "ar" || normalized.startsWith("ar-") || normalized.startsWith("ar_");
}

function catalogMessageKey(message: Pick<CatalogMessage, "context" | "id">): string {
  return `${message.context}\u0004${message.id}`;
}

function catalogMessages(
  catalog: GetTextTranslations,
  file: string,
): ReadonlyMap<string, CatalogMessage> {
  const messages = new Map<string, CatalogMessage>();
  for (const entries of Object.values(catalog.translations)) {
    for (const translation of Object.values(entries)) {
      if (translation.msgid.length === 0 || translation.obsolete === true) {
        continue;
      }
      const message: CatalogMessage = {
        file,
        id: translation.msgid,
        context: translation.msgctxt ?? "",
        forms: translation.msgstr,
        pluralId: translation.msgid_plural,
      };
      messages.set(catalogMessageKey(message), message);
    }
  }
  return messages;
}

function flattenJsonCatalog(
  file: string,
  value: JsonCatalogValue,
  prefix = "",
  messages = new Map<string, CatalogMessage>(),
): ReadonlyMap<string, CatalogMessage> {
  if (typeof value === "string") {
    throw new Error(`JSON catalog root and namespaces must be objects in ${file}.`);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.trim().length === 0) {
      throw new Error(`JSON catalog message keys must be non-empty in ${file}.`);
    }
    const id = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (typeof child === "string") {
      const message: CatalogMessage = {
        file,
        id,
        context: "",
        forms: [child],
        pluralId: undefined,
      };
      const messageMapKey = catalogMessageKey(message);
      if (messages.has(messageMapKey)) {
        throw new Error(`JSON catalog has duplicate flattened message key ${id} in ${file}.`);
      }
      messages.set(messageMapKey, message);
    } else {
      flattenJsonCatalog(file, child, id, messages);
    }
  }
  return messages;
}

function gettextPluralFormCount(catalog: GetTextTranslations): number | undefined {
  const value = catalog.headers["Plural-Forms"];
  const match = value === undefined ? undefined : /\bnplurals\s*=\s*(\d+)/u.exec(value);
  if (match === undefined || match === null) {
    return undefined;
  }
  const count = Number(match[1]);
  return Number.isSafeInteger(count) && count > 0 ? count : undefined;
}

async function loadCatalog(
  repoRoot: string,
  file: string,
  format: ResolvedI18nOptions["format"],
): Promise<LoadedCatalog | LaneFinding> {
  const locale = basename(dirname(file));
  try {
    const source = await readFile(resolve(repoRoot, file), "utf8");
    if (format === "po") {
      const catalog = po.parse(source, { validation: true });
      return {
        file,
        locale,
        messages: catalogMessages(catalog, file),
        pluralFormCount: gettextPluralFormCount(catalog),
      };
    }
    const decoded: unknown = JSON.parse(source);
    const parsed = jsonCatalogSchema.safeParse(decoded);
    if (!parsed.success) {
      throw new Error(
        `JSON catalog must contain nested objects and string messages: ${parsed.error.message}`,
      );
    }
    return {
      file,
      locale,
      messages: flattenJsonCatalog(file, parsed.data),
      pluralFormCount: undefined,
    };
  } catch (error: unknown) {
    return finding(file, "i18n-catalog-parse", `Could not parse ${file}: ${errorMessage(error)}`);
  }
}

function allowlistFailure(file: string, rule: string, message: string): LoadedAllowlist {
  return { entries: new Map(), findings: [finding(file, rule, message)] };
}

function buildAllowlist(
  file: string,
  records: readonly AllowlistPayload["entries"][number][],
): LoadedAllowlist {
  const entries = new Map<string, AllowlistEntry>();
  const findings: LaneFinding[] = [];
  for (const entry of records) {
    const normalized: AllowlistEntry = {
      locale: entry.locale,
      id: entry.id,
      context: entry.context ?? "",
      reason: entry.reason,
    };
    const key = messageKey(normalized.locale, normalized.id, normalized.context);
    if (entries.has(key)) {
      findings.push(
        finding(
          file,
          "i18n-allowlist-duplicate",
          `Duplicate allowlist entry for ${normalized.locale}:${normalized.id}.`,
        ),
      );
      continue;
    }
    entries.set(key, normalized);
  }
  return { entries, findings };
}

function parseAllowlist(file: string, source: string): LoadedAllowlist {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch (error: unknown) {
    return allowlistFailure(
      file,
      "i18n-allowlist-parse",
      `Could not parse the i18n allowlist: ${errorMessage(error)}`,
    );
  }
  const parsed = allowlistSchema.safeParse(decoded);
  if (!parsed.success) {
    return allowlistFailure(
      file,
      "i18n-allowlist-shape",
      `The i18n allowlist is invalid: ${parsed.error.message}`,
    );
  }
  return buildAllowlist(file, parsed.data.entries);
}

async function loadAllowlist(repoRoot: string, file: string): Promise<LoadedAllowlist> {
  const absolutePath = resolve(repoRoot, file);
  const relativePath = relative(repoRoot, absolutePath);
  if (isAbsolute(relativePath) || relativePath.split(sep)[0] === "..") {
    return allowlistFailure(
      file,
      "i18n-allowlist-path",
      "The allowlist path must stay inside the project root.",
    );
  }
  try {
    const source = await readFile(absolutePath, "utf8");
    return parseAllowlist(file, source);
  } catch (error: unknown) {
    return allowlistFailure(
      file,
      "i18n-allowlist-read",
      `Could not read the i18n allowlist: ${errorMessage(error)}`,
    );
  }
}

function normalizedMessage(message: string): string {
  return message.replace(/\s+/gu, " ").trim();
}

function displayId(message: CatalogMessage): string {
  return message.context.length === 0 ? message.id : `${message.context} / ${message.id}`;
}

function sourceTextFor(targetIndex: number, source: CatalogMessage): string | undefined {
  return source.forms[targetIndex] ?? source.forms[0];
}

interface TranslationCheck {
  readonly file: string;
  readonly locale: string;
  readonly source: CatalogMessage;
  readonly target: CatalogMessage;
  readonly allowed: AllowlistEntry | undefined;
  readonly usedAllowlist: Set<string>;
  readonly allowlistKey: string;
  readonly sourceFile: string;
  readonly findings: LaneFinding[];
}

function translationForms(target: CatalogMessage): readonly string[] {
  return target.forms.length === 0 ? [""] : target.forms;
}

function sourceHasEnglishText(source: CatalogMessage): boolean {
  return source.forms.length > 0 && source.forms.some((text) => text.trim().length > 0);
}

function untranslatedForms(
  source: CatalogMessage,
  translations: readonly string[],
): readonly string[] {
  const invalidText: string[] = [];
  for (const [index, text] of translations.entries()) {
    if (text.trim().length === 0) {
      invalidText.push(`translation form ${index + 1} is empty`);
      continue;
    }
    const sourceText = sourceTextFor(index, source);
    if (sourceText !== undefined && normalizedMessage(text) === normalizedMessage(sourceText)) {
      invalidText.push(`translation form ${index + 1} is identical to the English source`);
    }
  }
  return invalidText;
}

function reportUntranslatedForms(
  check: TranslationCheck,
  id: string,
  invalidText: readonly string[],
): void {
  if (invalidText.length === 0) {
    return;
  }
  if (check.allowed === undefined) {
    check.findings.push(
      finding(
        check.file,
        "i18n-untranslated",
        `${id} in ${check.locale}: ${invalidText.join("; ")}.`,
      ),
    );
  } else {
    check.usedAllowlist.add(check.allowlistKey);
  }
}

function sourceIcuInspection(
  check: TranslationCheck,
  id: string,
  sourceText: string,
): IcuInspection | undefined {
  try {
    return inspectIcuMessage(sourceText);
  } catch (error: unknown) {
    check.findings.push(
      finding(
        check.sourceFile,
        "i18n-icu-source",
        `${id}: invalid English ICU message: ${errorMessage(error)}`,
      ),
    );
    return undefined;
  }
}

function targetIcuInspection(
  check: TranslationCheck,
  id: string,
  text: string,
): IcuInspection | undefined {
  try {
    return inspectIcuMessage(text);
  } catch (error: unknown) {
    check.findings.push(
      finding(
        check.file,
        "i18n-icu-translation",
        `${id} in ${check.locale}: invalid ICU message: ${errorMessage(error)}`,
      ),
    );
    return undefined;
  }
}

function checkArabicIcuCategories(
  check: TranslationCheck,
  id: string,
  targetIcu: IcuInspection,
): void {
  if (!isArabicLocale(check.locale)) {
    return;
  }
  for (const plural of targetIcu.plurals) {
    const required = plural.kind === "plural" ? arabicCardinalCategories : arabicOrdinalCategories;
    const missing = required.filter((category) => !plural.categories.includes(category));
    if (missing.length > 0) {
      check.findings.push(
        finding(
          check.file,
          "i18n-arabic-plurals",
          `${id} in ${check.locale} is missing Arabic ${plural.kind} categories: ${missing.join(", ")}.`,
        ),
      );
    }
  }
}

function checkArabicGettextForms(
  check: TranslationCheck,
  id: string,
  translations: readonly string[],
): void {
  const hasPluralMessage =
    check.source.pluralId !== undefined || check.target.pluralId !== undefined;
  if (!isArabicLocale(check.locale) || !hasPluralMessage) {
    return;
  }
  if (translations.length !== arabicCardinalCategories.length) {
    check.findings.push(
      finding(
        check.file,
        "i18n-arabic-plurals",
        `${id} in ${check.locale} has ${translations.length} gettext forms; Arabic requires ${arabicCardinalCategories.length}.`,
      ),
    );
  }
}

function compareIcuForm(
  check: TranslationCheck,
  id: string,
  sourceText: string,
  targetText: string,
): void {
  const sourceIcu = sourceIcuInspection(check, id, sourceText);
  if (sourceIcu === undefined) {
    return;
  }
  const targetIcu = targetIcuInspection(check, id, targetText);
  if (targetIcu === undefined) {
    return;
  }
  const mismatch = compareIcuMessages(sourceIcu, targetIcu);
  if (mismatch !== undefined) {
    check.findings.push(
      finding(check.file, "i18n-icu-arguments", `${id} in ${check.locale}: ${mismatch}.`),
    );
  }
  checkArabicIcuCategories(check, id, targetIcu);
}

function compareTranslations(check: TranslationCheck): void {
  const { source, target } = check;
  const id = displayId(target);
  const translations = translationForms(target);
  if (!sourceHasEnglishText(source)) {
    check.findings.push(
      finding(source.file, "i18n-source-empty", `Source message ${id} has no English text.`),
    );
    return;
  }
  reportUntranslatedForms(check, id, untranslatedForms(source, translations));
  for (const [index, text] of translations.entries()) {
    if (text.trim().length === 0) {
      continue;
    }
    const sourceText = sourceTextFor(index, source);
    if (sourceText !== undefined && sourceText.trim().length > 0) {
      compareIcuForm(check, id, sourceText, text);
    }
  }
  checkArabicGettextForms(check, id, translations);
}

interface TargetCatalogCheck {
  readonly sourceCatalog: LoadedCatalog;
  readonly targetCatalog: LoadedCatalog;
  readonly sourceLocale: string;
  readonly locale: string;
  allowlist: ReadonlyMap<string, AllowlistEntry>;
  readonly usedAllowlist: Set<string>;
  readonly findings: LaneFinding[];
}

function checkSourceTranslations(check: TargetCatalogCheck): void {
  for (const [key, source] of check.sourceCatalog.messages) {
    const target = check.targetCatalog.messages.get(key);
    if (target === undefined) {
      check.findings.push(
        finding(
          check.targetCatalog.file,
          "i18n-catalog-parity",
          `${displayId(source)} is missing from ${check.locale}.`,
        ),
      );
      continue;
    }
    const allowlistKey = messageKey(check.locale, source.id, source.context);
    compareTranslations({
      file: target.file,
      locale: check.locale,
      source,
      target,
      allowed: check.allowlist.get(allowlistKey),
      usedAllowlist: check.usedAllowlist,
      allowlistKey,
      sourceFile: source.file,
      findings: check.findings,
    });
  }
}

function checkExtraTargetMessages(check: TargetCatalogCheck): void {
  for (const target of check.targetCatalog.messages.values()) {
    if (!check.sourceCatalog.messages.has(catalogMessageKey(target))) {
      check.findings.push(
        finding(
          target.file,
          "i18n-catalog-parity",
          `${displayId(target)} has no matching ${check.sourceLocale} source message.`,
        ),
      );
    }
  }
}

function checkArabicPluralHeader(check: TargetCatalogCheck, target: CatalogMessage): void {
  if (target.pluralId === undefined || !isArabicLocale(check.locale)) {
    return;
  }
  const source = check.sourceCatalog.messages.get(catalogMessageKey(target));
  if (source?.pluralId === undefined) {
    return;
  }
  if (check.targetCatalog.pluralFormCount === arabicCardinalCategories.length) {
    return;
  }
  check.findings.push(
    finding(
      target.file,
      "i18n-arabic-plurals",
      `${displayId(target)} in ${check.locale} must declare ${arabicCardinalCategories.length} Arabic gettext plural forms in its Plural-Forms header.`,
    ),
  );
}

function checkTargetCatalog(check: TargetCatalogCheck): void {
  checkSourceTranslations(check);
  checkExtraTargetMessages(check);
  for (const target of check.targetCatalog.messages.values()) {
    checkArabicPluralHeader(check, target);
  }
}

function reportStaleAllowlist(
  allowlist: ReadonlyMap<string, AllowlistEntry>,
  usedAllowlist: ReadonlySet<string>,
  allowlistPath: string,
  findings: LaneFinding[],
): void {
  for (const [key, entry] of allowlist) {
    if (!usedAllowlist.has(key)) {
      findings.push(
        finding(
          allowlistPath,
          "i18n-allowlist-stale",
          `Allowlisted ${entry.locale}:${entry.id} did not match an empty or identical translation; remove the unused exception (${entry.reason}).`,
        ),
      );
    }
  }
}

function checkCatalogs(
  catalogs: ReadonlyMap<string, LoadedCatalog>,
  sourceLocale: string,
  allowlist: ReadonlyMap<string, AllowlistEntry>,
  allowlistPath: string,
  findings: LaneFinding[],
): void {
  const sourceCatalog = catalogs.get(sourceLocale);
  if (sourceCatalog === undefined) {
    findings.push(
      finding(
        "i18n",
        "i18n-source-locale",
        `No catalog was found for source locale ${sourceLocale}.`,
      ),
    );
    return;
  }
  if (sourceCatalog.messages.size === 0) {
    findings.push(
      finding(sourceCatalog.file, "i18n-source-empty", "The source catalog contains no messages."),
    );
  }

  const targetLocales = [...catalogs.keys()].filter((locale) => locale !== sourceLocale).toSorted();
  if (targetLocales.length === 0) {
    findings.push(
      finding(
        sourceCatalog.file,
        "i18n-no-target-locale",
        "No non-source locale catalog was found.",
      ),
    );
  }

  const usedAllowlist = new Set<string>();
  for (const locale of targetLocales) {
    const targetCatalog = catalogs.get(locale);
    if (targetCatalog !== undefined) {
      checkTargetCatalog({
        sourceCatalog,
        targetCatalog,
        sourceLocale,
        locale,
        allowlist,
        usedAllowlist,
        findings,
      });
    }
  }
  reportStaleAllowlist(allowlist, usedAllowlist, allowlistPath, findings);
}

type CatalogPathResult =
  | { readonly kind: "ready"; readonly files: readonly string[] }
  | { readonly kind: "failed"; readonly result: LaneResult };

async function catalogPaths(
  repoRoot: string,
  pattern: string,
  format: ResolvedI18nOptions["format"],
): Promise<CatalogPathResult> {
  let files: string[];
  try {
    files = await glob(pattern, {
      cwd: repoRoot,
      dot: true,
      onlyFiles: true,
      unique: true,
    });
  } catch (error: unknown) {
    return {
      kind: "failed",
      result: {
        status: "failed",
        findings: [
          finding(
            pattern,
            "i18n-catalog-glob",
            `Could not expand catalog glob: ${errorMessage(error)}`,
          ),
        ],
        metrics: { filesChecked: 0 },
      },
    };
  }
  if (files.length === 0) {
    return {
      kind: "failed",
      result: {
        status: "failed",
        findings: [
          finding(
            pattern,
            "i18n-catalog-missing",
            `No ${format.toUpperCase()} catalogs matched ${pattern}.`,
          ),
        ],
        metrics: { filesChecked: 0 },
      },
    };
  }
  return { kind: "ready", files: files.toSorted() };
}

function catalogMap(
  loadedCatalogs: readonly (LoadedCatalog | LaneFinding)[],
  format: ResolvedI18nOptions["format"],
  findings: LaneFinding[],
): Map<string, LoadedCatalog> {
  const catalogs = new Map<string, LoadedCatalog>();
  for (const loaded of loadedCatalogs) {
    if (!("locale" in loaded)) {
      findings.push(loaded);
      continue;
    }
    const existing = catalogs.get(loaded.locale);
    if (existing !== undefined && format === "po") {
      findings.push(
        finding(
          loaded.file,
          "i18n-catalog-duplicate-locale",
          `More than one PO catalog matched locale ${loaded.locale}.`,
        ),
      );
      continue;
    }
    if (existing === undefined) {
      catalogs.set(loaded.locale, loaded);
      continue;
    }
    const messages = new Map(existing.messages);
    for (const [key, message] of loaded.messages) {
      if (messages.has(key)) {
        findings.push(
          finding(
            message.file,
            "i18n-catalog-duplicate-message",
            `More than one JSON catalog defines ${displayId(message)} for locale ${loaded.locale}.`,
          ),
        );
        continue;
      }
      messages.set(key, message);
    }
    catalogs.set(loaded.locale, {
      ...existing,
      messages,
    });
  }
  return catalogs;
}

async function runI18n(context: LaneContext, options: ResolvedI18nOptions): Promise<LaneResult> {
  const pathResult = await catalogPaths(context.repoRoot, options.catalogGlob, options.format);
  if (pathResult.kind === "failed") {
    return pathResult.result;
  }
  const [loadedCatalogs, allowlist] = await Promise.all([
    Promise.all(
      pathResult.files.map((file) => loadCatalog(context.repoRoot, file, options.format)),
    ),
    loadAllowlist(context.repoRoot, options.allowlistPath),
  ]);
  const findings: LaneFinding[] = [...allowlist.findings];
  const catalogs = catalogMap(loadedCatalogs, options.format, findings);
  checkCatalogs(catalogs, options.sourceLocale, allowlist.entries, options.allowlistPath, findings);
  return {
    status: findings.length === 0 ? "passed" : "failed",
    metrics: { filesChecked: pathResult.files.length },
    ...(findings.length === 0 ? {} : { findings }),
  };
}

function i18nTrigger(context: TriggerContext, catalogGlob: string): boolean | string {
  if (context.scope === "full") {
    return "always required";
  }
  const relevant = context.changedFiles.filter(
    (file) => matchesGlob(file, catalogGlob) || /\.(?:[cm]?[jt]sx?)$/u.test(file),
  );
  if (relevant.length === 0) {
    return false;
  }
  return `${relevant.length} i18n catalog or source ${relevant.length === 1 ? "file" : "files"} changed`;
}

export function i18n(options: I18nLaneOptions = {}): GateLane {
  const resolved: ResolvedI18nOptions = {
    format: options.format ?? DEFAULT_OPTIONS.format,
    catalogGlob: options.catalogGlob ?? DEFAULT_OPTIONS.catalogGlob,
    sourceLocale: options.sourceLocale ?? DEFAULT_OPTIONS.sourceLocale,
    allowlistPath: options.allowlistPath ?? DEFAULT_OPTIONS.allowlistPath,
  };
  return {
    id: "i18n",
    title: "Internationalization catalogs",
    triggers: (context) => i18nTrigger(context, resolved.catalogGlob),
    run: (context) => runI18n(context, resolved),
  };
}
