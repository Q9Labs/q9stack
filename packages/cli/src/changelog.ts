import semver from "semver";

export const entryTypes = ["added", "changed", "fixed", "removed", "security", "internal"] as const;
export type EntryType = (typeof entryTypes)[number];
export type Entry = { type: EntryType; title: string; body: string };
export type Release = { version: string; date: string; entries: Entry[] };
export type Changelog = { unreleased: Entry[]; releases: Release[] };

const headings = ["Added", "Changed", "Fixed", "Removed", "Security", "Internal"];

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function typeFor(heading: string): EntryType {
  const index = headings.indexOf(heading);
  if (index < 0) throw new Error("CHANGELOG.md: invalid section heading " + heading);
  const type = entryTypes[index];
  if (!type) throw new Error("CHANGELOG.md: invalid section heading " + heading);
  return type;
}

export function parseChangelog(source: string): Changelog {
  const lines = source.split(/\r?\n/);
  if (lines[0] !== "# Changelog") throw new Error("CHANGELOG.md:1: expected # Changelog");
  const result: Changelog = { unreleased: [], releases: [] };
  let seenUnreleased = false;
  let currentRelease: Release | undefined;
  let currentType: EntryType | undefined;
  let entriesInSection = 0;
  let lastVersion: string | undefined;
  const seenVersions = new Set<string>();
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (!line.trim()) continue;
    const location = "CHANGELOG.md:" + (index + 1) + ": ";
    if (line.startsWith("## ")) {
      if (currentType && entriesInSection === 0) throw new Error(location + "empty section");
      currentType = undefined;
      entriesInSection = 0;
      if (line === "## [Unreleased]") {
        if (seenUnreleased || currentRelease || result.releases.length)
          throw new Error(location + "[Unreleased] must appear once and first");
        seenUnreleased = true;
        continue;
      }
      if (!seenUnreleased) throw new Error(location + "[Unreleased] must appear first");
      const match = /^## \[([^\]]+)\] - (\S+)$/.exec(line);
      if (!match) throw new Error(location + "expected ## [version] - YYYY-MM-DD");
      const version = match[1] ?? "";
      const date = match[2] ?? "";
      if (!semver.valid(version) || version !== semver.clean(version))
        throw new Error(location + "invalid semver " + version);
      if (!validDate(date)) throw new Error(location + "invalid calendar date " + date);
      if (seenVersions.has(version) || (lastVersion && !semver.lt(version, lastVersion)))
        throw new Error(location + "releases must be newest first");
      seenVersions.add(version);
      lastVersion = version;
      currentRelease = { version, date, entries: [] };
      result.releases.push(currentRelease);
      continue;
    }
    if (line.startsWith("### ")) {
      if (!seenUnreleased) throw new Error(location + "section before [Unreleased]");
      if (currentType && entriesInSection === 0) throw new Error(location + "empty section");
      currentType = typeFor(line.slice(4));
      entriesInSection = 0;
      continue;
    }
    if (line.startsWith("- ")) {
      if (!currentType) throw new Error(location + "entry requires a section heading");
      const match = /^- \*\*(.+?)\*\*: (.+)$/.exec(line);
      if (!match || !match[1]?.trim() || !match[2]?.trim())
        throw new Error(location + "expected - **Title**: body");
      const entry: Entry = { type: currentType, title: match[1], body: match[2] };
      if (currentRelease) currentRelease.entries.push(entry);
      else result.unreleased.push(entry);
      entriesInSection++;
      continue;
    }
    throw new Error(location + "unexpected content");
  }
  if (!seenUnreleased) throw new Error("CHANGELOG.md: missing [Unreleased]");
  if (currentType && entriesInSection === 0) throw new Error("CHANGELOG.md: empty section");
  return result;
}

export function renderChangelog(changelog: Changelog): string {
  const lines = ["# Changelog", "", "## [Unreleased]", ""];
  appendEntries(lines, changelog.unreleased);
  for (const item of changelog.releases) {
    lines.push("## [" + item.version + "] - " + item.date, "");
    appendEntries(lines, item.entries);
  }
  return lines.join("\n").trimEnd() + "\n";
}

function appendEntries(lines: string[], entries: Entry[]): void {
  for (const type of entryTypes) {
    const selected = entries.filter((entry) => entry.type === type);
    if (!selected.length) continue;
    const heading = headings[entryTypes.indexOf(type)];
    lines.push("### " + heading, "");
    for (const entry of selected) lines.push("- **" + entry.title + "**: " + entry.body);
    lines.push("");
  }
}

export function addEntry(source: string, entry: Entry): string {
  const withUnreleased = source.includes("## [Unreleased]")
    ? source
    : source.replace(/^# Changelog\s*\n/, "# Changelog\n\n## [Unreleased]\n\n");
  const changelog = parseChangelog(withUnreleased);
  if (
    !entryTypes.includes(entry.type) ||
    !entry.title.trim() ||
    !entry.body.trim() ||
    /[\r\n]/.test(entry.title + entry.body)
  )
    throw new Error("CHANGELOG.md: type, title, and body must be valid single-line entry values");
  changelog.unreleased.push(entry);
  return renderChangelog(changelog);
}

export function release(source: string, version: string, date: string): string {
  const changelog = parseChangelog(source);
  if (!changelog.unreleased.length) throw new Error("CHANGELOG.md: [Unreleased] is empty");
  if (!semver.valid(version) || version !== semver.clean(version))
    throw new Error("CHANGELOG.md: invalid semver " + version);
  if (!validDate(date)) throw new Error("CHANGELOG.md: invalid calendar date " + date);
  if (changelog.releases[0] && !semver.gt(version, changelog.releases[0].version))
    throw new Error(
      "CHANGELOG.md: version must be greater than latest release " + changelog.releases[0].version,
    );
  changelog.releases.unshift({ version, date, entries: changelog.unreleased });
  changelog.unreleased = [];
  return renderChangelog(changelog);
}

function plainText(value: string): string {
  return value.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_~]/g, "");
}

export function exportWhatsNew(source: string): { schemaVersion: 1; releases: Release[] } {
  const changelog = parseChangelog(source);
  return {
    schemaVersion: 1,
    releases: changelog.releases
      .map((item) => ({
        version: item.version,
        date: item.date,
        entries: item.entries
          .filter((entry) => entry.type !== "internal")
          .map((entry) => ({
            type: entry.type,
            title: plainText(entry.title),
            body: plainText(entry.body),
          })),
      }))
      .filter((item) => item.entries.length > 0),
  };
}
