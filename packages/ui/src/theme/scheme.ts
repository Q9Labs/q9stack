export const COLOR_SCHEMES = ["light", "dark", "system"] as const;

export type ColorScheme = (typeof COLOR_SCHEMES)[number];

/** The scheme actually painted on screen once `system` has been resolved. */
export type ResolvedScheme = "light" | "dark";

export const DEFAULT_STORAGE_KEY = "q9-color-scheme";

export const DARK_CLASS = "dark";

export const PRODUCT_THEME_ATTRIBUTE = "data-theme";

export const TEXT_DIRECTIONS = ["ltr", "rtl"] as const;

/** Writing direction applied to `<html dir>` and to Base UI's DirectionProvider. */
export type Direction = (typeof TEXT_DIRECTIONS)[number];

export function isDirection(value: unknown): value is Direction {
  return typeof value === "string" && TEXT_DIRECTIONS.some((direction) => direction === value);
}

export function isColorScheme(value: unknown): value is ColorScheme {
  return typeof value === "string" && COLOR_SCHEMES.some((scheme) => scheme === value);
}

export function resolveScheme(scheme: ColorScheme, prefersDark: boolean): ResolvedScheme {
  if (scheme === "system") {
    return prefersDark ? "dark" : "light";
  }
  return scheme;
}
