import { z } from "zod";

import type { DiagnosticEvent, FlowRunResult, FlowStepResult } from "./index.js";

const identifier = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
const stepSchema = z.strictObject({
  id: identifier,
  after: z.array(z.string().min(1)).default([]),
  within: z.string().optional(),
  oneOf: z.array(identifier).min(2).optional(),
  need: z.enum(["required", "conditional", "best_effort"]).default("required"),
});
type Step = z.infer<typeof stepSchema>;

function durationMs(value: string): number {
  const amount = Number.parseInt(value, 10);
  const unit = value.at(-1);
  return amount * (unit === "h" ? 3_600_000 : unit === "m" ? 60_000 : 1_000);
}

function referenceIssue(reference: string, steps: Map<string, Step>): string | undefined {
  const [id, outcome, extra] = reference.split(":");
  const predecessor = id ? steps.get(id) : undefined;
  if (!predecessor) return `unknown step in ${reference}`;
  if (
    extra !== undefined ||
    (reference.includes(":") && (!outcome || !predecessor.oneOf?.includes(outcome)))
  )
    return `unknown outcome in ${reference}`;
  return undefined;
}

function durationIssue(value: string): string | undefined {
  if (!/^[1-9][0-9]*(?:s|m|h)$/.test(value)) return `invalid duration ${value}`;
  if (!Number.isSafeInteger(durationMs(value)) || durationMs(value) > 31_536_000_000)
    return "duration is too large";
  return undefined;
}

function stepIssues(
  step: Step,
  steps: Map<string, Step>,
  seen: Set<string>,
): { field: string; message: string }[] {
  const issues: { field: string; message: string }[] = [];
  if (seen.has(step.id)) issues.push({ field: "id", message: "duplicate step id" });
  if (step.oneOf && new Set(step.oneOf).size !== step.oneOf.length)
    issues.push({ field: "oneOf", message: "duplicate outcome" });
  for (const reference of step.after) {
    const message = referenceIssue(reference, steps);
    if (message) issues.push({ field: "after", message });
  }
  if (step.within !== undefined) {
    const message = durationIssue(step.within);
    if (message) issues.push({ field: "within", message });
  }
  return issues;
}

function cycleIds(steps: Map<string, Step>): string[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[] = [];
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      cycles.push(id);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const reference of steps.get(id)?.after ?? []) {
      const predecessor = reference.split(":")[0];
      if (predecessor && steps.has(predecessor)) visit(predecessor);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of steps.keys()) visit(id);
  return cycles;
}

export const flowDefinitionSchema = z
  .strictObject({
    id: identifier,
    version: z.literal(1),
    steps: z.array(stepSchema).min(1),
  })
  .superRefine((flow, context) => {
    const steps = new Map(flow.steps.map((step) => [step.id, step]));
    const seen = new Set<string>();
    for (const [index, step] of flow.steps.entries()) {
      for (const issue of stepIssues(step, steps, seen))
        context.addIssue({
          code: "custom",
          path: ["steps", index, issue.field],
          message: `Flow ${flow.id}, step ${step.id}: ${issue.message}`,
        });
      seen.add(step.id);
    }
    for (const id of cycleIds(steps))
      context.addIssue({ code: "custom", message: `Flow ${flow.id}, step ${id}: cycle in after` });
  });
export type FlowDefinition = z.infer<typeof flowDefinitionSchema>;

type Dependency = { result: FlowStepResult; outcome: string | undefined };

function dependencyUnavailable(dependencies: Dependency[]): boolean {
  return dependencies.some(
    ({ result, outcome }) =>
      !result.event ||
      result.status === "not_observable" ||
      (outcome !== undefined && result.event.attributes?.outcome !== outcome),
  );
}

function observedStatus(
  step: Step,
  event: DiagnosticEvent,
  times: number[],
  deadline: number | undefined,
): FlowStepResult["status"] {
  if (step.oneOf && !step.oneOf.includes(String(event.attributes?.outcome ?? "")))
    return "not_observable";
  if (times.some((time) => event.occurredAt < time - 2_000)) return "out_of_order";
  if (deadline !== undefined && event.occurredAt > deadline) return "late";
  return "ok";
}

function satisfyingEvent(
  step: Step,
  candidates: DiagnosticEvent[],
  times: number[],
  deadline: number | undefined,
): DiagnosticEvent | undefined {
  return (
    candidates.find((candidate) => {
      const status = observedStatus(step, candidate, times, deadline);
      return status === "ok" || status === "late";
    }) ?? candidates[0]
  );
}

/** Check one run's retained events; the caller supplies the complete run when available. */
export function checkFlowRun(
  definition: FlowDefinition,
  events: readonly DiagnosticEvent[],
  now: number,
): FlowRunResult {
  const ids = new Set(definition.steps.map((step) => step.id));
  const relevant = events.filter((event) => event.attributes?.flow === definition.id);
  const unexpected = relevant.filter(
    (event) =>
      typeof event.attributes?.flow_step === "string" && !ids.has(event.attributes.flow_step),
  );
  const firstAt = relevant.length
    ? Math.min(...relevant.map((event) => event.occurredAt))
    : undefined;
  const observations = new Map(
    definition.steps.map((step) => [
      step.id,
      relevant
        .filter((event) => event.attributes?.flow_step === step.id)
        .toSorted((a, b) => a.occurredAt - b.occurredAt),
    ]),
  );
  const results = new Map<string, FlowStepResult>();
  const evaluate = (id: string): FlowStepResult => {
    const prior = results.get(id);
    if (prior) return prior;
    const step = definition.steps.find((candidate) => candidate.id === id);
    if (!step) throw new Error(`Unknown flow step ${id}`);
    const dependencies = step.after.map((reference) => {
      const [predecessor, outcome] = reference.split(":");
      return { result: evaluate(predecessor ?? ""), outcome };
    });
    const prerequisiteTimes = dependencies.flatMap(({ result }) =>
      result.observedAt === undefined ? [] : [result.observedAt],
    );
    const anchor = prerequisiteTimes.length ? Math.max(...prerequisiteTimes) : firstAt;
    const expectedDeadline =
      step.within && anchor !== undefined ? anchor + durationMs(step.within) : undefined;
    const event = satisfyingEvent(
      step,
      observations.get(id) ?? [],
      prerequisiteTimes,
      expectedDeadline,
    );
    const status = dependencyUnavailable(dependencies)
      ? "not_observable"
      : event
        ? observedStatus(step, event, prerequisiteTimes, expectedDeadline)
        : expectedDeadline !== undefined && now <= expectedDeadline
          ? "pending"
          : "missing";
    const result: FlowStepResult = {
      id,
      need: step.need,
      status,
      ...(event ? { event, observedAt: event.occurredAt } : {}),
      ...(expectedDeadline !== undefined ? { expectedDeadline } : {}),
    };
    results.set(id, result);
    return result;
  };
  const steps = definition.steps.map((step) => evaluate(step.id));
  const required = steps.filter(
    (step) =>
      step.need !== "best_effort" &&
      !(step.need === "conditional" && step.status === "not_observable"),
  );
  const verdict = required.some((step) => ["missing", "late", "out_of_order"].includes(step.status))
    ? "failed"
    : required.some((step) => step.status === "pending")
      ? "pending"
      : required.some((step) => step.status === "not_observable")
        ? "not_observable"
        : "ok";
  return { verdict, steps, unexpected };
}
