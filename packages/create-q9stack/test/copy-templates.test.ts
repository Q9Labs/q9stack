import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

// @ts-expect-error The JavaScript helper is checked by scripts/tsconfig.json.
import { copyTemplates } from "../scripts/copy-templates.mjs";

describe("copy templates", () => {
  test("installs the built changelog registry item with q9 UI imports", async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "create-q9stack-registry-"));
    const sourceDirectory = join(fixtureDirectory, "source");
    const destinationDirectory = join(fixtureDirectory, "destination");
    const registryItemPath = join(fixtureDirectory, "changelog.json");

    try {
      await mkdir(sourceDirectory);
      const registryItem = {
        name: "changelog",
        files: [
          { path: "changelog/changelog.ts", content: "export type Changelog = {};\n" },
          {
            path: "changelog/use-changelog.ts",
            content:
              'import { Changelog } from "@/lib/changelog";\n// On the server the last seen version is unknown, so nothing counts as unseen.\nfunction readLastSeenOnServer() {\n  return undefined;\n}\nconst hasUnseen = latestVersion !== undefined &&\n    lastSeenVersion !== undefined &&\n    (lastSeenVersion === null);\n',
          },
          {
            path: "changelog/changelog-dialog.tsx",
            content:
              'import {\n  Dialog,\n  DialogContent,\n  DialogDescription,\n  DialogHeader,\n  DialogTitle,\n} from "@/components/ui/dialog";\nimport { Changelog } from "@/lib/changelog";\nfunction documentLocale() {\n  if (typeof document === "undefined") return undefined;\n  return document.documentElement.lang || undefined;\n}\n',
          },
        ],
      };
      await writeFile(registryItemPath, JSON.stringify(registryItem));

      // oxlint-disable-next-line typescript/no-unsafe-call
      await copyTemplates(sourceDirectory, destinationDirectory, registryItemPath);

      expect(
        await readFile(join(destinationDirectory, "base/apps/web/src/lib/changelog.ts"), "utf8"),
      ).toBe("export type Changelog = {};\n");
      expect(
        await readFile(
          join(destinationDirectory, "base/apps/web/src/hooks/use-changelog.ts"),
          "utf8",
        ),
      ).toBe(
        'import { Changelog } from "../lib/changelog";\n// With no stored version, the latest release remains unseen.\nfunction readLastSeenOnServer() {\n  return null;\n}\nconst hasUnseen = latestVersion !== undefined &&\n    (lastSeenVersion === null);\n',
      );
      expect(
        await readFile(
          join(destinationDirectory, "base/apps/web/src/components/changelog-dialog.tsx"),
          "utf8",
        ),
      ).toBe(
        'import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@q9labsai/ui";\n\nimport { Changelog } from "../lib/changelog";\nfunction documentLocale() {\n  return typeof document === "undefined" ? undefined : document.documentElement.lang || undefined;\n}\n',
      );

      const voidReturnItem = {
        ...registryItem,
        files: registryItem.files.map((file) =>
          file.path === "changelog/use-changelog.ts"
            ? {
                path: file.path,
                content: file.content.replace("return undefined;", "return;"),
              }
            : file,
        ),
      };
      await writeFile(registryItemPath, JSON.stringify(voidReturnItem));
      // oxlint-disable-next-line typescript/no-unsafe-call
      await copyTemplates(sourceDirectory, destinationDirectory, registryItemPath);
      const copiedHook = await readFile(
        join(destinationDirectory, "base/apps/web/src/hooks/use-changelog.ts"),
        "utf8",
      );
      expect(copiedHook).toContain("return null;");
      expect(copiedHook).not.toContain("lastSeenVersion !== undefined");
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true });
    }
  });

  test("filters generated directories and directory symlinks", async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "create-q9stack-copy-"));
    const sourceDirectory = join(fixtureDirectory, "source");
    const destinationDirectory = join(fixtureDirectory, "destination");

    try {
      await mkdir(join(sourceDirectory, "nested"), { recursive: true });
      await writeFile(join(sourceDirectory, "README.md"), "template\n");
      await writeFile(join(sourceDirectory, ".gitignore"), "node_modules/\n");
      await writeFile(join(sourceDirectory, "nested", "ordinary.txt"), "ordinary\n");
      await writeFile(join(sourceDirectory, "nested", ".env.example"), "EXAMPLE=value\n");
      await writeFile(join(sourceDirectory, "nested", ".gitignore"), "nested-cache/\n");

      const ignoredDirectories = [
        ["nested", "node_modules"],
        ["nested", "build", ".turbo"],
        ["nested", "build", "dist"],
      ];
      await Promise.all(
        ignoredDirectories.map(async (directoryParts) => {
          const ignoredDirectory = join(sourceDirectory, ...directoryParts);
          await mkdir(ignoredDirectory, { recursive: true });
          await writeFile(join(ignoredDirectory, "ignored.txt"), "ignored\n");
        }),
      );

      const linkedDirectory = join(sourceDirectory, "nested", "linked-directory");
      await mkdir(linkedDirectory);
      await writeFile(join(linkedDirectory, "ignored.txt"), "linked\n");
      await symlink(linkedDirectory, join(sourceDirectory, "nested", "directory-link"), "dir");

      // oxlint-disable-next-line typescript/no-unsafe-call
      await copyTemplates(sourceDirectory, destinationDirectory);

      expect(await readFile(join(destinationDirectory, "README.md"), "utf8")).toBe("template\n");
      expect(await readFile(join(destinationDirectory, "nested", "ordinary.txt"), "utf8")).toBe(
        "ordinary\n",
      );
      expect(await readFile(join(destinationDirectory, "nested", ".env.example"), "utf8")).toBe(
        "EXAMPLE=value\n",
      );
      expect(await readFile(join(destinationDirectory, ".gitignore.template"), "utf8")).toBe(
        "node_modules/\n",
      );
      expect(
        await readFile(join(destinationDirectory, "nested", ".gitignore.template"), "utf8"),
      ).toBe("nested-cache/\n");
      await Promise.all(
        ignoredDirectories.map(async (directoryParts) => {
          await expect(lstat(join(destinationDirectory, ...directoryParts))).rejects.toMatchObject({
            code: "ENOENT",
          });
        }),
      );
      await expect(
        lstat(join(destinationDirectory, "nested", "directory-link")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(lstat(join(destinationDirectory, ".gitignore"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true });
    }
  });
});
