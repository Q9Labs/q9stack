import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { load } from "js-yaml";
import { z } from "zod";

const evidenceSchema = z.strictObject({
  kind: z.enum(["prior_assessment", "source_review", "check", "observation"]),
  scope: z.string().optional(),
  detail: z.string().optional(),
  from: z.array(z.string()).optional(),
  artifact: z.string().optional(),
  revision: z.string().optional(),
  environment: z.string().optional(),
  date: z.string().optional(),
  result: z.enum(["pass", "fail", "blocked"]).optional(),
});
const outcomeSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  area: z.string(),
  state: z.enum(["unknown", "planned", "in_progress", "blocked", "working"]),
  summary: z.string(),
  priority: z.enum(["P0", "P1", "P2"]).optional(),
  size: z.enum(["S", "M", "L", "Unknown"]).optional(),
  size_reason: z.string().optional(),
  remaining: z.array(z.string()).optional(),
  uncertainty: z.string().optional(),
  blocked_by: z.string().optional(),
  theory: z.string().optional(),
  code: z.array(z.string()),
  evidence: z.array(evidenceSchema).optional(),
});
const trackerSchema = z.strictObject({
  schema_version: z.number(),
  principle: z.string(),
  sizing: z.string(),
  outcomes: z.array(outcomeSchema),
});
const configSchema = z.strictObject({ trackerAreas: z.array(z.string().min(1)) });
export type Tracker = z.infer<typeof trackerSchema>;
export type Outcome = Tracker["outcomes"][number];
export const defaultAreas = [
  "foundation",
  "contracts",
  "adapters",
  "quality",
  "toolkit",
  "release",
];

export class TrackerError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
  }
}

function nonempty(value: string | undefined, label: string, problems: string[]): void {
  if (value === undefined || value.trim() === "")
    problems.push(label + ": expected non-empty text");
}

function strings(
  value: string[] | undefined,
  label: string,
  problems: string[],
  required = true,
): void {
  if (value === undefined || (required && value.length === 0)) {
    problems.push(label + ": expected a non-empty list");
    return;
  }
  value.forEach((item, index) => nonempty(item, label + "[" + index + "]", problems));
  if (new Set(value).size !== value.length) problems.push(label + ": duplicate entries");
}

function validDate(value: string | undefined): boolean {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateTracker(input: unknown, additionalAreas: string[] = []): Tracker {
  const parsed = trackerSchema.safeParse(input);
  if (!parsed.success) {
    throw new TrackerError(
      parsed.error.issues.map(
        (issue) => (issue.path.length ? issue.path.join(".") : "tracker") + ": " + issue.message,
      ),
    );
  }
  const tracker = parsed.data;
  const problems: string[] = [];
  if (tracker.schema_version !== 7) problems.push("schema_version: expected 7");
  nonempty(tracker.principle, "principle", problems);
  nonempty(tracker.sizing, "sizing", problems);
  if (!tracker.outcomes.length) problems.push("outcomes: expected a non-empty list");
  const ids = new Set<string>();
  for (const [index, item] of tracker.outcomes.entries()) {
    const base = "outcomes[" + index + "]";
    nonempty(item.id, base + ".id", problems);
    if (!/^[a-z][a-z0-9_.-]+$/.test(item.id)) problems.push(base + ".id: invalid ID");
    if (ids.has(item.id)) problems.push(base + ".id: duplicate outcome ID");
    ids.add(item.id);
    nonempty(item.title, base + ".title", problems);
    nonempty(item.summary, base + ".summary", problems);
    if (![...defaultAreas, ...additionalAreas].includes(item.area))
      problems.push(base + ".area: unknown area " + item.area);
    if (item.state !== "working" && item.priority === undefined)
      problems.push(base + ".priority: required");
    if (item.state === "working") {
      if (item.size !== undefined || item.size_reason !== undefined)
        problems.push(base + ".size: working entries have no remaining work to size");
      if (item.remaining !== undefined || item.uncertainty !== undefined)
        problems.push(
          base + ".remaining: working scope cannot have unresolved work or uncertainty",
        );
    } else {
      if (item.size === undefined) problems.push(base + ".size: size must be S, M, L or Unknown");
      nonempty(item.size_reason, base + ".size_reason", problems);
    }
    if (item.remaining !== undefined || ["planned", "in_progress", "blocked"].includes(item.state))
      strings(item.remaining, base + ".remaining", problems);
    if (item.uncertainty !== undefined || item.state === "unknown")
      nonempty(item.uncertainty, base + ".uncertainty", problems);
    if (item.blocked_by !== undefined || item.state === "blocked")
      nonempty(item.blocked_by, base + ".blocked_by", problems);
    if (item.state !== "blocked" && item.blocked_by !== undefined)
      problems.push(base + ".blocked_by: requires blocked state");
    if (item.theory !== undefined) nonempty(item.theory, base + ".theory", problems);
    strings(item.code, base + ".code", problems, false);
    if (item.evidence !== undefined && !item.evidence.length)
      problems.push(base + ".evidence: expected a non-empty list");
    for (const [eIndex, evidence] of (item.evidence ?? []).entries()) {
      const label = base + ".evidence[" + eIndex + "]";
      if (evidence.scope !== undefined) nonempty(evidence.scope, label + ".scope", problems);
      if (evidence.detail !== undefined) nonempty(evidence.detail, label + ".detail", problems);
      if (evidence.kind === "prior_assessment") {
        strings(evidence.from, label + ".from", problems);
        for (const field of ["artifact", "revision", "environment", "date", "result"] as const) {
          if (evidence[field] !== undefined)
            problems.push(
              label + "." + field + ": do not invent execution metadata for a prior assessment",
            );
        }
      } else {
        nonempty(evidence.scope, label + ".scope", problems);
        nonempty(evidence.detail, label + ".detail", problems);
        if (evidence.from !== undefined) problems.push(label + ".from: only for prior assessments");
        for (const field of ["artifact", "revision", "environment"] as const)
          nonempty(evidence[field], label + "." + field, problems);
        if (!validDate(evidence.date))
          problems.push(label + ".date: expected a valid YYYY-MM-DD date");
        if (evidence.result === undefined)
          problems.push(label + ".result: expected pass, fail or blocked");
      }
    }
  }
  if (problems.length) throw new TrackerError(problems);
  return tracker;
}

function headingSlug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\- ]/gu, "")
    .replaceAll(" ", "-");
}

