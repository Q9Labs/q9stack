import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  diagnosticCodeSchema,
  diagnosticEventSchema,
  diagnosticTraceBriefSchema,
  safeIdSchema,
  spanIdSchema,
  type DiagnosticEvent,
  type DiagnosticTraceBrief,
} from "@q9labsai/diagnostics";
import { z } from "zod";

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
]);
type Config = z.infer<typeof configSchema>;
type Options = {
  prod: boolean;
  deployment: string | undefined;
  json: boolean;
  logs: boolean;
  otlp: string | undefined;
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
      throw new DiagError("Unknown diag option: " + flag, 3);
  }
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
  if (options.otlp || !options.logs) throw new DiagError("Those options apply only to trace.", 3);
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
  };
  while (args.length) consumeFlag(args.shift() ?? "", args, options);
  validateTarget(action, options);
  return { action, code, options };
}

async function readConfig(root: string): Promise<Config> {
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
  const rootSchema = z.looseObject({ diag: configSchema.optional() });
  const result = rootSchema.safeParse(parsed);
  if (!result.success || !result.data.diag)
    throw new DiagError("Configure diag.adapter in q9.config.json.", 3);
  const config = result.data.diag;
  return config;
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

const logSchema = z.looseObject({
  requestId: z.string().optional(),
  identifier: z.string().optional(),
  executionTimestamp: z.number().optional(),
  timestamp: z.number().optional(),
  executionTime: z.number().optional(),
  success: z.boolean().optional(),
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
    const stop = () => {
      truncated = true;
      child.kill("SIGTERM");
    };
    const timer = setTimeout(stop, 2_500);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 1_000_000) {
        stop();
        return;
      }
      buffer += chunk;
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (lines.length >= 500) {
          stop();
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

function safeName(name: string | undefined): string | undefined {
  const dotted = name?.replaceAll(/[/:]/g, ".");
  return dotted && /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(dotted) && dotted.length <= 96
    ? dotted
    : undefined;
}

function correlateLog(
  log: z.infer<typeof logSchema>,
  events: DiagnosticEvent[],
  requests: Map<string | undefined, DiagnosticEvent>,
  millis: number,
): { parent: DiagnosticEvent; correlation: "request_id" | "heuristic" } | undefined {
  const exact = log.requestId ? requests.get(log.requestId) : undefined;
  if (exact) return { parent: exact, correlation: "request_id" };
  const heuristic = events.find(
    (event) =>
      event.attributes?.function === log.identifier && Math.abs(event.occurredAt - millis) <= 5_000,
  );
  return heuristic ? { parent: heuristic, correlation: "heuristic" } : undefined;
}

function safeLogRequestId(value: string | undefined): string | undefined {
  return value && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : undefined;
}

function logDurationMs(value: number | undefined): number | undefined {
  return value !== undefined && value >= 0 ? Math.round(value * 1000) : undefined;
}

function logToServerSpan(
  log: z.infer<typeof logSchema>,
  index: number,
  events: DiagnosticEvent[],
  requests: Map<string | undefined, DiagnosticEvent>,
): DiagnosticTraceBrief["serverSpans"][number] | undefined {
  const millis = Math.round((log.executionTimestamp ?? log.timestamp ?? 0) * 1000);
  const match = correlateLog(log, events, requests, millis);
  const name = safeName(log.identifier);
  if (!match || !name) return undefined;
  const spanId = (index + 1).toString(16).padStart(16, "0");
  if (!spanIdSchema.safeParse(spanId).success) return undefined;
  return {
    traceId: match.parent.traceId,
    spanId,
    parentSpanId: match.parent.spanId,
    requestId: safeLogRequestId(log.requestId),
    name,
    occurredAt: millis,
    durationMs: logDurationMs(log.executionTime),
    status: log.success === false ? "error" : "ok",
    correlation: match.correlation,
  };
}

function toServerSpans(events: DiagnosticEvent[], logs: z.infer<typeof logSchema>[]) {
  const requests = new Map(
    events.filter((event) => event.requestId).map((event) => [event.requestId, event]),
  );
  return logs.flatMap((log, index) => {
    const span = logToServerSpan(log, index, events, requests);
    return span ? [span] : [];
  });
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

function briefTruncated(
  eventCount: number,
  errorCount: number,
  spanCount: number,
  linksTruncated: boolean,
  logsTruncated: boolean,
): boolean {
  return eventCount > 500 || errorCount > 100 || spanCount > 200 || linksTruncated || logsTruncated;
}

function buildBrief(
  code: string,
  target: string,
  events: DiagnosticEvent[],
  expired: boolean,
  logRead: LogRead,
  logsRequested: boolean,
): DiagnosticTraceBrief {
  const sorted = events.toSorted((left, right) => left.occurredAt - right.occurredAt);
  const bounded = sorted.slice(0, 500);
  const allServerSpans = toServerSpans(bounded, logRead.logs).toSorted(
    (left, right) => left.occurredAt - right.occurredAt,
  );
  const serverSpans = allServerSpans.slice(0, 200);
  const allErrors = bounded.filter((event) => event.kind === "error");
  const errors = allErrors.slice(0, 100);
  const links = traceLinks(bounded);
  const found = bounded.length > 0;
  const gaps = serverLogGaps(found, logsRequested, serverSpans, logRead.truncated);
  const truncated = briefTruncated(
    sorted.length,
    allErrors.length,
    allServerSpans.length,
    links.truncated,
    logRead.truncated,
  );
  return diagnosticTraceBriefSchema.parse({
    version: 1,
    code,
    target,
    retrievedAt: new Date().toISOString(),
    completeness: briefCompleteness(found, expired, gaps.length > 0 || truncated),
    summary: briefSummary(bounded.length, expired),
    journeyTraceId: bounded.find((event) => event.journeyTraceId)?.journeyTraceId,
    events: bounded,
    serverSpans,
    errors,
    links: links.links,
    visibilityGaps: gaps,
    truncated,
  });
}

function render(brief: DiagnosticTraceBrief): string {
  const lines = [
    `Code: ${brief.code}`,
    `Target: ${brief.target}`,
    `Retrieved: ${brief.retrievedAt}`,
    `Completeness: ${brief.completeness}`,
    `Summary: ${brief.summary}`,
    "Events:",
    ...brief.events.flatMap((event) => [
      `  ${new Date(event.occurredAt).toISOString()} ${event.name} ${event.status}${event.requestId ? ` request=${event.requestId}` : ""}`,
      ...(event.safeStackFrames ?? []).map(
        (frame) =>
          `    ${frame.file}:${frame.line}${frame.column === undefined ? "" : `:${frame.column}`}${frame.function ? ` ${frame.function}` : ""}`,
      ),
    ]),
    "Server executions:",
    ...brief.serverSpans.map(
      (span) =>
        `  ${new Date(span.occurredAt).toISOString()} ${span.name} ${span.status} (${span.correlation})`,
    ),
    "Visibility gaps:",
    ...brief.visibilityGaps.map((gap) => `  ${gap.reason}`),
  ];
  if (brief.truncated) lines.push("Truncated: true");
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

function assertOtlpEndpoint(endpoint: string, config: Config): URL {
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
  const targetArgs = options.prod
    ? ["--prod"]
    : options.deployment
      ? ["--deployment", options.deployment]
      : [];
  const stdout = await run(
    command[0] ?? "",
    [...command.slice(1), "trace", code, ...targetArgs],
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

const lookupSchema = z.strictObject({
  events: z.array(diagnosticEventSchema).max(2_000),
  expired: z.boolean().optional(),
});

function parseLookup(stdout: string, code: string): z.infer<typeof lookupSchema> {
  let lookup: z.infer<typeof lookupSchema>;
  try {
    lookup = lookupSchema.parse(JSON.parse(stdout));
  } catch {
    throw new DiagError("Convex lookup returned invalid DiagnosticEvent/v1 data.", 4);
  }
  if (lookup.events.some((event) => event.traceId !== code && event.journeyTraceId !== code))
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
  const stdout = await run(
    binary,
    [
      "run",
      config.lookup ?? "diagnostics/lookup:trace",
      JSON.stringify({ traceId: code }),
      ...deploymentArgs(options),
    ],
    cwd,
  );
  const lookup = parseLookup(stdout, code);
  const logRead =
    !check && options.logs && lookup.events.length
      ? await readLogs(binary, cwd, deploymentArgs(options))
      : { logs: [], truncated: false };
  return buildBrief(code, target, lookup.events, lookup.expired ?? false, logRead, options.logs);
}

function writeCheck(config: Config, target: string, json: boolean): void {
  process.stdout.write(
    json
      ? JSON.stringify({ ok: true, adapter: config.adapter, target }) + "\n"
      : `Diagnostics access OK (${config.adapter}, ${target})\n`,
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
  return readConvexBrief(config, root, code, target, options, check);
}

export async function runDiag(root: string, args: string[]): Promise<number> {
  const { action, code, options } = parseArgs(args);
  const config = await readConfig(root);
  const endpoint = options.otlp ? assertOtlpEndpoint(options.otlp, config) : undefined;
  const target = options.prod ? "production" : (options.deployment ?? "development");
  const lookupCode = action === "check" ? "00000000000000000000000000000001" : code;
  if (!lookupCode) throw new DiagError("Missing diagnostic code.", 3);
  const brief = await retrieveBrief(config, root, lookupCode, target, options, action === "check");
  if (action === "check") {
    writeCheck(config, target, options.json);
    return 0;
  }
  return writeTrace(brief, options, endpoint);
}
