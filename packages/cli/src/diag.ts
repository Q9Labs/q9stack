import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  diagnosticCodeSchema,
  diagnosticEventSchema,
  diagnosticTraceBriefSchema,
  checkFlowRun,
  flowDefinitionSchema,
  safeIdSchema,
  spanIdSchema,
  type DiagnosticEvent,
  type DiagnosticTraceBrief,
  type FlowDefinition,
} from "@q9labsai/diagnostics";
import { z } from "zod";

import { AxiomError, checkAxiom, lookupAxiomRun, readAxiomBrief } from "./diag/axiom.js";
import { MergeError, mergeBriefs } from "./diag/merge.js";

const exec = promisify(execFile);
const otlpSchema = z.strictObject({ allowedEndpoints: z.array(z.url()).max(12).optional() });
const configSchema = z.discriminatedUnion("adapter", [
  z.strictObject({
    adapter: z.literal("convex"),
    convexDir: z.string().min(1),
    lookup: z
      .string()
      .regex(/^[a-zA-Z0-9_/-]+:[a-zA-Z0-9_]+$/)
      .optional(),
    otlp: otlpSchema.optional(),
  }),
  z.strictObject({
    adapter: z.literal("command"),
    command: z.array(z.string().min(1)).min(1).max(12),
    otlp: otlpSchema.optional(),
  }),
  z
    .strictObject({
      adapter: z.literal("axiom"),
      org: z
        .string()
        .min(1)
        .max(96)
        .regex(/^[a-zA-Z0-9_-]+$/),
      traces: z
        .string()
        .min(1)
        .max(96)
        .regex(/^[a-zA-Z0-9_-]+$/)
        .optional(),
      logs: z
        .string()
        .min(1)
        .max(96)
        .regex(/^[a-zA-Z0-9_-]+$/)
        .optional(),
      tokenEnv: z
        .string()
        .min(1)
        .max(96)
        .regex(/^[A-Z_][A-Z0-9_]*$/),
      window: z
        .string()
        .regex(/^[1-9][0-9]*[dh]$/)
        .optional(),
      otlp: otlpSchema.optional(),
    })
    .refine((value) => Boolean(value.traces ?? value.logs)),
]);
type Config = z.infer<typeof configSchema>;
type DiagConfig = { sources: Config[]; otlp: z.infer<typeof otlpSchema> | undefined };
type Options = {
  prod: boolean;
  deployment: string | undefined;
  json: boolean;
  logs: boolean;
  otlp: string | undefined;
  limit: number | undefined;
  after: string | undefined;
};

export class DiagError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

function consumeFlag(flag: string, args: string[], options: Options): void {
  switch (flag) {
    case "--prod":
      options.prod = true;
      break;
    case "--deployment":
      options.deployment = args.shift() ?? "";
      break;
    case "--json":
      options.json = true;
      break;
    case "--no-logs":
      options.logs = false;
      break;
    case "--otlp":
      options.otlp = takeOtlpEndpoint(args);
      break;
    default:
      consumePageFlag(flag, args, options);
  }
}

function consumePageFlag(flag: string, args: string[], options: Options): void {
  if (flag === "--limit") {
    options.limit = takeLimit(args.shift());
    return;
  }
  if (flag === "--after") {
    options.after = takeAfter(args.shift());
    return;
  }
  throw new DiagError("Unknown diag option: " + flag, 3);
}

function takeLimit(raw: string | undefined): number {
  const limit = Number(raw);
  if (!raw || !/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(limit) || limit > 1_000)
    throw new DiagError("--limit must be an integer from 1 to 1000.", 3);
  return limit;
}

function takeAfter(after: string | undefined): string {
  if (!after || after.length > 262_144 || !/^[a-zA-Z0-9_-]+$/.test(after))
    throw new DiagError("--after needs a valid cursor.", 3);
  return after;
}

function takeOtlpEndpoint(args: string[]): string {
  const next = args[0];
  return next && !next.startsWith("--")
    ? (args.shift() ?? "http://localhost:4318")
    : "http://localhost:4318";
}

function validateTraceCode(action: "trace" | "check", code: string | undefined): void {
  if (action !== "trace") return;
  if (code?.startsWith("chalkdiag:v1:"))
    throw new DiagError("Chalk episode reference: use pnpm trace:inspect instead.", 3);
  if (!diagnosticCodeSchema.safeParse(code).success)
    throw new DiagError(
      "Diagnostic code must be 32 lowercase hexadecimal characters and nonzero.",
      3,
    );
}

