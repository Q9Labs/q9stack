export interface SelectKnob<Option extends string> {
  readonly kind: "select";
  readonly name: string;
  readonly options: readonly Option[];
  readonly defaultValue: Option;
}

export interface BooleanKnob {
  readonly kind: "boolean";
  readonly name: string;
  readonly defaultValue: boolean;
}

export interface TextKnob {
  readonly kind: "text";
  readonly name: string;
  readonly defaultValue: string;
}

export interface NumberKnobRange {
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
}

export interface NumberKnob extends NumberKnobRange {
  readonly kind: "number";
  readonly name: string;
  readonly defaultValue: number;
}

export type Knob = SelectKnob<string> | BooleanKnob | TextKnob | NumberKnob;

export type KnobValue = string | boolean | number;

/** A scenario's knob declarations, keyed by the prop they drive. */
export type KnobSpec = Readonly<Record<string, Knob>>;

export type KnobValueOf<K extends Knob> =
  K extends SelectKnob<infer Option>
    ? Option
    : K extends BooleanKnob
      ? boolean
      : K extends NumberKnob
        ? number
        : string;

export type KnobValues<Spec extends KnobSpec> = {
  readonly [Name in keyof Spec]: KnobValueOf<Spec[Name]>;
};

export const knob = {
  select<const Option extends string>(
    name: string,
    options: readonly Option[],
    defaultValue: Option,
  ): SelectKnob<Option> {
    return { kind: "select", name, options, defaultValue };
  },
  boolean(name: string, defaultValue: boolean): BooleanKnob {
    return { kind: "boolean", name, defaultValue };
  },
  text(name: string, defaultValue: string): TextKnob {
    return { kind: "text", name, defaultValue };
  },
  number(name: string, defaultValue: number, range: NumberKnobRange = {}): NumberKnob {
    return { kind: "number", name, defaultValue, ...range };
  },
};

/** Parses a knob value out of its URL string form; falls back to the default. */
export function parseKnobValue(spec: Knob, raw: string | null): KnobValue {
  if (raw === null) {
    return spec.defaultValue;
  }
  if (spec.kind === "select") {
    return spec.options.includes(raw) ? raw : spec.defaultValue;
  }
  if (spec.kind === "boolean") {
    return raw === "true";
  }
  if (spec.kind === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : spec.defaultValue;
  }
  return raw;
}
