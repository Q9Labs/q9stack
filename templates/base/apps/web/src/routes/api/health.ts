import { createFileRoute } from "@tanstack/react-router";

import { readAppEnvironment } from "../../env.js";
import { createHealthHandler } from "./-health-response.js";

const getHealth = createHealthHandler(() => readAppEnvironment().APP_ENV);

export const Route = createFileRoute("/api/health")({
  server: { handlers: { GET: getHealth } },
});
