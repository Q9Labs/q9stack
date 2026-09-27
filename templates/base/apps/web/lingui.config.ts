import { defineConfig } from "@lingui/cli";
import { formatter as poFormatter } from "@lingui/format-po";

export default defineConfig({
  sourceLocale: "en",
  fallbackLocales: { default: "en" },
  locales: ["en", "ar"],
  // Line numbers shift with generated app names; keep origins path-only so
  // extracted catalogs stay drift-free across scaffolds.
  format: poFormatter({ origins: true, lineNumbers: false }),
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["<rootDir>/src"],
    },
  ],
});
