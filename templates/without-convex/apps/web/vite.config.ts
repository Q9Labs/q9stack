import { cloudflare } from "@cloudflare/vite-plugin";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Env files (.env.local and friends) live at the workspace root.
  envDir: "../..",
  // Expose only contract-declared browser values. Server credentials never
  // enter import.meta.env or the client bundle.
  envPrefix: ["VITE_", "PUBLIC_", "APP_ENV", "APP_URL", "SENTRY_DSN"],
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({
      router: {
        routeFileIgnorePattern: "\\.(test|preview)\\.|health-response",
      },
    }),
    viteReact(),
    lingui(),
    babel({ presets: [linguiTransformerBabelPreset()] }),
    tailwindcss(),
  ],
});
