export const changelogEntryTypes = ["added", "changed", "fixed", "removed", "security"] as const;

export type ChangelogEntryType = (typeof changelogEntryTypes)[number];

export type ChangelogEntry = {
  type: ChangelogEntryType;
  title: string;
  body: string;
};

export type ChangelogRelease = {
  version: string;
  date: string;
  entries: ChangelogEntry[];
};

export type Changelog = {
  schemaVersion: 1;
  releases: ChangelogRelease[];
};

const versionPattern = /^(\d+)\.(\d+)\.(\d+)/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isEntryType(value: unknown): value is ChangelogEntryType {
  return changelogEntryTypes.some((type) => type === value);
}

function parseEntry(value: unknown, where: string): ChangelogEntry {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${where} must be an object`);
  }
  if (!("type" in value) || !isEntryType(value.type)) {
    throw new Error(`${where}.type must be one of ${changelogEntryTypes.join(", ")}`);
  }
  if (!("title" in value) || typeof value.title !== "string" || value.title === "") {
    throw new Error(`${where}.title must be a non-empty string`);
  }
  if (!("body" in value) || typeof value.body !== "string") {
    throw new Error(`${where}.body must be a string`);
  }
  return { type: value.type, title: value.title, body: value.body };
}

function parseRelease(value: unknown, where: string): ChangelogRelease {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${where} must be an object`);
  }
  if (
    !("version" in value) ||
    typeof value.version !== "string" ||
    !versionPattern.test(value.version)
  ) {
    throw new Error(`${where}.version must be a semver version`);
  }
  if (!("date" in value) || typeof value.date !== "string" || !datePattern.test(value.date)) {
    throw new Error(`${where}.date must be an ISO date (YYYY-MM-DD)`);
  }
  if (!("entries" in value) || !Array.isArray(value.entries)) {
    throw new Error(`${where}.entries must be an array`);
  }
  const entries = value.entries.map((entry, index) =>
    parseEntry(entry, `${where}.entries[${index}]`),
  );
  return { version: value.version, date: value.date, entries };
}

/** Compares the major.minor.patch parts of two versions. Pre-release suffixes are ignored. */
export function compareVersions(a: string, b: string): number {
  const partsA = versionPattern.exec(a);
  const partsB = versionPattern.exec(b);
  if (!partsA || !partsB) return 0;
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(partsA[index]) - Number(partsB[index]);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Validates the changelog.json written by `q9 changelog export` and returns releases newest first. */
export function parseChangelog(input: unknown): Changelog {
  if (typeof input !== "object" || input === null) {
    throw new Error("changelog.json must be an object");
  }
  if (!("schemaVersion" in input) || input.schemaVersion !== 1) {
    throw new Error("changelog.json schemaVersion must be 1");
  }
  if (!("releases" in input) || !Array.isArray(input.releases)) {
    throw new Error("changelog.json releases must be an array");
  }
  const releases = input.releases
    .map((release, index) => parseRelease(release, `changelog.json releases[${index}]`))
    .toSorted((a, b) => compareVersions(b.version, a.version));
  return { schemaVersion: 1, releases };
}
