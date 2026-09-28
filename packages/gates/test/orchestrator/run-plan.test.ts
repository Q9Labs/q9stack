import { describe, expect, it } from "vitest";

import type {
  Classification,
  CommandResult,
  GateExec,
  GateLane,
  GatePlan,
  LaneContext,
} from "../../src/core/types.js";
import { runPlan } from "../../src/orchestrator/run-plan.js";

const classification: Classification = {
  changedFiles: ["src/index.ts"],
  categories: [{ category: "source", files: ["src/index.ts"] }],
  unclassifiedFiles: [],
  docsOnly: false,
  fullRequired: false,
};

const successfulExec: GateExec = async (command, args = []): Promise<CommandResult> => ({
  command: [command, ...args].join(" "),
  exitCode: 0,
  stdout: "",
  stderr: "",
  failed: false,
});

const context: LaneContext = {
  repoRoot: "/fixture",
  changedFiles: classification.changedFiles,
  allChangedFiles: classification.changedFiles,
  classification,
  scope: "full",
  target: undefined,
  exec: successfulExec,
};

function selectedPlan(lanes: readonly GateLane[]): GatePlan {
  return {
    full: true,
    fullReason: "test",
    lanes: lanes.map((lane) => ({ lane, selected: true, reason: "test" })),
  };
}

describe("runPlan", () => {
  it("limits parallel work and runs exclusive lanes alone", async () => {
    let active = 0;
    let maximum = 0;
    const events: string[] = [];
    const lane = (id: string, exclusive = false): GateLane => ({
      id,
      title: id,
      triggers: () => true,
      exclusive,
      run: async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        events.push(`start:${id}:${active}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push(`end:${id}:${active}`);
        active -= 1;
        return { status: "passed" };
      },
    });
    const lanes = [lane("a"), lane("b"), lane("exclusive", true), lane("c")];
    const reports = await runPlan(selectedPlan(lanes), context, {
      repoRoot: "/fixture",
      exec: successfulExec,
      concurrency: 2,
      paranoid: false,
    });
    expect(maximum).toBe(2);
    expect(events).toContain("start:exclusive:1");
    expect(reports.map((report) => report.id)).toEqual(["a", "b", "exclusive", "c"]);
  });

  it("fails a passing lane when paranoid status detects a mutation", async () => {
    let statusCalls = 0;
    const exec: GateExec = async (command, args = []): Promise<CommandResult> => {
      const isStatus = command === "git" && args.includes("status");
      statusCalls += Number(isStatus);
      return {
        command: [command, ...args].join(" "),
        exitCode: 0,
        stdout: isStatus && statusCalls === 2 ? " M generated.ts\n" : "",
        stderr: "",
        failed: false,
      };
    };
    const lane: GateLane = {
      id: "mutating",
      title: "Mutating",
      triggers: () => true,
      run: async () => ({ status: "passed" }),
    };
    const reports = await runPlan(
      selectedPlan([lane]),
      { ...context, exec },
      {
        repoRoot: "/fixture",
        exec,
        concurrency: 1,
        paranoid: true,
      },
    );
    expect(reports[0]?.status).toBe("failed");
    expect(reports[0]?.findings?.[0]?.rule).toBe("tree-mutation");
  });

  it("also detects when a lane removes a pre-existing status entry", async () => {
    let statusCalls = 0;
    const exec: GateExec = async (command, args = []): Promise<CommandResult> => {
      const isStatus = command === "git" && args.includes("status");
      statusCalls += Number(isStatus);
      return {
        command: [command, ...args].join(" "),
        exitCode: 0,
        stdout: isStatus && statusCalls === 1 ? " M existing.ts\n" : "",
        stderr: "",
        failed: false,
      };
    };
    const lane: GateLane = {
      id: "cleaning",
      title: "Cleaning",
      triggers: () => true,
      run: async () => ({ status: "passed" }),
    };

    const reports = await runPlan(
      selectedPlan([lane]),
      { ...context, exec },
      {
        repoRoot: "/fixture",
        exec,
        concurrency: 1,
        paranoid: true,
      },
    );

    expect(reports[0]?.status).toBe("failed");
    expect(reports[0]?.findings?.[0]?.message).toContain("removed");
  });
});
