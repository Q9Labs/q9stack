import type { Direction, ResolvedScheme } from "../theme/scheme";

export interface PreviewEnvironment {
  readonly locale: string;
  readonly dir: Direction;
  readonly scheme: ResolvedScheme;
  readonly productTheme: string;
  readonly role: string;
  /** Stage width in pixels; `0` means "fill the available space". */
  readonly width: number;
  /** Renders the scenario twice, LTR beside RTL. */
  readonly compareDir: boolean;
}

export interface ViewportPreset {
  readonly label: string;
  readonly width: number;
}

export const VIEWPORT_PRESETS: readonly ViewportPreset[] = [
  { label: "Fill", width: 0 },
  { label: "360", width: 360 },
  { label: "768", width: 768 },
  { label: "1024", width: 1024 },
  { label: "1440", width: 1440 },
];

export interface TweakerConfig {
  readonly locales?: readonly string[] | undefined;
  readonly roles?: readonly string[] | undefined;
  readonly productThemes?: readonly string[] | undefined;
  readonly viewports?: readonly ViewportPreset[] | undefined;
}

export const RTL_LOCALES: readonly string[] = ["ar", "he", "fa", "ur"];

export const DEFAULT_ENVIRONMENT: PreviewEnvironment = {
  locale: "en",
  dir: "ltr",
  scheme: "light",
  productTheme: "q9",
  role: "user",
  width: 0,
  compareDir: false,
};

export function directionForLocale(locale: string): Direction {
  const language = locale.split("-")[0] ?? locale;
  return RTL_LOCALES.includes(language) ? "rtl" : "ltr";
}
