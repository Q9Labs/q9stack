import { diagnosticTraceBriefSchema } from "@q9labsai/diagnostics";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { AxiomError, checkAxiom, readAxiomBrief, type AxiomConfig } from "../src/diag/axiom.js";
import { mergeBriefs } from "../src/diag/merge.js";

const code = "1234567890abcdef1234567890abcdef";
const config: AxiomConfig = {
  adapter: "axiom",
  org: "test-org",
  traces: "traces",
  logs: "logs",
  tokenEnv: "Q9_TEST_AXIOM_TOKEN",
};
const originalToken = process.env["Q9_TEST_AXIOM_TOKEN"];

afterEach(() => {
  if (originalToken === undefined) delete process.env["Q9_TEST_AXIOM_TOKEN"];
  else process.env["Q9_TEST_AXIOM_TOKEN"] = originalToken;
});

type FakeRow = { _time: string; trace_id: string; span_id: string; [field: string]: unknown };

function tabular(rows: FakeRow[]): Response {
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return Response.json({
    format: "tabular",
    tables: [
      {
        fields: fields.map((name) => ({ name, type: "string" })),
        columns: fields.map((name) => rows.map((row) => row[name] ?? null)),
      },
    ],
  });
}

function fakeFetch(traces: FakeRow[], logs: FakeRow[] = []) {
  const requests: { apl: string; startTime: string; headers: Headers }[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    if (typeof init?.body !== "string") throw new Error("Invalid test query body");
    const parsed = z
      .object({ apl: z.string(), startTime: z.string() })
      .parse(JSON.parse(init.body));
    const headers = new Headers(init.headers);
    requests.push({ apl: parsed.apl, startTime: parsed.startTime, headers });
    const source = parsed.apl.includes("['traces']") ? traces : logs;
    const filtered = source.filter((row) => row["_time"] >= parsed.startTime);
    const limit = Number(/\| limit (\d+)/.exec(parsed.apl)?.[1] ?? 1000);
    return tabular(filtered.slice(0, limit));
  };
  return { fetcher, requests };
}

function span(index: number, time: number): FakeRow {
  return {
    _time: new Date(time).toISOString(),
    trace_id: code,
    span_id: (index + 1).toString(16).padStart(16, "0"),
    name: "api.request",
    kind: "server",
    "service.name": "api-service",
    duration: "0.125s",
    "status.code": "OK",
  };
}

