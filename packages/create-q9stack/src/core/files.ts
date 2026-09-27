export type FileContent = string | Uint8Array;

export type FileMap = ReadonlyMap<string, FileContent>;

export function cloneFileContent(content: FileContent): FileContent {
  if (typeof content === "string") {
    return content;
  }

  return new Uint8Array(content);
}

export function cloneFileMap(files: FileMap): Map<string, FileContent> {
  const clone = new Map<string, FileContent>();
  for (const [path, content] of files) {
    clone.set(path, cloneFileContent(content));
  }

  return clone;
}
