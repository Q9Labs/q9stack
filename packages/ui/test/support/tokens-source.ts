import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type TokenBlocks = ReadonlyMap<string, ReadonlyMap<string, string>>;

const TOKENS_PATH = fileURLToPath(new URL("../../src/styles/tokens.css", import.meta.url));

const DECLARATION = /--([a-z0-9-]+)\s*:\s*([^;]+);/g;

const COMMENT = /\/\*[\s\S]*?\*\//g;

interface CssBlock {
  readonly selector: string;
  readonly body: string;
}

/**
 * Splits the stylesheet into its top-level `selector { … }` blocks. Nested
 * at-rule bodies stay inside the block that contains them.
 */
function topLevelBlocks(css: string): readonly CssBlock[] {
  const blocks: CssBlock[] = [];
  let depth = 0;
  let selectorStart = 0;
  let bodyStart = 0;

  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    if (char === "{") {
      if (depth === 0) {
        bodyStart = index + 1;
      }
      depth += 1;
      continue;
    }
    if (char === ";" && depth === 0) {
      selectorStart = index + 1;
      continue;
    }
    if (char !== "}") {
      continue;
    }
    depth -= 1;
    if (depth > 0) {
      continue;
    }
    blocks.push({
      selector: css.slice(selectorStart, bodyStart - 1).trim(),
      body: css.slice(bodyStart, index),
    });
    selectorStart = index + 1;
  }

  return blocks;
}

/**
 * Reads the custom property declarations of tokens.css keyed by selector.
 * At-rule blocks (`@theme inline`, `@layer base`, `@media`) are skipped: only
 * plain selector blocks carry tokens.
 */
export function readTokenBlocks(): TokenBlocks {
  const css = readFileSync(TOKENS_PATH, "utf8").replace(COMMENT, "");
  const blocks = new Map<string, ReadonlyMap<string, string>>();

  for (const block of topLevelBlocks(css)) {
    if (!block.selector.startsWith("@")) {
      blocks.set(normalizeSelector(block.selector), readDeclarations(block.body));
    }
  }

  return blocks;
}

function normalizeSelector(selector: string): string {
  return selector
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(", ");
}

function readDeclarations(body: string): Map<string, string> {
  const declarations = new Map<string, string>();
  DECLARATION.lastIndex = 0;
  let match = DECLARATION.exec(body);
  while (match !== null) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      declarations.set(name, value.trim());
    }
    match = DECLARATION.exec(body);
  }
  return declarations;
}

export function requireBlock(blocks: TokenBlocks, selector: string): ReadonlyMap<string, string> {
  const block = blocks.get(selector);
  if (block === undefined) {
    throw new Error(
      `tokens.css has no \`${selector}\` block. Present: ${[...blocks.keys()].join(" | ")}`,
    );
  }
  return block;
}
