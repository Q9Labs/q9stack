import {
  diagnosticCodeSchema,
  diagnosticTraceBriefSchema,
  type DiagnosticEvent,
  type DiagnosticTraceBrief,
} from "@q9labsai/diagnostics";
import { z } from "zod";

export type BriefSource = {
  name: string;
  trace: (after: string | undefined) => Promise<DiagnosticTraceBrief>;
};

export class MergeError extends Error {
  constructor(
    message: string,
    readonly exitCode: 3 | 4,
  ) {
    super(message);
  }
}

const positionSchema = z.strictObject({
  after: z.string().optional(),
  skip: z.number().int().min(0),
  done: z.boolean().optional(),
  completeness: diagnosticTraceBriefSchema.shape.completeness.optional(),
});
const cursorSchema = z.strictObject({
  version: z.literal(1),
  code: diagnosticCodeSchema,
  target: z.string(),
  positions: z.array(positionSchema).min(1).max(12),
});
type Position = z.infer<typeof positionSchema>;
type Span = DiagnosticTraceBrief["serverSpans"][number];
type LogRecord = NonNullable<DiagnosticTraceBrief["serverLogs"]>[number];
type Entry =
  | { source: number; kind: "events"; value: DiagnosticEvent; key: string }
  | { source: number; kind: "errors"; value: DiagnosticEvent; key: string }
  | { source: number; kind: "serverSpans"; value: Span; key: string }
  | { source: number; kind: "serverLogs"; value: LogRecord; key: string };
type Evidence = {
  events: DiagnosticEvent[];
  serverSpans: Span[];
  serverLogs: LogRecord[];
  errors: DiagnosticEvent[];
};
type SourcePage = { brief?: DiagnosticTraceBrief; entries: Entry[] };
type Caps = { events: number; serverSpans: number; serverLogs: number; errors: number };
type Seen = {
  events: Set<string>;
  serverSpans: Set<string>;
  serverLogs: Set<string>;
  errors: Set<string>;
};

function decode(
  after: string | undefined,
  code: string,
  target: string,
  count: number,
): Position[] {
  if (!after) return Array.from({ length: count }, () => ({ skip: 0 }));
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(after, "base64url").toString("utf8")));
    if (parsed.code !== code || parsed.target !== target || parsed.positions.length !== count)
      throw new Error("Mismatched cursor");
    return parsed.positions;
  } catch {
    throw new MergeError("Invalid or mismatched diagnostic cursor.", 3);
  }
}

function entries(brief: DiagnosticTraceBrief, source: number): Entry[] {
  return [
    ...brief.events.map((value) => ({
      source,
      kind: "events" as const,
      value,
      key: `${value.traceId}:${value.eventId}`,
    })),
    ...brief.serverSpans.map((value) => ({
      source,
      kind: "serverSpans" as const,
      value,
      key: `${value.traceId}:${value.spanId}`,
    })),
    ...(brief.serverLogs ?? []).map((value) => ({
      source,
      kind: "serverLogs" as const,
      value,
      key: `${value.traceId}:${value.spanId}:${value.occurredAt}:${value.level}:${value.message}`,
    })),
    ...brief.errors.map((value) => ({
      source,
      kind: "errors" as const,
      value,
      key: `${value.traceId}:${value.eventId}`,
    })),
  ].toSorted(compare);
}

function compare(left: Entry, right: Entry): number {
  return (
    left.value.occurredAt - right.value.occurredAt ||
    left.kind.localeCompare(right.kind) ||
    left.key.localeCompare(right.key) ||
    left.source - right.source
  );
}

async function readPages(sources: BriefSource[], positions: Position[]): Promise<SourcePage[]> {
  return Promise.all(
    sources.map(async (source, index) => {
      const position = positions[index];
      if (!position || position.done) return { entries: [] };
      const brief = await source.trace(position.after);
      return { brief, entries: entries(brief, index).slice(position.skip) };
    }),
  );
}

function addEvidence(entry: Entry, evidence: Evidence): void {
  if (entry.kind === "events") evidence.events.push(entry.value);
  else if (entry.kind === "errors") evidence.errors.push(entry.value);
  else if (entry.kind === "serverLogs") evidence.serverLogs.push(entry.value);
  else evidence.serverSpans.push(entry.value);
}

function consumeEntry(
  entry: Entry,
  evidence: Evidence,
  caps: Caps,
  seen: Seen,
  consumed: number[],
): boolean {
  const duplicate = seen[entry.kind].has(entry.key);
  if (!duplicate && evidence[entry.kind].length >= caps[entry.kind]) return false;
  consumed[entry.source] = (consumed[entry.source] ?? 0) + 1;
  if (duplicate) return true;
  seen[entry.kind].add(entry.key);
  addEvidence(entry, evidence);
  return true;
}

