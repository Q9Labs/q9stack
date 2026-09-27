import { Either } from "effect";
import { describe, expect, it } from "vitest";

import {
  createSeedConfig,
  preflightSeedEnvironment,
  type SeedEnvironmentValues,
} from "../preflight.js";

const validEnvironment: SeedEnvironmentValues = {
  API_PORT: 8787,
  API_URL: new URL("http://localhost:8787"),
  APP_ENV: "dev",
  APP_URL: new URL("http://localhost:5173"),
  BETTER_AUTH_SECRET: "dev-secret",
  DATABASE_URL: "postgres://localhost/dev",
};

describe("seed preflight", () => {
  it("rejects a parser failure before a runtime config can be built", () => {
    const result = preflightSeedEnvironment(
      Either.left(new Error("DATABASE_URL: Required value is missing")),
    );

    expect(Either.isLeft(result)).toBe(true);
  });

  it("rejects production before the database program can run", () => {
    const result = createSeedConfig({ ...validEnvironment, APP_ENV: "prod" });

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.message).toBe("Refusing to seed APP_ENV=prod.");
    }
  });

  it("returns the validated development config", () => {
    const result = createSeedConfig(validEnvironment);

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.environment).toBe("dev");
      expect(result.right.databaseURL).toBe(validEnvironment.DATABASE_URL);
    }
  });
});
