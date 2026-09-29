import { randomUUID } from "node:crypto";

import { HttpMiddleware, HttpServerError, HttpServerRequest } from "@effect/platform";
import type { HttpApp } from "@effect/platform";
import { diagnosticEventSchema } from "@q9labsai/diagnostics";
import { writeDiagnosticEvent } from "@q9labsai/diagnostics-server";
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
  <Error, Requirements>(httpApp: HttpApp.Default<Error, Requirements>) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const startedAt = yield* Clock.currentTimeMillis;
      const exit = yield* Effect.exit(httpApp);
      const duration = (yield* Clock.currentTimeMillis) - startedAt;
      const response = HttpServerError.exitResponse(exit);
      const message = response.status >= 500 ? "HTTP request failed" : "Sent HTTP response";
      const span = yield* Effect.currentSpan.pipe(Effect.option);
      if (response.status >= 500 && span._tag === "Some") {
        const event = diagnosticEventSchema.parse({
          version: 1,
          traceId: span.value.traceId,
          spanId: span.value.spanId,
          eventId: randomUUID().replaceAll("-", ""),
          occurredAt: Date.now(),
          source: "server",
          kind: "error",
          name: "http.request.failed",
          status: "error",
          level: "error",
          attributes: { method: request.method, response_class: "5xx" },
        });
        yield* writeDiagnosticEvent(event).pipe(
          Effect.catchAllCause(() => Effect.logWarning("Diagnostic event not stored")),
        );
      }
      yield* Effect.annotateLogs(Effect.log(message), {
        "http.duration.ms": duration,
        "http.method": request.method,
        "http.route": safeRequestTarget(request.url),
        "http.status": response.status,
        ...(span._tag === "Some" ? { trace_id: span.value.traceId } : {}),
      });
      return yield* exit;
    }),
);
