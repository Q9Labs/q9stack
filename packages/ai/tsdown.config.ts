import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    plain: "src/plain/client.ts",
    tools: "src/tools/index.ts",
  },
  format: ["esm"],
  dts: true,
  outDir: "dist",
  clean: true,
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
