const value: unknown = "value";

// ruleid: q9.typescript.no-type-assertions
const unsafe = value as string;

// ok: q9.typescript.no-type-assertions
const literal = "value" as const;

// ok: q9.typescript.no-type-assertions
void Promise.resolve(value);

// ruleid: q9.typescript.no-type-assertions
const angle = <string>value;
