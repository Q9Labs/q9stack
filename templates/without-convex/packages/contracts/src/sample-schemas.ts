import {
  SampleEntitySchema,
  SampleId,
  type SampleEntity,
  type SampleEntityKind,
} from "@__APP_SLUG__/core";
import { Schema } from "effect";

export { SampleId };
export { SampleEntitySchema };
export type { SampleEntity, SampleEntityKind };

export const SampleEntityKindSchema = Schema.Literal("draft", "published", "archived");

export const SampleCommandKindSchema = Schema.Literal("publish", "archive", "restore");

export const SampleCommandSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("publish"),
    publishedAt: Schema.String,
  }),
  Schema.Struct({
    archivedAt: Schema.String,
    kind: Schema.Literal("archive"),
  }),
  Schema.Struct({
    kind: Schema.Literal("restore"),
  }),
);
export type SampleCommand = typeof SampleCommandSchema.Type;

export const SamplePathSchema = Schema.Struct({ id: SampleId });
