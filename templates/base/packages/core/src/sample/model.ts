import { Schema } from "effect";

import { SampleId } from "../ids.js";

export const SAMPLE_ENTITY_KINDS = ["draft", "published", "archived"] as const;
export type SampleEntityKind = (typeof SAMPLE_ENTITY_KINDS)[number];

const sampleFields = {
  id: SampleId,
  title: Schema.String.pipe(Schema.minLength(1)),
};

export const DraftSampleSchema = Schema.Struct({
  ...sampleFields,
  kind: Schema.Literal("draft"),
});
export type DraftSample = Schema.Schema.Type<typeof DraftSampleSchema>;

export const PublishedSampleSchema = Schema.Struct({
  ...sampleFields,
  kind: Schema.Literal("published"),
  publishedAt: Schema.String,
});
export type PublishedSample = Schema.Schema.Type<typeof PublishedSampleSchema>;

export const ArchivedSampleSchema = Schema.Struct({
  ...sampleFields,
  archivedAt: Schema.String,
  kind: Schema.Literal("archived"),
});
export type ArchivedSample = Schema.Schema.Type<typeof ArchivedSampleSchema>;

export const SampleEntitySchema = Schema.Union(
  DraftSampleSchema,
  PublishedSampleSchema,
  ArchivedSampleSchema,
);
export type SampleEntity = Schema.Schema.Type<typeof SampleEntitySchema>;

export const createDraftSample = (id: SampleId, title: string): DraftSample => ({
  id,
  kind: "draft",
  title,
});

export const createPublishedSample = (
  id: SampleId,
  title: string,
  publishedAt: string,
): PublishedSample => ({
  id,
  kind: "published",
  publishedAt,
  title,
});

export const createArchivedSample = (
  id: SampleId,
  title: string,
  archivedAt: string,
): ArchivedSample => ({
  archivedAt,
  id,
  kind: "archived",
  title,
});
