import { spawn, execFile, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { open, readFile, mkdir, rename, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

// cspell:ignore lstart pgid

const execFileAsync = promisify(execFile);
const processSchema = z.strictObject({
  pid: z.number().int().positive(),
  group: z.number().int().positive(),
  command: z.array(z.string()).min(1),
  startedAt: z.string(),
  pidStartedAt: z.string(),
  logPath: z.string(),
});
const recordsSchema = z.record(z.string(), processSchema);
export type DevProcess = z.infer<typeof processSchema>;
export type DevRecord = {
  name: string;
  process: DevProcess;
  alive: boolean;
  uptime: number;
  ports?: number[];
};

export function repoRoot(start: string): string {
  let current = path.resolve(start);
  while (current !== path.dirname(current)) {
    if (
      existsSync(path.join(current, ".git")) ||
      existsSync(path.join(current, "pnpm-workspace.yaml"))
    )
      return current;
    const parent = path.dirname(current);
    current = parent;
  }
  return path.resolve(start);
}

function recordPath(root: string): string {
  return path.join(root, ".logs", "q9-dev.json");
}

async function withRecordLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  const lock = path.join(root, ".logs", "q9-dev.lock");
  await mkdir(path.dirname(lock), { recursive: true });
  let acquired = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await mkdir(lock);
      acquired = true;
      break;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!acquired)
    throw new Error(
      lock + ": busy or stale; remove the lock only after verifying no q9 dev command is running",
    );
  try {
    return await action();
  } finally {
    await rmdir(lock);
  }
}

async function readRecords(root: string): Promise<Map<string, DevProcess>> {
  const file = recordPath(root);
  try {
    return new Map(Object.entries(recordsSchema.parse(JSON.parse(await readFile(file, "utf8")))));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return new Map();
    throw new Error(file + ": " + message(error), { cause: error });
  }
}

async function writeRecords(root: string, records: Map<string, DevProcess>): Promise<void> {
  const file = recordPath(root);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = file + "." + process.pid + ".tmp";
  await writeFile(temporary, JSON.stringify(Object.fromEntries(records), null, 2) + "\n");
  await rename(temporary, file);
}

async function pidStart(pid: number): Promise<string | undefined> {
  try {
    return (
      (await execFileAsync("ps", ["-p", String(pid), "-o", "lstart="])).stdout.trim() || undefined
    );
  } catch {
    return undefined;
  }
}

async function processGroup(pid: number): Promise<number | undefined> {
  try {
    return Number((await execFileAsync("ps", ["-p", String(pid), "-o", "pgid="])).stdout.trim());
  } catch {
    return undefined;
  }
}

async function isAlive(record: DevProcess): Promise<boolean> {
  if (record.group !== record.pid) return false;
  try {
    process.kill(record.pid, 0);
  } catch {
    return false;
  }
  return (
    (await pidStart(record.pid)) === record.pidStartedAt &&
    (await processGroup(record.pid)) === record.group
  );
}

export async function startDev(root: string, name: string, command: string[]): Promise<DevProcess> {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("dev name: use letters, digits, _ or -");
  if (!command.length) throw new Error("dev start: command required after --");
  return withRecordLock(root, () => startDevUnlocked(root, name, command));
}

// fallow-ignore-next-line complexity -- Reason: ordered spawn, identity, and registry cleanup are covered by CLI fixtures.
async function startDevUnlocked(
  root: string,
  name: string,
  command: string[],
): Promise<DevProcess> {
  const records = await readRecords(root);
  const existing = records.get(name);
  if (existing && (await isAlive(existing)))
    throw new Error(
      recordPath(root) + ": " + name + " is already running (pid " + existing.pid + ")",
    );
  await mkdir(path.join(root, ".logs"), { recursive: true });
  const logPath = path.join(root, ".logs", name + ".log");
  const log = await open(logPath, "a");
  let child: ChildProcess;
  try {
    child = spawn(command[0] ?? "", command.slice(1), {
      cwd: root,
      detached: true,
      stdio: ["ignore", log.fd, log.fd],
      env: process.env,
    });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
  } finally {
    await log.close();
  }
  child.unref();
  if (!child.pid) throw new Error("dev start: process did not return a pid");
  const pidStartedAt = await pidStart(child.pid);
  if (!pidStartedAt) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* The process may already have exited. */
    }
    throw new Error(
      logPath + ": cannot verify process identity with ps, or process exited; inspect the log",
    );
  }
  const record = {
    pid: child.pid,
    group: child.pid,
    command,
    startedAt: new Date().toISOString(),
    pidStartedAt,
    logPath,
  };
  records.set(name, record);
  try {
    await writeRecords(root, records);
  } catch (error) {
    try {
      process.kill(-record.group, "SIGTERM");
    } catch {
      /* The process may already have exited. */
    }
    throw new Error(recordPath(root) + ": could not record " + name + ": " + message(error), {
      cause: error,
    });
  }
  return record;
}

