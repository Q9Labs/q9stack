import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { diagnosticTraceBriefSchema } from "@q9labsai/diagnostics";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const bin = path.join(packageRoot, "dist", "cli.js");
const code = "1234567890abcdef1234567890abcdef";
const expired = "00000000000000000000000000000002";
const missing = "00000000000000000000000000000003";
const partialCode = "00000000000000000000000000000004";
const heuristicCode = "00000000000000000000000000000005";
const hundredErrorsCode = "00000000000000000000000000000006";
const slowLogsCode = "00000000000000000000000000000007";
const journeyCode = "00000000000000000000000000000008";
const unrelatedCode = "00000000000000000000000000000009";
const journey = "0000000000000000000000000000000a";
let root: string;

function cli(...args: string[]) {
  return spawnSync(process.execPath, [bin, "diag", ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
  });
}

function brief(...args: string[]) {
  const raw: unknown = JSON.parse(cli("trace", ...args, "--json").stdout);
  return diagnosticTraceBriefSchema.parse(raw);
}

async function configure(diag: object) {
  await writeFile(path.join(root, "q9.config.json"), JSON.stringify({ diag }));
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "q9-diag-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function fakeConvex() {
  const dir = path.join(root, "backend", "node_modules", ".bin");
  await mkdir(dir, { recursive: true });
  const binary = path.join(dir, "convex");
  await writeFile(
    binary,
    `#!/usr/bin/env node
const fs = require('node:fs');
const code = JSON.parse(process.argv[4] || '{}').traceId;
if (process.argv[2] === 'logs') {
  console.log(JSON.stringify({requestId:'request_12345678',identifier:'convex.query',executionTimestamp:1780000000,executionTime:0.04,success:false,logLines:[{messages:['secret private cause']}]}) + '\\n' + JSON.stringify({kind:'Console',requestId:'f3e600482491b74b',identifier:'tasks:createTask',timestamp:1780000000.4,logLines:['convex.function.failed ' + (fs.readFileSync('.last-code', 'utf8') === '${code}' ? '${code}' : 'unrelated')]}) + '\\n' + JSON.stringify({kind:'Completion',requestId:'f3e600482491b74b',identifier:'tasks:createTask',executionTimestamp:1780000000.5,executionTime:0.01,success:null,error:'Uncaught private failure',logLines:[]}));
  if (fs.readFileSync('.last-code', 'utf8') === '${slowLogsCode}') setInterval(() => {}, 1000);
  else process.exit(0);
} else {
if (process.argv[2] !== 'run') process.exit(1);
fs.writeFileSync('.last-code', code);
const events = code === '${missing}' || code === '${expired}' || code === '00000000000000000000000000000001' ? [] : code === '${hundredErrorsCode}' ? Array.from({length:100}, (_,i) => ({version:1,traceId:code,spanId:(i+1).toString(16).padStart(16,'0'),eventId:'error_'+i,occurredAt:1780000000000+i,source:'browser',kind:'error',name:'app.error',status:'error',level:'error'})) : [{version:1,traceId:code,spanId:'1234567890abcdef',eventId:'one',occurredAt:1780000000000,source:'browser',kind:'request',name:'convex.query',status:'error',level:'error',requestId:code === '${partialCode}' || code === '${heuristicCode}' ? 'request_other123' : 'request_12345678',attributes:{function:code === '${partialCode}' ? 'other.function' : 'convex.query',replay_session_id:'opaqueReplaySession12'}}];
const linked = code === '${journeyCode}' ? [{version:1,traceId:'${journey}',spanId:'000000000000000a',eventId:'nav',occurredAt:1779999999000,source:'browser',kind:'navigation',name:'app.navigate',status:'ok',level:'info'},{version:1,traceId:code,spanId:'000000000000000b',eventId:'fail',occurredAt:1780000000000,source:'browser',kind:'error',name:'app.error',status:'error',level:'error',journeyTraceId:'${journey}'}] : code === '${unrelatedCode}' ? [{version:1,traceId:'${journey}',spanId:'000000000000000a',eventId:'nav',occurredAt:1779999999000,source:'browser',kind:'navigation',name:'app.navigate',status:'ok',level:'info'}] : undefined;
console.log(JSON.stringify({events:linked ?? events,expired:code === '${expired}'}));
}
`,
  );
  await chmod(binary, 0o755);
  await configure({ adapter: "convex", convexDir: "backend" });
}

