export interface ConvexAuthEnvironment {
  readonly betterAuthSecret: string;
  readonly siteUrl: string;
}

const isBlank = (value: string): boolean => /^[\p{White_Space}\u200b\ufeff]*$/u.test(value);

const requireValue = (
  source: Record<string, string | undefined>,
  key: "BETTER_AUTH_SECRET" | "SITE_URL",
): string => {
  const value = source[key];
  if (value === undefined || isBlank(value)) {
    throw new Error(`${key} is required for Convex authentication`);
  }
  return value;
};

export const readConvexAuthEnvironment = (
  source: Record<string, string | undefined> = process.env,
): ConvexAuthEnvironment => {
  const betterAuthSecret = requireValue(source, "BETTER_AUTH_SECRET");
  const siteUrl = requireValue(source, "SITE_URL");
  try {
    return { betterAuthSecret, siteUrl: new URL(siteUrl).toString() };
  } catch (error: unknown) {
    throw new Error("SITE_URL must be a valid URL", { cause: error });
  }
};
