#!/usr/bin/env node

import { runCli } from "./cli.js";

runCli(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`create-q9stack: ${message}\n`);
  process.exitCode = 1;
});
