import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";

import { ConflictingTransition, NotFound } from "./errors.js";
import { SampleCommandSchema, SampleEntitySchema, SamplePathSchema } from "./sample-schemas.js";

export const insertSample = HttpApiEndpoint.post("insertSample", "/api/samples")
  .setPayload(SampleEntitySchema)
  .addSuccess(SampleEntitySchema);

export const getSample = HttpApiEndpoint.get("getSample", "/api/samples/:id")
  .setPath(SamplePathSchema)
  .addSuccess(SampleEntitySchema)
  .addError(NotFound);

export const listSamples = HttpApiEndpoint.get("listSamples", "/api/samples").addSuccess(
  Schema.Array(SampleEntitySchema),
);

export const transitionSample = HttpApiEndpoint.post(
  "transitionSample",
  "/api/samples/:id/transition",
)
  .setPath(SamplePathSchema)
  .setPayload(SampleCommandSchema)
  .addSuccess(SampleEntitySchema)
  .addError(NotFound)
  .addError(ConflictingTransition);

export class SampleGroup extends HttpApiGroup.make("sample")
  .add(insertSample)
  .add(getSample)
  .add(listSamples)
  .add(transitionSample) {}
