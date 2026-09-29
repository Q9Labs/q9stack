import { HttpApp, HttpServerResponse } from "@effect/platform";
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { diagnosticEventSchema } from "@q9labsai/diagnostics";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  diagnosticMiddleware,
  diagnosticsLayer,
  recordStep,
  redactLogRecord,
  redactSpan,
} from "../src/index.js";

describe("diagnostics server", () => {
  it("runs without an OTLP endpoint", async () => {
    const previous = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
    delete process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
    try {
      await expect(
        Effect.runPromise(Effect.succeed("ready").pipe(Effect.provide(diagnosticsLayer("test")))),
      ).resolves.toBe("ready");
    } finally {
      if (previous !== undefined) process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] = previous;
    }
  });

  it("continues a W3C traceparent and creates a fresh trace otherwise", async () => {
    const handler = HttpApp.toWebHandler(
      Effect.succeed(HttpServerResponse.empty()),
      diagnosticMiddleware,
    );
    const incoming = await handler(
      new Request("http://localhost/test", {
        headers: {
          traceparent: "00-1234567890abcdef1234567890abcdef-1234567890abcdef-01",
        },
      }),
    );
    expect(incoming.headers.get("x-q9-diagnostic-code")).toBe("1234567890abcdef1234567890abcdef");
    const fresh = await handler(new Request("http://localhost/test"));
    expect(fresh.headers.get("x-q9-diagnostic-code")).toMatch(/^[0-9a-f]{32}$/);
    expect(fresh.headers.get("x-q9-diagnostic-code")).not.toBe(
      incoming.headers.get("x-q9-diagnostic-code"),
    );
  });

  it("returns an opaque body for unexpected failures", async () => {
    const handler = HttpApp.toWebHandler(
      Effect.fail(new Error("password=private")),
      diagnosticMiddleware,
    );
    const response = await handler(new Request("http://localhost/fail"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ code: response.headers.get("x-q9-diagnostic-code"), error: "INTERNAL" });
    expect(JSON.stringify(body)).not.toContain("private");
  });

  it("keeps a safe Retry-After value when redacting a 503 response", async () => {
    const handler = HttpApp.toWebHandler(
      Effect.succeed(HttpServerResponse.empty({ status: 503, headers: { "retry-after": "30" } })),
      diagnosticMiddleware,
    );
    const response = await handler(new Request("http://localhost/maintenance"));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(await response.json()).toEqual({
      code: response.headers.get("x-q9-diagnostic-code"),
      error: "INTERNAL",
    });
  });

  it("redacts span and log export data", async () => {
    const spanExporter = new InMemorySpanExporter();
    const tracerProvider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(spanExporter)],
    });
    const span = tracerProvider.getTracer("test").startSpan("https://secret.example/path");
    span.setAttributes({ flow: "checkout", password: "private", reason: "secret-token" });
    span.addEvent("flow.step", { flow_step: "paid", authorization: "Bearer private" });
    span.end();
    const finished = spanExporter.getFinishedSpans()[0];
    if (!finished) throw new Error("No span recorded");
    const safeSpan = redactSpan(finished, "test-api");
    expect(safeSpan.name).toBe("server.operation");
    expect(safeSpan.attributes).toEqual({ flow: "checkout" });
    expect(safeSpan.events[0]?.attributes).toEqual({ flow_step: "paid" });

    const logExporter = new InMemoryLogRecordExporter();
    const loggerProvider = new LoggerProvider({
      processors: [new SimpleLogRecordProcessor({ exporter: logExporter })],
    });
    loggerProvider.getLogger("test").emit({
      body: "Bearer private",
      severityNumber: 9,
      attributes: {
        flow: "checkout",
        cookie: "private",
        traceId: "1234567890abcdef1234567890abcdef",
        spanId: "1234567890abcdef",
      },
    });
    await loggerProvider.forceFlush();
    const record = logExporter.getFinishedLogRecords()[0];
    if (!record) throw new Error("No log recorded");
    const safeRecord = redactLogRecord(record, "test-api");
    expect(safeRecord.body).toBe("Diagnostic log");
    expect(safeRecord.attributes).toEqual({ flow: "checkout" });
    expect(safeRecord.spanContext?.traceId).toBe("1234567890abcdef1234567890abcdef");
    await tracerProvider.shutdown();
    await loggerProvider.shutdown();
  });

  it("records a schema-valid flow step in the active trace", async () => {
    const event = await Effect.runPromise(
      Effect.withSpan(recordStep("checkout", "run-1", "paid", "success"), "test").pipe(
        Effect.withTracerEnabled(true),
      ),
    );
    expect(diagnosticEventSchema.safeParse(event).success).toBe(true);
    expect(event.attributes).toEqual({
      flow: "checkout",
      flow_run: "run-1",
      flow_step: "paid",
      outcome: "success",
    });
  });
});
