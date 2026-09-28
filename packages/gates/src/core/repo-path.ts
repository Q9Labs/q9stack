export function canonicalRepoRelativePath(input: string): string | undefined {
  const normalized = input.replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized.includes("\0") ||
    normalized.includes("\n") ||
    normalized.includes("\r") ||
    normalized
      .split("/")
      .some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    return undefined;
  }
  return normalized;
}
