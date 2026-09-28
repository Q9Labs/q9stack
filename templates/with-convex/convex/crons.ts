import { cronJobs } from "convex/server";

import { internal } from "./_generated/api.js";

const crons = cronJobs();
crons.daily(
  "diagnostics 14-day cleanup",
  { hourUTC: 3, minuteUTC: 0 },
  internal.diagnostics.maintenance.cleanupExpired,
);
export default crons;
