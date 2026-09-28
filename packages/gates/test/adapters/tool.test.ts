import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { executeCommand } from "../../src/adapters/process.js";
import { probeTool } from "../../src/adapters/tool.js";

describe("probeTool", () => {
  it("skips an executable shim with a missing target and uses the next candidate", async () => {
    const root = await mkdtemp(join(tmpdir(), "q9gate-tool-"));
    const brokenShim = join(root, "config-depcruise", "node_modules", ".bin", "depcruise");
    const rootShim = join(root, "node_modules", ".bin", "depcruise");
    const missingTarget = join(root, "dependency-cruiser", "bin", "dependency-cruiser.mjs");

    try {
      await mkdir(join(root, "config-depcruise", "node_modules", ".bin"), { recursive: true });
      await mkdir(join(root, "node_modules", ".bin"), { recursive: true });
      await writeFile(
        brokenShim,
        `#!/bin/sh\nexec "${process.execPath}" "${missingTarget}" "$@"\n`,
      );
      await chmod(brokenShim, 0o755);
      await writeFile(rootShim, "#!/bin/sh\nprintf '%s\\n' 'dependency-cruiser 18.2.0'\n");
      await chmod(rootShim, 0o755);

      const availability = await probeTool(
        executeCommand,
        {
          command: rootShim,
          candidates: [brokenShim],
          installHint: "Install dependency-cruiser.",
        },
        root,
      );

      expect(availability).toEqual({
        available: true,
        command: rootShim,
        version: "dependency-cruiser 18.2.0",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
