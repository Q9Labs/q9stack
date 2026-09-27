import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/adapter.ts", "src/types.ts", "src/client.ts"],
  fixedExtension: false,
  format: ["esm"],
  outDir: "dist",
});
