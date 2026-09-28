import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type {
  Classification,
  LaneContext,
  LaneResult,
  TriggerContext,
} from "../../src/core/types.js";
import { i18n } from "../../src/lanes/i18n.js";

const fixturesRoot = fileURLToPath(new URL("../fixtures/i18n", import.meta.url));
const templateRoot = fileURLToPath(new URL("../../../../templates/base", import.meta.url));

const emptyClassification: Classification = {
  changedFiles: [],
  categories: [],
  unclassifiedFiles: [],
  docsOnly: false,
  fullRequired: false,
};

type JsonCatalogValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonCatalogValue[]
  | { readonly [key: string]: JsonCatalogValue };
type JsonCatalog = { readonly [key: string]: JsonCatalogValue };

interface AllowlistRecord {
  readonly locale: string;
  readonly id: string;
  readonly context?: string;
  readonly reason: string;
}

async function runFixture(
  scenario: string,
  entries: readonly AllowlistRecord[] = [],
): Promise<LaneResult> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "q9gate-i18n-"));
  const repoRoot = join(temporaryRoot, "repo");
  try {
    await cp(resolve(fixturesRoot, scenario), repoRoot, { recursive: true });
    await mkdir(join(repoRoot, "gates"), { recursive: true });
    await writeFile(
      join(repoRoot, "gates/i18n-allowlist.json"),
      `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`,
    );
    const context: LaneContext = {
      classification: emptyClassification,
      changedFiles: [],
      allChangedFiles: [],
      scope: "full",
      repoRoot,
      target: undefined,
      exec: async (command) => ({
        command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        failed: false,
      }),
    };
    return await i18n().run(context);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function runJsonFixture(
  sourceCatalogs: readonly JsonCatalog[],
  targetCatalogs: readonly JsonCatalog[],
): Promise<LaneResult> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "q9gate-i18n-json-"));
  const repoRoot = join(temporaryRoot, "repo");
  const catalogGlob = "apps/web/src/locales/*/*.json";
  try {
    await Promise.all(
      (
        [
          ["en", sourceCatalogs],
          ["ar", targetCatalogs],
        ] as const
      ).map(async ([locale, catalogs]) => {
        const localeRoot = join(repoRoot, "apps/web/src/locales", locale);
        await mkdir(localeRoot, { recursive: true });
        await Promise.all(
          catalogs.map((catalog, index) =>
            writeFile(join(localeRoot, `catalog-${index}.json`), `${JSON.stringify(catalog)}\n`),
          ),
        );
      }),
    );
    await mkdir(join(repoRoot, "gates"), { recursive: true });
    await writeFile(
      join(repoRoot, "gates/i18n-allowlist.json"),
      '{"schemaVersion":1,"entries":[]}\n',
    );
    const context: LaneContext = {
      classification: emptyClassification,
      changedFiles: [],
      allChangedFiles: [],
      target: undefined,
      scope: "full",
      repoRoot,
      exec: async (command) => ({
        command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        failed: false,
      }),
    };
    return await i18n({ format: "json", catalogGlob }).run(context);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function expectRule(result: LaneResult, rule: string): void {
  expect(result.status).toBe("failed");
  expect(result.findings?.some((entry) => entry.rule === rule)).toBe(true);
}

describe("i18n catalog parity and ICU", () => {
  it("passes complete Lingui PO catalogs with matching ICU arguments and Arabic plurals", async () => {
    const result = await runFixture("valid", [
      { locale: "ar", id: "product.name", reason: "Product names are shared across locales." },
    ]);

    expect(result.status).toBe("passed");
    expect(result.metrics?.filesChecked).toBe(2);
  });

  it("fails when a source-locale message is missing from another locale", async () => {
    expectRule(await runFixture("missing"), "i18n-catalog-parity");
  });

  it("fails when a locale has a message missing from the source locale", async () => {
    expectRule(await runFixture("extra"), "i18n-catalog-parity");
  });

  it("fails when ICU placeholder names differ", async () => {
    const result = await runFixture("icu-mismatch");
    expectRule(result, "i18n-icu-arguments");
    expect(result.findings?.some((entry) => entry.message.includes("argument types"))).toBe(true);
  });

  it("fails on malformed ICU syntax instead of treating braces as literal text", async () => {
    expectRule(await runFixture("icu-invalid"), "i18n-icu-translation");
  });

  it("fails when an Arabic ICU plural omits required categories", async () => {
    expectRule(await runFixture("arabic-plurals"), "i18n-arabic-plurals");
  });
});

describe("i18n translation policy", () => {
  it("fails when a locale translation is empty", async () => {
    expectRule(await runFixture("empty"), "i18n-untranslated");
  });

  it("fails when a locale translation is identical to the English source", async () => {
    expectRule(await runFixture("identical"), "i18n-untranslated");
  });

  it("allows reviewed empty and unchanged strings by locale and message id", async () => {
    const result = await runFixture("allowlisted", [
      { locale: "ar", id: "product.name", reason: "The product brand remains in Latin script." },
      {
        locale: "ar",
        id: "future.notice",
        reason: "This intentionally remains untranslated until launch.",
      },
    ]);

    expect(result.status).toBe("passed");
  });

  it("fails when a reviewed allowlist entry is no longer needed", async () => {
    expectRule(
      await runFixture("valid", [
        { locale: "ar", id: "greeting", reason: "Temporary copy review exception." },
      ]),
      "i18n-allowlist-stale",
    );
  });
});

describe("i18n JSON catalogs", () => {
  it("flattens nested keys and combines catalog files for each locale", async () => {
    const source = [
      { account: { greeting: "Hello {name}" } },
      { inbox: { files: "{count, plural, one {# file} other {# files}}" } },
    ];
    const target = [
      { account: { greeting: "مرحبًا {name}" } },
      {
        inbox: {
          files:
            "{count, plural, zero {# ملف} one {# ملف} two {# ملفان} few {# ملفات} many {# ملفًا} other {# ملف}}",
        },
      },
    ];

    const result = await runJsonFixture(source, target);

    expect(result.status, JSON.stringify(result.findings)).toBe("passed");
    expect(result.metrics?.filesChecked).toBe(4);
  });

  it("checks flattened nested keys for locale parity", async () => {
    const result = await runJsonFixture(
      [{ settings: { title: "Settings", description: "Manage your profile" } }],
      [{ settings: { title: "الإعدادات" } }],
    );

    expectRule(result, "i18n-catalog-parity");
    expect(result.findings?.some((entry) => entry.message.includes("settings.description"))).toBe(
      true,
    );
  });

  it("checks ICU arguments and malformed syntax in JSON message values", async () => {
    const mismatch = await runJsonFixture(
      [{ greeting: { message: "Hello {name}" } }],
      [{ greeting: { message: "مرحبًا {user}" } }],
    );
    expectRule(mismatch, "i18n-icu-arguments");

    const invalid = await runJsonFixture(
      [{ greeting: { message: "Hello {name}" } }],
      [{ greeting: { message: "مرحبًا {name" } }],
    );
    expectRule(invalid, "i18n-icu-translation");
  });

  it("rejects non-string JSON leaves and duplicate keys across catalogs", async () => {
    const invalid = await runJsonFixture(
      [{ greeting: { message: "Hello" } }],
      [{ greeting: { message: "مرحبًا", metadata: 1 } }],
    );
    expectRule(invalid, "i18n-catalog-parse");

    const duplicate = await runJsonFixture(
      [{ shared: { message: "Hello" } }, { shared: { message: "Hello again" } }],
      [{ shared: { message: "مرحبًا" } }],
    );
    expectRule(duplicate, "i18n-catalog-duplicate-message");
  });
});

describe("i18n template defaults and triggers", () => {
  it("passes the base template catalogs with the default lane paths", async () => {
    const context: LaneContext = {
      classification: emptyClassification,
      changedFiles: [],
      allChangedFiles: [],
      scope: "full",
      repoRoot: templateRoot,
      target: undefined,
      exec: async (command) => ({
        command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        failed: false,
      }),
    };

    const result = await i18n().run(context);
    expect(result.status).toBe("passed");
  });

  it("triggers for PO catalogs and source files, and always in full scope", () => {
    const lane = i18n();
    if (typeof lane.triggers !== "function") {
      throw new Error("i18n must use a contextual lane trigger.");
    }
    const triggerContext: TriggerContext = {
      classification: emptyClassification,
      changedFiles: ["apps/web/src/locales/ar/messages.po"],
      allChangedFiles: ["apps/web/src/locales/ar/messages.po"],
      scope: "branch",
      target: undefined,
    };
    expect(lane.triggers(triggerContext)).toContain("i18n catalog");
    expect(
      lane.triggers({
        ...triggerContext,
        changedFiles: ["apps/web/src/routes/home.tsx"],
        allChangedFiles: ["apps/web/src/routes/home.tsx"],
      }),
    ).toContain("i18n catalog");
    expect(
      lane.triggers({
        ...triggerContext,
        changedFiles: ["README.md"],
        allChangedFiles: ["README.md"],
      }),
    ).toBe(false);
    expect(
      lane.triggers({
        ...triggerContext,
        changedFiles: [],
        allChangedFiles: [],
        scope: "full",
      }),
    ).toBe("always required");

    const jsonLane = i18n({
      format: "json",
      catalogGlob: "apps/portal/src/i18n/messages/*/*.json",
    });
    if (typeof jsonLane.triggers !== "function") {
      throw new Error("i18n must use a contextual lane trigger.");
    }
    expect(
      jsonLane.triggers({
        ...triggerContext,
        changedFiles: ["apps/portal/src/i18n/messages/ar-SA/common.json"],
        allChangedFiles: ["apps/portal/src/i18n/messages/ar-SA/common.json"],
      }),
    ).toContain("i18n catalog");
  });
});
