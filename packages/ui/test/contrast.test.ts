import { describe, expect, it } from "vitest";

import { contrastRatio, type Oklch, parseOklch } from "./support/color";
import { readTokenBlocks, requireBlock } from "./support/tokens-source";

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

/** Foreground/background token pairs that render body-sized text. */
const TEXT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["foreground", "background"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["success-foreground", "success"],
  ["warning-foreground", "warning"],
  ["destructive", "background"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["sidebar-accent-foreground", "sidebar-accent"],
];

/**
 * WCAG 2.2 SC 1.4.11: the boundary of a control and its focus indicator carry
 * meaning, so they owe 3:1. Decorative hairlines between containers do not.
 */
const NON_TEXT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["input", "background"],
  ["ring", "background"],
  ["chart-1", "background"],
  ["chart-2", "background"],
  ["chart-3", "background"],
  ["chart-4", "background"],
  ["chart-5", "background"],
];

/** Decorative separators: must stay visible, are not required to reach 3:1. */
const DECORATIVE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["border", "background"],
  ["border", "card"],
  ["sidebar-border", "sidebar"],
];

const DECORATIVE_MINIMUM = 1.25;

const blocks = readTokenBlocks();
const root = requireBlock(blocks, ":root");
const dark = requireBlock(blocks, ".dark");

type Scheme = "light" | "dark";

const SCHEMES: ReadonlyArray<readonly [Scheme, ReadonlyMap<string, string>]> = [
  ["light", root],
  ["dark", new Map([...root, ...dark])],
];

const PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ["q9", '[data-theme="q9"]', '.dark [data-theme="q9"], .dark[data-theme="q9"]'],
  [
    "recruiter",
    '[data-theme="recruiter"]',
    '.dark [data-theme="recruiter"], .dark[data-theme="recruiter"]',
  ],
  ["kaadr", '[data-theme="kaadr"]', '.dark [data-theme="kaadr"], .dark[data-theme="kaadr"]'],
];

function resolve(tokens: ReadonlyMap<string, string>, name: string): Oklch {
  const raw = tokens.get(name);
  if (raw === undefined) {
    throw new Error(`Unknown token --${name}`);
  }
  const color = parseOklch(raw);
  if (color instanceof Error) {
    throw color;
  }
  return color;
}

function expectPairs(
  label: string,
  tokens: ReadonlyMap<string, string>,
  pairs: ReadonlyArray<readonly [string, string]>,
  minimum: number,
): void {
  const failures = pairs
    .map(([fg, bg]) => ({
      pair: `${fg} on ${bg}`,
      ratio: contrastRatio(resolve(tokens, fg), resolve(tokens, bg)),
    }))
    .filter(({ ratio }) => ratio < minimum)
    .map(({ pair, ratio }) => `${label}: ${pair} = ${ratio.toFixed(2)}:1`);

  expect(failures).toEqual([]);
}

describe("WCAG contrast of the default palette", () => {
  it.each(SCHEMES)("%s text pairs clear AA (4.5:1)", (scheme, tokens) => {
    expectPairs(scheme, tokens, TEXT_PAIRS, AA_TEXT);
  });

  it.each(SCHEMES)("%s control and focus pairs clear 3:1", (scheme, tokens) => {
    expectPairs(scheme, tokens, NON_TEXT_PAIRS, AA_NON_TEXT);
  });

  it.each(SCHEMES)("%s hairlines stay visible", (scheme, tokens) => {
    expectPairs(scheme, tokens, DECORATIVE_PAIRS, DECORATIVE_MINIMUM);
  });
});

describe("WCAG contrast of product palettes", () => {
  const PALETTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ["primary-foreground", "primary"],
    ["accent-foreground", "accent"],
    ["sidebar-primary-foreground", "sidebar-primary"],
    ["sidebar-accent-foreground", "sidebar-accent"],
  ];

  it.each(PALETTES)("%s stays AA in both schemes", (name, lightSel, darkSel) => {
    const light = new Map([...root, ...requireBlock(blocks, lightSel)]);
    const night = new Map([...root, ...dark, ...requireBlock(blocks, darkSel)]);

    expectPairs(`${name}/light`, light, PALETTE_PAIRS, AA_TEXT);
    expectPairs(`${name}/dark`, night, PALETTE_PAIRS, AA_TEXT);
    expectPairs(`${name}/light`, light, [["ring", "background"]], AA_NON_TEXT);
    expectPairs(`${name}/dark`, night, [["ring", "background"]], AA_NON_TEXT);
  });
});
