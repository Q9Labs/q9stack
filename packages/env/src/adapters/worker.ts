const stringBinding = (value: unknown): value is string => typeof value === "string";

export const fromWorkerEnv = (env: object): Record<string, string | undefined> => {
  const values: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (stringBinding(value)) {
      values[key] = value;
    }
  }
  return values;
};
