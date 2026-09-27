import { HttpApiSchema } from "@effect/platform";
import { Schema } from "effect";

import { SampleCommandKindSchema, SampleEntityKindSchema, SampleId } from "./sample-schemas.js";

export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  { id: SampleId },
  HttpApiSchema.annotations({ status: 404 }),
) {}

export class ConflictingTransition extends Schema.TaggedError<ConflictingTransition>()(
  "ConflictingTransition",
  {
    command: SampleCommandKindSchema,
    from: SampleEntityKindSchema,
    id: SampleId,
  },
  HttpApiSchema.annotations({ status: 409 }),
) {}
