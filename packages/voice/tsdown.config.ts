import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    ultravox: "src/ultravox/index.ts",
    "openai-realtime": "src/openai-realtime/index.ts",
    react: "src/react/index.ts",
  },
  format: ["esm"],
  dts: true,
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  clean: true,
  outDir: "dist",
});