async function fakeCommand() {
  const script = path.join(root, "trace.mjs");
  await writeFile(
    script,
    `const code = process.argv[3];
const target = process.argv.includes('--prod') ? 'production' : process.argv.includes('--deployment') ? process.argv[process.argv.indexOf('--deployment')+1] : 'development';
const events = code === '${missing}' || code === '00000000000000000000000000000001' ? [] : [{version:1,traceId:code,spanId:'1234567890abcdef',eventId:'one',occurredAt:1780000000000,source:'browser',kind:'event',name:'app.submit',status:'ok',level:'info'}];
console.log(JSON.stringify({version:1,code,target,retrievedAt:new Date().toISOString(),completeness:events.length?'complete':'not_found',summary:events.length?'One event':'No retained evidence',events,serverSpans:[],errors:[],links:[],visibilityGaps:[],truncated:false}));
`,
  );
  await configure({ adapter: "command", command: [process.execPath, script] });
}

describe("q9 diag", () => {
  it("prints setup help and refuses invalid codes and conflicting targets", async () => {
    expect(cli("--help").stdout).toContain("diag trace <code>");
    expect(cli("trace", "chalkdiag:v1:dev:foo").stderr).toContain("pnpm trace:inspect");
    expect(cli("trace", "bad").status).toBe(3);
    expect(cli("trace", code).status).toBe(3);
    await fakeConvex();
    expect(cli("trace", code, "--prod", "--deployment", "staging").status).toBe(3);
    expect(cli("trace", code, "--deployment").status).toBe(3);
    expect(cli("trace", code, "--otlp", "https://collector.example.com").status).toBe(3);
  });

  it("reads Convex events, correlates logs by request ID, redacts output, and probes access", async () => {
    await fakeConvex();
    const found = cli("trace", code, "--json");
    expect(found.status).toBe(0);
    const raw: unknown = JSON.parse(found.stdout);
    const foundBrief = diagnosticTraceBriefSchema.parse(raw);
    expect(foundBrief).toMatchObject({
      code,
      target: "development",
      completeness: "complete",
      truncated: false,
    });
    expect(
      foundBrief.serverSpans.map((span) => [span.name, span.status, span.correlation]),
    ).toEqual([
      ["convex.query", "error", "request_id"],
      ["tasks.createTask", "error", "trace_id"],
    ]);
    expect(found.stdout).not.toContain("Uncaught private failure");
    expect(foundBrief.links).toEqual([
      { idClass: "posthog.session", value: "opaqueReplaySession12" },
    ]);
    expect(found.stdout).not.toContain("secret private cause");
    expect(cli("check", "--json").status).toBe(0);
    expect(cli("trace", missing, "--json").status).toBe(2);
    expect(brief(expired).completeness).toBe("expired");
    const partial = brief(partialCode);
    expect(partial.completeness).toBe("partial");
    expect(partial.visibilityGaps).toEqual([{ reason: "server_log_not_available" }]);
    const heuristic = brief(heuristicCode);
    expect(heuristic.serverSpans[0]?.correlation).toBe("heuristic");
    expect(brief(code, "--no-logs").serverSpans).toEqual([]);
    const exactlyHundred = brief(hundredErrorsCode, "--no-logs");
    expect(exactlyHundred.errors).toHaveLength(100);
    expect(exactlyHundred.truncated).toBe(false);
    expect(exactlyHundred.completeness).toBe("complete");
    const streamingLogs = brief(slowLogsCode);
    expect(streamingLogs.truncated).toBe(false);
    expect(streamingLogs.completeness).toBe("complete");
  }, 20_000);

  it("accepts journey events linked to the code and rejects unrelated ones", async () => {
    await fakeConvex();
    const linked = brief(journeyCode, "--no-logs");
    expect(linked.journeyTraceId).toBe(journey);
    expect(linked.events.map((event) => event.eventId)).toEqual(["nav", "fail"]);
    expect(cli("trace", unrelatedCode, "--no-logs").status).toBe(4);
  });

  it("reads and validates a command brief", async () => {
    await fakeCommand();
    expect(brief(code, "--prod")).toMatchObject({
      code,
      target: "production",
      completeness: "complete",
    });
    expect(cli("trace", missing, "--json").status).toBe(2);
    expect(cli("check").status).toBe(0);
  });

  it("returns adapter errors without echoing adapter stderr", async () => {
    await configure({
      adapter: "command",
      command: [process.execPath, "-e", "process.stderr.write('SECRET'); process.exit(1)"],
    });
    const result = cli("trace", code, "--json");
    expect(result.status).toBe(4);
    expect(result.stdout + result.stderr).not.toContain("SECRET");
  });
});
