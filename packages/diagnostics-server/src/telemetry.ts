import { NodeSdk } from "@effect/opentelemetry";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import type { LogRecordExporter, ReadableLogRecord } from "@opentelemetry/sdk-logs";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import {
  diagnosticCodeSchema,
  redactDiagnosticAttributes,
  spanIdSchema,
} from "@q9labsai/diagnostics";
import { Layer } from "effect";

function safeSpanContext(context: { traceId: string; spanId: string; traceFlags: number }) {
  return { traceId: context.traceId, spanId: context.spanId, traceFlags: context.traceFlags };
}

export function redactSpan(span: ReadableSpan, serviceName: string): ReadableSpan {
  return {
    name: "server.operation",
    kind: span.kind,
    spanContext: () => safeSpanContext(span.spanContext()),
    ...(span.parentSpanContext
      ? { parentSpanContext: safeSpanContext(span.parentSpanContext) }
      : {}),
    startTime: span.startTime,
    endTime: span.endTime,
    duration: span.duration,
    ended: span.ended,
    attributes: redactDiagnosticAttributes(span.attributes).attributes ?? {},
    events: span.events.map((event) => ({
      time: event.time,
      name: event.name === "flow.step" ? "flow.step" : "server.event",
      attributes: redactDiagnosticAttributes(event.attributes).attributes ?? {},
    })),
    links: [],
    status: { code: span.status.code },
    resource: resourceFromAttributes({ "service.name": serviceName }),
    instrumentationScope: { name: "q9.diagnostics" },
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount,
  };
}

export function redactLogRecord(record: ReadableLogRecord, serviceName: string): ReadableLogRecord {
  const traceId = record.spanContext?.traceId ?? record.attributes["traceId"];
  const spanId = record.spanContext?.spanId ?? record.attributes["spanId"];
  const spanContext =
    typeof traceId === "string" &&
    typeof spanId === "string" &&
    diagnosticCodeSchema.safeParse(traceId).success &&
    spanIdSchema.safeParse(spanId).success
      ? safeSpanContext({
          traceId,
          spanId,
          traceFlags: record.spanContext?.traceFlags ?? 1,
        })
      : undefined;
  return {
    hrTime: record.hrTime,
    hrTimeObserved: record.hrTimeObserved,
    ...(spanContext ? { spanContext } : {}),
    ...(record.severityNumber ? { severityNumber: record.severityNumber } : {}),
    body: "Diagnostic log",
    eventName: "diagnostic.log",
    severityText: "DIAGNOSTIC",
    attributes: redactDiagnosticAttributes(record.attributes).attributes ?? {},
    resource: resourceFromAttributes({ "service.name": serviceName }),
    instrumentationScope: { name: "q9.diagnostics" },
    droppedAttributesCount: record.droppedAttributesCount,
  };
}

function redactedSpanExporter(exporter: SpanExporter, serviceName: string): SpanExporter {
  return {
    export: (spans, callback) =>
      exporter.export(
        spans.map((span) => redactSpan(span, serviceName)),
        callback,
      ),
    forceFlush: () => exporter.forceFlush?.() ?? Promise.resolve(),
    shutdown: () => exporter.shutdown(),
  };
}

function redactedLogExporter(exporter: LogRecordExporter, serviceName: string): LogRecordExporter {
  return {
    export: (records, callback) =>
      exporter.export(
        records.map((record) => redactLogRecord(record, serviceName)),
        callback,
      ),
    forceFlush: () => exporter.forceFlush(),
    shutdown: () => exporter.shutdown(),
  };
}

function otlpHeaders(value: string | undefined): { [key: string]: string } {
  if (!value) return {};
  return Object.fromEntries(
    value.split(",").flatMap((entry) => {
      const separator = entry.indexOf("=");
      if (separator < 1) return [];
      return [[entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()]];
    }),
  );
}

// Signal-specific headers override shared ones, as the OTel spec defines, so traces and logs can reach different datasets.
export function signalHeaders(signal: "TRACES" | "LOGS"): { [key: string]: string } {
  return {
    ...otlpHeaders(process.env["OTEL_EXPORTER_OTLP_HEADERS"]),
    ...otlpHeaders(process.env[`OTEL_EXPORTER_OTLP_${signal}_HEADERS`]),
  };
}

export function diagnosticsLayer(serviceName: string): Layer.Layer<never> {
  const endpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  if (!endpoint) return Layer.empty;
  const base = endpoint.replace(/\/$/, "");
  const traces = redactedSpanExporter(
    new OTLPTraceExporter({ url: `${base}/v1/traces`, headers: signalHeaders("TRACES") }),
    serviceName,
  );
  const logs = redactedLogExporter(
    new OTLPLogExporter({ url: `${base}/v1/logs`, headers: signalHeaders("LOGS") }),
    serviceName,
  );
  return NodeSdk.layer(() => ({
    resource: { serviceName },
    spanProcessor: new BatchSpanProcessor(traces),
    logRecordProcessor: new BatchLogRecordProcessor({ exporter: logs }),
  }));
}
