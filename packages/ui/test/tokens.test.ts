import { describe, expect, it } from "vitest";

import { parseOklch } from "./support/color";
import { readTokenBlocks, requireBlock } from "./support/tokens-source";

const NON_COLOR_TOKENS = new Set(["radius", "font-sans", "font-mono"]);

const PALETTE_OVERRIDE_ALLOWLIST = [
  /^primary(-foreground)?$/,
  /^accent(-foreground)?$/,
  /^ring$/,
  /^chart-[1-5]$/,
  /^sidebar-primary(-foreground)?$/,
  /^sidebar-accent(-foreground)?$/,
  /^sidebar-ring$/,
] as const;

const PRODUCT_THEMES = ["q9", "recruiter", "kaadr"] as const;

const blocks = readTokenBlocks();
const root = requireBlock(blocks, ":root");
const dark = requireBlock(blocks, ".dark");

const lightSelector = (theme: string): string => `[data-theme="${theme}"]`;
const darkSelector = (theme: string): string =>
  `.dark [data-theme="${theme}"], .dark[data-theme="${theme}"]`;

describe("tokens.css scheme parity", () => {
  it("redefines every :root colour token in .dark", () => {
    const missing = [...root.keys()].filter(
      (name) => !NON_COLOR_TOKENS.has(name) && !dark.has(name),
    );
    expect(missing).toEqual([]);
  });

  it("does not introduce tokens in .dark that :root never declared", () => {
    const extra = [...dark.keys()].filter((name) => !root.has(name));
    expect(extra).toEqual([]);
  });

  it("expresses every colour token as a parseable oklch() value in both schemes", () => {
    for (const block of [root, dark]) {
      for (const [name, value] of block) {
        if (NON_COLOR_TOKENS.has(name)) continue;
        expect(parseOklch(value), `${name}: ${value}`).not.toBeInstanceOf(Error);
      }
    }
  });

  it("pins the radius scale base at 0.625rem", () => {
    expect(root.get("radius")).toBe("0.625rem");
  });

  it("names Geist as the sans and mono families", () => {
    expect(root.get("font-sans")).toContain('"Geist Variable"');
    expect(root.get("font-mono")).toContain('"Geist Mono Variable"');
  });
});

describe("product palettes", () => {
  it.each(PRODUCT_THEMES)("%s overrides only the allowed subset", (theme) => {
    for (const selector of [lightSelector(theme), darkSelector(theme)]) {
      const block = requireBlock(blocks, selector);
      const disallowed = [...block.keys()].filter(
        (name) => !PALETTE_OVERRIDE_ALLOWLIST.some((pattern) => pattern.test(name)),
      );
      expect(disallowed, selector).toEqual([]);
    }
  });

  it.each(PRODUCT_THEMES)("%s declares the same tokens in light and dark", (theme) => {
    const light = requireBlock(blocks, lightSelector(theme));
    const night = requireBlock(blocks, darkSelector(theme));
    expect([...night.keys()].toSorted()).toEqual([...light.keys()].toSorted());
  });

  it.each(PRODUCT_THEMES)("%s only overrides tokens that :root defines", (theme) => {
    const light = requireBlock(blocks, lightSelector(theme));
    const unknown = [...light.keys()].filter((name) => !root.has(name));
    expect(unknown).toEqual([]);
  });

  it("keeps the q9 palette identical to the shared defaults", () => {
    const light = requireBlock(blocks, lightSelector("q9"));
    for (const [name, value] of light) {
      expect(root.get(name), name).toBe(value);
    }
    const night = requireBlock(blocks, darkSelector("q9"));
    for (const [name, value] of night) {
      expect(dark.get(name), name).toBe(value);
    }
  });
});
