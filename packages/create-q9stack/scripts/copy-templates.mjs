import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(packageDirectory, "../../templates");
const destinationDirectory = resolve(packageDirectory, "templates");
const changelogRegistryPath = resolve(packageDirectory, "../../registry/public/r/changelog.json");
const generatedDirectoryNames = new Set(["node_modules", ".turbo", "dist"]);

const changelogTemplatePaths = new Map([
  ["changelog/changelog.ts", "base/apps/web/src/lib/changelog.ts"],
  ["changelog/use-changelog.ts", "base/apps/web/src/hooks/use-changelog.ts"],
  ["changelog/changelog-dialog.tsx", "base/apps/web/src/components/changelog-dialog.tsx"],
]);

/** @typedef {{ name: string, files: Array<{ path: string, content: string }> }} BuiltRegistryItem */

/** @param {unknown} value @returns {value is BuiltRegistryItem["files"][number]} */
function isBuiltRegistryFile(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "content" in value &&
    typeof value.content === "string"
  );
}

/** @param {unknown} value @returns {value is BuiltRegistryItem} */
function isBuiltRegistryItem(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    value.name === "changelog" &&
    "files" in value &&
    Array.isArray(value.files) &&
    value.files.every(isBuiltRegistryFile)
  );
}

/** @param {unknown} value @param {string} registryItemPath @returns {BuiltRegistryItem} */
function parse(value, registryItemPath) {
  if (!isBuiltRegistryItem(value)) {
    throw new Error(`Invalid built changelog registry item: ${registryItemPath}`);
  }
  return value;
}

/** @param {string} registryItemPath */
async function readChangelogRegistryItem(registryItemPath) {
  const source = await readFile(registryItemPath, "utf8");
  const item = parse(JSON.parse(source), registryItemPath);
  const itemFiles = new Map(item.files.map((file) => [file.path, file.content]));
  for (const sourcePath of changelogTemplatePaths.keys()) {
    if (!itemFiles.has(sourcePath)) {
      throw new Error(`Built changelog registry item is missing ${sourcePath}`);
    }
  }
  return itemFiles;
}

/** @param {string} targetPath @param {Map<string, string>} itemFiles */
async function copyChangelogRegistryItem(targetPath, itemFiles) {
  await Promise.all(
    [...changelogTemplatePaths].map(async ([registryPath, templatePath]) => {
      let content = itemFiles.get(registryPath);
      if (content === undefined) {
        throw new Error(`Built changelog registry item is missing ${registryPath}`);
      }
      if (registryPath === "changelog/use-changelog.ts") {
        content = content
          .replace('from "@/lib/changelog"', 'from "../lib/changelog"')
          .replace(
            /\/\/ On the server the last seen version is unknown, so nothing counts as unseen\.\nfunction readLastSeenOnServer\(\) \{\n[ \t]*return(?: undefined)?;\n\}/,
            "// With no stored version, the latest release remains unseen.\nfunction readLastSeenOnServer() {\n  return null;\n}",
          )
          .replace("\n    lastSeenVersion !== undefined &&", "");
      }
      if (registryPath === "changelog/changelog-dialog.tsx") {
        content = content
          .replace('from "@/components/ui/dialog"', 'from "@q9labsai/ui"')
          .replace('from "@/lib/changelog"', 'from "../lib/changelog"')
          .replace('from "@q9labsai/ui";\nimport {', 'from "@q9labsai/ui";\n\nimport {')
          .replace(
            `import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@q9labsai/ui";`,
            'import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@q9labsai/ui";',
          )
          .replace(
            /function documentLocale\(\) \{\n[ \t]*if \(typeof document === "undefined"\) return(?: undefined)?;\n[ \t]*return document\.documentElement\.lang \|\| undefined;\n\}/,
            'function documentLocale() {\n  return typeof document === "undefined" ? undefined : document.documentElement.lang || undefined;\n}',
          );
      }
      const target = resolve(targetPath, templatePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }),
  );
}

/** @param {string} sourcePath */
async function shouldCopy(sourcePath) {
  const sourceStats = await lstat(sourcePath);
  if (sourceStats.isSymbolicLink()) {
    return false;
  }

  return !(sourceStats.isDirectory() && generatedDirectoryNames.has(basename(sourcePath)));
}

/** @param {string} directory */
async function preserveGitIgnoreFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await preserveGitIgnoreFiles(path);
      } else if (entry.name === ".gitignore") {
        await rename(path, resolve(directory, ".gitignore.template"));
      }
    }),
  );
}

/**
 * @param {string} sourcePath
 * @param {string} destinationPath
 * @param {string=} registryItemPath
 */
export async function copyTemplates(sourcePath, destinationPath, registryItemPath) {
  const changelogFiles =
    registryItemPath === undefined ? undefined : await readChangelogRegistryItem(registryItemPath);
  await rm(destinationPath, { force: true, recursive: true });
  await mkdir(destinationPath, { recursive: true });
  await cp(sourcePath, destinationPath, { recursive: true, filter: shouldCopy });
  if (changelogFiles !== undefined) {
    await copyChangelogRegistryItem(destinationPath, changelogFiles);
  }
  await preserveGitIgnoreFiles(destinationPath);
}

async function run() {
  const allowMissing = process.argv.includes("--allow-missing");

  try {
    await copyTemplates(sourceDirectory, destinationDirectory, changelogRegistryPath);
  } catch (error) {
    if (allowMissing && error instanceof Error && "code" in error && error.code === "ENOENT") {
      process.stderr.write(
        `q9stack templates are not present at ${sourceDirectory}; built the package without a local template copy.\n`,
      );
      process.exit(0);
    }

    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Unable to prepare q9stack templates: ${message}\n`);
    process.exitCode = 1;
  }
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  await run();
}
