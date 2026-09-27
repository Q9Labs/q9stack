import type { Schema } from "effect";
import { JSONSchema } from "effect";

import type { VoiceToolDefinition } from "./types";

export type VoiceToolJsonSchema = ReturnType<typeof JSONSchema.make>;

export function toVoiceToolJsonSchema(schema: Schema.Schema.Any): VoiceToolJsonSchema {
  return JSONSchema.make(schema);
}

export function toVoiceToolDefinition<Parameters extends Schema.Schema.Any>(
  tool: VoiceToolDefinition<Parameters>,
): {
  readonly name: string;
  readonly description?: string;
  readonly parameters: VoiceToolJsonSchema;
} {
  const parameters = toVoiceToolJsonSchema(tool.parameters);
  if (tool.description === undefined) {
    return { name: tool.name, parameters };
  }
  return { name: tool.name, description: tool.description, parameters };
}