function validateTarget(action: "trace" | "check", options: Options): void {
  if (options.prod && options.deployment)
    throw new DiagError("--prod and --deployment are mutually exclusive.", 3);
  if (options.deployment !== undefined && !/^[a-zA-Z0-9_-]{1,80}$/.test(options.deployment))
    throw new DiagError("--deployment needs a name.", 3);
  if (action === "check") validateCheckOptions(options);
}

function validateCheckOptions(options: Options): void {
  if (options.otlp || !options.logs || options.limit || options.after)
    throw new DiagError("Those options apply only to trace.", 3);
}

function parseArgs(args: string[]): {
  action: "trace" | "check";
  code: string | undefined;
  options: Options;
} {
  const action = args.shift();
  if (action !== "trace" && action !== "check")
    throw new DiagError("Use q9 diag trace <code> or q9 diag check.", 3);
  const code = action === "trace" ? args.shift() : undefined;
  validateTraceCode(action, code);
  const options: Options = {
    prod: false,
    deployment: undefined,
    json: false,
    logs: true,
    otlp: undefined,
    limit: undefined,
    after: undefined,
  };
  while (args.length) consumeFlag(args.shift() ?? "", args, options);
  validateTarget(action, options);
  return { action, code, options };
}

async function readConfig(root: string): Promise<DiagConfig> {
  let raw: string;
  try {
    raw = await readFile(path.join(root, "q9.config.json"), "utf8");
  } catch {
    throw new DiagError("Add diag configuration to q9.config.json; see q9 diag --help.", 3);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DiagError("q9.config.json is not valid JSON.", 3);
  }
  const rootSchema = z.looseObject({
    diag: z
      .union([
        configSchema,
        z.strictObject({
          sources: z.array(configSchema).min(1).max(12),
          otlp: otlpSchema.optional(),
        }),
      ])
      .optional(),
  });
  const result = rootSchema.safeParse(parsed);
  if (!result.success || !result.data.diag)
    throw new DiagError("Configure diag.adapter or diag.sources in q9.config.json.", 3);
  const config = result.data.diag;
  return "sources" in config
    ? { sources: config.sources, otlp: config.otlp }
    : { sources: [config], otlp: config.otlp };
}

