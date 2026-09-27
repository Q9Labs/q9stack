import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["test/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "components",
          environment: "jsdom",
          environmentOptions: { jsdom: { url: "http://localhost/" } },
          include: ["test/components/**/*.test.tsx"],
          setupFiles: ["test/components/setup.ts"],
        },
      },
    ],
  },
});
