import {
  diagnosticEventSchema,
  diagnosticTraceBriefSchema,
  redactDiagnosticAttributes,
  serverLogLineSchema,
  serverLogRecordSchema,
  serverSpanSchema,
  type DiagnosticEvent,
  type DiagnosticTraceBrief,
} from "@q9labsai/diagnostics";
import { z } from "zod";

export type AxiomConfig = {
  adapter: "axiom";
  org: string;
  traces?: string | undefined;
  logs?: string | undefined;
  tokenEnv: string;
  window?: string | undefined;
};

export class AxiomError extends Error {
  constructor(
    message: string,
    readonly exitCode: 3 | 4,
  ) {
    super(message);
  }
}

const queryUrl = "https://api.axiom.co/v1/datasets/_apl?format=tabular";
const tableSchema = z.looseObject({
  fields: z.array(z.object({ name: z.string() })),
  columns: z.array(z.array(z.unknown())),
});
const responseSchema = z.looseObject({ tables: z.array(tableSchema) });
type Row = Map<string, unknown>;
type Position = { time: string; skip: number };
const sourceCursorSchema = z.object({
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  position: z.object({ time: z.string(), skip: z.int().min(1) }).optional(),
  seenSpans: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(128_000)
    .optional(),
});
type SourceCursor = z.infer<typeof sourceCursorSchema>;

function decodeSeenSpans(encoded: string | undefined): Set<string> {
  if (!encoded) return new Set();
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.length % 8 !== 0) throw new AxiomError("Invalid Axiom cursor.", 3);
  const seen = new Set<string>();
  for (let index = 0; index < bytes.length; index += 8)
    seen.add(bytes.toString("hex", index, index + 8));
  return seen;
}

function encodeSeenSpans(seen: Set<string>): string {
  if (seen.size > 12_000) throw new AxiomError("Axiom cursor capacity exceeded.", 4);
  return Buffer.from([...seen].join(""), "hex").toString("base64url");
}

function rowValue(row: Row, name: string): unknown {
  return row.get(name);
}

function rowString(row: Row, name: string): string | undefined {
  const value = rowValue(row, name);
  return typeof value === "string" ? value : undefined;
}

function rowsFromResponse(input: unknown): Row[] {
  const parsed = responseSchema.safeParse(input);
  if (!parsed.success) throw new AxiomError("Axiom returned an invalid query response.", 4);
  return parsed.data.tables.flatMap((table) => {
    const count = table.columns[0]?.length ?? 0;
    if (
      table.columns.length !== table.fields.length ||
      table.columns.some((col) => col.length !== count)
    )
      throw new AxiomError("Axiom returned inconsistent columns.", 4);
    return Array.from(
      { length: count },
      (_, index) =>
        new Map(table.fields.map((field, column) => [field.name, table.columns[column]?.[index]])),
    );
  });
}

function token(config: AxiomConfig): string {
  const value = process.env[config.tokenEnv];
  if (!value) throw new AxiomError(`Missing Axiom query token in ${config.tokenEnv}.`, 3);
  return value;
}

