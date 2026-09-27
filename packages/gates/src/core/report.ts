import { z } from "zod";

const laneFindingSchema = z.object({
  file: z.string(),
  line: z.number().int().positive().optional(),
  rule: z.string(),
  message: z.string(),
});

const laneMetricsSchema = z.object({
  deadCode: z.number().nonnegative().optional(),
  dupes: z.number().nonnegative().optional(),
  complexityOverBaseline: z.number().nonnegative().optional(),
  dependencyIssues: z.number().nonnegative().optional(),
  vulnerabilities: z.number().nonnegative().optional(),
  spellingIssues: z.number().nonnegative().optional(),
  missingTests: z.number().nonnegative().optional(),
  missingEnvKeys: z.number().nonnegative().optional(),
  unexpectedEnvKeys: z.number().nonnegative().optional(),
  bytes: z.number().nonnegative().optional(),
  gzipBytes: z.number().nonnegative().optional(),
  bytesOverBudget: z.number().nonnegative().optional(),
  versionMismatches: z.number().nonnegative().optional(),
  duplicateMajors: z.number().nonnegative().optional(),
  unsafeMigrations: z.number().nonnegative().optional(),
  stacksChecked: z.number().nonnegative().optional(),
  toolsSkipped: z.number().nonnegative().optional(),
  filesChecked: z.number().nonnegative().optional(),
});

const laneBaselineReportSchema = z.object({
  before: z.number().nonnegative(),
  after: z.number().nonnegative(),
});

const laneReportSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["passed", "failed", "skipped"]),
  reason: z.string(),
  durationMs: z.number().nonnegative(),
  metrics: laneMetricsSchema.optional(),
  baseline: laneBaselineReportSchema.optional(),
  findings: z.array(laneFindingSchema).optional(),
});

export const gateReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    repo: z.string().min(1),
    ref: z.string().min(1),
    scope: z.enum(["staged", "branch", "full"]),
    base: z.string().optional(),
    startedAt: z.string().datetime(),
    durationMs: z.number().nonnegative(),
    concurrency: z.number().int().positive(),
    lanes: z.array(laneReportSchema),
    summary: z.object({
      passed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative(),
    }),
  })
  .superRefine((report, context) => {
    const expected = {
      passed: report.lanes.filter((lane) => lane.status === "passed").length,
      failed: report.lanes.filter((lane) => lane.status === "failed").length,
      skipped: report.lanes.filter((lane) => lane.status === "skipped").length,
    };
    if (
      expected.passed !== report.summary.passed ||
      expected.failed !== report.summary.failed ||
      expected.skipped !== report.summary.skipped
    ) {
      context.addIssue({
        code: "custom",
        path: ["summary"],
        message: "Report summary counts must match lane statuses.",
      });
    }
  });

export type LaneFinding = z.infer<typeof laneFindingSchema>;
export type LaneMetrics = z.infer<typeof laneMetricsSchema>;
export type LaneBaselineReport = z.infer<typeof laneBaselineReportSchema>;
export type LaneReport = z.infer<typeof laneReportSchema>;
export type GateReport = z.infer<typeof gateReportSchema>;

export function validateGateReport(input: unknown): GateReport {
  return gateReportSchema.parse(input);
}

export function isGateReport(input: unknown): input is GateReport {
  return gateReportSchema.safeParse(input).success;
}
