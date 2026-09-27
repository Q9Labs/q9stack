import { createFileRoute } from "@tanstack/react-router";

import { runtimeAppEnvironment } from "../../env.js";
import { createHealthHandler } from "./-health-response.js";

const getHealth = createHealthHandler(runtimeAppEnvironment);

export const Route = createFileRoute("/api/health")({
  server: { handlers: { GET: getHealth } },
});
