const stringBinding = (value: unknown): value is string => typeof value === "string";

const readStringBindings = (source: object): Record<string, string | undefined> => {
  const values: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    if (stringBinding(value)) {
      values[key] = value;
    }
  }
  return values;
};

export function fromImportMetaEnv(): Record<string, string | undefined>;
export function fromImportMetaEnv(source: object): Record<string, string | undefined>;
export function fromImportMetaEnv(source?: object): Record<string, string | undefined> {
  if (source !== undefined) {
    return readStringBindings(source);
  }

  // @ts-expect-error because Vite supplies import.meta.env at the Vite boundary.
  const candidate: unknown = import.meta.env;
  if (typeof candidate !== "object" || candidate === null) {
    return {};
  }

  return readStringBindings(candidate);
}
