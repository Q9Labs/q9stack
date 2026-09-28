import { api } from "@__APP_SLUG__/convex";
import {
  createDiagnosticCode,
  sanitizeDiagnosticEvent,
  type DiagnosticEvent,
} from "@q9labsai/diagnostics";

import { convexClient } from "./convex.js";

const MAX_QUEUE = 100;
const BATCH_SIZE = 20;
let tabJourneyTraceId: string | undefined;
function toWireEvent(event: DiagnosticEvent) {
  return {
    version: event.version,
    traceId: event.traceId,
    spanId: event.spanId,
    eventId: event.eventId,
    occurredAt: event.occurredAt,
    source: event.source,
    kind: event.kind,
    name: event.name,
    status: event.status,
    level: event.level,
    ...(event.parentSpanId !== undefined && { parentSpanId: event.parentSpanId }),
    ...(event.journeyTraceId !== undefined && { journeyTraceId: event.journeyTraceId }),
    ...(event.durationMs !== undefined && { durationMs: event.durationMs }),
    ...(event.attributes !== undefined && { attributes: event.attributes }),
    ...(event.errorClass !== undefined && { errorClass: event.errorClass }),
    ...(event.safeMessage !== undefined && { safeMessage: event.safeMessage }),
    ...(event.safeStackFrames !== undefined && {
      safeStackFrames: event.safeStackFrames.map((frame) => ({
        file: frame.file,
        line: frame.line,
        ...(frame.column !== undefined && { column: frame.column }),
        ...(frame.function !== undefined && { function: frame.function }),
      })),
    }),
  };
}

const queue: ReturnType<typeof toWireEvent>[] = [];
let enabled = false;
let flushing = false;

function journeyTraceId(): string {
  if (tabJourneyTraceId) return tabJourneyTraceId;
  try {
    const stored = sessionStorage.getItem("q9_journey_trace_id");
    if (stored && /^[0-9a-f]{32}$/.test(stored)) {
      tabJourneyTraceId = stored;
      return stored;
    }
  } catch {
    // Private browsing may disable session storage.
  }
  const minted = createDiagnosticCode();
  tabJourneyTraceId = minted;
  try {
    sessionStorage.setItem("q9_journey_trace_id", minted);
  } catch {
    /* Ephemeral tab ID remains valid. */
  }
  return minted;
}

function spanId(): string {
  let value = "";
  do value = createDiagnosticCode().slice(0, 16);
  while (/^0{16}$/.test(value));
  return value;
}

function safeRoute(pathname: string): string | undefined {
  switch (pathname) {
    case "/":
      return "/";
    case "/sign-in":
      return "/sign-in";
    case "/sign-up":
      return "/sign-up";
    case "/forgot-password":
      return "/forgot-password";
    default:
      return undefined;
  }
}

// No analytics dependency: PostHog can attach diagnostic_trace_id here later.
export function correlateDiagnosticTraceId(_traceId: string): void {}

function enqueue(event: DiagnosticEvent): void {
  if (!enabled) return;
  if (queue.length >= MAX_QUEUE) return;
  queue.push(toWireEvent(event));
  void flush();
}

async function flush(): Promise<boolean> {
  if (!enabled || flushing || queue.length === 0) return false;
  flushing = true;
  const batch = queue.slice(0, BATCH_SIZE);
  try {
    await convexClient.mutation(api.diagnostics.ingest.ingest, { events: batch });
    queue.splice(0, batch.length);
    return true;
  } catch {
    // Diagnostics delivery is independent of the application operation.
    return false;
  } finally {
    flushing = false;
    if (queue.length > 0 && queue[0] !== batch[0]) void flush();
  }
}

function capture(
  name: string,
  kind: DiagnosticEvent["kind"],
  traceId: string,
  attributes?: DiagnosticEvent["attributes"],
  status: DiagnosticEvent["status"] = kind === "error" ? "error" : "ok",
): void {
  try {
    enqueue(
      sanitizeDiagnosticEvent({
        version: 1,
        traceId,
        journeyTraceId: traceId === journeyTraceId() ? undefined : journeyTraceId(),
        spanId: spanId(),
        eventId: crypto.randomUUID().replaceAll("-", ""),
        occurredAt: Date.now(),
        source: "browser",
        kind,
        name,
        status,
        level: status === "error" ? "error" : "info",
        attributes,
      }),
    );
  } catch {
    // Capture cannot interrupt UI work.
  }
}

export function startDiagnostics(): () => void {
  enabled = true;
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    enabled = false;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

function onError(): void {
  capture("browser.unhandled_error", "error", journeyTraceId());
}
function onRejection(): void {
  capture("browser.unhandled_rejection", "error", journeyTraceId());
}

export function captureNavigation(pathname: string): void {
  const route = safeRoute(pathname);
  if (route)
    capture("browser.navigation", "navigation", journeyTraceId(), { route_template: route });
}

export async function timedConvexAction<T>(
  functionName: string,
  operation: () => Promise<T>,
): Promise<T> {
  // Convex's browser action result does not include its server request ID.
  const started = performance.now();
  try {
    const result = await operation();
    capture("convex.call", "request", journeyTraceId(), {
      function: functionName,
      operation_type: "action",
      duration_ms: Math.round(performance.now() - started),
      result: "ok",
    });
    return result;
  } catch (error) {
    capture(
      "convex.call",
      "request",
      journeyTraceId(),
      {
        function: functionName,
        operation_type: "action",
        duration_ms: Math.round(performance.now() - started),
        result: "error",
      },
      "error",
    );
    throw error;
  }
}

export function captureServerFailure(traceId: string): void {
  correlateDiagnosticTraceId(traceId);
  capture("convex.function.failed", "error", traceId, { error_code: "INTERNAL" });
}

export async function reportUnexpectedError(): Promise<string | undefined> {
  if (!enabled) return undefined;
  const code = createDiagnosticCode();
  const now = Date.now();
  const base = {
    version: 1,
    spanId: spanId(),
    occurredAt: now,
    source: "browser",
  };
  try {
    const journey = sanitizeDiagnosticEvent({
      ...base,
      traceId: journeyTraceId(),
      eventId: crypto.randomUUID().replaceAll("-", ""),
      kind: "event",
      name: "browser.failure_context",
      status: "ok",
      level: "info",
    });
    const failure = sanitizeDiagnosticEvent({
      ...base,
      traceId: code,
      journeyTraceId: journeyTraceId(),
      eventId: crypto.randomUUID().replaceAll("-", ""),
      kind: "error",
      name: "browser.unexpected_error",
      status: "error",
      level: "error",
      errorClass: "INTERNAL",
    });
    await convexClient.mutation(api.diagnostics.ingest.ingest, {
      events: [toWireEvent(journey), toWireEvent(failure)],
    });
    correlateDiagnosticTraceId(code);
    return code;
  } catch {
    return undefined;
  }
}
