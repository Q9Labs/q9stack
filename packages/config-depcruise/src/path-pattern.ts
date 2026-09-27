const GLOB_TOKEN = /[*?{]/u;
const REGEX_TOKEN = /(^\^|\$|\\|\(\?|\||\+|\[|\])/u;

function escapeRegexCharacter(character: string): string {
  if (/[.+^$()|[\]\\]/u.test(character)) {
    return `\\${character}`;
  }

  return character;
}

function findClosingBrace(pattern: string, openingIndex: number): number {
  let depth = 0;

  for (let index = openingIndex; index < pattern.length; index += 1) {
    const character = pattern.charAt(index);
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function toGlobPattern(pattern: string): string {
  let result = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern.charAt(index);

    if (character === "*" && pattern.charAt(index + 1) === "*") {
      result += ".*";
      index += 1;
      continue;
    }

    if (character === "*") {
      result += "[^/]+";
      continue;
    }

    if (character === "?") {
      result += "[^/]";
      continue;
    }

    if (character === "{") {
      const closingIndex = findClosingBrace(pattern, index);
      if (closingIndex !== -1) {
        const alternatives = pattern.slice(index + 1, closingIndex).split(",");
        result += `(?:${alternatives.map(toGlobPattern).join("|")})`;
        index = closingIndex;
        continue;
      }
    }

    result += escapeRegexCharacter(character);
  }

  return result;
}

function toPathPattern(pattern: string): string {
  if (!GLOB_TOKEN.test(pattern) && REGEX_TOKEN.test(pattern)) {
    return pattern;
  }

  return `(?:^|/)${toGlobPattern(pattern)}(?:/|$)`;
}

export function toDependencyCruiserPatterns(patterns: readonly string[]): string[] {
  return patterns.map(toPathPattern);
}
