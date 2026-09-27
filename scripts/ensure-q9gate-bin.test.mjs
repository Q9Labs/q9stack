import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ensureQ9Bin, ensureQ9gateBin } from "./ensure-q9gate-bin.mjs";

void test("creates an executable launcher and preserves a built CLI", (context) => {
  const root = mkdtempSync(join(tmpdir(), "q9gate-bootstrap-"));
  context.after(() => rmSync(root, { force: true, recursive: true }));

  const cliPath = ensureQ9gateBin(root);
  const launcher = readFileSync(cliPath, "utf8");
  assert.match(launcher, /^#!\/usr\/bin\/env node/u);
  assert.match(launcher, /@q9labsai\/gates/u);
  assert.notEqual(statSync(cliPath).mode & 0o111, 0);

  writeFileSync(cliPath, "real built CLI", "utf8");
  chmodSync(cliPath, 0o755);
  assert.equal(ensureQ9gateBin(root), cliPath);
  assert.equal(readFileSync(cliPath, "utf8"), "real built CLI");
});

void test("creates a q9 launcher before the package is built", (context) => {
  const root = mkdtempSync(join(tmpdir(), "q9-bootstrap-"));
  context.after(() => rmSync(root, { force: true, recursive: true }));

  const cliPath = ensureQ9Bin(root);
  const launcher = readFileSync(cliPath, "utf8");
  assert.match(launcher, /@q9labsai\/cli/u);
  assert.notEqual(statSync(cliPath).mode & 0o111, 0);
});
