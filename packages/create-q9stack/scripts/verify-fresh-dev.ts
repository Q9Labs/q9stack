import { spawn, type ChildProcess } from "node:child_process";
import { access, stat, utimes } from "node:fs/promises";
import { resolve } from "node:path";

const startupTimeoutMs = 60_000;
const rebuildTimeoutMs = 20_000;
const outputLimit = 20_000;
const viteUrl = "http://localhost:5173/";

interface ChildState {
  exit?: string;
  output: string;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return false;
    }

    throw error;
  }
}

async function urlResponds(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(500) });
    await response.body?.cancel();
    return true;
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error instanceof DOMException && error.name === "TimeoutError")
    ) {
      return false;
    }

    throw error;
  }
}

function appendOutput(current: string, chunk: Buffer): string {
  return `${current}${String(chunk)}`.slice(-outputLimit);
}

async function waitFor(
  description: string,
  timeoutMs: number,
  predicate: () => boolean | Promise<boolean>,
  childState: ChildState,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (childState.exit !== undefined) {
      throw new Error(
        `Development command exited before ${description}: ${childState.exit}\n${childState.output}`,
      );
    }

    // oxlint-disable-next-line no-await-in-loop -- Intentional polling must observe each updated state before delaying.
    if (await predicate()) {
      return;
    }

    // oxlint-disable-next-line no-await-in-loop -- Intentional polling must wait between state observations.
    await delay(100);
  }

  throw new Error(`Timed out waiting for ${description}.\n${childState.output}`);
}

async function runFiniteProcess(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<void> {
  await new Promise<void>((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const { stderr, stdout } = child;
    let output = "";
    stdout.on("data", (chunk: Buffer) => {
      output = appendOutput(output, chunk);
    });
    stderr.on("data", (chunk: Buffer) => {
      output = appendOutput(output, chunk);
    });
    child.once("error", rejectProcess);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveProcess();
        return;
      }

      const reason = signal === null ? `exit code ${code ?? "unknown"}` : `signal ${signal}`;
      rejectProcess(new Error(`${command} failed with ${reason}.\n${output}`));
    });
  });
}

function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals): boolean {
  if (child.pid === undefined) {
    return false;
  }

  try {
    process.kill(-child.pid, signal);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ESRCH")) {
      return false;
    }

    throw error;
  }
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  return new Promise((resolveExit) => {
    const timeout = setTimeout(() => {
      resolveExit(false);
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveExit(true);
    });
  });
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (
    child.exitCode !== null ||
    child.signalCode !== null ||
    !signalProcessGroup(child, "SIGINT")
  ) {
    return;
  }

  if (!(await waitForExit(child, 5_000))) {
    signalProcessGroup(child, "SIGTERM");
    if (!(await waitForExit(child, 5_000))) {
      signalProcessGroup(child, "SIGKILL");
      await waitForExit(child, 5_000);
    }
  }
}

async function verifyFreshDevelopment(projectDirectory: string, appSlug: string): Promise<void> {
  const webDirectory = resolve(projectDirectory, "apps/web");
  const envSource = resolve(projectDirectory, "packages/env/src/index.ts");
  const envEntry = resolve(projectDirectory, "packages/env/dist/index.js");
  if (await pathExists(envEntry)) {
    throw new Error(
      `Fresh scaffold already contains ${envEntry}; the smoke test requires no build output.`,
    );
  }

  const childState: ChildState = { output: "" };
  const child = spawn("pnpm", ["dev"], {
    cwd: webDirectory,
    detached: true,
    env: { ...process.env, CI: "1", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const { stderr, stdout } = child;
  stdout.on("data", (chunk: Buffer) => {
    childState.output = appendOutput(childState.output, chunk);
  });
  stderr.on("data", (chunk: Buffer) => {
    childState.output = appendOutput(childState.output, chunk);
  });
  child.once("error", (error) => {
    childState.exit = `spawn error: ${error.message}`;
  });
  child.once("exit", (code, signal) => {
    childState.exit = signal === null ? `exit code ${code ?? "unknown"}` : `signal ${signal}`;
  });

  try {
    await waitFor(
      "compiled environment entry and Vite HTTP listener",
      startupTimeoutMs,
      async () => (await pathExists(envEntry)) && (await urlResponds(viteUrl)),
      childState,
    );

    await runFiniteProcess(
      "node",
      ["--input-type=module", "--eval", `await import(${JSON.stringify(`@${appSlug}/env`)})`],
      webDirectory,
    );

    const entryBeforeChange = await stat(envEntry);
    const changedAt = new Date(Date.now() + 2_000);
    await utimes(envSource, changedAt, changedAt);
    await waitFor(
      "the environment package watcher to rebuild",
      rebuildTimeoutMs,
      async () => (await stat(envEntry)).mtimeMs > entryBeforeChange.mtimeMs,
      childState,
    );
  } finally {
    await stopProcess(child);
  }

  process.stdout.write(
    `Fresh ${appSlug} web development prepared, resolved, and watched workspace packages.\n`,
  );
}

const projectDirectoryArgument = process.argv[2];
const appSlug = process.argv[3];
if (projectDirectoryArgument === undefined || appSlug === undefined) {
  process.stderr.write("Usage: node verify-fresh-dev.ts PROJECT_DIRECTORY APP_SLUG\n");
  process.exitCode = 64;
} else {
  verifyFreshDevelopment(resolve(projectDirectoryArgument), appSlug).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
