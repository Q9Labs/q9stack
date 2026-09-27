import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    tsconfig: false,
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