describe("Axiom diagnostics source", () => {
  it("finds spans and errors, attaches safe log lines, and redacts attributes and body", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const time = Date.now() - 1000;
    const trace = {
      ...span(0, time),
      "status.code": "ERROR",
      "status.message": "private failure",
      "attributes.action": "retry",
      "attributes.secret": "private-token",
      events: [{ name: "exception", attributes: { "exception.message": "private cause" } }],
    };
    const logs = [
      { ...span(0, time + 1), body: "Queue retry", severity_text: "WARN" },
      { ...span(0, time + 2), body: "email@example.com", severity_text: "ERROR" },
    ];
    const { fetcher, requests } = fakeFetch([trace], logs);
    const brief = await readAxiomBrief(config, code, "production", 10, undefined, true, fetcher);
    expect(brief.completeness).toBe("complete");
    expect(brief.serverSpans).toHaveLength(1);
    expect(brief.serverSpans[0]).toMatchObject({
      status: "error",
      durationMs: 125,
      kind: "server",
      serviceName: "api-service",
      attributes: { action: "retry" },
      logLines: [
        { message: "Redacted log body", level: "warning" },
        { message: "Redacted log body", level: "error" },
      ],
    });
    expect(brief.errors.map((error) => error.name)).toEqual(["otel.error", "otel.exception"]);
    expect(JSON.stringify(brief)).not.toMatch(/private|example.com/);
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer private-test-token");
    expect(requests[0]?.headers.get("X-AXIOM-ORG-ID")).toBe("test-org");
    expect(requests[0]?.apl).toContain(`where trace_id == "${code}"`);
  });

  it("pages beyond 1000 rows by time and removes duplicate spans", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const start = Date.now() - 20_000;
    const traces = Array.from({ length: 1002 }, (_, index) => span(index, start + index));
    traces[1001] = { ...span(1001, start + 1001), span_id: traces[1000]?.span_id ?? "" };
    const { fetcher, requests } = fakeFetch(traces);
    const first = await readAxiomBrief(
      { ...config, logs: undefined },
      code,
      "production",
      1000,
      undefined,
      false,
      fetcher,
    );
    expect(first.serverSpans).toHaveLength(1000);
    expect(first.nextCursor).toBeTruthy();
    const second = await readAxiomBrief(
      { ...config, logs: undefined },
      code,
      "production",
      1000,
      first.nextCursor,
      false,
      fetcher,
    );
    expect(second.serverSpans).toHaveLength(1);
    expect(second.nextCursor).toBeUndefined();
    expect(requests.length).toBeGreaterThan(2);
  });

  it("does not re-emit a duplicate span across cursor pages", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const start = Date.now() - 20_000;
    const traces = Array.from({ length: 502 }, (_, index) => span(index, start + index));
    traces[500] = { ...span(500, start + 500), span_id: traces[499]?.span_id ?? "" };
    const { fetcher } = fakeFetch(traces);
    const source = { ...config, logs: undefined };
    const first = await readAxiomBrief(source, code, "production", 500, undefined, false, fetcher);
    const second = await readAxiomBrief(
      source,
      code,
      "production",
      500,
      first.nextCursor,
      false,
      fetcher,
    );
    expect(first.serverSpans).toHaveLength(500);
    expect(second.serverSpans).toHaveLength(1);
    expect(second.serverSpans[0]?.spanId).toBe(span(501, start + 501).span_id);
    expect(second.nextCursor).toBeUndefined();
  });

  it("marks a per-span log-line cap as partial and truncated", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const start = Date.now() - 20_000;
    const logs = Array.from({ length: 101 }, (_, index) => ({
      ...span(0, start + index),
      body: `private ${index}`,
      severity_text: "INFO",
    }));
    const { fetcher } = fakeFetch([span(0, start)], logs);
    const brief = await readAxiomBrief(config, code, "production", 10, undefined, true, fetcher);
    expect(brief.serverSpans[0]?.logLines).toHaveLength(100);
    expect(brief.truncated).toBe(true);
    expect(brief.completeness).toBe("partial");
    expect(brief.visibilityGaps).toContainEqual({
      reason: "not_available",
      detail: "Axiom span log lines bounded",
    });
  });

  it("preserves and pages redacted log records when no trace dataset is configured", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const time = Date.now() - 1000;
    const logs = [
      { ...span(0, time), body: "private one", severity_text: "INFO" },
      { ...span(1, time + 1), body: "private two", severity_text: "ERROR" },
    ];
    const { fetcher } = fakeFetch([], logs);
    const source = { ...config, traces: undefined };
    const first = await readAxiomBrief(source, code, "production", 1, undefined, true, fetcher);
    expect(first.serverLogs).toMatchObject([{ message: "Redacted log body", level: "info" }]);
    expect(first.nextCursor).toBeTruthy();
    const second = await readAxiomBrief(
      source,
      code,
      "production",
      1,
      first.nextCursor,
      true,
      fetcher,
    );
    expect(second.serverLogs).toMatchObject([{ message: "Redacted log body", level: "error" }]);
    expect(second.nextCursor).toBeUndefined();
    expect(JSON.stringify([first, second])).not.toContain("private");
  });

  it("attaches a logs-only source to a matching span from another source", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const time = Date.now() - 1000;
    const { fetcher } = fakeFetch(
      [],
      [{ ...span(0, time), body: "private", severity_text: "WARN" }],
    );
    const logs = await readAxiomBrief(
      { ...config, traces: undefined },
      code,
      "production",
      10,
      undefined,
      true,
      fetcher,
    );
    const own = diagnosticTraceBriefSchema.parse({
      version: 1,
      code,
      target: "production",
      retrievedAt: new Date().toISOString(),
      completeness: "complete",
      summary: "One own span",
      events: [],
      serverSpans: [
        {
          traceId: code,
          spanId: span(0, time).span_id,
          name: "api.request",
          occurredAt: time,
          status: "ok",
          correlation: "trace_id",
        },
      ],
      errors: [],
      links: [],
      visibilityGaps: [],
      truncated: false,
    });
    const merged = await mergeBriefs(
      [
        { name: "command", trace: async () => own },
        { name: "axiom", trace: async () => logs },
      ],
      code,
      "production",
    );
    expect(merged.serverSpans[0]?.logLines).toMatchObject([
      { level: "warning", message: "Redacted log body" },
    ]);
    expect(merged.serverLogs).toHaveLength(1);
    expect(merged.completeness).toBe("complete");
  });

  it("checks every configured dataset with one-row queries", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const { fetcher, requests } = fakeFetch([], []);
    await checkAxiom(config, fetcher);
    expect(requests.map((request) => request.apl)).toEqual([
      "['traces'] | limit 1",
      "['logs'] | limit 1",
    ]);
  });

  it("reports a missing token by variable name, without its value", async () => {
    delete process.env["Q9_TEST_AXIOM_TOKEN"];
    const { fetcher } = fakeFetch([]);
    await expect(
      readAxiomBrief(config, code, "production", 10, undefined, true, fetcher),
    ).rejects.toMatchObject({
      exitCode: 3,
      message: "Missing Axiom query token in Q9_TEST_AXIOM_TOKEN.",
    });
  });

  it.each([401, 403, 429, 500])("handles HTTP %i without exposing the token", async (status) => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const fetcher: typeof fetch = async () => new Response("private-test-token", { status });
    let failure: unknown;
    try {
      await readAxiomBrief(config, code, "production", 10, undefined, true, fetcher);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AxiomError);
    expect(failure).toMatchObject({ exitCode: 4 });
    expect(String(failure)).not.toContain("private-test-token");
    if (status >= 429) expect(String(failure)).toContain("Retry");
  });
});