async function query(
  config: AxiomConfig,
  dataset: string,
  aplSuffix: string,
  start: string,
  end: string,
  fetcher: typeof fetch,
): Promise<Row[]> {
  const queryToken = token(config);
  let response: Response;
  try {
    response = await fetcher(queryUrl, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${queryToken}`,
        "X-AXIOM-ORG-ID": config.org,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        apl: `['${dataset}']${aplSuffix}`,
        startTime: start,
        endTime: end,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AxiomError("Axiom query failed. Retry the read.", 4);
  }
  if (response.status === 401 || response.status === 403)
    throw new AxiomError("Axiom query access denied. Check the query token and dataset scope.", 4);
  if (response.status === 429 || response.status >= 500)
    throw new AxiomError("Axiom query is temporarily unavailable. Retry shortly.", 4);
  if (!response.ok) throw new AxiomError(`Axiom query failed (HTTP ${response.status}).`, 4);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AxiomError("Axiom returned invalid JSON.", 4);
  }
  return rowsFromResponse(body);
}

function windowMillis(window: string | undefined): number {
  const match = /^(\d+)([dh])$/.exec(window ?? "14d");
  if (!match) throw new AxiomError("Axiom window must be a number of days or hours.", 3);
  const value = Number(match[1]);
  const millis = value * (match[2] === "d" ? 86_400_000 : 3_600_000);
  if (!Number.isSafeInteger(millis) || millis < 1) throw new AxiomError("Invalid Axiom window.", 3);
  return millis;
}

function initialCursor(config: AxiomConfig, after: string | undefined): SourceCursor {
  if (after) {
    try {
      return sourceCursorSchema.parse(JSON.parse(Buffer.from(after, "base64url").toString("utf8")));
    } catch {
      throw new AxiomError("Invalid Axiom cursor.", 3);
    }
  }
  const now = Date.now();
  return {
    start: new Date(now - windowMillis(config.window)).toISOString(),
    end: new Date(now).toISOString(),
  };
}

function encodeCursor(cursor: SourceCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function positionAfter(position: Position | undefined, row: Row): Position {
  const time = rowString(row, "_time");
  if (!time || Number.isNaN(Date.parse(time)))
    throw new AxiomError("Axiom row has no valid time.", 4);
  return { time, skip: time === position?.time ? position.skip + 1 : 1 };
}

function consumeBatch(
  batch: Row[],
  rows: Row[],
  boundary: Position | undefined,
  limit: number,
): { position: Position | undefined; hasMore: boolean; skipped: number } {
  let position = boundary;
  let skipped = 0;
  for (const row of batch) {
    if (boundary && rowString(row, "_time") === boundary.time && skipped < boundary.skip) {
      skipped++;
      continue;
    }
    if (rows.length === limit) return { position, hasMore: true, skipped };
    rows.push(row);
    position = positionAfter(position, row);
  }
  return { position, hasMore: false, skipped };
}

async function pageRows(
  config: AxiomConfig,
  dataset: string,
  code: string,
  cursor: SourceCursor,
  limit: number,
  fetcher: typeof fetch,
): Promise<{ rows: Row[]; next: Position | undefined }> {
  const rows: Row[] = [];
  let position = cursor.position;
  let hasMore = false;
  while (rows.length <= limit) {
    const start = position?.time ?? cursor.start;
    const batch = await query(
      config,
      dataset,
      ` | where trace_id == "${code}" | sort by _time asc | limit 1000`,
      start,
      cursor.end,
      fetcher,
    );
    const result = consumeBatch(batch, rows, position, limit);
    position = result.position;
    hasMore = result.hasMore;
    if (hasMore || batch.length < 1000) break;
    if (result.skipped === batch.length)
      throw new AxiomError("Axiom time page cannot advance; narrow the query window.", 4);
  }
  return { rows, next: hasMore ? position : undefined };
}

function safeName(value: string | undefined): string {
  const name = value?.replaceAll(/[/: -]+/g, ".");
  return name &&
    /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(name) &&
    name.length <= 96
    ? name
    : "otel.span";
}

function durationMs(value: unknown): number | undefined {
  if (typeof value === "number") return value >= 0 ? value / 1_000_000 : undefined;
  if (typeof value !== "string") return undefined;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  return match ? Number(match[1]) * 1000 : undefined;
}

function attributes(row: Row): DiagnosticEvent["attributes"] {
  const candidate = new Map<string, unknown>();
  for (const [key, value] of row) {
    if (key.startsWith("attributes.")) candidate.set(key.slice(11), value);
  }
  const custom = rowValue(row, "attributes.custom");
  if (typeof custom === "object" && custom !== null && !Array.isArray(custom)) {
    for (const [key, value] of Object.entries(custom)) candidate.set(key, value);
  }
  return redactDiagnosticAttributes(Object.fromEntries(candidate)).attributes;
}

function errorEvent(row: Row, suffix: string, name: string): DiagnosticEvent | undefined {
  const traceId = rowString(row, "trace_id");
  const spanId = rowString(row, "span_id");
  const occurredAt = Date.parse(rowString(row, "_time") ?? "");
  const candidate = {
    version: 1,
    traceId,
    spanId,
    eventId: `${spanId}_${suffix}`,
    occurredAt,
    source: "server",
    kind: "error",
    name,
    status: "error",
    level: "error",
    attributes: attributes(row),
  };
  const parsed = diagnosticEventSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

function exceptions(row: Row): DiagnosticEvent[] {
  const value = rowValue(row, "events");
  if (!Array.isArray(value)) return [];
  return value.flatMap((event, index) => {
    if (typeof event !== "object" || event === null || Array.isArray(event)) return [];
    const parsed = z.looseObject({ name: z.string() }).safeParse(event);
    if (!parsed.success || parsed.data.name !== "exception") return [];
    const error = errorEvent(row, `exception_${index}`, "otel.exception");
    return error ? [error] : [];
  });
}

function safeLogLine(row: Row):
  | {
      spanId: string;
      key: string;
      line: NonNullable<DiagnosticTraceBrief["serverSpans"][number]["logLines"]>[number];
    }
  | undefined {
  const spanId = rowString(row, "span_id");
  const occurredAt = Date.parse(rowString(row, "_time") ?? "");
  if (!spanId || !Number.isFinite(occurredAt)) return undefined;
  const severity =
    rowString(row, "severity_text") ?? rowString(row, "attributes.log_level") ?? "info";
  const line = serverLogLineSchema.parse({
    occurredAt,
    level: /error|fatal/i.test(severity) ? "error" : /warn/i.test(severity) ? "warning" : "info",
    message: "Redacted log body",
  });
  return {
    spanId,
    line,
    key: `${spanId}:${occurredAt}:${line.level}:${rowString(row, "body") ?? ""}`,
  };
}

function logLines(rows: Row[]): {
  lines: Map<string, DiagnosticTraceBrief["serverSpans"][number]["logLines"]>;
  truncated: boolean;
} {
  const lines = new Map<
    string,
    NonNullable<DiagnosticTraceBrief["serverSpans"][number]["logLines"]>
  >();
  const seen = new Set<string>();
  let truncated = false;
  for (const row of rows) {
    const safe = safeLogLine(row);
    if (!safe || seen.has(safe.key)) continue;
    seen.add(safe.key);
    const current = lines.get(safe.spanId) ?? [];
    if (current.length < 100) current.push(safe.line);
    else truncated = true;
    lines.set(safe.spanId, current);
  }
  return { lines, truncated };
}

function logRecords(rows: Row[]): NonNullable<DiagnosticTraceBrief["serverLogs"]> {
  const records: NonNullable<DiagnosticTraceBrief["serverLogs"]> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const safe = safeLogLine(row);
    if (!safe || seen.has(safe.key)) continue;
    const parsed = serverLogRecordSchema.safeParse({
      ...safe.line,
      traceId: rowString(row, "trace_id"),
      spanId: safe.spanId,
    });
    if (!parsed.success) continue;
    seen.add(safe.key);
    records.push(parsed.data);
  }
  return records;
}

function toServerSpan(
  row: Row,
  lines: ReturnType<typeof logLines>["lines"],
): DiagnosticTraceBrief["serverSpans"][number] | undefined {
  const traceId = rowString(row, "trace_id");
  const spanId = rowString(row, "span_id");
  if (!traceId || !spanId) return undefined;
  const occurredAt = Date.parse(rowString(row, "_time") ?? "");
  const status = rowString(row, "status.code") === "ERROR" ? "error" : "ok";
  const kind = serverSpanSchema.shape.kind.safeParse(rowString(row, "kind")?.toLowerCase());
  const serviceName = serverSpanSchema.shape.serviceName.safeParse(rowString(row, "service.name"));
  const candidate = {
    traceId,
    spanId,
    parentSpanId: rowString(row, "parent_span_id") ?? undefined,
    name: safeName(rowString(row, "name")),
    occurredAt,
    durationMs: durationMs(rowValue(row, "duration")),
    status,
    correlation: "trace_id",
    kind: kind.success ? kind.data : undefined,
    serviceName: serviceName.success ? serviceName.data : undefined,
    attributes: attributes(row),
    logLines: lines.get(spanId),
  };
  const parsed = serverSpanSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

function spansAndErrors(
  rows: Row[],
  lines: ReturnType<typeof logLines>["lines"],
  seen: Set<string>,
): Pick<DiagnosticTraceBrief, "serverSpans" | "errors"> {
  const spans: DiagnosticTraceBrief["serverSpans"] = [];
  const errors: DiagnosticEvent[] = [];
  for (const row of rows) {
    const span = toServerSpan(row, lines);
    if (!span || seen.has(span.spanId)) continue;
    seen.add(span.spanId);
    spans.push(span);
    if (span.status === "error") {
      const error = errorEvent(row, "error", "otel.error");
      if (error) errors.push(error);
    }
    errors.push(...exceptions(row));
  }
  return { serverSpans: spans, errors };
}

export async function checkAxiom(
  config: AxiomConfig,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const end = new Date().toISOString();
  const start = new Date(Date.now() - windowMillis(config.window)).toISOString();
  await Promise.all(
    [config.traces, config.logs]
      .filter((dataset) => dataset !== undefined)
      .map((dataset) => query(config, dataset, " | limit 1", start, end, fetcher)),
  );
}

type AxiomPages = {
  traceRows: Row[];
  logRows: Row[];
  traceNext: Position | undefined;
  logNext: Position | undefined;
};

async function readAxiomPages(
  config: AxiomConfig,
  code: string,
  cursor: SourceCursor,
  limit: number,
  logsRequested: boolean,
  fetcher: typeof fetch,
): Promise<AxiomPages> {
  const traces = config.traces
    ? await pageRows(config, config.traces, code, cursor, limit, fetcher)
    : { rows: [], next: undefined };
  const logs =
    config.logs && logsRequested
      ? await pageRows(
          config,
          config.logs,
          code,
          config.traces ? { ...cursor, position: undefined } : cursor,
          config.traces ? 10_000 : limit,
          fetcher,
        )
      : { rows: [], next: undefined };
  return { traceRows: traces.rows, traceNext: traces.next, logRows: logs.rows, logNext: logs.next };
}

function axiomGaps(
  found: boolean,
  traceDataset: boolean,
  logBounded: boolean,
  lineBounded: boolean,
  errorBounded: boolean,
): DiagnosticTraceBrief["visibilityGaps"] {
  const gaps: DiagnosticTraceBrief["visibilityGaps"] = [];
  if (!found) gaps.push({ reason: "not_available", detail: "Axiom returned no trace evidence" });
  if (traceDataset && logBounded)
    gaps.push({ reason: "not_available", detail: "Axiom log read bounded" });
  if (lineBounded) gaps.push({ reason: "not_available", detail: "Axiom span log lines bounded" });
  if (errorBounded) gaps.push({ reason: "not_available", detail: "Axiom error list bounded" });
  return gaps;
}

function nextAxiomCursor(
  config: AxiomConfig,
  pages: AxiomPages,
  cursor: SourceCursor,
  seen: Set<string>,
): string | undefined {
  const position = config.traces ? pages.traceNext : pages.logNext;
  if (!position) return undefined;
  return encodeCursor({
    ...cursor,
    position,
    seenSpans: config.traces && seen.size ? encodeSeenSpans(seen) : undefined,
  });
}

function axiomCompleteness(
  found: boolean,
  gaps: DiagnosticTraceBrief["visibilityGaps"],
  nextCursor: string | undefined,
): DiagnosticTraceBrief["completeness"] {
  if (!found) return "not_found";
  return gaps.length || nextCursor ? "partial" : "complete";
}

function axiomBrief(
  config: AxiomConfig,
  code: string,
  target: string,
  limit: number,
  cursor: SourceCursor,
  pages: AxiomPages,
): DiagnosticTraceBrief {
  const seen = decodeSeenSpans(cursor.seenSpans);
  const logRead = logLines(pages.logRows);
  const mapped = spansAndErrors(pages.traceRows, logRead.lines, seen);
  const serverLogs = config.traces ? [] : logRecords(pages.logRows);
  const found = seen.size > 0 || serverLogs.length > 0;
  const gaps = axiomGaps(
    found,
    Boolean(config.traces),
    Boolean(pages.logNext),
    Boolean(config.traces && logRead.truncated),
    mapped.errors.length > limit,
  );
  const nextCursor = nextAxiomCursor(config, pages, cursor, seen);
  return diagnosticTraceBriefSchema.parse({
    version: 1,
    code,
    target,
    retrievedAt: new Date().toISOString(),
    completeness: axiomCompleteness(found, gaps, nextCursor),
    summary: found
      ? `${mapped.serverSpans.length} Axiom server spans and ${serverLogs.length} log lines`
      : "No Axiom trace evidence",
    events: [],
    serverSpans: mapped.serverSpans,
    serverLogs,
    errors: mapped.errors.slice(0, limit),
    links: [],
    visibilityGaps: gaps,
    truncated:
      Boolean(nextCursor ?? pages.logNext) ||
      mapped.errors.length > limit ||
      Boolean(config.traces && logRead.truncated),
    nextCursor,
  });
}

export async function readAxiomBrief(
  config: AxiomConfig,
  code: string,
  target: string,
  limit: number,
  after: string | undefined,
  logsRequested: boolean,
  fetcher: typeof fetch = fetch,
): Promise<DiagnosticTraceBrief> {
  const cursor = initialCursor(config, after);
  const pages = await readAxiomPages(config, code, cursor, limit, logsRequested, fetcher);
  return axiomBrief(config, code, target, limit, cursor, pages);
}
