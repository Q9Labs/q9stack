import { describe, expect, it } from "vitest";

import { createHealthHandler } from "./-health-response.js";

describe("GET /api/health response", () => {
  it("returns the stable health contract for an injected environment", async () => {
    const getHealth = createHealthHandler(() => "dev");
    const response = getHealth();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      version: "0.1.0",
      env: "dev",
    });
  });
});
