import { jsonSchema, type Schema as AiSchema } from "ai";
import { JSONSchema } from "effect";
import { Either, Schema } from "effect";

export const toAiSdkSchema = <A, I>(schema: Schema.Schema<A, I>): AiSchema<A> =>
  jsonSchema<A>(JSONSchema.make(schema), {
    validate: (value) => {
      const decoded = Schema.decodeUnknownEither(schema)(value);
      return Either.isRight(decoded)
        ? { success: true, value: decoded.right }
        : {
            success: false,
            error: new Error(String(decoded.left)),
          };
    },
  });
