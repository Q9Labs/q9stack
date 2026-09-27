import type { envSchema } from "./env.js";

export { appEnv, browserEnv, envSchema, webServerEnv } from "./env.js";
export { fromImportMetaEnv, fromProcessEnv } from "@q9labsai/env";
export type AppEnvKey = keyof typeof envSchema;
