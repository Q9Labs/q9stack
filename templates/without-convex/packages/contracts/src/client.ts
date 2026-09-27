import { FetchHttpClient, HttpApiClient } from "@effect/platform";
import { Effect } from "effect";

import { AppApi } from "./api.js";

export const makeClient = (baseUrl: string) =>
  HttpApiClient.make(AppApi, { baseUrl }).pipe(Effect.provide(FetchHttpClient.layer));

export const fetchHealth = (baseUrl: string) =>
  Effect.flatMap(makeClient(baseUrl), (client) => client.health.getHealth({}));
