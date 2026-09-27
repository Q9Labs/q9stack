import { Schema } from "effect";

const identifier = Schema.String.pipe(Schema.minLength(1));

export const SampleId = identifier.pipe(Schema.brand("SampleId"));
export type SampleId = Schema.Schema.Type<typeof SampleId>;
export const decodeSampleId = Schema.decodeUnknownSync(SampleId);

export const WorkspaceId = identifier.pipe(Schema.brand("WorkspaceId"));
export type WorkspaceId = Schema.Schema.Type<typeof WorkspaceId>;
