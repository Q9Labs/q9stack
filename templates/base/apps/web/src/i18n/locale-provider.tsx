import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import { messages as arMessages } from "../locales/ar/messages.po";
import { messages as enMessages } from "../locales/en/messages.po";

export type Locale = "en" | "ar";
export type Direction = "ltr" | "rtl";

export const defaultLocale: Locale = "en";

interface LocaleContextValue {
  readonly locale: Locale;
  readonly direction: Direction;
  readonly setLocale: (locale: Locale) => void;
  readonly toggleLocale: () => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

// The locale cookie is the source of truth; the provider subscribes to it so
// the stored locale applies after hydration without a setState-in-effect.
const localeListeners = new Set<() => void>();

function subscribeToLocale(listener: () => void): () => void {
  localeListeners.add(listener);
  return () => {
    localeListeners.delete(listener);
  };
}

const serverSnapshot = (): Locale => defaultLocale;

export function LocaleProvider({ children }: PropsWithChildren) {
  const locale = useSyncExternalStore(subscribeToLocale, readStoredLocale, serverSnapshot);
  const direction: Direction = locale === "ar" ? "rtl" : "ltr";

  const setLocale = useCallback((nextLocale: Locale) => {
    persistLocale(nextLocale);
    for (const listener of localeListeners) {
      listener();
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "ar" ? "en" : "ar");
  }, [locale, setLocale]);

  const i18n = useMemo(() => {
    const activeMessages = locale === "ar" ? { ...enMessages, ...arMessages } : enMessages;
    return setupI18n({ locale, messages: { [locale]: activeMessages } });
  }, [locale]);

  useEffect(() => {
    const documentElement = document.documentElement;
    documentElement.lang = locale;
    documentElement.dir = direction;
  }, [direction, locale]);

  const contextValue = useMemo(
    () => ({ locale, direction, setLocale, toggleLocale }),
    [direction, locale, setLocale, toggleLocale],
  );

  return (
    <LocaleContext.Provider value={contextValue}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (value === null) {
    throw new Error("useLocale must be used inside LocaleProvider");
  }
  return value;
}

function readStoredLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;

  const cookieLocale = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("q9_locale="))
    ?.slice("q9_locale=".length);

  return isLocale(cookieLocale) ? cookieLocale : defaultLocale;
}

function persistLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `q9_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "ar";
}
