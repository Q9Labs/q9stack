import { DARK_CLASS, DEFAULT_STORAGE_KEY, PRODUCT_THEME_ATTRIBUTE } from "./scheme";

export interface ThemeInitScriptOptions {
  readonly storageKey?: string | undefined;
  readonly defaultScheme?: "light" | "dark" | "system" | undefined;
  readonly productTheme?: string | undefined;
  readonly dir?: "ltr" | "rtl" | undefined;
}

/**
 * Returns the body of an inline `<script>` for `<head>`. Running it before
 * first paint stops the light-mode flash that a React-only ThemeProvider causes.
 *
 * ```tsx
 * <script dangerouslySetInnerHTML={{ __html: themeInitScript({ productTheme: "q9" }) }} />
 * ```
 */
export function themeInitScript(options: ThemeInitScriptOptions = {}): string {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
  const defaultScheme = options.defaultScheme ?? "system";
  const productTheme = options.productTheme ?? "q9";
  const dir = options.dir ?? "ltr";

  return [
    "(function(){try{",
    `var s=localStorage.getItem(${JSON.stringify(storageKey)})||${JSON.stringify(defaultScheme)};`,
    "var d=s==='dark'||(s==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);",
    `document.documentElement.classList.toggle(${JSON.stringify(DARK_CLASS)},d);`,
    `document.documentElement.setAttribute(${JSON.stringify(PRODUCT_THEME_ATTRIBUTE)},${JSON.stringify(productTheme)});`,
    "document.documentElement.style.colorScheme=d?'dark':'light';",
    `document.documentElement.dir=${JSON.stringify(dir)};`,
    "}catch(e){}})();",
  ].join("");
}
