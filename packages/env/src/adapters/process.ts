export function fromProcessEnv(): Record<string, string | undefined>;
export function fromProcessEnv(
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined>;
export function fromProcessEnv(
  source?: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  return source ?? process.env;
}
