import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { scanMigration } from "../../src/core/migration-safety.js";

const unsafeStatements = [
  "DROP TABLE users;",
  "ALTER TABLE users ALTER COLUMN name TYPE text;",
  "ALTER TABLE users ADD COLUMN created_at timestamp NOT NULL;",
  "ALTER TABLE users ALTER COLUMN email SET NOT NULL;",
] as const;

describe("migration safety", () => {
  it("finds DROP, ALTER TYPE, and unsafe NOT NULL additions", () => {
    const sql = [
      "DROP TABLE users;",
      "ALTER TABLE users ALTER COLUMN name TYPE text;",
      "ALTER TABLE users ADD COLUMN created_at timestamp NOT NULL;",
      "ALTER TABLE users ALTER COLUMN email SET NOT NULL;",
    ].join("\n");

    expect(scanMigration(sql)).toEqual([
      { line: 1, rule: "drop", statement: "DROP TABLE users;" },
      { line: 2, rule: "alter-type", statement: "ALTER TABLE users ALTER COLUMN name TYPE text;" },
      {
        line: 3,
        rule: "add-not-null",
        statement: "ALTER TABLE users ADD COLUMN created_at timestamp NOT NULL;",
      },
      {
        line: 4,
        rule: "add-not-null",
        statement: "ALTER TABLE users ALTER COLUMN email SET NOT NULL;",
      },
    ]);
  });

  it("allows an unsafe statement when the previous line annotates expand-contract", () => {
    const sql = [
      "-- expand-contract: remove after old clients are migrated",
      "DROP COLUMN legacy_name;",
      "-- expand-contract: convert after dual writes",
      "ALTER TABLE users ALTER COLUMN name TYPE text;",
      "-- expand-contract: backfill before enforcing",
      "ALTER TABLE users ADD COLUMN created_at timestamp NOT NULL;",
    ].join("\n");

    expect(scanMigration(sql)).toEqual([]);
  });

  it("requires the annotation to be immediately above the statement", () => {
    const sql = [
      "-- expand-contract: this is not adjacent",
      "-- another comment",
      "DROP TABLE users;",
      "-- expand-contract: only the next statement is covered",
      "DROP TABLE audit;",
      "DROP TABLE sessions;",
    ].join("\n");

    expect(scanMigration(sql)).toEqual([
      { line: 3, rule: "drop", statement: "DROP TABLE users;" },
      { line: 6, rule: "drop", statement: "DROP TABLE sessions;" },
    ]);
  });

  it("ignores safe migration statements", () => {
    const sql = [
      "CREATE TABLE users (id uuid PRIMARY KEY);",
      "ALTER TABLE users ADD COLUMN display_name text;",
      "CREATE INDEX users_display_name_idx ON users(display_name);",
      "UPDATE users SET display_name = 'unknown' WHERE display_name IS NULL;",
    ].join("\n");

    expect(scanMigration(sql)).toEqual([]);
  });

  it("scans multiline statements and ignores comments and string literals", () => {
    const sql = [
      "-- expand-contract: backfill is complete",
      "ALTER TABLE users",
      "  ALTER COLUMN name",
      "  TYPE text;",
      "SELECT 'DROP TABLE users;';",
      "/* DROP TABLE users; */",
      "ALTER TABLE sessions",
      "  ADD COLUMN owner_id uuid NOT NULL;",
    ].join("\n");

    expect(scanMigration(sql)).toEqual([
      {
        line: 7,
        rule: "add-not-null",
        statement: "ALTER TABLE sessions   ADD COLUMN owner_id uuid NOT NULL;",
      },
    ]);
  });

  it("always reports one violation for each unannotated unsafe statement", () => {
    fc.assert(
      fc.property(fc.constantFrom(...unsafeStatements), (statement) => {
        const violations = scanMigration(statement);

        expect(violations).toHaveLength(1);
        expect(violations[0]?.line).toBe(1);
      }),
    );
  });

  it("never reports an unsafe statement directly preceded by an annotation", () => {
    fc.assert(
      fc.property(fc.constantFrom(...unsafeStatements), (statement) => {
        expect(scanMigration(`-- expand-contract: approved\n${statement}`)).toEqual([]);
      }),
    );
  });
});
