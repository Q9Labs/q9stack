import { cloneFileContent, type FileContent, type FileMap } from "./files.js";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | Map<string, JsonValue>;

export class DependencyRewriteError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DependencyRewriteError";
  }
}

function readObjectProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    return undefined;
  }

  if (descriptor.value === null) {
    return null;
  }

  if (typeof descriptor.value === "boolean") {
    return descriptor.value;
  }

  if (typeof descriptor.value === "number") {
    return descriptor.value;
  }

  if (typeof descriptor.value === "string") {
    return descriptor.value;
  }

  if (typeof descriptor.value === "object") {
    return descriptor.value;
  }

  return undefined;
}

function normalizeJson(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeJson);
  }

  if (typeof value === "object") {
    const object = new Map<string, JsonValue>();
    for (const key of Object.keys(value)) {
      const property = readObjectProperty(value, key);
      if (property === undefined) {
        throw new DependencyRewriteError(`Unsupported undefined value at ${key}`);
      }

      object.set(key, normalizeJson(property));
    }

    return object;
  }

  throw new DependencyRewriteError(`Unsupported JSON value: ${typeof value}`);
}

function toObject(value: JsonValue | undefined): Map<string, JsonValue> | undefined {
  if (value instanceof Map) {
    return value;
  }

  return undefined;
}

function toSerializableJson(value: JsonValue): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toSerializableJson);
  }

  return Object.fromEntries(
    Array.from(value, ([key, property]) => [key, toSerializableJson(property)]),
  );
}

function linkTarget(checkoutPath: string, dependencyName: string): string {
  const packageName = dependencyName.slice("@q9labsai/".length);
  return `link:${checkoutPath}/packages/${packageName}`;
}

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

function parseManifest(content: string, path: string): Map<string, JsonValue> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DependencyRewriteError(`Invalid JSON in ${path}: ${message}`);
  }

  const root = toObject(normalizeJson(parsed));
  if (root === undefined) {
    throw new DependencyRewriteError(`Package manifest must be an object: ${path}`);
  }

  return root;
}

function serializeManifest(root: Map<string, JsonValue>): string {
  return `${JSON.stringify(toSerializableJson(root), null, 2)}\n`;
}

/**
 * Token substitution changes dependency names (`@__APP_SLUG__/*` becomes the
 * generated scope), so section order must be re-sorted per scaffold to stay
 * format-clean for any app name.
 */
function sortManifestDependencies(content: string, path: string): string {
  const root = parseManifest(content, path);
  let changed = false;

  for (const sectionName of dependencySections) {
    const section = toObject(root.get(sectionName));
    if (section === undefined) {
      continue;
    }

    const entries = Array.from(section);
    const sorted = entries.toSorted(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    if (sorted.some(([name], index) => name !== entries[index]?.[0])) {
      section.clear();
      for (const [name, version] of sorted) {
        section.set(name, version);
      }
      changed = true;
    }
  }

  return changed ? serializeManifest(root) : content;
}

export function sortDependencySections(files: FileMap): Map<string, FileContent> {
  const result = new Map<string, FileContent>();
  for (const [path, content] of files) {
    if (
      (path === "package.json" || path.endsWith("/package.json")) &&
      typeof content === "string"
    ) {
      result.set(path, sortManifestDependencies(content, path));
    } else {
      result.set(path, cloneFileContent(content));
    }
  }

  return result;
}

function rewriteManifest(content: string, path: string, checkoutPath: string): string {
  const root = parseManifest(content, path);
  let changed = false;

  for (const sectionName of dependencySections) {
    const section = toObject(root.get(sectionName));
    if (section === undefined) {
      continue;
    }

    for (const [dependencyName, version] of section) {
      if (typeof version === "string" && dependencyName.startsWith("@q9labsai/")) {
        section.set(dependencyName, linkTarget(checkoutPath, dependencyName));
        changed = true;
      }
    }
  }

  if (!changed) {
    return content;
  }

  return serializeManifest(root);
}

const CATALOG_LINKED_ENTRY = /^\s*"@q9labsai\/[^"]+":/;

/**
 * Linked manifests no longer reference these entries through `catalog:`, so
 * keeping them would leave orphaned catalog entries that fallow flags.
 */
function stripLinkedCatalogEntries(content: string): string {
  return content
    .split("\n")
    .filter((line) => !CATALOG_LINKED_ENTRY.test(line))
    .join("\n");
}

export function rewriteLinkedDependencies(
  files: FileMap,
  checkoutPath: string,
): Map<string, FileContent> {
  const result = new Map<string, FileContent>();
  for (const [path, content] of files) {
    if (
      (path === "package.json" || path.endsWith("/package.json")) &&
      typeof content === "string"
    ) {
      result.set(path, rewriteManifest(content, path, checkoutPath));
    } else if (path === "pnpm-workspace.yaml" && typeof content === "string") {
      result.set(path, stripLinkedCatalogEntries(content));
    } else {
      result.set(path, cloneFileContent(content));
    }
  }

  return result;
}
