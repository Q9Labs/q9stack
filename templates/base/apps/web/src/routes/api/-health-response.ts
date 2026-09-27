export interface HealthPayload {
  readonly ok: true;
  readonly version: "0.1.0";
  readonly env: string;
}

export type EnvironmentReader = () => string;

export function createHealthHandler(readEnvironment: EnvironmentReader): () => Response {
  return () => healthResponse(readEnvironment());
}

export function healthResponse(environment: string): Response {
  const payload: HealthPayload = {
    ok: true,
    version: "0.1.0",
    env: environment,
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
