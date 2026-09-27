import type * as Either from "effect/Either";
import type * as Redacted from "effect/Redacted";

import type { EnvError } from "./errors.js";
import type { EnvSchema, EnvSchemaJson } from "./schema.js";

export type EnvScope = "server" | "client" | "build";

export type EnvValue = string | number | boolean | URL | Redacted.Redacted;

export interface EnvEntry<A extends EnvValue = EnvValue> {
  readonly schema: EnvSchema<A>;
  readonly description: string;
  readonly required?: boolean;
  readonly scope: EnvScope;
}

export interface EnvSpec {
  readonly [key: string]: EnvEntry;
}

export type EnvKey = string;

export type SchemaOutput<Entry> = Entry extends EnvEntry<infer A> ? A : never;

export type ParsedValue<Entry> =
  Entry extends EnvEntry<infer A>
    ? Entry extends { readonly required: false }
      ? A | undefined
      : A
    : never;

export type Parsed<Spec extends EnvSpec> = {
  [Key in keyof Spec]: ParsedValue<Spec[Key]>;
};

type PublicClientKey<Spec extends EnvSpec> = {
  [Key in keyof Spec]: Key extends string
    ? Spec[Key] extends { readonly scope: "client" }
      ? Key extends `VITE_${string}` | `PUBLIC_${string}` | `EXPO_PUBLIC_${string}`
        ? Key
        : never
      : never
    : never;
}[keyof Spec];

export type ClientSpec<Spec extends EnvSpec> = Pick<Spec, PublicClientKey<Spec>>;

export interface EnvSchemaJsonEntry {
  readonly key: EnvKey;
  readonly schema: EnvSchemaJson;
  readonly description: string;
  readonly required: boolean;
  readonly scope: EnvScope;
}

export interface EnvContract<Spec extends EnvSpec> {
  readonly parse: (
    source: Record<string, string | undefined>,
  ) => Either.Either<Parsed<Spec>, EnvError>;
  readonly keys: () => readonly EnvKey[];
  readonly schemaJson: () => readonly EnvSchemaJsonEntry[];
  readonly client: () => EnvContract<ClientSpec<Spec>>;
}