async function readFlows(root: string): Promise<Map<string, FlowDefinition>> {
  let raw: string;
  try {
    raw = await readFile(path.join(root, "diagnostics", "flows.json"), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return new Map();
    throw new DiagError("Cannot read diagnostics/flows.json.", 3);
  }
  return parseFlows(raw);
}

function parseFlows(raw: string): Map<string, FlowDefinition> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new DiagError("diagnostics/flows.json is not valid JSON.", 3);
  }
  if (!Array.isArray(data))
    throw new DiagError("diagnostics/flows.json must be an array of flows.", 3);
  const flows = new Map<string, FlowDefinition>();
  for (const [index, entry] of data.entries()) {
    const parsed = flowDefinitionSchema.safeParse(entry);
    if (!parsed.success)
      throw new DiagError(
        `diagnostics/flows.json flow ${index + 1}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
        3,
      );
    if (flows.has(parsed.data.id))
      throw new DiagError(`diagnostics/flows.json: duplicate flow ${parsed.data.id}.`, 3);
    flows.set(parsed.data.id, parsed.data);
  }
  return flows;
}

async function run(binary: string, args: string[], cwd: string): Promise<string> {
  try {
    const result = await exec(binary, args, {
      cwd,
      timeout: 15_000,
      maxBuffer: 1_000_000,
      encoding: "utf8",
    });
    return result.stdout;
  } catch {
    throw new DiagError(
      "Diagnostic adapter failed. Check its installation, deployment, and read access.",
      4,
    );
  }
}

function deploymentArgs(options: Options): string[] {
  if (options.prod) return ["--prod"];
  if (options.deployment) return ["--deployment-name", options.deployment];
  return [];
}

// Convex prints `null` for absent fields, e.g. `"success": null, "error": null`.
const logSchema = z.looseObject({
  kind: z.string().nullish(),
  requestId: z.string().nullish(),
  identifier: z.string().nullish(),
  executionTimestamp: z.number().nullish(),
  timestamp: z.number().nullish(),
  executionTime: z.number().nullish(),
  success: z.boolean().nullish(),
  error: z.unknown().optional(),
});
type LogRead = { logs: z.infer<typeof logSchema>[]; truncated: boolean };

async function readLogs(binary: string, cwd: string, target: string[]): Promise<LogRead> {
  return new Promise((resolve, reject) => {
    const lines: z.infer<typeof logSchema>[] = [];
    let buffer = "";
    let bytes = 0;
    let truncated = false;
    const child = spawn(binary, ["logs", "--history", "500", "--jsonl", ...target], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    });
    // `convex logs` prints its history and then keeps streaming, so the timer is
    // the normal end of a read. Only the byte and line caps truncate evidence.
    const stop = (capped: boolean) => {
      truncated ||= capped;
      child.kill("SIGTERM");
    };
    const timer = setTimeout(() => stop(false), 2_500);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 1_000_000) {
        stop(true);
        return;
      }
      buffer += chunk;
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (lines.length >= 500) {
          stop(true);
          break;
        }
        try {
          const log = logSchema.safeParse(JSON.parse(part));
          if (log.success) lines.push(log.data);
        } catch {
          /* Convex may emit progress text. */
        }
      }
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new DiagError("Convex log adapter failed. Check read access.", 4));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0 && signal !== "SIGTERM") {
        reject(new DiagError("Convex log adapter failed. Check read access.", 4));
        return;
      }
      resolve({ logs: lines, truncated });
    });
  });
}

function safeName(name: string | null | undefined): string | undefined {
  const dotted = name?.replaceAll(/[/:]/g, ".");
  return dotted &&
    /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(dotted) &&
    dotted.length <= 96
    ? dotted
    : undefined;
}

function correlateLog(
  log: z.infer<typeof logSchema>,
  events: DiagnosticEvent[],
  requests: Map<string | undefined, DiagnosticEvent>,
  millis: number,
  traced: Map<string, DiagnosticEvent>,
): { parent: DiagnosticEvent; correlation: "request_id" | "trace_id" | "heuristic" } | undefined {
  const exact = log.requestId ? requests.get(log.requestId) : undefined;
  if (exact) return { parent: exact, correlation: "request_id" };
  const linked = log.requestId ? traced.get(log.requestId) : undefined;
  if (linked) return { parent: linked, correlation: "trace_id" };
  const heuristic = events.find(
    (event) =>
      event.attributes?.function === log.identifier && Math.abs(event.occurredAt - millis) <= 5_000,
  );
  return heuristic ? { parent: heuristic, correlation: "heuristic" } : undefined;
}

function safeLogRequestId(value: string | null | undefined): string | undefined {
  return value && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : undefined;
}

function logDurationMs(value: number | null | undefined): number | undefined {
  return value !== undefined && value !== null && value >= 0 ? Math.round(value * 1000) : undefined;
}

function logMillis(log: z.infer<typeof logSchema>): number {
  return Math.round((log.executionTimestamp ?? log.timestamp ?? 0) * 1000);
}

function logStatus(log: z.infer<typeof logSchema>): "ok" | "error" {
  const failed = log.success === false || (log.error !== undefined && log.error !== null);
  return failed ? "error" : "ok";
}

function logToServerSpan(
  log: z.infer<typeof logSchema>,
  index: number,
  events: DiagnosticEvent[],
  requests: Map<string | undefined, DiagnosticEvent>,
  traced: Map<string, DiagnosticEvent>,
): DiagnosticTraceBrief["serverSpans"][number] | undefined {
  const millis = logMillis(log);
  const match = correlateLog(log, events, requests, millis, traced);
  const name = safeName(log.identifier);
  const spanId = (index + 1).toString(16).padStart(16, "0");
  if (!match || !name || !spanIdSchema.safeParse(spanId).success) return undefined;
  return {
    traceId: match.parent.traceId,
    spanId,
    parentSpanId: match.parent.spanId,
    requestId: safeLogRequestId(log.requestId),
    name,
    occurredAt: millis,
    durationMs: logDurationMs(log.executionTime),
    status: logStatus(log),
    correlation: match.correlation,
  };
}

function toServerSpans(events: DiagnosticEvent[], logs: z.infer<typeof logSchema>[]) {
  const requests = new Map(
    events.filter((event) => event.requestId).map((event) => [event.requestId, event]),
  );
  const traced = traceLinkedRequests(events, logs);
  // `Console` entries carry log text; the `Completion` entry is the execution itself.
  return logs.flatMap((log, index) => {
    if (log.kind && log.kind !== "Completion") return [];
    const span = logToServerSpan(log, index, events, requests, traced);
    return span ? [span] : [];
  });
}

// A server function that logs the trace ID (e.g. `convex.function.failed`) links its
// request, whichever log entry of that request carries the text.
function traceLinkedRequests(
  events: DiagnosticEvent[],
  logs: z.infer<typeof logSchema>[],
): Map<string, DiagnosticEvent> {
  const traced = new Map<string, DiagnosticEvent>();
  for (const log of logs) {
    if (!log.requestId || traced.has(log.requestId)) continue;
    const serialized = JSON.stringify(log);
    const event = events.find((candidate) => serialized.includes(candidate.traceId));
    if (event) traced.set(log.requestId, event);
  }
  return traced;
}

function briefCompleteness(
  found: boolean,
  expired: boolean,
  partial: boolean,
): DiagnosticTraceBrief["completeness"] {
  if (!found) return expired ? "expired" : "not_found";
  return partial ? "partial" : "complete";
}

function briefSummary(count: number, expired: boolean): string {
  if (count) return `${count} retained diagnostic events`;
  return expired ? "Diagnostic evidence expired" : "No retained diagnostic evidence";
}

function traceLinks(events: DiagnosticEvent[]): {
  links: DiagnosticTraceBrief["links"];
  truncated: boolean;
} {
  const sessions = new Set(
    events
      .map((event) => event.attributes?.replay_session_id)
      .filter((value) => typeof value === "string"),
  );
  const links = [...sessions].slice(0, 32).flatMap((value) => {
    const parsed = safeIdSchema.safeParse({ idClass: "posthog.session", value });
    return parsed.success ? [parsed.data] : [];
  });
  return { links, truncated: sessions.size > 32 };
}

function serverLogGaps(
  found: boolean,
  logsRequested: boolean,
  serverSpans: DiagnosticTraceBrief["serverSpans"],
  logsTruncated: boolean,
): DiagnosticTraceBrief["visibilityGaps"] {
  if (found && logsRequested && !serverSpans.length)
    return [{ reason: "server_log_not_available" }];
  return logsTruncated
    ? [{ reason: "not_available", detail: "Server log collection bounded" }]
    : [];
}

const convexCursorSchema = z.strictObject({
  events: z.number().int().min(0).max(2_000),
  serverSpans: z.number().int().min(0).max(2_000),
  errors: z.number().int().min(0).max(2_000),
});

function convexPosition(after: string | undefined): z.infer<typeof convexCursorSchema> {
  if (!after) return { events: 0, serverSpans: 0, errors: 0 };
  try {
    return convexCursorSchema.parse(JSON.parse(Buffer.from(after, "base64url").toString("utf8")));
  } catch {
    throw new DiagError("Invalid Convex cursor.", 3);
  }
}

function pageConvexEvidence(
  events: DiagnosticEvent[],
  logs: LogRead["logs"],
  limit: number | undefined,
  after: string | undefined,
): {
  events: DiagnosticEvent[];
  serverSpans: DiagnosticTraceBrief["serverSpans"];
  errors: DiagnosticEvent[];
  allServerSpans: DiagnosticTraceBrief["serverSpans"];
  nextCursor: string | undefined;
  found: boolean;
} {
  const position = convexPosition(after);
  const sorted = events.toSorted((left, right) => left.occurredAt - right.occurredAt);
  const allServerSpans = toServerSpans(sorted, logs).toSorted(
    (left, right) => left.occurredAt - right.occurredAt,
  );
  const allErrors = sorted.filter((event) => event.kind === "error");
  const pageEvents = sorted.slice(position.events, position.events + (limit ?? 500));
  const serverSpans = allServerSpans.slice(
    position.serverSpans,
    position.serverSpans + (limit ?? 200),
  );
  const errors = allErrors.slice(position.errors, position.errors + (limit ?? 100));
  const next = {
    events: position.events + pageEvents.length,
    serverSpans: position.serverSpans + serverSpans.length,
    errors: position.errors + errors.length,
  };
  const more =
    next.events < sorted.length ||
    next.serverSpans < allServerSpans.length ||
    next.errors < allErrors.length;
  return {
    events: pageEvents,
    serverSpans,
    errors,
    allServerSpans,
    nextCursor: more ? Buffer.from(JSON.stringify(next)).toString("base64url") : undefined,
    found: sorted.length > 0,
  };
}

function buildBrief(
  code: string,
  target: string,
  events: DiagnosticEvent[],
  expired: boolean,
  logRead: LogRead,
  logsRequested: boolean,
  limit: number | undefined,
  after: string | undefined,
): DiagnosticTraceBrief {
  const page = pageConvexEvidence(events, logRead.logs, limit, after);
  const links = traceLinks(page.events);
  const gaps = serverLogGaps(page.found, logsRequested, page.allServerSpans, logRead.truncated);
  const truncated = Boolean(page.nextCursor) || links.truncated || logRead.truncated;
  return diagnosticTraceBriefSchema.parse({
    version: 1,
    code,
    target,
    retrievedAt: new Date().toISOString(),
    completeness: briefCompleteness(page.found, expired, gaps.length > 0 || truncated),
    summary: briefSummary(page.events.length, expired),
    journeyTraceId: page.events.find((event) => event.journeyTraceId)?.journeyTraceId,
    events: page.events,
    serverSpans: page.serverSpans,
    errors: page.errors,
    links: links.links,
    visibilityGaps: gaps,
    truncated,
    nextCursor: page.nextCursor,
  });
}

function render(brief: DiagnosticTraceBrief): string {
  const lines = [
    `Code: ${brief.code}`,
    `Target: ${brief.target}`,
    `Retrieved: ${brief.retrievedAt}`,
    `Completeness: ${brief.completeness}`,
    `Summary: ${brief.summary}`,
    ...(brief.flows?.length
      ? [
          "Flows:",
          ...brief.flows.flatMap((flow) => [
            `  ${flow.flow} v${flow.version} run=${flow.runId} ${flow.verdict}`,
            ...flow.steps.map(
              (step) =>
                `    ${step.id} ${step.status}${step.expectedDeadline === undefined ? "" : ` deadline=${new Date(step.expectedDeadline).toISOString()}`}`,
            ),
            ...flow.unexpected.map(
              (event) => `    unexpected ${event.attributes?.flow_step ?? event.eventId}`,
            ),
          ]),
        ]
      : []),
    "Events:",
    ...brief.events.flatMap((event) => [
      `  ${new Date(event.occurredAt).toISOString()} ${event.name} ${event.status}${event.requestId ? ` request=${event.requestId}` : ""}`,
      ...(event.safeStackFrames ?? []).map(
        (frame) =>
          `    ${frame.file}:${frame.line}${frame.column === undefined ? "" : `:${frame.column}`}${frame.function ? ` ${frame.function}` : ""}`,
      ),
    ]),
    "Server executions:",
    ...brief.serverSpans.flatMap((span) => [
      `  ${new Date(span.occurredAt).toISOString()} ${span.name} ${span.status} (${span.correlation})`,
      ...(span.logLines ?? []).map(
        (line) => `    ${new Date(line.occurredAt).toISOString()} ${line.level} ${line.message}`,
      ),
    ]),
    "Server log lines:",
    ...(brief.serverLogs ?? []).map(
      (line) =>
        `  ${new Date(line.occurredAt).toISOString()} ${line.spanId} ${line.level} ${line.message}`,
    ),
    "Visibility gaps:",
    ...brief.visibilityGaps.map((gap) => `  ${gap.source ? `${gap.source}: ` : ""}${gap.reason}`),
  ];
  if (brief.truncated) lines.push("Truncated: true");
  if (brief.nextCursor) lines.push(`Next cursor: ${brief.nextCursor}`);
  return lines.join("\n") + "\n";
}

function parseOtlpUrl(endpoint: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new DiagError("Invalid OTLP endpoint.", 3);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new DiagError("OTLP endpoint must use HTTP(S).", 3);
  if (url.username || url.password || url.hash)
    throw new DiagError("OTLP endpoint cannot include credentials or fragments.", 3);
  return url;
}

function assertOtlpEndpoint(endpoint: string, config: DiagConfig): URL {
  const url = parseOtlpUrl(endpoint);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!loopback && !config.otlp?.allowedEndpoints?.includes(url.href))
    throw new DiagError(
      "OTLP endpoint is not loopback or allowlisted in diag.otlp.allowedEndpoints.",
      3,
    );
  return url;
}

async function exportOtlp(brief: DiagnosticTraceBrief, endpoint: URL): Promise<void> {
  const spans = [...brief.events, ...brief.serverSpans].map((event) => {
    const end = Math.round(event.occurredAt + (event.durationMs ?? 0));
    return {
      traceId: event.traceId,
      spanId: event.spanId,
      parentSpanId: event.parentSpanId,
      name: event.name,
      startTimeUnixNano: `${event.occurredAt}000000`,
      endTimeUnixNano: `${end}000000`,
      attributes: [{ key: "q9.diagnostic.code", value: { stringValue: brief.code } }],
    };
  });
  const url = new URL(endpoint);
  if (url.pathname === "/") url.pathname = "/v1/traces";
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceSpans: [{ scopeSpans: [{ spans }] }] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
  } catch {
    throw new DiagError("OTLP export failed.", 4);
  }
}

async function readCommandBrief(
  config: Extract<Config, { adapter: "command" }>,
  root: string,
  code: string,
  target: string,
  options: Options,
): Promise<DiagnosticTraceBrief> {
  const command = config.command;
  const stdout = await run(
    command[0] ?? "",
    [...command.slice(1), ...commandArgs(code, options)],
    root,
  );
  let brief: DiagnosticTraceBrief;
  try {
    brief = diagnosticTraceBriefSchema.parse(JSON.parse(stdout));
  } catch {
    throw new DiagError("Command adapter returned an invalid DiagnosticTraceBrief/v1.", 4);
  }
  if (brief.code !== code || brief.target !== target)
    throw new DiagError("Command adapter returned a different code or target.", 4);
  return brief;
}

async function lookupRunCommand(
  config: Extract<Config, { adapter: "command" }>,
  root: string,
  runId: string,
  options: Options,
): Promise<DiagnosticEvent[]> {
  const targetArgs = options.prod
    ? ["--prod"]
    : options.deployment
      ? ["--deployment", options.deployment]
      : [];
  const stdout = await run(
    config.command[0] ?? "",
    [...config.command.slice(1), "run", runId, ...targetArgs],
    root,
  );
  return parseRunLookup(stdout, "Command");
}

function commandArgs(code: string, options: Options): string[] {
  const targetArgs = options.prod
    ? ["--prod"]
    : options.deployment
      ? ["--deployment", options.deployment]
      : [];
  return [
    "trace",
    code,
    ...targetArgs,
    ...(options.limit ? ["--limit", String(options.limit)] : []),
    ...(options.after ? ["--after", options.after] : []),
  ];
}

const lookupSchema = z.strictObject({
  events: z.array(diagnosticEventSchema).max(2_000),
  expired: z.boolean().optional(),
});
const runLookupSchema = z.strictObject({ events: z.array(diagnosticEventSchema).max(10_000) });

function parseRunLookup(stdout: string, adapter: "Command" | "Convex"): DiagnosticEvent[] {
  try {
    return runLookupSchema.parse(JSON.parse(stdout)).events;
  } catch {
    throw new DiagError(`${adapter} run lookup returned invalid DiagnosticEvent/v1 data.`, 4);
  }
}

function parseLookup(stdout: string, code: string): z.infer<typeof lookupSchema> {
  let lookup: z.infer<typeof lookupSchema>;
  try {
    lookup = lookupSchema.parse(JSON.parse(stdout));
  } catch {
    throw new DiagError("Convex lookup returned invalid DiagnosticEvent/v1 data.", 4);
  }
  const journeys = new Set(
    lookup.events.flatMap((event) =>
      event.traceId === code && event.journeyTraceId ? [event.journeyTraceId] : [],
    ),
  );
  const related = (event: DiagnosticEvent) =>
    event.traceId === code || event.journeyTraceId === code || journeys.has(event.traceId);
  if (!lookup.events.every(related))
    throw new DiagError("Convex lookup returned unrelated events.", 4);
  return lookup;
}

async function readConvexBrief(
  config: Extract<Config, { adapter: "convex" }>,
  root: string,
  code: string,
  target: string,
  options: Options,
  check: boolean,
): Promise<DiagnosticTraceBrief> {
  const cwd = path.resolve(root, config.convexDir);
  const binary = path.join(cwd, "node_modules", ".bin", "convex");
  const stdout = await invokeConvexLookup(config, root, { traceId: code }, options);
  const lookup = parseLookup(stdout, code);
  const logRead =
    !check && options.logs && lookup.events.length
      ? await readLogs(binary, cwd, deploymentArgs(options))
      : { logs: [], truncated: false };
  return buildBrief(
    code,
    target,
    lookup.events,
    lookup.expired ?? false,
    logRead,
    options.logs,
    options.limit,
    options.after,
  );
}

async function lookupRunConvex(
  config: Extract<Config, { adapter: "convex" }>,
  root: string,
  runId: string,
  options: Options,
): Promise<DiagnosticEvent[]> {
  const stdout = await invokeConvexLookup(config, root, { flowRun: runId }, options);
  return parseRunLookup(stdout, "Convex");
}

function invokeConvexLookup(
  config: Extract<Config, { adapter: "convex" }>,
  root: string,
  argument: { traceId: string } | { flowRun: string },
  options: Options,
): Promise<string> {
  const cwd = path.resolve(root, config.convexDir);
  const binary = path.join(cwd, "node_modules", ".bin", "convex");
  return run(
    binary,
    [
      "run",
      config.lookup ?? "diagnostics/lookup:trace",
      JSON.stringify(argument),
      ...deploymentArgs(options),
    ],
    cwd,
  );
}

async function attachFlows(
  brief: DiagnosticTraceBrief,
  config: DiagConfig,
  root: string,
  options: Options,
  definitions: Map<string, FlowDefinition>,
): Promise<DiagnosticTraceBrief> {
  const runs = findFlowRuns(brief.events).flatMap((flowRun) => {
    const definition = definitions.get(flowRun.flow);
    return definition ? [{ flowRun, definition }] : [];
  });
  if (!runs.length) return brief;
  const checked = await checkRuns(brief.events, runs, config, root, options);
  const incomplete = checked.some(
    ({ lookupUnavailable, truncated }) => lookupUnavailable || truncated,
  );
  return diagnosticTraceBriefSchema.parse({
    ...brief,
    flows: checked.map(({ entry }) => entry),
    completeness: incomplete && brief.completeness === "complete" ? "partial" : brief.completeness,
    truncated: brief.truncated || checked.some(({ truncated }) => truncated),
    visibilityGaps: checked.some(({ lookupUnavailable }) => lookupUnavailable)
      ? withRunLookupGap(brief.visibilityGaps)
      : brief.visibilityGaps,
  });
}

async function checkRuns(
  traceEvents: DiagnosticEvent[],
  runs: { flowRun: { flow: string; runId: string }; definition: FlowDefinition }[],
  config: DiagConfig,
  root: string,
  options: Options,
): Promise<Awaited<ReturnType<typeof checkOneRun>>[]> {
  const checked: Awaited<ReturnType<typeof checkOneRun>>[] = [];
  let lookupAllowed = true;
  for (const { flowRun, definition } of runs) {
    const result = await checkOneRun(
      traceEvents,
      flowRun,
      definition,
      config,
      root,
      options,
      lookupAllowed,
    );
    checked.push(result);
    if (result.lookupUnavailable) lookupAllowed = false;
  }
  return checked;
}

async function lookupRun(
  sources: Config[],
  root: string,
  runId: string,
  options: Options,
): Promise<DiagnosticEvent[]> {
  const lookups = sources.flatMap((source) =>
    source.adapter === "command"
      ? [lookupRunCommand(source, root, runId, options)]
      : source.adapter === "convex"
        ? [lookupRunConvex(source, root, runId, options)]
        : [lookupAxiomRun(source, runId)],
  );
  if (!lookups.length) throw new DiagError("No source can look up flow runs.", 4);
  const events = new Map<string, DiagnosticEvent>();
  for (const event of (await Promise.all(lookups)).flat())
    events.set(`${event.traceId}\0${event.eventId}`, event);
  return [...events.values()];
}

function findFlowRuns(events: DiagnosticEvent[]): { flow: string; runId: string }[] {
  const runs = new Map<string, { flow: string; runId: string }>();
  for (const event of events) {
    const runId = event.attributes?.flow_run;
    const flow = event.attributes?.flow;
    if (typeof runId === "string" && typeof flow === "string")
      runs.set(`${flow}\0${runId}`, { flow, runId });
  }
  return [...runs.values()];
}

function withRunLookupGap(
  gaps: DiagnosticTraceBrief["visibilityGaps"],
): DiagnosticTraceBrief["visibilityGaps"] {
  return gaps.some((gap) => gap.reason === "flow_run_lookup_unavailable")
    ? gaps
    : [...gaps.slice(0, 31), { reason: "flow_run_lookup_unavailable" }];
}

async function checkOneRun(
  traceEvents: DiagnosticEvent[],
  flowRun: { flow: string; runId: string },
  definition: FlowDefinition,
  config: DiagConfig,
  root: string,
  options: Options,
  lookupAllowed: boolean,
): Promise<{
  entry: NonNullable<DiagnosticTraceBrief["flows"]>[number];
  lookupUnavailable: boolean;
  truncated: boolean;
}> {
  let events = traceEvents.filter(
    (event) =>
      event.attributes?.flow_run === flowRun.runId && event.attributes.flow === flowRun.flow,
  );
  let lookupUnavailable = !lookupAllowed;
  if (lookupAllowed) {
    try {
      const fetched = await lookupRun(config.sources, root, flowRun.runId, options);
      if (!fetched.every((event) => event.attributes?.flow_run === flowRun.runId))
        throw new DiagError("Run lookup returned unrelated events.", 4);
      events = fetched;
    } catch {
      lookupUnavailable = true;
    }
  }
  const result = checkFlowRun(definition, events, Date.now());
  const truncated = result.unexpected.length > 100;
  return {
    entry: {
      flow: flowRun.flow,
      version: definition.version,
      runId: flowRun.runId,
      ...result,
      unexpected: result.unexpected.slice(0, 100),
    },
    lookupUnavailable,
    truncated,
  };
}

function writeCheck(config: DiagConfig, target: string, json: boolean): void {
  const adapters = config.sources.map((source) => source.adapter);
  process.stdout.write(
    json
      ? JSON.stringify({
          ok: true,
          adapter: adapters.length === 1 ? adapters[0] : undefined,
          adapters,
          target,
        }) + "\n"
      : `Diagnostics access OK (${adapters.join(", ")}, ${target})\n`,
  );
}

async function writeTrace(
  brief: DiagnosticTraceBrief,
  options: Options,
  endpoint: URL | undefined,
): Promise<number> {
  if (endpoint) await exportOtlp(brief, endpoint);
  process.stdout.write(options.json ? JSON.stringify(brief) + "\n" : render(brief));
  return brief.completeness === "not_found" || brief.completeness === "expired" ? 2 : 0;
}

function retrieveBrief(
  config: Config,
  root: string,
  code: string,
  target: string,
  options: Options,
  check: boolean,
): Promise<DiagnosticTraceBrief> {
  if (config.adapter === "command") return readCommandBrief(config, root, code, target, options);
  if (config.adapter === "convex")
    return readConvexBrief(config, root, code, target, options, check);
  return readAxiomBrief(config, code, target, options.limit ?? 500, options.after, options.logs);
}

function sourceName(sources: Config[], index: number): string {
  const adapter = sources[index]?.adapter ?? "unknown";
  return sources.filter((source) => source.adapter === adapter).length > 1
    ? `${adapter}.${index + 1}`
    : adapter;
}

async function mergedBrief(
  config: DiagConfig,
  root: string,
  code: string,
  target: string,
  options: Options,
): Promise<DiagnosticTraceBrief> {
  return mergeBriefs(
    config.sources.map((source, index) => ({
      name: sourceName(config.sources, index),
      trace: (after) => retrieveBrief(source, root, code, target, { ...options, after }, false),
    })),
    code,
    target,
    options.limit,
    options.after,
  );
}

export async function runDiag(root: string, args: string[]): Promise<number> {
  const { action, code, options } = parseArgs(args);
  const config = await readConfig(root);
  const definitions = await readFlows(root);
  const endpoint = options.otlp ? assertOtlpEndpoint(options.otlp, config) : undefined;
  const target = options.prod ? "production" : (options.deployment ?? "development");
  if (action === "check") {
    await checkSources(config, root, target, options);
    writeCheck(config, target, options.json);
    return 0;
  }
  if (!code) throw new DiagError("Missing diagnostic code.", 3);
  return traceSources(config, root, code, target, options, endpoint, definitions);
}

async function checkSources(
  config: DiagConfig,
  root: string,
  target: string,
  options: Options,
): Promise<void> {
  const probe = "00000000000000000000000000000001";
  try {
    await Promise.all(
      config.sources.map((source) =>
        source.adapter === "axiom"
          ? checkAxiom(source)
          : retrieveBrief(source, root, probe, target, options, true),
      ),
    );
  } catch (error) {
    if (error instanceof AxiomError) throw new DiagError(error.message, error.exitCode);
    throw error;
  }
}

async function traceSources(
  config: DiagConfig,
  root: string,
  code: string,
  target: string,
  options: Options,
  endpoint: URL | undefined,
  definitions: Map<string, FlowDefinition>,
): Promise<number> {
  let brief: DiagnosticTraceBrief;
  try {
    brief = await mergedBrief(config, root, code, target, options);
  } catch (error) {
    if (error instanceof AxiomError || error instanceof MergeError)
      throw new DiagError(error.message, error.exitCode);
    throw error;
  }
  return writeTrace(
    await attachFlows(brief, config, root, options, definitions),
    options,
    endpoint,
  );
}
