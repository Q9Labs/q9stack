import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const previewRoot = fileURLToPath(new URL(".", import.meta.url));

/** Dev-only app for visual QA; it is never published (see `files` in package.json). */
export default defineConfig({
  root: previewRoot,
  plugins: [react(), tailwindcss()],
  server: { port: 5311 },
  build: { outDir: "dist", emptyOutDir: true },
});
