import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    dts: {
      neverBundle: true,
    },
  },
  dts: { tsconfig: "../../tsconfig.dts.json" },
  entry: ["src/index.ts", "src/api.ts"],
  fixedExtension: false,
  format: ["esm"],
  outDir: "dist",
});
