import { cloneFileContent, type FileContent, type FileMap } from "./files.js";

export class OverlayError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "OverlayError";
  }
}

function normalizeTemplatePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    segments.some((segment) => segment === "..")
  ) {
    throw new OverlayError(`Template path is outside its root: ${path}`);
  }

  return normalized;
}

function cloneEntries(files: FileMap): Map<string, FileContent> {
  const clone = new Map<string, FileContent>();
  for (const [path, content] of files) {
    clone.set(normalizeTemplatePath(path), cloneFileContent(content));
  }

  return clone;
}

export function parseRemovalList(content: string): readonly string[] {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(normalizeTemplatePath);
}

function removePath(files: Map<string, FileContent>, path: string): void {
  for (const existingPath of files.keys()) {
    if (existingPath === path || existingPath.startsWith(`${path}/`)) {
      files.delete(existingPath);
    }
  }
}

export function applyOverlay(base: FileMap, overlay: FileMap): Map<string, FileContent> {
  const result = cloneEntries(base);
  let removalList: readonly string[] = [];

  for (const [rawPath, content] of overlay) {
    const path = normalizeTemplatePath(rawPath);
    if (path === ".q9-remove") {
      if (typeof content !== "string") {
        throw new OverlayError(".q9-remove must be a UTF-8 text file");
      }

      removalList = parseRemovalList(content);
      continue;
    }

    result.set(path, cloneFileContent(content));
  }

  result.delete(".q9-remove");
  for (const path of removalList) {
    removePath(result, path);
  }

  return result;
}