async function listeningPorts(group: number): Promise<number[] | undefined> {
  try {
    const output = (
      await execFileAsync("lsof", ["-nP", "-a", "-g", String(group), "-iTCP", "-sTCP:LISTEN"], {
        timeout: 1500,
      })
    ).stdout;
    const ports = [...output.matchAll(/:(\d+)\s*\(LISTEN\)/g)].map((match) => Number(match[1]));
    return [...new Set(ports)].toSorted((a, b) => a - b);
  } catch {
    return undefined;
  }
}

export async function statusDev(root: string): Promise<DevRecord[]> {
  const records = await readRecords(root);
  return Promise.all(
    [...records].map(async ([name, processRecord]) => {
      const alive = await isAlive(processRecord);
      const uptime = alive
        ? Math.max(0, Math.floor((Date.now() - new Date(processRecord.startedAt).getTime()) / 1000))
        : 0;
      const ports = alive ? await listeningPorts(processRecord.group) : undefined;
      const item: DevRecord = {
        name,
        process: processRecord,
        alive,
        uptime,
      };
      if (ports !== undefined) item.ports = ports;
      return item;
    }),
  );
}

async function waitDead(record: DevProcess, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isAlive(record))) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !(await isAlive(record));
}

export async function stopDev(root: string, name?: string): Promise<string[]> {
  return withRecordLock(root, () => stopDevUnlocked(root, name));
}

// fallow-ignore-next-line complexity -- Reason: signal escalation and ownership checks must stay ordered.
async function stopDevUnlocked(root: string, name?: string): Promise<string[]> {
  const records = await readRecords(root);
  if (name && !records.has(name))
    throw new Error(recordPath(root) + ": no recorded process named " + name);
  const selected = name ? [name] : [...records.keys()];
  for (const key of selected) {
    const record = records.get(key);
    if (!record) continue;
    if (await isAlive(record)) {
      process.kill(-record.group, "SIGTERM");
      if (!(await waitDead(record, 3000)) && (await isAlive(record))) {
        process.kill(-record.group, "SIGKILL");
        if (!(await waitDead(record, 1000)))
          throw new Error(recordPath(root) + ": could not stop " + key);
      }
    }
    records.delete(key);
    await writeRecords(root, records);
  }
  return selected;
}

// fallow-ignore-next-line complexity -- Reason: bounded input validation and file errors are covered by CLI fixtures.
export async function readDevLog(root: string, name: string, tail: number): Promise<string> {
  if (!Number.isInteger(tail) || tail < 0)
    throw new Error("dev logs: --tail must be a non-negative integer");
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("dev name: use letters, digits, _ or -");
  const file = path.join(root, ".logs", name + ".log");
  try {
    const text = await readFile(file, "utf8");
    if (tail === 0) return "";
    const lines = text.split("\n");
    if (lines.at(-1) === "") lines.pop();
    return lines.slice(-tail).join("\n") + (lines.length ? "\n" : "");
  } catch (error) {
    throw new Error(file + ": " + message(error), { cause: error });
  }
}

export async function resetDev(
  root: string,
  quiet = false,
): Promise<{ stopped: string[]; hook: boolean }> {
  const stopped = await stopDev(root);
  const packagePath = path.join(root, "package.json");
  const scriptsSchema = z.object({
    scripts: z.object({ "dev:reset:hook": z.string().optional() }).optional(),
  });
  const manifest = scriptsSchema.parse(JSON.parse(await readFile(packagePath, "utf8")));
  if (!manifest.scripts?.["dev:reset:hook"]) return { stopped, hook: false };
  const child = spawn("pnpm", ["run", "dev:reset:hook"], {
    cwd: root,
    stdio: quiet ? "ignore" : "inherit",
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
  });
  if (code !== 0) throw new Error(packagePath + ": dev:reset:hook failed with exit " + code);
  return { stopped, hook: true };
}

export function followDevLog(root: string, name: string, json: boolean): Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("dev name: use letters, digits, _ or -");
  const file = path.join(root, ".logs", name + ".log");
  if (!existsSync(file)) throw new Error(file + ": file does not exist");
  const child = spawn("tail", ["-n", "0", "-f", file], { stdio: ["ignore", "pipe", "inherit"] });
  child.stdout.setEncoding("utf8");
  let pending = "";
  child.stdout.on("data", (chunk: string) => {
    if (!json) {
      process.stdout.write(chunk);
      return;
    }
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) process.stdout.write(JSON.stringify({ line }) + "\n");
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(file + ": tail exited " + code)),
    );
    process.once("SIGINT", () => child.kill("SIGTERM"));
    process.once("SIGTERM", () => child.kill("SIGTERM"));
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
