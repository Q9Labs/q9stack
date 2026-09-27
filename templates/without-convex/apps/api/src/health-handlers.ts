import { AppApi } from "@__APP_SLUG__/contracts";
import { HttpApiBuilder } from "@effect/platform";
import { Effect } from "effect";

export const HealthHandlersLive = HttpApiBuilder.group(AppApi, "health", (handlers) =>
  handlers.handle("getHealth", () =>
    Effect.succeed({ status: "ok" as const, version: "0.1.0" as const }),
  ),
);
