import { Either } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  fromOnePassword,
  OnePasswordEnvError,
  type OnePasswordCommandExecutor,
} from "../src/adapters/one-password.js";
import {
  defineEnv,
  fromImportMetaEnv,
  fromProcessEnv,
  fromWorkerEnv,
  integer,
  string,
} from "../src/index.js";

const item = (fields: readonly object[]): string => JSON.stringify({ fields });

const successfulExecutor = (stdout: string): OnePasswordCommandExecutor =>
  vi.fn(() => ({ status: 0, stderr: "", stdout }));

const readOnePasswordError = (load: () => unknown): OnePasswordEnvError => {
  try {
    load();
  } catch (error) {
    if (error instanceof OnePasswordEnvError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected the 1Password adapter to fail");
};

describe("environment adapters", () => {
  it("reads an explicit process environment source", () => {
    const source = {
      API_URL: "https://example.com",
      PORT: "4310",
    };

    expect(fromProcessEnv(source)).toEqual(source);
  });

  it("keeps only string Worker bindings", () => {
    const source = {
      API_URL: "https://example.com",
      PORT: 4310,
      ENABLED: true,
      CONFIG: { region: "test" },
      UNSET: undefined,
    };

    expect(fromWorkerEnv(source)).toEqual({ API_URL: "https://example.com" });
  });

  it("keeps only string bindings from an explicit ImportMeta source", () => {
    const source = {
      VITE_API_URL: "https://example.com",
      VITE_PORT: 4310,
      DEV: true,
      IMPORTED: { value: "ignored" },
      UNSET: undefined,
    };

    expect(fromImportMetaEnv(source)).toEqual({ VITE_API_URL: "https://example.com" });
  });

  it("does not expose non-string bindings from the direct import.meta.env path", () => {
    const values = fromImportMetaEnv();

    expect(Object.values(values).every((value) => typeof value === "string")).toBe(true);
  });

  it("loads only declared item fields through an argument-array op command", () => {
    const execute = successfulExecutor(
      item([
        { label: "DATABASE_URL", value: "postgres://from-item" },
        { label: "IGNORED_SECRET", value: "must-not-escape" },
      ]),
    );

    const values = fromOnePassword({
      execute,
      item: "q9stack-development",
      keys: ["DATABASE_URL", "PORT"],
      source: { PORT: "4310" },
      vault: "Development",
    });

    expect(values).toEqual({ DATABASE_URL: "postgres://from-item", PORT: "4310" });
    expect(execute).toHaveBeenCalledWith({
      arguments: [
        "item",
        "get",
        "q9stack-development",
        "--vault",
        "Development",
        "--format=json",
        "--reveal",
      ],
      executable: "op",
    });
  });

  it("gives existing environment values precedence over item fields", () => {
    const values = fromOnePassword({
      execute: successfulExecutor(item([{ label: "DATABASE_URL", value: "postgres://from-item" }])),
      item: "q9stack-development",
      keys: ["DATABASE_URL"],
      source: { DATABASE_URL: "postgres://from-process", UNDECLARED: "ignored" },
      vault: "Development",
    });

    expect(values).toEqual({ DATABASE_URL: "postgres://from-process" });
  });

  it("rejects duplicate requested labels as ambiguous without exposing values", () => {
    const secret = "must-never-appear-in-diagnostics";
    const error = readOnePasswordError(() =>
      fromOnePassword({
        execute: successfulExecutor(
          item([
            { label: "DATABASE_URL", value: secret },
            { label: "DATABASE_URL", value: "another-secret" },
          ]),
        ),
        item: "q9stack-development",
        keys: ["DATABASE_URL"],
        source: {},
        vault: "Development",
      }),
    );

    expect(error.code).toBe("ambiguous-field");
    expect(error.message).not.toContain(secret);
    expect(error.message).not.toContain("another-secret");
  });

  it("classifies authentication and missing-item failures without echoing CLI output", () => {
    const failures = [
      {
        code: "authentication",
        stderr: "error initializing client: failed to parseToken secret-token-value",
      },
      {
        code: "authentication",
        stderr: "You are not currently signed in. Please run `op signin --help` for instructions",
      },
      {
        code: "item-not-found",
        stderr: 'No item found with title "api".',
      },
    ] as const;

    for (const failure of failures) {
      const error = readOnePasswordError(() =>
        fromOnePassword({
          execute: () => ({ status: 1, stderr: failure.stderr, stdout: "" }),
          item: "q9stack-development",
          keys: ["DATABASE_URL"],
          source: {},
          vault: "Development",
        }),
      );

      expect(error.code).toBe(failure.code);
      expect(error.message).not.toContain(failure.stderr);
      expect(error.message).not.toContain("secret-token-value");
      expect(error.message).not.toContain('title "api"');
    }
  });

  it("reports an unavailable op executable without exposing command output", () => {
    const error = readOnePasswordError(() =>
      fromOnePassword({
        execute: () => ({ status: null, stderr: "spawn op ENOENT", stdout: "secret-output" }),
        item: "q9stack-development",
        keys: ["DATABASE_URL"],
        source: {},
        vault: "Development",
      }),
    );

    expect(error.code).toBe("cli-unavailable");
    expect(error.message).not.toContain("secret-output");
    expect(error.message).not.toContain("spawn op ENOENT");
  });

  it("redacts malformed JSON, malformed fields, and thrown executor failures", () => {
    const malformedError = readOnePasswordError(() =>
      fromOnePassword({
        execute: successfulExecutor('{"secret":"must-not-escape"'),
        item: "q9stack-development",
        keys: ["DATABASE_URL"],
        source: {},
        vault: "Development",
      }),
    );
    const malformedFieldError = readOnePasswordError(() =>
      fromOnePassword({
        execute: successfulExecutor(item([{ label: "DATABASE_URL", value: 4310 }])),
        item: "q9stack-development",
        keys: ["DATABASE_URL"],
        source: {},
        vault: "Development",
      }),
    );
    const commandError = readOnePasswordError(() =>
      fromOnePassword({
        execute: () => {
          throw new Error("command failed with must-not-escape");
        },
        item: "q9stack-development",
        keys: ["DATABASE_URL"],
        source: {},
        vault: "Development",
      }),
    );

    expect(malformedError.code).toBe("malformed-item");
    expect(malformedFieldError.code).toBe("malformed-item");
    expect(commandError.code).toBe("command-failed");
    expect(malformedError.message).not.toContain("must-not-escape");
    expect(malformedFieldError.message).not.toContain("4310");
    expect(commandError.message).not.toContain("must-not-escape");
  });

  it("leaves absent fields to the contract so validation issues still accumulate", () => {
    const env = defineEnv({
      DATABASE_URL: {
        description: "PostgreSQL URL",
        schema: string(),
        scope: "server",
      },
      PORT: {
        description: "HTTP port",
        schema: integer(),
        scope: "server",
      },
    });
    const source = fromOnePassword({
      execute: successfulExecutor(item([{ label: "PORT", value: "not-an-integer" }])),
      item: "q9stack-development",
      keys: env.keys(),
      source: {},
      vault: "Development",
    });
    const parsed = env.parse(source);

    expect(Either.isLeft(parsed)).toBe(true);
    if (Either.isLeft(parsed)) {
      expect(parsed.left.issues.map(({ code, key }) => ({ code, key }))).toEqual([
        { code: "missing", key: "DATABASE_URL" },
        { code: "invalid", key: "PORT" },
      ]);
    }
  });
});
