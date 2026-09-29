import {
  HttpApp,
  HttpMiddleware,
  HttpServerRequest,
  HttpServerResponse,
  HttpTraceContext,
} from "@effect/platform";
import { Effect, Option } from "effect";

function preserveRetryAfter(
  original: HttpServerResponse.HttpServerResponse,
  safe: HttpServerResponse.HttpServerResponse,
): HttpServerResponse.HttpServerResponse {
  const retryAfter = original.headers["retry-after"];
  if (retryAfter === undefined || retryAfter.length > 64) return safe;
  const safeDelay = /^[0-9]{1,7}$/.test(retryAfter);
  const safeDate = new Date(retryAfter).toUTCString() === retryAfter;
  return safeDelay || safeDate
    ? HttpServerResponse.setHeader(safe, "retry-after", retryAfter)
    : safe;
}

export const diagnosticMiddleware = HttpMiddleware.make(
  <Error, Requirements>(httpApp: HttpApp.Default<Error, Requirements>) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const parent = Option.getOrUndefined(HttpTraceContext.w3c(request.headers));
      return yield* Effect.useSpan("server.request", { parent, kind: "server" }, (span) =>
        Effect.gen(function* () {
          yield* HttpApp.appendPreResponseHandler((_request, response) =>
            (response.status >= 500
              ? HttpServerResponse.json(
                  { code: span.traceId, error: "INTERNAL" },
                  { status: response.status },
                ).pipe(Effect.orDie)
              : Effect.succeed(response)
            ).pipe(
              Effect.map((safe) =>
                HttpServerResponse.setHeader(
                  response.status >= 500 ? preserveRetryAfter(response, safe) : safe,
                  "x-q9-diagnostic-code",
                  span.traceId,
                ),
              ),
            ),
          );
          return yield* httpApp;
        }).pipe(Effect.withParentSpan(span)),
      ).pipe(Effect.withTracerEnabled(true));
    }),
);
