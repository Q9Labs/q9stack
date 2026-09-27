import { spawnSync } from "node:child_process";

import { Either, Schema } from "effect";

export type OnePasswordEnvErrorCode =
  | "ambiguous-field"
  | "authentication"
  | "cli-unavailable"
  | "command-failed"
  | "invalid-options"
  | "item-not-found"
  | "malformed-item";

export class OnePasswordEnvError extends Error {
  readonly code: OnePasswordEnvErrorCode;

  constructor(code: OnePasswordEnvErrorCode, message: string) {
    super(message);
    this.name = "OnePasswordEnvError";
    this.code = code;
  }
}

export interface OnePasswordCommand {
  readonly executable: string;
  readonly arguments: readonly string[];
}

export interface OnePasswordCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export type OnePasswordCommandExecutor = (command: OnePasswordCommand) => OnePasswordCommandResult;

export interface OnePasswordEnvOptions {
  readonly vault: string;
  readonly item: string;
  readonly keys: readonly string[];
  readonly source?: Readonly<Record<string, string | undefined>>;
  readonly execute?: OnePasswordCommandExecutor;
}

const onePasswordItemSchema = Schema.Struct({
  fields: Schema.Array(
    Schema.Struct({
      label: Schema.optional(Schema.String),
      value: Schema.optional(Schema.String),
    }),
  ),
});

const authenticationFailure =
  /authenticate|authentication|authorization|unauthorized|not(?: currently)? signed in|signin|service account token|failed to parseToken|DecodeSACredentials|error initializing client/i;
const missingItemFailure =
  /no item found|could not find item|item[^\n]*(?:not found|does not exist)|isn't an item/i;

const defaultExecutor: OnePasswordCommandExecutor = ({ executable, arguments: arguments_ }) => {
  const result = spawnSync(executable, arguments_, {
    encoding: "utf8",
    shell: false,
  });

  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
};

const validateOptions = (options: OnePasswordEnvOptions): ReadonlySet<string> => {
  if (options.vault.trim().length === 0) {
    throw new OnePasswordEnvError("invalid-options", "A 1Password vault reference is required");
  }
  if (options.item.trim().length === 0) {
    throw new OnePasswordEnvError("invalid-options", "A 1Password item reference is required");
  }

  const keys = new Set<string>();
  for (const key of options.keys) {
    if (key.trim().length === 0) {
      throw new OnePasswordEnvError("invalid-options", "Environment keys must not be blank");
    }
    if (keys.has(key)) {
      throw new OnePasswordEnvError(
        "invalid-options",
        `Environment key ${key} was declared more than once`,
      );
    }
    keys.add(key);
  }
  return keys;
};

const commandError = (result: OnePasswordCommandResult): OnePasswordEnvError => {
  if (result.status === null) {
    return new OnePasswordEnvError(
      "cli-unavailable",
      "Could not start the 1Password CLI. Install op and ensure it is on PATH",
    );
  }
  if (authenticationFailure.test(result.stderr)) {
    return new OnePasswordEnvError(
      "authentication",
      "1Password CLI authentication failed. Sign in or set OP_SERVICE_ACCOUNT_TOKEN",
    );
  }
  if (missingItemFailure.test(result.stderr)) {
    return new OnePasswordEnvError(
      "item-not-found",
      "The 1Password item was not found in the selected vault",
    );
  }
  return new OnePasswordEnvError("command-failed", "1Password CLI could not load the item");
};

const decodeItem = (output: string) => {
  try {
    return Schema.decodeUnknownEither(onePasswordItemSchema)(JSON.parse(output));
  } catch {
    throw new OnePasswordEnvError("malformed-item", "1Password returned malformed item data");
  }
};

const parseItem = (output: string) => {
  const decoded = decodeItem(output);
  if (Either.isLeft(decoded)) {
    throw new OnePasswordEnvError("malformed-item", "1Password returned malformed item data");
  }
  return decoded.right;
};

const valuesForKeys = (output: string, keys: ReadonlySet<string>): Map<string, string> => {
  const values = new Map<string, string>();
  for (const field of parseItem(output).fields) {
    if (field.label === undefined || !keys.has(field.label)) {
      continue;
    }
    if (values.has(field.label)) {
      throw new OnePasswordEnvError(
        "ambiguous-field",
        `The 1Password item contains multiple fields labeled ${field.label}`,
      );
    }
    if (field.value === undefined) {
      throw new OnePasswordEnvError(
        "malformed-item",
        `The 1Password field ${field.label} has no string value`,
      );
    }
    values.set(field.label, field.value);
  }
  return values;
};

export const fromOnePassword = (
  options: OnePasswordEnvOptions,
): Record<string, string | undefined> => {
  const keys = validateOptions(options);
  if (keys.size === 0) {
    return {};
  }

  const execute = options.execute ?? defaultExecutor;
  let result: OnePasswordCommandResult;
  try {
    result = execute({
      executable: "op",
      arguments: [
        "item",
        "get",
        options.item,
        "--vault",
        options.vault,
        "--format=json",
        "--reveal",
      ],
    });
  } catch {
    throw new OnePasswordEnvError("command-failed", "1Password CLI could not load the item");
  }

  if (result.status !== 0) {
    throw commandError(result);
  }

  const itemValues = valuesForKeys(result.stdout, keys);
  const source = options.source ?? process.env;
  const values: Record<string, string | undefined> = {};
  for (const key of keys) {
    const sourceValue = source[key];
    const value = sourceValue ?? itemValues.get(key);
    if (value !== undefined) {
      values[key] = value;
    }
  }
  return values;
};
