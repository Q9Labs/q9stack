import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const launcher = (packageName, commandName) => `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(import.meta.url);
const packageDirectory = resolve(dirname(cliPath), "..");
const workspaceRoot = resolve(packageDirectory, "..", "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const build = spawnSync(pnpm, ["--filter", "@q9labsai/${packageName}", "build"], {
  cwd: workspaceRoot,
  shell: false,
  stdio: "inherit",
});

if (build.error !== undefined) {
  console.error("${commandName} bootstrap could not start pnpm");
  process.exitCode = 1;
} else if (build.status !== 0) {
  process.exitCode = build.status ?? 1;
} else {
  const gate = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
    cwd: workspaceRoot,
    shell: false,
    stdio: "inherit",
  });
  if (gate.error !== undefined) {
    console.error("${commandName} bootstrap could not start the built CLI");
    process.exitCode = 1;
  } else {
    process.exitCode = gate.status ?? 1;
  }
}
`;

export const ensureQ9gateBin = (rootDirectory = workspaceRoot) => {
  const cliPath = resolve(rootDirectory, "packages/gates/dist/cli.js");
  if (existsSync(cliPath)) {
    return cliPath;
  }

  mkdirSync(dirname(cliPath), { recursive: true });
  writeFileSync(cliPath, launcher("gates", "q9gate"), { encoding: "utf8", mode: 0o755 });
  chmodSync(cliPath, 0o755);
  return cliPath;
};

export const ensureQ9Bin = (rootDirectory = workspaceRoot) => {
  const cliPath = resolve(rootDirectory, "packages/cli/dist/cli.js");
  if (existsSync(cliPath)) return cliPath;

  mkdirSync(dirname(cliPath), { recursive: true });
  writeFileSync(cliPath, launcher("cli", "q9"), { encoding: "utf8", mode: 0o755 });
  chmodSync(cliPath, 0o755);
  return cliPath;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensureQ9gateBin();
  ensureQ9Bin();
}
