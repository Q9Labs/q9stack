import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { diagnosticTraceBriefSchema } from "@q9labsai/diagnostics";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { runDiag } from "../src/diag.js";
import {
  AxiomError,
  checkAxiom,
  lookupAxiomRun,
  readAxiomBrief,
  type AxiomConfig,
} from "../src/diag/axiom.js";
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
const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
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
    const traceMatch = /where trace_id == "([a-f0-9]+)"/.exec(parsed.apl)?.[1];
    const runMatch = /flow_run(?:'\])? == "([^"]+)"/.exec(parsed.apl)?.[1];
    const filtered = source
      .filter(
        (row) => row["_time"] >= parsed.startTime && (!traceMatch || row.trace_id === traceMatch),
      )
      .flatMap((row) => {
        if (!parsed.apl.includes("mv-expand events")) return [row];
        const events = z.array(z.unknown()).safeParse(row["events"]);
        return events.success ? events.data.map((event) => ({ ...row, events: event })) : [];
      })
      .filter((row) => {
        if (!runMatch) return true;
        if (parsed.apl.includes("mv-expand events")) {
          const event = z
            .looseObject({ attributes: z.looseObject({ flow_run: z.string().optional() }) })
            .safeParse(row["events"]);
          return event.success && event.data.attributes.flow_run === runMatch;
        }
        return row["attributes.flow_run"] === runMatch;
      });
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

const syntaxErrorFetch: typeof fetch = async () =>
  Response.json({ code: 400, detail: { message: "syntax error" } }, { status: 400 });

describe("Axiom diagnostics source", () => {
  it("maps a span event and a correlated log to one redacted flow event", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const time = Date.now() - 1000;
    const attrs = {
      flow: "resume.import",
      flow_run: "run_1",
      flow_step: "uploaded",
      outcome: "stored",
      secret: "private-token",
    };
    const trace = {
      ...span(0, time),
      events: [{ name: "q9.flow.step", timestamp: time * 1_000_000, attributes: attrs }],
    };
    const log = {
      ...span(0, time),
      ...Object.fromEntries(
        Object.entries(attrs).map(([key, value]) => [`attributes.${key}`, value]),
      ),
      body: "private-token",
    };
    const { fetcher } = fakeFetch([trace], [log]);
    const brief = await readAxiomBrief(config, code, "production", 10, undefined, true, fetcher);
    expect(brief.events).toHaveLength(1);
    expect(brief.events[0]).toMatchObject({
      source: "server",
      kind: "event",
      name: "resume.import",
      occurredAt: time,
      attributes: {
        flow: "resume.import",
        flow_run: "run_1",
        flow_step: "uploaded",
        outcome: "stored",
      },
    });
    expect(JSON.stringify(brief.events)).not.toContain("private-token");
    expect(
      (
        await readAxiomBrief(
          { ...config, logs: undefined },
          code,
          "production",
          10,
          undefined,
          true,
          fetcher,
        )
      ).events,
    ).toHaveLength(1);
    expect(
      (
        await readAxiomBrief(
          { ...config, traces: undefined },
          code,
          "production",
          10,
          undefined,
          true,
          fetcher,
        )
      ).events,
    ).toEqual(brief.events);
  });

  it("keeps distinct flows and pages multiple events from one span", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const time = Date.now() - 1000;
    const trace = {
      ...span(0, time),
      events: ["resume.import", "recording.callback"].map((flow) => ({
        name: "q9.flow.step",
        timestamp: time * 1_000_000,
        attributes: { flow, flow_run: "run_1", flow_step: "uploaded" },
      })),
    };
    const { fetcher } = fakeFetch([trace]);
    const source = { ...config, logs: undefined };
    const first = await readAxiomBrief(source, code, "production", 1, undefined, true, fetcher);
    expect(first.events).toHaveLength(1);
    expect(first.nextCursor).toBeDefined();
    const second = await readAxiomBrief(
      source,
      code,
      "production",
      1,
      first.nextCursor,
      true,
      fetcher,
    );
    expect(second.events).toHaveLength(1);
    expect(second.serverSpans).toHaveLength(0);
    expect(second.nextCursor).toBeUndefined();
    expect(new Set([...first.events, ...second.events].map((event) => event.eventId)).size).toBe(2);
    expect([first.events[0]?.name, second.events[0]?.name]).toEqual([
      "resume.import",
      "recording.callback",
    ]);
  });

  it("does not re-emit flow logs on later trace pages", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const time = Date.now() - 1000;
    const trace = {
      ...span(0, time),
      events: [
        {
          name: "q9.flow.step",
          timestamp: time * 1_000_000,
          attributes: { flow: "resume.import", flow_run: "run_1", flow_step: "uploaded" },
        },
      ],
    };
    const log = {
      ...span(1, time + 1),
      "attributes.flow": "resume.import",
      "attributes.flow_run": "run_1",
      "attributes.flow_step": "parsed",
    };
    const { fetcher } = fakeFetch([trace, span(1, time + 1)], [log]);
    const first = await readAxiomBrief(config, code, "production", 1, undefined, true, fetcher);
    const second = await readAxiomBrief(
      config,
      code,
      "production",
      1,
      first.nextCursor,
      true,
      fetcher,
    );
    const third = await readAxiomBrief(
      config,
      code,
      "production",
      1,
      second.nextCursor,
      true,
      fetcher,
    );
    expect([
      first.events[0]?.attributes?.flow_step,
      second.events[0]?.attributes?.flow_step,
    ]).toEqual(["uploaded", "parsed"]);
    expect(third.events).toHaveLength(0);
    expect(third.serverSpans).toHaveLength(1);
    expect(third.nextCursor).toBeUndefined();
  });

  it("looks up a run across trace IDs through expanded span events and log attributes", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const time = Date.now() - 1000;
    const otherTrace = "0000000000000000000000000000000a";
    const first = {
      ...span(0, time),
      events: [
        {
          name: "q9.flow.step",
          timestamp: time * 1_000_000,
          attributes: { flow: "resume.import", flow_run: "run_1", flow_step: "uploaded" },
        },
      ],
    };
    const second = {
      ...span(1, time + 1),
      trace_id: otherTrace,
      events: [
        {
          name: "q9.flow.step",
          timestamp: (time + 1) * 1_000_000,
          attributes: { flow: "resume.import", flow_run: "run_1", flow_step: "parsed" },
        },
      ],
    };
    const log = {
      ...second,
      events: undefined,
      "attributes.flow": "resume.import",
      "attributes.flow_run": "run_1",
      "attributes.flow_step": "parsed",
    };
    const { fetcher, requests } = fakeFetch([first, second], [log]);
    const events = await lookupAxiomRun(config, "run_1", fetcher);
    expect(events.map((event) => [event.traceId, event.attributes?.flow_step])).toEqual([
      [code, "uploaded"],
      [otherTrace, "parsed"],
    ]);
    expect(
      requests.some((request) =>
        request.apl.includes("mv-expand events | where events.attributes.flow_run"),
      ),
    ).toBe(true);
    expect(requests.some((request) => request.apl.includes("where ['attributes.flow_run']"))).toBe(
      true,
    );
  });

  it("fails a bounded run lookup instead of treating incomplete evidence as complete", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const start = Date.now() - 20_000;
    const traces = Array.from({ length: 10_001 }, (_, index) => ({
      ...span(index, start + index),
      events: [
        {
          name: "q9.flow.step",
          timestamp: (start + index) * 1_000_000,
          attributes: { flow: "resume.import", flow_run: "run_1", flow_step: "uploaded" },
        },
      ],
    }));
    const { fetcher } = fakeFetch(traces);
    await expect(lookupAxiomRun({ ...config, logs: undefined }, "run_1", fetcher)).rejects.toThrow(
      "exceeds 10,000 events",
    );
  });

  it("merges command and Axiom run evidence in the rendered flow", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const time = Date.now() - 1000;
    const attrs = { flow: "resume.import", flow_run: "run_1", flow_step: "uploaded" };
    const row = {
      ...span(0, time),
      events: [{ name: "q9.flow.step", timestamp: time * 1_000_000, attributes: attrs }],
    };
    const { fetcher } = fakeFetch([row]);
    const uploaded = (
      await readAxiomBrief(config, code, "development", 10, undefined, true, fetcher)
    ).events[0];
    expect(uploaded).toBeDefined();
    const parsed = {
      ...uploaded,
      traceId: "0000000000000000000000000000000a",
      eventId: "parsed",
      occurredAt: time + 100,
      attributes: { flow: "resume.import", flow_run: "run_1", flow_step: "parsed" },
    };
    const root = await mkdtemp(path.join(tmpdir(), "q9-axiom-flow-"));
    try {
      await mkdir(path.join(root, "diagnostics"));
      await writeFile(
        path.join(root, "diagnostics", "flows.json"),
        JSON.stringify([
          {
            id: "resume.import",
            version: 1,
            steps: [{ id: "uploaded" }, { id: "parsed", after: ["uploaded"], within: "2m" }],
          },
        ]),
      );
      const script = path.join(root, "command.mjs");
      await writeFile(
        script,
        `const events = ${JSON.stringify([uploaded, parsed])};\nif (process.argv[2] === "run") console.log(JSON.stringify({ events }));\nelse console.log(JSON.stringify({ version: 1, code: process.argv[3], target: "development", retrievedAt: new Date().toISOString(), completeness: "not_found", summary: "No evidence", events: [], serverSpans: [], errors: [], links: [], visibilityGaps: [], truncated: false }));\n`,
      );
      await writeFile(
        path.join(root, "q9.config.json"),
        JSON.stringify({
          diag: { sources: [{ adapter: "command", command: [process.execPath, script] }, config] },
        }),
      );
      globalThis.fetch = fetcher;
      const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      expect(await runDiag(root, ["trace", code])).toBe(0);
      const rendered = output.mock.calls.map((call) => String(call[0])).join("");
      expect(rendered).toContain("Flows:");
      expect(rendered).toContain("resume.import");
      expect(rendered).toContain("parsed");
      expect(rendered).not.toContain("flow_run_lookup_unavailable");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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

  it("reads a dataset that has never received the filtered field as empty", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    const time = Date.now() - 1000;
    const traces = fakeFetch([span(0, time)]);
    const fetcher: typeof fetch = async (url, init) => {
      if (typeof init?.body === "string" && init.body.includes("['logs']"))
        return Response.json(
          { code: 400, message: "invalid field", detail: { message: 'invalid field: "trace_id"' } },
          { status: 400 },
        );
      return traces.fetcher(url, init);
    };
    const brief = await readAxiomBrief(config, code, "production", 10, undefined, true, fetcher);
    expect(brief.serverSpans).toHaveLength(1);
  });

  it("still fails other HTTP 400 responses", async () => {
    process.env["Q9_TEST_AXIOM_TOKEN"] = "private-test-token";
    await expect(
      readAxiomBrief(config, code, "production", 10, undefined, true, syntaxErrorFetch),
    ).rejects.toMatchObject({ exitCode: 4, message: "Axiom query failed (HTTP 400)." });
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
