import { defineConfig } from "vitest/config";

// These tests spawn the built CLI and fake adapters as subprocesses, which exceed 5 s when turbo runs every package at once.
export default defineConfig({ test: { testTimeout: 30_000 } });
