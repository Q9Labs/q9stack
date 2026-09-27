import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";

export const HealthResponse = Schema.Struct({
  status: Schema.Literal("ok"),
  version: Schema.Literal("0.1.0"),
});
export type HealthResponse = typeof HealthResponse.Type;

export const getHealth = HttpApiEndpoint.get("getHealth", "/api/health").addSuccess(HealthResponse);

export class HealthGroup extends HttpApiGroup.make("health").add(getHealth) {}
