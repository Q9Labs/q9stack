import { tool, type Schema as AiSchema, type Tool, type ToolSet } from "ai";
import { Either, Effect, Schema } from "effect";

import { toAiSdkSchema } from "../effect/schema.js";

type ToolContext = Record<string, never>;

export type AiSdkTool = Tool<unknown, unknown, ToolContext>;

export interface ToolAdapter {
  readonly toAiSdkTool: () => AiSdkTool;
}

export interface DefinedTool<A, B> extends ToolAdapter {
  readonly run: (input: A) => Promise<B>;
}

export interface DefineToolOptions {
  readonly description?: string;
  readonly title?: string;
}

export const defineTool = <A, I, B, E>(
  schema: Schema.Schema<A, I>,
  handler: (input: A) => Effect.Effect<B, E>,
  options: DefineToolOptions = {},
): DefinedTool<A, B> => {
  const inputSchema: AiSchema<A> = toAiSdkSchema(schema);
  const run = (input: A): Promise<B> => Effect.runPromise(handler(input));
  const execute = async (input: unknown): Promise<unknown> => {
    const decoded = Schema.decodeUnknownEither(schema)(input);
    if (Either.isLeft(decoded)) {
      throw new Error(`Tool input failed schema validation: ${String(decoded.left)}`);
    }
    return run(decoded.right);
  };

  return {
    run,
    toAiSdkTool: () =>
      tool<unknown, unknown, ToolContext>({
        inputSchema,
        execute,
        ...(options.description === undefined ? {} : { description: options.description }),
        ...(options.title === undefined ? {} : { title: options.title }),
      }),
  };
};

export const toAiSdkTools = (definitions: ReadonlyMap<string, ToolAdapter>): ToolSet =>
  Object.fromEntries(
    Array.from(definitions, ([name, definition]) => [name, definition.toAiSdkTool()] as const),
  );
