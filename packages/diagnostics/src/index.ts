import { z } from "zod";

export const diagnosticCodeSchema = z.string().regex(/^(?!0{32}$)[0-9a-f]{32}$/);
export const spanIdSchema = z.string().regex(/^(?!0{16}$)[0-9a-f]{16}$/);
export type DiagnosticCode = z.infer<typeof diagnosticCodeSchema>;

export function isDiagnosticCode(value: unknown): value is DiagnosticCode {
  return diagnosticCodeSchema.safeParse(value).success;
}

export function createDiagnosticCode(): DiagnosticCode {
  const bytes = new Uint8Array(16);
  do {
    crypto.getRandomValues(bytes);
  } while (bytes.every((byte) => byte === 0));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const UNKNOWN_REASONS = [
  "not_retained",
  "not_observable",
  "redacted",
  "provider_opaque",
  "expired",
  "not_available",
  "invalid",
  "diagnostics_disabled",
  "permission_denied",
  "server_log_not_available",
  "unknown",
] as const;

export const ATTRIBUTE_KEYS = [
  "action",
  "reason",
  "result",
  "status",
  "kind",
  "method",
  "origin",
  "route_template",
  "function",
  "operation_type",
  "response_class",
  "stage",
  "outcome",
  "size_bucket",
  "retry_count",
  "attempt",
  "duration_ms",
  "latency_ms",
  "count",
  "bytes",
  "retryable",
  "source_surface",
  "error_code",
  "replay_session_id",
] as const;

const attributeKey = z.enum(ATTRIBUTE_KEYS);
const forbidden =
  /(?:https?:\/\/|www\.|@|[?#]|bearer\s|authorization|cookie|password|secret|token|api[_-]?key|sk-[a-z0-9]|[a-z0-9_-]{24,}\.[a-z0-9_-]{24,}\.)/i;
const safeWord = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/;
const opaqueReplayId = /^[a-zA-Z0-9_-]{16,96}$/;
const routeTemplate = z
  .string()
  .min(1)
  .max(96)
  .regex(
    /^\/(?:(?:[a-z][a-z0-9_-]*|:[a-z][a-z0-9_]*)(?:\/(?:[a-z][a-z0-9_-]*|:[a-z][a-z0-9_]*))*)?$/,
  );
const functionIdentifier = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-zA-Z0-9_/-]+:[a-zA-Z0-9_]+$/);
const safeMessageSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => !forbidden.test(value) && /^[a-zA-Z0-9_.: -]+$/.test(value));
const attributeValue = z.union([
  z
    .string()
    .max(96)
    .refine((value) => safeWord.test(value) && !forbidden.test(value)),
  z.number().finite(),
  z.boolean(),
]);
const functionValue = z.union([attributeValue, functionIdentifier]);
const replayValue = z.string().regex(opaqueReplayId);

function safeAttributeValue(key: string, value: unknown): string | number | boolean | undefined {
  const schema =
    key === "route_template"
      ? routeTemplate
      : key === "replay_session_id"
        ? replayValue
        : key === "function"
          ? functionValue
          : attributeValue;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export const diagnosticAttributesSchema = z
  .partialRecord(
    attributeKey,
    z.union([attributeValue, routeTemplate, functionIdentifier, replayValue]),
  )
  .refine((attributes) => Object.keys(attributes).length <= 24, "At most 24 attributes")
  .refine(
    (attributes) =>
      Object.entries(attributes).every(
        ([key, value]) => safeAttributeValue(key, value) !== undefined,
      ),
    "Attribute value is not safe for its key",
  );

export const safeStackFrameSchema = z.strictObject({
  file: z
    .string()
    .min(1)
    .max(160)
    .refine(
      (value) =>
        !value.startsWith("/") &&
        !value.startsWith("file:") &&
        !value.includes("://") &&
        !value.includes("..") &&
        !forbidden.test(value) &&
        /^[a-zA-Z0-9_./:-]+$/.test(value),
    ),
  line: z.int().min(1).max(1_000_000),
  column: z.int().min(0).max(1_000_000).optional(),
  function: z
    .string()
    .min(1)
    .max(96)
    .regex(/^[a-zA-Z0-9_.:$<>-]+$/)
    .optional(),
});

export const diagnosticEventSchema = z
  .strictObject({
    version: z.literal(1),
    traceId: diagnosticCodeSchema,
    spanId: spanIdSchema,
    eventId: z
      .string()
      .min(1)
      .max(96)
      .regex(/^[a-zA-Z0-9_-]+$/),
    occurredAt: z.number().int().min(0),
    source: z.enum(["browser", "server"]),
    kind: z.enum(["navigation", "request", "event", "error", "span"]),
    name: z
      .string()
      .min(3)
      .max(96)
      .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/),
    status: z.enum(["unset", "ok", "error"]),
    level: z.enum(["info", "warning", "error"]),
    parentSpanId: spanIdSchema.optional(),
    journeyTraceId: diagnosticCodeSchema.optional(),
    durationMs: z.number().finite().min(0).max(604_800_000).optional(),
    requestId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .optional(),
    attributes: diagnosticAttributesSchema.optional(),
    errorClass: z
      .string()
      .min(1)
      .max(96)
      .regex(/^[a-zA-Z][a-zA-Z0-9_.:-]*$/)
      .optional(),
    safeMessage: safeMessageSchema.optional(),
    safeStackFrames: z.array(safeStackFrameSchema).max(12).optional(),
  })
  .refine(
    (event) => new TextEncoder().encode(JSON.stringify(event)).length <= 2048,
    "Event exceeds 2048 bytes",
  );