function collectEvidence(
  pages: SourcePage[],
  limit: number | undefined,
): { evidence: Evidence; consumed: number[] } {
  const caps = {
    events: limit ?? 500,
    serverSpans: limit ?? 200,
    serverLogs: limit ?? 500,
    errors: limit ?? 100,
  };
  const evidence: Evidence = { events: [], serverSpans: [], serverLogs: [], errors: [] };
  const seen = {
    events: new Set<string>(),
    serverSpans: new Set<string>(),
    serverLogs: new Set<string>(),
    errors: new Set<string>(),
  };
  const consumed = pages.map(() => 0);
  for (const entry of pages.flatMap((page) => page.entries).toSorted(compare)) {
    if (!consumeEntry(entry, evidence, caps, seen, consumed)) break;
  }
  return { evidence, consumed };
}

function advance(position: Position, page: SourcePage, consumed: number): Position {
  const brief = page.brief;
  if (!brief || position.done) return position;
  if (consumed < page.entries.length)
    return { ...position, skip: position.skip + consumed, completeness: brief.completeness };
  if (!brief.nextCursor) return { done: true, skip: 0, completeness: brief.completeness };
  if (brief.nextCursor === position.after)
    throw new MergeError("Diagnostic source cursor did not advance.", 4);
  return { after: brief.nextCursor, skip: 0, completeness: brief.completeness };
}

function nextCursor(code: string, target: string, positions: Position[]): string | undefined {
  if (positions.every((position) => position.done)) return undefined;
  return Buffer.from(JSON.stringify({ version: 1, code, target, positions })).toString("base64url");
}

function gaps(sources: BriefSource[], pages: SourcePage[]): DiagnosticTraceBrief["visibilityGaps"] {
  return pages
    .flatMap((page, index) => {
      const brief = page.brief;
      if (!brief) return [];
      const source = sources[index]?.name ?? "unknown";
      const named = brief.visibilityGaps.map((gap) => ({ ...gap, source }));
      if (brief.completeness === "not_found" && named.length === 0)
        named.push({ reason: "not_available", detail: "No diagnostic evidence", source });
      return named;
    })
    .slice(0, 32);
}

function completeness(
  positions: Position[],
  evidence: Evidence,
  next: string | undefined,
  gapCount: number,
): DiagnosticTraceBrief["completeness"] {
  const statuses = positions.map((position) => position.completeness ?? "not_found");
  if (statuses.every((status) => status === "complete") && !next && gapCount === 0)
    return "complete";
  if (
    evidence.events.length +
      evidence.serverSpans.length +
      evidence.serverLogs.length +
      evidence.errors.length >
    0
  )
    return "partial";
  if (statuses.every((status) => status === "expired")) return "expired";
  return statuses.every((status) => status === "not_found") ? "not_found" : "partial";
}

function links(pages: SourcePage[]): DiagnosticTraceBrief["links"] {
  const seen = new Set<string>();
  return pages
    .flatMap((page) => page.brief?.links ?? [])
    .filter((link) => {
      const key = `${link.idClass}:${link.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 32);
}

function attachLogs(evidence: Evidence): void {
  const bySpan = new Map<string, LogRecord[]>();
  for (const log of evidence.serverLogs) {
    const key = `${log.traceId}:${log.spanId}`;
    const current = bySpan.get(key) ?? [];
    current.push(log);
    bySpan.set(key, current);
  }
  evidence.serverSpans = evidence.serverSpans.map((span) => {
    const records = bySpan.get(`${span.traceId}:${span.spanId}`) ?? [];
    if (!records.length) return span;
    const lines = [
      ...(span.logLines ?? []),
      ...records.map((log) => ({
        occurredAt: log.occurredAt,
        level: log.level,
        message: log.message,
      })),
    ];
    return { ...span, logLines: lines.slice(0, 100) };
  });
}

export async function mergeBriefs(
  sources: BriefSource[],
  code: string,
  target: string,
  limit?: number,
  after?: string,
): Promise<DiagnosticTraceBrief> {
  const positions = decode(after, code, target, sources.length);
  const pages = await readPages(sources, positions);
  const { evidence, consumed } = collectEvidence(pages, limit);
  attachLogs(evidence);
  const advanced = positions.map((position, index) =>
    advance(position, pages[index] ?? { entries: [] }, consumed[index] ?? 0),
  );
  const next = nextCursor(code, target, advanced);
  const visibilityGaps = gaps(sources, pages);
  return diagnosticTraceBriefSchema.parse({
    version: 1,
    code,
    target,
    retrievedAt: new Date().toISOString(),
    completeness: completeness(advanced, evidence, next, visibilityGaps.length),
    summary: `${evidence.events.length} diagnostic events ${evidence.serverSpans.length} server spans ${evidence.serverLogs.length} log lines`,
    journeyTraceId: pages.find((page) => page.brief?.journeyTraceId)?.brief?.journeyTraceId,
    ...evidence,
    links: links(pages),
    visibilityGaps,
    truncated: Boolean(next) || pages.some((page) => page.brief?.truncated),
    nextCursor: next,
  });
}
