import { Either, Redacted } from "effect";
import * as fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";

import { boolean, defineEnv, enumeration, integer, redacted, string, url } from "../src/index.js";

describe("defineEnv", () => {
  it("parses each built-in schema", () => {
    const env = defineEnv({
      API_URL: {
        description: "API origin",
        schema: url(),
        scope: "server",
      },
      ENABLED: {
        description: "Feature switch",
        schema: boolean(),
        scope: "build",
      },
      PORT: {
        description: "Listen port",
        schema: integer(),
        scope: "server",
      },
      TOKEN: {
        description: "Private token",
        schema: redacted(),
        scope: "server",
      },
      VITE_LABEL: {
        description: "Public label",
        schema: string(),
        scope: "client",
      },
    });

    const result = env.parse({
      API_URL: "https://example.com",
      ENABLED: "true",
      PORT: "4310",
      TOKEN: "secret",
      VITE_LABEL: "demo",
    });

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.API_URL).toEqual(new URL("https://example.com"));
      expect(result.right.ENABLED).toBe(true);
      expect(result.right.PORT).toBe(4310);
      expect(Redacted.value(result.right.TOKEN)).toBe("secret");
      expect(result.right.VITE_LABEL).toBe("demo");
      expectTypeOf(result.right.PORT).toEqualTypeOf<number>();
    }
  });

  it("accumulates missing and invalid keys", () => {
    const env = defineEnv({
      API_URL: {
        description: "API origin",
        schema: url(),
        scope: "server",
      },
      ENABLED: {
        description: "Feature switch",
        schema: boolean(),
        scope: "build",
      },
      PORT: {
        description: "Listen port",
        schema: integer(),
        scope: "server",
      },
    });

    const result = env.parse({ ENABLED: "not-a-boolean", PORT: "not-an-integer" });

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.issues).toHaveLength(3);
      expect(result.left.issues.map((issue) => issue.key)).toEqual(["API_URL", "ENABLED", "PORT"]);
      expect(result.left.issues.map((issue) => issue.code)).toEqual([
        "missing",
        "invalid",
        "invalid",
      ]);
    }
  });

  it.each(["   ", "\u00a0\u2003\u202f", "\u200b\u200b"])(
    "rejects a required string containing only Unicode whitespace (%j)",
    (value) => {
      const env = defineEnv({
        LABEL: {
          description: "Display label",
          schema: string(),
          scope: "server",
        },
      });

      const result = env.parse({ LABEL: value });

      expect(result._tag).toBe("Left");
      if (Either.isLeft(result)) {
        expect(result.left.issues).toEqual([
          { code: "invalid", key: "LABEL", message: "must not be blank" },
        ]);
      }
    },
  );

  it("rejects a required redacted value containing only Unicode whitespace", () => {
    const env = defineEnv({
      TOKEN: {
        description: "Private token",
        schema: redacted(),
        scope: "server",
      },
    });

    const result = env.parse({ TOKEN: "\u2003\u00a0" });

    expect(result._tag).toBe("Left");
    if (Either.isLeft(result)) {
      expect(result.left.issues).toMatchObject([{ code: "invalid", key: "TOKEN" }]);
      expect(result.left.message).not.toContain("\u2003");
    }
  });

  it("does not expose malformed source values in decoder errors", () => {
    const malformedValue = "secret-value-without-a-url";
    const env = defineEnv({
      WEBHOOK_URL: {
        description: "Webhook URL",
        schema: url(),
        scope: "server",
      },
    });

    const result = env.parse({ WEBHOOK_URL: malformedValue });

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.issues).toEqual([
        {
          code: "invalid",
          key: "WEBHOOK_URL",
          message: "Value does not match its schema",
        },
      ]);
      expect(result.left.message).not.toContain(malformedValue);
    }
  });

  it("allows deliberate optional entries and filters the client contract", () => {
    const env = defineEnv({
      CLIENT_ONLY: {
        description: "Unprefixed client value",
        schema: string(),
        scope: "client",
      },
      EXPO_PUBLIC_SENTRY_DSN: {
        description: "Public Expo error-reporting endpoint",
        schema: string(),
        scope: "client",
      },
      PUBLIC_NAME: {
        description: "Public name",
        schema: string(),
        required: false,
        scope: "client",
      },
      VITE_API_URL: {
        description: "Public API origin",
        schema: url(),
        scope: "client",
      },
      VITE_SERVER_VALUE: {
        description: "Server-only value",
        schema: string(),
        scope: "server",
      },
    });

    expect(env.keys()).toEqual([
      "CLIENT_ONLY",
      "EXPO_PUBLIC_SENTRY_DSN",
      "PUBLIC_NAME",
      "VITE_API_URL",
      "VITE_SERVER_VALUE",
    ]);
    expect(env.client().keys()).toEqual(["EXPO_PUBLIC_SENTRY_DSN", "PUBLIC_NAME", "VITE_API_URL"]);

    const result = env.client().parse({
      EXPO_PUBLIC_SENTRY_DSN: "https://sentry.example.com/1",
      VITE_API_URL: "https://example.com",
    });
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.VITE_API_URL).toEqual(new URL("https://example.com"));
      expect(result.right.EXPO_PUBLIC_SENTRY_DSN).toBe("https://sentry.example.com/1");
      expectTypeOf(result.right.EXPO_PUBLIC_SENTRY_DSN).toEqualTypeOf<string>();
      expect(result.right.PUBLIC_NAME).toBeUndefined();
      expectTypeOf(result.right.PUBLIC_NAME).toEqualTypeOf<string | undefined>();
    }
  });

  it("treats a blank optional value as deliberately unset", () => {
    const env = defineEnv({
      OPTIONAL_URL: {
        description: "Optional endpoint",
        required: false,
        schema: url(),
        scope: "server",
      },
    });

    const result = env.parse({ OPTIONAL_URL: "\u200b" });

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.OPTIONAL_URL).toBeUndefined();
    }
  });

  it("keeps schemaJson JSON-serializable", () => {
    const metadataArbitrary = fc.record({
      description: fc.string(),
      required: fc.boolean(),
      scope: fc.constantFrom("server", "client", "build"),
    });
    fc.assert(
      fc.property(fc.tuple(metadataArbitrary, metadataArbitrary), ([port, apiUrl]) => {
        const env = defineEnv({
          PORT: {
            description: port.description,
            schema: integer(),
            required: port.required,
            scope: port.scope,
          },
          VITE_API_URL: {
            description: apiUrl.description,
            schema: url(),
            required: apiUrl.required,
            scope: apiUrl.scope,
          },
        });
        const schemaJson = env.schemaJson();

        expect(JSON.parse(JSON.stringify(schemaJson))).toEqual(schemaJson);
        expect(schemaJson.map((entry) => entry.key)).toEqual(["PORT", "VITE_API_URL"]);
      }),
    );
  });
});

describe("enumeration schema", () => {
  const contract = defineEnv({
    LOG_LEVEL: {
      description: "Log verbosity",
      schema: enumeration(["debug", "info", "warn", "error"]),
      scope: "server",
    },
  });

  it("accepts a declared member", () => {
    const parsed = contract.parse({ LOG_LEVEL: "warn" });
    expect(Either.isRight(parsed)).toBe(true);
    if (Either.isRight(parsed)) {
      expect(parsed.right.LOG_LEVEL).toBe("warn");
    }
  });

  it("rejects values outside the declared members", () => {
    const parsed = contract.parse({ LOG_LEVEL: "verbose" });
    expect(Either.isLeft(parsed)).toBe(true);
  });

  it("reports the members in schema JSON", () => {
    expect(contract.schemaJson()).toEqual([
      {
        description: "Log verbosity",
        key: "LOG_LEVEL",
        required: true,
        schema: { type: "enum", values: ["debug", "info", "warn", "error"] },
        scope: "server",
      },
    ]);
  });
});
