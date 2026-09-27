// ruleid: q9.typescript.no-shapeless-records
type JsonMap = Record<string, unknown>;

// ok: q9.typescript.no-shapeless-records
type User = { id: string; displayName: string };