async function checkReference(root: string, reference: string): Promise<void> {
  const parts = reference.split("#");
  const file = parts[0];
  if (
    parts.length > 2 ||
    !file ||
    path.isAbsolute(file) ||
    file.split(/[\\/]/).includes("..") ||
    /[\r\n<>]/.test(reference)
  )
    throw new Error("expected a repository-relative path");
  const absoluteRoot = await realpath(root);
  let absolute: string;
  try {
    absolute = await realpath(path.join(absoluteRoot, file));
  } catch {
    throw new Error("file does not exist");
  }
  if (!absolute.startsWith(absoluteRoot + path.sep)) throw new Error("path leaves the repository");
  if (parts.length === 2) {
    const anchor = parts[1];
    if (!anchor || !file.endsWith(".md")) throw new Error("anchors require Markdown headings");
    const source = await readFile(absolute, "utf8");
    const headings = [...source.matchAll(/^#{1,6} (.+)$/gm)].map((match) =>
      headingSlug(match[1] ?? ""),
    );
    if (!headings.includes(anchor)) throw new Error("heading does not exist");
  }
}

export async function readTracker(root: string, file = "tracker.yaml"): Promise<Tracker> {
  const configPath = path.join(root, "q9.config.json");
  let areas: string[] = [];
  try {
    areas = configSchema.parse(JSON.parse(await readFile(configPath, "utf8"))).trackerAreas;
  } catch (error) {
    if (!isMissingFile(error))
      throw new Error(configPath + ": " + errorMessage(error), { cause: error });
  }
  const fullPath = path.resolve(root, file);
  let source: string;
  try {
    source = await readFile(fullPath, "utf8");
  } catch (error) {
    throw new Error(fullPath + ": " + errorMessage(error), { cause: error });
  }
  let tracker: Tracker;
  try {
    tracker = validateTracker(load(source), areas);
  } catch (error) {
    throw new Error(fullPath + ": " + errorMessage(error), { cause: error });
  }
  const problems: string[] = [];
  for (const [index, item] of tracker.outcomes.entries()) {
    const references: [string, string][] = [];
    if (item.theory) references.push(["theory", item.theory]);
    item.code.forEach((reference, codeIndex) =>
      references.push(["code[" + codeIndex + "]", reference]),
    );
    item.evidence?.forEach((evidence, evidenceIndex) => {
      if (evidence.artifact)
        references.push(["evidence[" + evidenceIndex + "].artifact", evidence.artifact]);
    });
    for (const [field, reference] of references) {
      try {
        await checkReference(root, reference);
      } catch (error) {
        problems.push(
          "outcomes[" + index + "]." + field + ": " + reference + ": " + errorMessage(error),
        );
      }
    }
  }
  if (problems.length) throw new Error(fullPath + ": " + problems.join("\n"));
  return tracker;
}

export function listOutcomes(
  tracker: Tracker,
  filters: { state?: string; area?: string; priority?: string } = {},
): Outcome[] {
  return tracker.outcomes.filter(
    (item) =>
      (filters.state === undefined || item.state === filters.state) &&
      (filters.area === undefined || item.area === filters.area) &&
      (filters.priority === undefined || item.priority === filters.priority),
  );
}

export function showOutcome(tracker: Tracker, id: string): Outcome {
  const outcome = tracker.outcomes.find((item) => item.id === id);
  if (!outcome) throw new Error("tracker.yaml: outcome " + id + " not found");
  return outcome;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
