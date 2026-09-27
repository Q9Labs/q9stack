import { cloneFileContent, type FileContent, type FileMap } from "./files.js";

const packedGitIgnoreName = ".gitignore.template";

export const restorePackedTemplatePaths = (files: FileMap): FileMap => {
  const restored = new Map<string, FileContent>();
  for (const [path, content] of files) {
    const outputPath = path.endsWith(packedGitIgnoreName)
      ? `${path.slice(0, -packedGitIgnoreName.length)}.gitignore`
      : path;
    if (restored.has(outputPath)) {
      throw new Error(`Packed template path collides with an existing file: ${outputPath}`);
    }
    restored.set(outputPath, cloneFileContent(content));
  }
  return restored;
};
