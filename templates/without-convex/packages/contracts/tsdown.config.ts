import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/api.ts", "src/client.ts"],
  fixedExtension: false,
  format: ["esm"],
  outDir: "dist",
});
