import { copyFileSync, mkdirSync } from "node:fs";

import { defineConfig } from "tsdown";

const STYLES = ["tokens.css", "fonts.css"];

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/auth/index.ts",
    "src/preview/index.ts",
    "src/icon.tsx",
    "src/shell/index.ts",
    "src/theme/index.ts",
  ],
  outDir: "dist",
  format: "esm",
  platform: "browser",
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  external: ["react", "react-dom", "react/jsx-runtime"],
  // Rolldown drops directives when it merges modules; the client boundary has to
  // survive for React Server Components consumers.
  outputOptions: { banner: '"use client";' },
  hooks: {
    "build:done": () => {
      mkdirSync("dist", { recursive: true });
      for (const file of STYLES) {
        copyFileSync(`src/styles/${file}`, `dist/${file}`);
      }
    },
  },
});
