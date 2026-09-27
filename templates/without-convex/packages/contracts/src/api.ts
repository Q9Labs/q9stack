import { HttpApi } from "@effect/platform";

import { HealthGroup } from "./health.js";
import { SampleGroup } from "./sample.js";

export class AppApi extends HttpApi.make("__APP_SLUG__").add(HealthGroup).add(SampleGroup) {}
