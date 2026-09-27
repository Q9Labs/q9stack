import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC_DIR = fileURLToPath(new URL("../src", import.meta.url));

/**
 * Physical-direction utilities break right-to-left locales. Every one of these
 * has a logical counterpart: ms/me, ps/pe, start/end, text-start/text-end,
 * border-s/border-e, rounded-s/rounded-e.
 */
const PHYSICAL_UTILITY =
  /(?<![\w:-])-?(?:ml|mr|pl|pr|left|right|inset-l|inset-r|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|text-left|text-right|float-left|float-right|clear-left|clear-right|origin-left|origin-right)(?:-[\w.[\]()/%-]+)?(?![\w-])/g;

/** `rtl:`-prefixed classes are the deliberate mirror of a physical utility. */
const RTL_PREFIXED = /(?:^|[\s"'`])rtl:/;

interface Offence {
  readonly file: string;
  readonly className: string;
  readonly utility: string;
}

const CLASS_ATTRIBUTE = /class(?:Name)?\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g;
const CLASS_STRING = /"([^"\n]*)"/g;

function sourceFiles(dir: string): readonly string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return entry.name.endsWith(".tsx") || entry.name.endsWith(".ts") ? [path] : [];
  });
}

function collectOffences(path: string): readonly Offence[] {
  const source = readFileSync(path, "utf8");
  const file = path.slice(SRC_DIR.length + 1);
  const offences: Offence[] = [];

  for (const candidate of classCandidates(source)) {
    if (RTL_PREFIXED.test(candidate)) {
      continue;
    }
    PHYSICAL_UTILITY.lastIndex = 0;
    for (const match of candidate.matchAll(PHYSICAL_UTILITY)) {
      offences.push({ file, className: candidate.trim(), utility: match[0] });
    }
  }
  return offences;
}

/**
 * Class names reach the DOM either through a `class(Name)` attribute or through
 * a plain string in a cva/cn argument list, so both are scanned.
 */
function classCandidates(source: string): readonly string[] {
  const candidates: string[] = [];
  for (const match of source.matchAll(CLASS_ATTRIBUTE)) {
    const value = match[1] ?? match[2] ?? match[3];
    if (value !== undefined) {
      candidates.push(value);
    }
  }
  for (const match of source.matchAll(CLASS_STRING)) {
    const value = match[1];
    if (value !== undefined && /(?:^|\s)[a-z-]+(?:-[\w.[\]()/%-]+)?(?:\s|$)/.test(value)) {
      candidates.push(value);
    }
  }
  return candidates;
}

describe("logical direction", () => {
  const files = sourceFiles(SRC_DIR);

  it("scans every source file", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it("uses no physical-direction Tailwind utilities", () => {
    const offences = files.flatMap(collectOffences);
    expect(offences).toEqual([]);
  });

  it("detects a physical utility when one is introduced", () => {
    const candidates = [...new Set(classCandidates('<div className="ml-2 text-left" />'))];
    expect(candidates).toEqual(["ml-2 text-left"]);
    const utilities = candidates.flatMap((candidate) =>
      [...candidate.matchAll(PHYSICAL_UTILITY)].map((match) => match[0]),
    );
    expect(utilities).toEqual(["ml-2", "text-left"]);
  });
});
