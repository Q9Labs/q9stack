import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { cloneFileContent, type FileContent, type FileMap } from "../core/files.js";

export class FilesystemTemplateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "FilesystemTemplateError";
  }
}

function relativeTemplatePath(root: string, path: string): string {
  const relativePath = relative(root, path).split(sep).join("/");
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    isAbsolute(relativePath)
  ) {
    throw new FilesystemTemplateError(`Template entry escaped its root: ${path}`);
  }

  return relativePath;
}

function decodeUtf8(bytes: Uint8Array, path: string): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) {
      return undefined;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new FilesystemTemplateError(`Unable to decode ${path}: ${message}`);
  }
}

async function readEntry(
  root: string,
  entry: Dirent,
  directory: string,
): Promise<[string, FileContent][]> {
  const absolutePath = resolve(directory, entry.name);
  if (entry.isDirectory()) {
    return readDirectory(root, absolutePath);
  }

  const bytes = new Uint8Array(await readFile(absolutePath));
  const text = decodeUtf8(bytes, absolutePath);
  return [[relativeTemplatePath(root, absolutePath), text ?? bytes]];
}

async function readDirectory(root: string, directory: string): Promise<[string, FileContent][]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => readEntry(root, entry, directory)));
  return files.flat();
}

export async function readTemplateDirectory(root: string): Promise<Map<string, FileContent>> {
  const entries = await readDirectory(resolve(root), resolve(root));
  return new Map(entries);
}

function absoluteOutputPath(root: string, relativePath: string): string {
  if (relativePath.length === 0 || isAbsolute(relativePath)) {
    throw new FilesystemTemplateError(`Output path must be relative: ${relativePath}`);
  }

  const outputRoot = resolve(root);
  const outputPath = resolve(outputRoot, relativePath);
  const escaped = relative(outputRoot, outputPath);
  if (escaped === ".." || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) {
    throw new FilesystemTemplateError(`Output path escaped its root: ${relativePath}`);
  }

  return outputPath;
}

export async function writeFileMap(root: string, files: FileMap): Promise<void> {
  const outputRoot = resolve(root);
  await mkdir(outputRoot, { recursive: true });

  await Promise.all(
    [...files].map(async ([relativePath, content]) => {
      const outputPath = absoluteOutputPath(outputRoot, relativePath);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, cloneFileContent(content));
    }),
  );
}
