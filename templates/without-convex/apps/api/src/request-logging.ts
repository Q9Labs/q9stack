import { HttpMiddleware, HttpServerError, HttpServerRequest } from "@effect/platform";
import type { HttpApp } from "@effect/platform";
import { Clock, Effect } from "effect";

const requestPath = (target: string): string => {
  const queryStart = target.indexOf("?");
  return queryStart === -1 ? target : target.slice(0, queryStart);
};

export const safeRequestTarget = (target: string): string => {
  const path = requestPath(target);
  return path.startsWith("/api/auth/reset-password/") ? "/api/auth/reset-password/:token" : path;
};

export const shouldDisableRequestTracing = (target: string): boolean =>
  target.includes("?") || requestPath(target).startsWith("/api/auth/reset-password/");

export const requestLogger = HttpMiddleware.make(
  <Error, Requirements>(
    httpApp: HttpApp.Default<Error, Requirements>,
  ): HttpApp.Default<Error, Requirements> =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const startedAt = yield* Clock.currentTimeMillis;
      const exit = yield* Effect.exit(httpApp);
      const duration = (yield* Clock.currentTimeMillis) - startedAt;
      const response = HttpServerError.exitResponse(exit);
      const message = exit._tag === "Failure" ? "HTTP request failed" : "Sent HTTP response";
      yield* Effect.annotateLogs(Effect.log(message), {
        "http.duration.ms": duration,
        "http.method": request.method,
        "http.route": safeRequestTarget(request.url),
        "http.status": response.status,
      });
      return yield* exit;
    }),
);
