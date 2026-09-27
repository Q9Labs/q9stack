import { Effect, Schedule } from "effect";

import { type LanguageModelError, isRetryableError } from "./errors.js";

export const languageModelRetrySchedule = Schedule.exponential("200 millis").pipe(
  Schedule.jittered,
  Schedule.compose(Schedule.recurs(3)),
);

export const retryLanguageModel = <A, R>(
  effect: Effect.Effect<A, LanguageModelError, R>,
): Effect.Effect<A, LanguageModelError, R> =>
  Effect.retry(effect, {
    schedule: languageModelRetrySchedule,
    while: isRetryableError,
  });
