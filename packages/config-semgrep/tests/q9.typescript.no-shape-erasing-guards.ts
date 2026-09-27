// ruleid: q9.typescript.no-shape-erasing-guards
function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

// ok: q9.typescript.no-shape-erasing-guards
function isUser(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && "id" in value;
}
