export interface IcuPlural {
  readonly kind: "plural" | "selectordinal";
  readonly name: string;
  readonly offset: number;
  readonly categories: readonly string[];
}

export interface IcuInspection {
  readonly arguments: readonly string[];
  readonly selects: readonly string[];
  readonly plurals: readonly IcuPlural[];
}

class IcuParser {
  private index = 0;
  private readonly arguments: string[] = [];
  private readonly selects: string[] = [];
  private readonly plurals: IcuPlural[] = [];

  constructor(private readonly source: string) {}

  parse(): IcuInspection {
    this.parseMessage(false, false);
    if (this.index !== this.source.length) {
      this.fail("unexpected trailing ICU content");
    }
    const plurals = [
      ...new Map(
        this.plurals.map((plural) => [`${plural.kind}:${plural.name}:${plural.offset}`, plural]),
      ).values(),
    ];
    return {
      arguments: [...new Set(this.arguments)].toSorted(),
      selects: [...new Set(this.selects)].toSorted(),
      plurals: plurals.toSorted((left, right) =>
        `${left.kind}:${left.name}:${left.offset}`.localeCompare(
          `${right.kind}:${right.name}:${right.offset}`,
        ),
      ),
    };
  }

  private parseMessage(stopAtBrace: boolean, inPlural: boolean): void {
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (character === "}" && stopAtBrace) {
        return;
      }
      if (character === "}") {
        this.fail("unexpected closing brace");
      }
      if (character === "'") {
        this.parseApostrophe();
        continue;
      }
      if (character === "{") {
        this.parseArgument();
        continue;
      }
      if (character === "#" && inPlural) {
        this.index += 1;
        continue;
      }
      this.index += 1;
    }
    if (stopAtBrace) {
      this.fail("unterminated ICU choice");
    }
  }

  private parseApostrophe(): void {
    const next = this.source[this.index + 1];
    if (next === "'") {
      this.index += 2;
      return;
    }
    if (next !== "{" && next !== "}" && next !== "#") {
      this.index += 1;
      return;
    }
    this.index += 2;
    while (this.index < this.source.length) {
      if (this.source[this.index] !== "'") {
        this.index += 1;
        continue;
      }
      if (this.source[this.index + 1] === "'") {
        this.index += 2;
        continue;
      }
      this.index += 1;
      return;
    }
    this.fail("unterminated apostrophe quote");
  }

  private parseArgument(): void {
    this.index += 1;
    this.skipSpaces();
    const name = this.readUntil((character) => character === "," || character === "}").trim();
    if (!name) {
      this.fail("argument name is empty");
    }
    this.skipSpaces();
    if (this.consume("}")) {
      this.arguments.push(`${name}\u0000argument`);
      return;
    }
    if (!this.consume(",")) {
      this.fail("expected ',' or '}' after argument name");
    }

    this.skipSpaces();
    const kind = this.readUntil((character) => character === "," || character === "}").trim();
    if (!kind) {
      this.fail("argument type is empty");
    }
    this.arguments.push(`${name}\u0000${kind}`);
    this.skipSpaces();
    if (this.consume("}")) {
      return;
    }
    if (!this.consume(",")) {
      this.fail(`expected ',' after ${kind} argument`);
    }

    if (kind === "plural" || kind === "selectordinal" || kind === "select") {
      this.parseChoices(name, kind);
      return;
    }
    this.skipStyle();
    if (!this.consume("}")) {
      this.fail(`unterminated ${kind} argument`);
    }
  }

  private parsePluralOffset(): number {
    this.index += "offset:".length;
    this.skipSpaces();
    const rawOffset = this.readUntil(
      (character) => /\s/u.test(character) || character === "}" || character === "{",
    );
    const offset = Number(rawOffset);
    if (!Number.isSafeInteger(offset) || offset < 0) {
      this.fail("plural offset must be a non-negative integer");
    }
    this.skipSpaces();
    return offset;
  }

  private readChoiceSelector(): string {
    const selector = this.readUntil(
      (character) => /\s/u.test(character) || character === "{" || character === "}",
    ).trim();
    if (!selector) {
      this.fail("choice selector is empty");
    }
    this.skipSpaces();
    return selector;
  }

  private parseChoiceBody(selector: string, plural: boolean): void {
    if (!this.consume("{")) {
      this.fail(`expected '{' for choice ${selector}`);
    }
    this.parseMessage(true, plural);
    if (!this.consume("}")) {
      this.fail(`unterminated choice ${selector}`);
    }
  }

  private storeChoices(
    name: string,
    kind: "plural" | "selectordinal" | "select",
    offset: number,
    categories: readonly string[],
  ): void {
    const sortedCategories = categories.toSorted();
    if (kind === "select") {
      this.selects.push(`${name}\u0000${sortedCategories.join("\u0000")}`);
      return;
    }
    this.plurals.push({ kind, name, offset, categories: sortedCategories });
  }

  private parseChoices(name: string, kind: "plural" | "selectordinal" | "select"): void {
    const plural = kind !== "select";
    const categories: string[] = [];
    this.skipSpaces();
    const offset =
      plural && this.source.startsWith("offset:", this.index) ? this.parsePluralOffset() : 0;
    while (this.index < this.source.length && this.source[this.index] !== "}") {
      const selector = this.readChoiceSelector();
      if (categories.includes(selector)) {
        this.fail(`duplicate choice selector ${selector}`);
      }
      this.parseChoiceBody(selector, plural);
      categories.push(selector);
      this.skipSpaces();
    }
    if (!this.consume("}")) {
      this.fail("unterminated choice argument");
    }
    if (!categories.includes("other")) {
      this.fail(`${kind} argument must include an other choice`);
    }
    this.storeChoices(name, kind, offset, categories);
  }

  private skipStyle(): void {
    let quoted = false;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (character === "'" && this.source[this.index + 1] !== "'") {
        quoted = !quoted;
      }
      if (!quoted && character === "}") {
        return;
      }
      this.index += 1;
    }
  }

  private readUntil(predicate: (character: string) => boolean): string {
    const start = this.index;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (character === undefined || predicate(character)) {
        break;
      }
      this.index += 1;
    }
    return this.source.slice(start, this.index);
  }

  private skipSpaces(): void {
    while (/\s/u.test(this.source[this.index] ?? "")) {
      this.index += 1;
    }
  }

  private consume(expected: string): boolean {
    if (!this.source.startsWith(expected, this.index)) {
      return false;
    }
    this.index += expected.length;
    return true;
  }

  private fail(message: string): never {
    throw new Error(`${message} at ICU offset ${this.index}`);
  }
}

export function inspectIcuMessage(message: string): IcuInspection {
  return new IcuParser(message).parse();
}

export function compareIcuMessages(
  source: IcuInspection,
  target: IcuInspection,
): string | undefined {
  if (JSON.stringify(source.arguments) !== JSON.stringify(target.arguments)) {
    return "placeholder names or argument types differ";
  }
  if (JSON.stringify(source.selects) !== JSON.stringify(target.selects)) {
    return "select argument options differ";
  }
  const sourcePlurals = [
    ...new Set(source.plurals.map(({ kind, name, offset }) => `${kind}:${name}:${offset}`)),
  ].toSorted();
  const targetPlurals = [
    ...new Set(target.plurals.map(({ kind, name, offset }) => `${kind}:${name}:${offset}`)),
  ].toSorted();
  if (JSON.stringify(sourcePlurals) !== JSON.stringify(targetPlurals)) {
    return "plural argument names or offsets differ";
  }
  return undefined;
}
