import { Config } from "effect";
import type * as Redacted from "effect/Redacted";

export type EnvSchemaKind = "string" | "integer" | "boolean" | "redacted" | "url" | "enum";

export interface EnvSchemaJson {
  readonly type: EnvSchemaKind;
  readonly values?: readonly string[];
}

export interface EnvSchema<A> {
  readonly kind: EnvSchemaKind;
  readonly config: (name: string) => Config.Config<A>;
  readonly schemaJson: EnvSchemaJson;
}

const makeSchema = <A>(
  kind: EnvSchemaKind,
  config: (name: string) => Config.Config<A>,
): EnvSchema<A> => ({
  config,
  kind,
  schemaJson: { type: kind },
});

export const isBlankEnvValue = (value: string): boolean =>
  /^[\p{White_Space}\u200b\ufeff]*$/u.test(value);

const nonBlankString = (name: string): Config.Config<string> =>
  Config.string(name).pipe(
    Config.validate({
      message: "must not be blank",
      validation: (value) => !isBlankEnvValue(value),
    }),
  );

export const string = (): EnvSchema<string> => makeSchema("string", nonBlankString);

export const integer = (): EnvSchema<number> =>
  makeSchema("integer", (name) => Config.integer(name));

export const boolean = (): EnvSchema<boolean> =>
  makeSchema("boolean", (name) => Config.boolean(name));

export const redacted = (): EnvSchema<Redacted.Redacted> =>
  makeSchema("redacted", (name) => Config.redacted(nonBlankString(name)));

export const url = (): EnvSchema<URL> => makeSchema("url", (name) => Config.url(name));

export const enumeration = <const Values extends readonly [string, ...string[]]>(
  values: Values,
): EnvSchema<Values[number]> => {
  const options: readonly string[] = values;
  const isMember = (value: string): value is Values[number] => options.includes(value);
  return {
    config: (name) =>
      nonBlankString(name).pipe(
        Config.validate({
          message: `must be one of: ${values.join(", ")}`,
          validation: isMember,
        }),
      ),
    kind: "enum",
    schemaJson: { type: "enum", values },
  };
};

export const schemas = {
  boolean,
  enumeration,
  integer,
  redacted,
  string,
  url,
} as const;

export const schema = schemas;
