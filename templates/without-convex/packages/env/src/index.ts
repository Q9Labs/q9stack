import type { envSchema as appEnvSchema } from "./env.js";

export { appEnv, browserEnv, envSchema, migrationEnv, webServerEnv } from "./env.js";
export { fromImportMetaEnv, fromProcessEnv } from "@q9labsai/env";
export type AppEnvKey = keyof typeof appEnvSchema;
