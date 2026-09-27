export interface MigrationViolation {
  readonly line: number;
  readonly rule: "drop" | "alter-type" | "add-not-null";
  readonly statement: string;
}

const annotation = /^\s*--\s*expand-contract:/iu;
const dropStatement = /\bDROP\b/iu;
const alterTypeStatement = /\bALTER\b[\s\S]*\b(?:COLUMN\s+[^;\s]+\s+)?TYPE\b/iu;
const addNotNullStatement =
  /\bALTER\b[\s\S]*\b(?:ADD\s+(?:COLUMN\s+)?[^;]+\bNOT\s+NULL|ALTER\s+COLUMN\s+[^;]+\bSET\s+NOT\s+NULL)\b/iu;

interface SqlStatement {
  readonly line: number;
  readonly previousLine: string;
  readonly text: string;
}

function statements(sql: string): readonly SqlStatement[] {
  const lines = sql.split(/\r?\n/u);
  const found: SqlStatement[] = [];
  let buffer = "";
  let statementLine: number | undefined;
  let blockComment = false;
  let quote: "single" | "double" | undefined;

  const finish = (): void => {
    const text = buffer.trim();
    if (text.length > 0 && statementLine !== undefined) {
      found.push({
        line: statementLine,
        previousLine: lines[statementLine - 2] ?? "",
        text,
      });
    }
    buffer = "";
    statementLine = undefined;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index] ?? "";
      const next = line[index + 1];
      if (blockComment) {
        if (character === "*" && next === "/") {
          blockComment = false;
          index += 1;
        }
        continue;
      }
      if (quote === "single") {
        if (character === "'" && next === "'") {
          index += 1;
        } else if (character === "'") {
          quote = undefined;
        }
        continue;
      }
      if (quote === "double") {
        if (character === '"' && next === '"') {
          index += 1;
        } else if (character === '"') {
          quote = undefined;
        }
        continue;
      }
      if (character === "-" && next === "-") {
        break;
      }
      if (character === "/" && next === "*") {
        blockComment = true;
        index += 1;
        continue;
      }
      if (character === "'" || character === '"') {
        quote = character === "'" ? "single" : "double";
        buffer += " ";
        statementLine ??= lineIndex + 1;
        continue;
      }
      if (character === ";") {
        buffer += character;
        finish();
        continue;
      }
      if (!/\s/u.test(character)) {
        statementLine ??= lineIndex + 1;
      }
      buffer += character;
    }
    if (buffer.length > 0) {
      buffer += " ";
    }
  }
  finish();
  return found;
}

function violationRule(line: string): MigrationViolation["rule"] | undefined {
  if (dropStatement.test(line)) {
    return "drop";
  }
  if (alterTypeStatement.test(line)) {
    return "alter-type";
  }
  if (addNotNullStatement.test(line)) {
    return "add-not-null";
  }
  return undefined;
}

export function scanMigration(sql: string): readonly MigrationViolation[] {
  return statements(sql).flatMap((statement) => {
    const rule = violationRule(statement.text);
    if (rule === undefined || annotation.test(statement.previousLine)) {
      return [];
    }
    return [{ line: statement.line, rule, statement: statement.text }];
  });
}
