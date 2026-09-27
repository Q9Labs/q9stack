import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { defineTool, toAiSdkTools } from "./define-tool.js";

describe("tool adapter", () => {
  it("preserves typed execution and adapts a map to an AI SDK tool set", async () => {
    const add = defineTool(
      Schema.Struct({ left: Schema.Number, right: Schema.Number }),
      ({ left, right }) => Effect.succeed(left + right),
    );

    expect(await add.run({ left: 2, right: 3 })).toBe(5);

    const tools = toAiSdkTools(new Map([["add", add]]));
    expect(tools["add"]).toBeDefined();

    const { execute } = add.toAiSdkTool();
    if (execute === undefined) throw new Error("tool is not executable");

    const output = Schema.decodeUnknownSync(Schema.Number)(
      await execute({ left: 4, right: 5 }, { toolCallId: "call-1", messages: [], context: {} }),
    );

    expect(output).toBe(9);
  });
});
