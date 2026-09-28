import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { GateConfig, GateLane } from "../core/types.js";

function isGateLane(value: unknown): value is GateLane {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "triggers" in value &&
    (typeof value.triggers === "function" || value.triggers === "always") &&
    "run" in value &&
    typeof value.run === "function"
  );
}

function isGateConfig(value: unknown): value is GateConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const hasValidTargets =
    !("targets" in value) ||
    (typeof value.targets === "object" &&
      value.targets !== null &&
      !Array.isArray(value.targets) &&
      Object.values(value.targets).every(
        (roots) => Array.isArray(roots) && roots.every((root) => typeof root === "string"),
      ));
  return (
    "workspaceRoots" in value &&
    Array.isArray(value.workspaceRoots) &&
    value.workspaceRoots.every((root) => typeof root === "string") &&
    hasValidTargets &&
    "lanes" in value &&
    Array.isArray(value.lanes) &&
    value.lanes.every(isGateLane)
  );
}

export async function loadGateConfig(
  repoRoot: string,
  configFile = "gate.config.ts",
): Promise<GateConfig> {
  const path = resolve(repoRoot, configFile);
  const metadata = await stat(path).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read gate config at ${path}: ${detail}`);
  });
  const url = pathToFileURL(path);
  url.searchParams.set("mtime", String(metadata.mtimeMs));
  const loaded: unknown = await import(url.href);
  if (typeof loaded !== "object" || loaded === null || !("default" in loaded)) {
    throw new Error(`Gate config ${path} must have a default export.`);
  }
  if (!isGateConfig(loaded.default)) {
    throw new Error(`Gate config ${path} does not match the @q9labsai/gates contract.`);
  }
  return loaded.default;
}
