import { existsSync } from "node:fs";

const expectedArtifacts = ["dist/index.js", "dist/index.d.ts"];
const staleArtifacts = ["dist/index.mjs", "dist/index.d.mts", "dist/tsconfig.tsbuildinfo"];
const missingArtifacts = expectedArtifacts.filter((path) => !existsSync(path));
const foundStaleArtifacts = staleArtifacts.filter((path) => existsSync(path));

if (missingArtifacts.length > 0 || foundStaleArtifacts.length > 0) {
  const details = [
    missingArtifacts.length > 0 ? `missing: ${missingArtifacts.join(", ")}` : undefined,
    foundStaleArtifacts.length > 0 ? `stale: ${foundStaleArtifacts.join(", ")}` : undefined,
  ].filter((detail) => detail !== undefined);

  throw new Error(`config-oxlint build artifact contract failed (${details.join("; ")}).`);
}
