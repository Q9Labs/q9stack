import { createAuthClient } from "@__APP_SLUG__/auth";
import { appEnv, fromImportMetaEnv, fromProcessEnv } from "@__APP_SLUG__/env";

/**
 * The browser boundary reads only the public application and API origins. Database and Better
 * Auth secrets stay in the Node API and are never imported by this module.
 */
type PublicAuthEnvironment = ReturnType<ReturnType<typeof appEnv.client>["parse"]>;
type ValidPublicAuthEnvironment = Extract<
  PublicAuthEnvironment,
  { readonly _tag: "Right" }
>["right"];

export const parsePublicAuthEnvironment = (
  source: Record<string, string | undefined>,
): ValidPublicAuthEnvironment => {
  const parsed = appEnv.client().parse(source);
  if (parsed._tag === "Left") {
    throw parsed.left;
  }
  return parsed.right;
};

const readPublicEnvironmentSource = (): Record<string, string | undefined> => {
  if (typeof window === "undefined" && typeof process !== "undefined") {
    return publicEnvironmentSource(fromProcessEnv(process.env));
  }
  return publicEnvironmentSource(fromImportMetaEnv(import.meta.env));
};

const publicEnvironmentSource = (
  source: Record<string, string | undefined>,
): Record<string, string | undefined> => {
  const values: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && key.startsWith("PUBLIC_")) {
      values[key] = value;
    }
  }
  return values;
};

const publicEnvironment = parsePublicAuthEnvironment(readPublicEnvironmentSource());

export const publicApiUrl = publicEnvironment.PUBLIC_API_URL.toString();

const publicAppUrl = publicEnvironment.PUBLIC_APP_URL.toString();

export const authClient = createAuthClient(publicApiUrl, publicAppUrl);
