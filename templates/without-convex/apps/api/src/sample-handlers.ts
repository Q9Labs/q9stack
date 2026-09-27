import { AppApi } from "@__APP_SLUG__/contracts";
import {
  SampleRepo,
  type SampleRepository,
  type SampleRepoInfrastructureError,
} from "@__APP_SLUG__/database";
import { HttpApiBuilder } from "@effect/platform";
import { Effect } from "effect";

import {
  toConflictingTransitionError,
  toDatabaseBoundaryError,
  toNotFoundError,
} from "./error-mapping.js";

const withSampleRepo = <Value, Error>(
  operation: (repo: SampleRepository) => Effect.Effect<Value, Error>,
): Effect.Effect<Value, Error, SampleRepo> =>
  Effect.gen(function* () {
    const repo = yield* SampleRepo;
    return yield* operation(repo);
  });

const dieOnInfrastructureError = (error: SampleRepoInfrastructureError): Effect.Effect<never> =>
  Effect.die(toDatabaseBoundaryError(error));

export const SampleHandlersLive = HttpApiBuilder.group(AppApi, "sample", (handlers) =>
  handlers
    .handle("insertSample", ({ payload }) =>
      withSampleRepo((repo) => repo.insert(payload)).pipe(
        Effect.catchTags({
          SampleRowDecodeError: dieOnInfrastructureError,
          SqlError: dieOnInfrastructureError,
        }),
      ),
    )
    .handle("getSample", ({ path }) =>
      withSampleRepo((repo) => repo.get(path.id)).pipe(
        Effect.catchTags({
          SampleRowDecodeError: dieOnInfrastructureError,
          SqlError: dieOnInfrastructureError,
        }),
        Effect.catchTag("NotFound", (error) => Effect.fail(toNotFoundError(error))),
      ),
    )
    .handle("listSamples", () =>
      withSampleRepo((repo) => repo.list()).pipe(
        Effect.catchTags({
          SampleRowDecodeError: dieOnInfrastructureError,
          SqlError: dieOnInfrastructureError,
        }),
      ),
    )
    .handle("transitionSample", ({ path, payload }) =>
      withSampleRepo((repo) => repo.transition(path.id, payload)).pipe(
        Effect.catchTags({
          SampleRowDecodeError: dieOnInfrastructureError,
          SqlError: dieOnInfrastructureError,
        }),
        Effect.catchTags({
          ConflictingTransition: (error) => Effect.fail(toConflictingTransitionError(error)),
          NotFound: (error) => Effect.fail(toNotFoundError(error)),
        }),
      ),
    ),
);
