import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/adapters/index.ts", "src/adapters/one-password.ts"],
  fixedExtension: false,
  format: ["esm"],
});
