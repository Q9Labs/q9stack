import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/ids.ts", "src/sample/index.ts"],
  fixedExtension: false,
  format: ["esm"],
  outDir: "dist",
});
