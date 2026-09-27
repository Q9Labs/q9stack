import { useLingui } from "@lingui/react/macro";

import { useLocale } from "../i18n/locale-provider.js";

export function LocaleSwitcher() {
  const { locale, toggleLocale } = useLocale();
  const { t } = useLingui();
  const targetLocale = locale === "ar" ? "en" : "ar";
  const targetLabel = targetLocale === "ar" ? "العربية" : "English";

  return (
    <button
      type="button"
      onClick={toggleLocale}
      aria-label={`${t({ id: "shell.language", message: "Switch language" })}: ${targetLabel}`}
      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
    >
      <span aria-hidden="true">{targetLocale === "ar" ? "ع" : "En"}</span>
      <span>{targetLabel}</span>
    </button>
  );
}
