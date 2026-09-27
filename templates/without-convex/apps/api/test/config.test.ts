import { describe, expect, it } from "vitest";

import { AppConfigError, readAppConfig } from "../src/config.js";

const validEnvironment = {
  APP_ENV: "dev",
  APP_URL: "http://localhost:3000",
  API_URL: "http://localhost:3001",
  API_PORT: "3001",
  DATABASE_URL: "postgres://app:app@localhost:5432/app",
  BETTER_AUTH_SECRET: "test-secret",
  LOG_LEVEL: "info",
  OPENROUTER_API_KEY: "test-key",
  PUBLIC_APP_URL: "http://localhost:3000",
  PUBLIC_API_URL: "http://localhost:3001",
};

describe("API environment boundary", () => {
  it("parses the complete server contract before constructing configuration", () => {
    expect(readAppConfig(validEnvironment)).toMatchObject({
      apiPort: 3001,
      apiURL: new URL("http://localhost:3001"),
      appURL: new URL("http://localhost:3000"),
      environment: "dev",
      databaseURL: validEnvironment.DATABASE_URL,
      betterAuthSecret: validEnvironment.BETTER_AUTH_SECRET,
    });
  });

  it("reports every invalid or missing key without exposing values", () => {
    expect(() =>
      readAppConfig({
        ...validEnvironment,
        APP_ENV: "staging",
        API_URL: "not-a-url",
        DATABASE_URL: "\u2003",
        OPENROUTER_API_KEY: undefined,
      }),
    ).toThrow(AppConfigError);

    try {
      readAppConfig({
        ...validEnvironment,
        APP_ENV: "staging",
        API_URL: "not-a-url",
        DATABASE_URL: "\u2003",
        OPENROUTER_API_KEY: undefined,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppConfigError);
      if (error instanceof AppConfigError) {
        expect(error.message).toMatch(/APP_ENV/u);
        expect(error.message).toMatch(/API_URL/u);
        expect(error.message).toMatch(/DATABASE_URL/u);
        expect(error.message).toMatch(/OPENROUTER_API_KEY/u);
        expect(error.message).not.toContain(validEnvironment.BETTER_AUTH_SECRET);
      }
    }
  });
});
