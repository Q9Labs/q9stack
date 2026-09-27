"use client";

import { DirectionProvider } from "@base-ui/react/direction-provider";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  type ColorScheme,
  DARK_CLASS,
  DEFAULT_STORAGE_KEY,
  isColorScheme,
  PRODUCT_THEME_ATTRIBUTE,
  type Direction,
  type ResolvedScheme,
  resolveScheme,
} from "./scheme";

export interface ThemeContextValue {
  readonly scheme: ColorScheme;
  readonly resolvedScheme: ResolvedScheme;
  readonly productTheme: string;
  readonly dir: Direction;
  readonly setScheme: (scheme: ColorScheme) => void;
  readonly setProductTheme: (theme: string) => void;
  readonly setDir: (dir: Direction) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  readonly children: ReactNode;
  /** Scheme used before anything is read from storage. */
  readonly defaultScheme?: ColorScheme | undefined;
  /** Value of the `data-theme` attribute, i.e. which product palette applies. */
  readonly defaultProductTheme?: string | undefined;
  /** Writing direction; mirrors onto `<html dir>` and Base UI's DirectionProvider. */
  readonly dir?: Direction | undefined;
  readonly storageKey?: string | undefined;
  /** Set to false when the host app owns `<html class>` itself. */
  readonly enableSystemListener?: boolean | undefined;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

const prefersDark = (): boolean =>
  typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;

/** The server has no media query to read, so it always renders the light scheme. */
const serverPrefersDark = (): boolean => false;

const unsubscribed = (): void => {};

function subscribeToSystemScheme(onChange: () => void): () => void {
  if (typeof window === "undefined") {
    return unsubscribed;
  }
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** A runtime direction change holds until the `dir` prop itself moves. */
interface DirectionOverride {
  readonly prop: Direction;
  readonly value: Direction;
}

function readStoredScheme(storageKey: string, fallback: ColorScheme): ColorScheme {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const stored = window.localStorage.getItem(storageKey);
    return isColorScheme(stored) ? stored : fallback;
  } catch {
    // Private-mode Safari and hardened browser profiles throw on localStorage
    // access. The in-memory scheme still works, so fall back instead of failing.
    return fallback;
  }
}

function persistScheme(storageKey: string, scheme: ColorScheme): void {
  try {
    window.localStorage.setItem(storageKey, scheme);
  } catch {
    // See readStoredScheme: persistence is best-effort by design.
  }
}

export function ThemeProvider({
  children,
  defaultScheme = "system",
  defaultProductTheme = "q9",
  dir: dirProp = "ltr",
  storageKey = DEFAULT_STORAGE_KEY,
  enableSystemListener = true,
}: ThemeProviderProps) {
  const [scheme, setSchemeState] = useState<ColorScheme>(() =>
    readStoredScheme(storageKey, defaultScheme),
  );
  const [productTheme, setProductThemeState] = useState(defaultProductTheme);
  const [dirOverride, setDirOverride] = useState<DirectionOverride | null>(null);

  const subscribe = useCallback(
    (onChange: () => void) =>
      enableSystemListener ? subscribeToSystemScheme(onChange) : unsubscribed,
    [enableSystemListener],
  );
  const systemDark = useSyncExternalStore(subscribe, prefersDark, serverPrefersDark);

  const dir = dirOverride !== null && dirOverride.prop === dirProp ? dirOverride.value : dirProp;
  const setDir = useCallback(
    (next: Direction) => setDirOverride({ prop: dirProp, value: next }),
    [dirProp],
  );

  const resolvedScheme = resolveScheme(scheme, systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(DARK_CLASS, resolvedScheme === "dark");
    root.style.colorScheme = resolvedScheme;
  }, [resolvedScheme]);

  useEffect(() => {
    document.documentElement.setAttribute(PRODUCT_THEME_ATTRIBUTE, productTheme);
  }, [productTheme]);

  useEffect(() => {
    document.documentElement.dir = dir;
  }, [dir]);

  const setScheme = useCallback(
    (next: ColorScheme) => {
      setSchemeState(next);
      persistScheme(storageKey, next);
    },
    [storageKey],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      scheme,
      resolvedScheme,
      productTheme,
      dir,
      setScheme,
      setProductTheme: setProductThemeState,
      setDir,
    }),
    [scheme, resolvedScheme, productTheme, dir, setScheme, setDir],
  );

  return (
    <ThemeContext value={value}>
      <DirectionProvider direction={dir}>{children}</DirectionProvider>
    </ThemeContext>
  );
}

export class ThemeProviderMissingError extends Error {
  readonly _tag = "ThemeProviderMissingError";

  constructor() {
    super("useTheme() was called outside of <ThemeProvider>.");
    this.name = "ThemeProviderMissingError";
  }
}

export function useTheme(): ThemeContextValue {
  const value = useThemeOptional();
  if (value === null) {
    throw new ThemeProviderMissingError();
  }
  return value;
}

/**
 * For components that have a sensible unthemed default, such as a toaster that
 * can fall back to the browser's own scheme preference.
 */
export function useThemeOptional(): ThemeContextValue | null {
  return use(ThemeContext);
}
