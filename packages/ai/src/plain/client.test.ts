import { describe, expect, it } from "vitest";

import { InvalidResponse } from "../core/errors.js";
import { createClient } from "./client.js";

describe("plain client", () => {
  it("surfaces the same tagged error instance as the Effect service", async () => {
    const error = new InvalidResponse({
      message: "invalid output",
      model: "mock/plain",
      operation: "generateText",
    });
    const client = createClient(
      { apiKey: "test" },
      {
        resolveModel: () => {
          throw error;
        },
      },
    );

    await expect(client.generateText({ prompt: "hello" })).rejects.toBe(error);
  });
});