export type DiagnosticEvent = z.infer<typeof diagnosticEventSchema>;

export function redactDiagnosticAttributes(input: unknown): {
  attributes: DiagnosticEvent["attributes"];
  redactedKeys: string[];
} {
  const attributes: NonNullable<DiagnosticEvent["attributes"]> = {};
  const redactedKeys: string[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return { attributes, redactedKeys: ["$"] };
  for (const [key, value] of Object.entries(input)) {
    const safeValue = safeAttributeValue(key, value);
    if (
      Object.keys(attributes).length >= 24 ||
      !attributeKey.safeParse(key).success ||
      safeValue === undefined
    ) {
      redactedKeys.push(key);
      continue;
    }
    Object.assign(attributes, { [key]: safeValue });
  }
  return { attributes, redactedKeys };
}

export function sanitizeDiagnosticEvent(input: unknown): DiagnosticEvent {
  const candidate = z
    .looseObject({ attributes: z.unknown().optional(), safeStackFrames: z.unknown().optional() })
    .parse(input);
  const attributes = redactDiagnosticAttributes(candidate.attributes).attributes;
  const frames = z.array(safeStackFrameSchema).max(12).safeParse(candidate.safeStackFrames);
  return diagnosticEventSchema.parse({
    ...candidate,
    attributes,
    safeStackFrames: frames.success ? frames.data : undefined,
    safeMessage: safeMessageSchema.safeParse(candidate["safeMessage"]).success
      ? candidate["safeMessage"]
      : undefined,
  });
}

export const SAFE_ID_CLASSES = [
  "q9.diagnostic",
  "q9.journey",
  "convex.request",
  "posthog.session",
] as const;
export const safeIdSchema = z
  .strictObject({
    idClass: z.enum(SAFE_ID_CLASSES),
    value: z.string().min(1).max(128),
  })
  .superRefine((id, context) => {
    const valid =
      id.idClass === "q9.diagnostic" || id.idClass === "q9.journey"
        ? isDiagnosticCode(id.value)
        : id.idClass === "convex.request"
          ? /^[a-zA-Z0-9_-]{8,128}$/.test(id.value)
          : opaqueReplayId.test(id.value);
    if (!valid) context.addIssue({ code: "custom", message: "Unsafe identifier" });
  });
export type SafeId = z.infer<typeof safeIdSchema>;

export const visibilityGapSchema = z.strictObject({
  reason: z.enum(UNKNOWN_REASONS),
  detail: safeMessageSchema.optional(),
});
export const serverSpanSchema = z.strictObject({
  traceId: diagnosticCodeSchema,
  spanId: spanIdSchema,
  parentSpanId: spanIdSchema.optional(),
  requestId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  // Server spans are named after Convex functions, which are usually camelCase.
  name: z
    .string()
    .min(3)
    .max(96)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/),
  occurredAt: z.number().int().min(0),
  durationMs: z.number().finite().min(0).max(604_800_000).optional(),
  status: z.enum(["unset", "ok", "error"]),
  correlation: z.enum(["request_id", "trace_id", "heuristic", "unmatched"]),
  safeStackFrames: z.array(safeStackFrameSchema).max(12).optional(),
});
export const diagnosticTraceBriefSchema = z.strictObject({
  version: z.literal(1),
  code: diagnosticCodeSchema,
  target: z
    .string()
    .min(1)
    .max(96)
    .regex(/^[a-zA-Z0-9_.:-]+$/),
  retrievedAt: z.string().datetime({ offset: true }),
  completeness: z.enum(["complete", "partial", "not_found", "expired"]),
  summary: safeMessageSchema,
  journeyTraceId: diagnosticCodeSchema.optional(),
  events: z.array(diagnosticEventSchema).max(500),
  serverSpans: z.array(serverSpanSchema).max(200),
  errors: z.array(diagnosticEventSchema).max(100),
  links: z.array(safeIdSchema).max(32),
  visibilityGaps: z.array(visibilityGapSchema).max(32),
  truncated: z.boolean(),
});
export type DiagnosticTraceBrief = z.infer<typeof diagnosticTraceBriefSchema>;
