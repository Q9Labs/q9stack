import type { GateCategory, GateLane, LaneRunner, LaneTrigger } from "../core/types.js";
import { categoryTrigger } from "./trigger.js";

export interface CustomLaneOptions {
  readonly id: string;
  readonly title: string;
  readonly triggers: readonly GateCategory[] | GateLane["triggers"];
  readonly run: string | LaneRunner;
  readonly exclusive?: boolean;
}

function isCategoryList(value: CustomLaneOptions["triggers"]): value is readonly GateCategory[] {
  return typeof value !== "function";
}

export function custom(options: CustomLaneOptions): GateLane {
  let categories: readonly GateCategory[] | undefined;
  let triggers: LaneTrigger;
  if (isCategoryList(options.triggers)) {
    categories = options.triggers;
    triggers = categoryTrigger(categories);
  } else {
    triggers = options.triggers;
  }
  let run: LaneRunner;
  if (typeof options.run === "string") {
    const command = options.run;
    run = async (context) => {
      const result = await context.exec("sh", ["-c", command], {
        cwd: context.repoRoot,
      });
      if (result.failed) {
        return {
          status: "failed",
          findings: [
            {
              file: "gate.config.ts",
              rule: `custom.${options.id}`,
              message: result.stderr || result.stdout || `Command failed: ${command}`,
            },
          ],
        };
      }
      return { status: "passed" };
    };
  } else {
    run = options.run;
  }
  return {
    id: options.id,
    title: options.title,
    triggers,
    run,
    ...(categories === undefined ? {} : { categories }),
    ...(options.exclusive === undefined ? {} : { exclusive: options.exclusive }),
  };
}
