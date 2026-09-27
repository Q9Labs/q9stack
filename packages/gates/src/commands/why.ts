import { printPlan } from "../adapters/terminal.js";
import { classify } from "../core/classify.js";
import { plan } from "../core/plan.js";
import type { GateConfig } from "../core/types.js";

export function whyCommand(config: GateConfig, file: string): number {
  const classification = classify([file], config.classifiers);
  const gatePlan = plan(classification, config.lanes, "staged");
  printPlan(gatePlan);
  return 0;
}
