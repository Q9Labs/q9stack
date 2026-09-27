import { validateBaseline } from "../adapters/baseline-store.js";
import { writeErrorLine, writeLine } from "../adapters/terminal.js";
import { probeTool, type ToolRequirement } from "../adapters/tool.js";
import { classify } from "../core/classify.js";
import type { BaselineSpec, GateConfig, GateExec, LaneContext } from "../core/types.js";
import { hygiene } from "../lanes/hygiene.js";

const toolByLane: readonly (ToolRequirement & { readonly laneId: string })[] = [
  { laneId: "typecheck", command: "pnpm", installHint: "Install pnpm." },
  { laneId: "test", command: "pnpm", installHint: "Install pnpm." },
  { laneId: "build", command: "pnpm", installHint: "Install pnpm." },
  { laneId: "lint", command: "oxlint", installHint: "Install oxlint." },
  { laneId: "format", command: "oxfmt", installHint: "Install oxfmt." },
  { laneId: "fallow", command: "fallow", installHint: "Install fallow." },
  { laneId: "semgrep", command: "semgrep", installHint: "Install the official Semgrep CLI." },
  {
    laneId: "depcruise",
    command: "depcruise",
    installHint: "Install dependency-cruiser.",
  },
  { laneId: "osv", command: "osv-scanner", installHint: "Install OSV-Scanner." },
  { laneId: "gitleaks", command: "gitleaks", installHint: "Install Gitleaks." },
  { laneId: "cspell", command: "cspell", installHint: "Install CSpell." },
  { laneId: "syncpack", command: "syncpack", installHint: "Install Syncpack." },
  { laneId: "shellcheck", command: "shellcheck", installHint: "Install ShellCheck." },
  { laneId: "actionlint", command: "actionlint", installHint: "Install actionlint." },
  { laneId: "tofu", command: "tofu", installHint: "Install OpenTofu." },
  {
    laneId: "react-doctor",
    command: "react-doctor",
    installHint: "Install React Doctor.",
  },
  { laneId: "react-doctor", command: "react-scan", installHint: "Install React Scan." },
  {
    laneId: "convex-codegen-drift",
    command: "convex",
    installHint: "Install Convex.",
  },
];

async function baselineFailure(repoRoot: string, spec: BaselineSpec): Promise<string | undefined> {
  try {
    await validateBaseline(repoRoot, spec);
    return undefined;
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function doctorCommand(
  repoRoot: string,
  config: GateConfig,
  exec: GateExec,
): Promise<number> {
  const specs = config.lanes.flatMap((lane) =>
    lane.baseline === undefined ? [] : [lane.baseline],
  );
  const baselineFailures = (
    await Promise.all(specs.map((spec) => baselineFailure(repoRoot, spec)))
  ).filter((failure) => failure !== undefined);
  const configuredIds = new Set(config.lanes.map((lane) => lane.id));
  const requirements = toolByLane.filter((requirement) => configuredIds.has(requirement.laneId));
  const toolAvailability = await Promise.all(
    requirements.map((requirement) => probeTool(exec, requirement, repoRoot)),
  );
  const toolFailures = toolAvailability.flatMap((availability) =>
    availability.available ? [] : [availability.finding.message],
  );
  const failures = [...baselineFailures, ...toolFailures];

  const hygieneLane = hygiene();
  const classification = classify(["gate.config.ts"], config.classifiers);
  const context: LaneContext = {
    repoRoot,
    changedFiles: classification.changedFiles,
    classification,
    scope: "full",
    exec,
  };
  const result = await hygieneLane.run(context);
  if (result.status === "failed") {
    failures.push(...(result.findings ?? []).map((finding) => finding.message));
  }

  if (failures.length > 0) {
    writeErrorLine("q9gate doctor failed:");
    for (const failure of failures) {
      writeErrorLine(`- ${failure}`);
    }
    return 1;
  }
  writeLine("q9gate doctor passed. Use q9gate run --paranoid to verify lane immutability.");
  return 0;
}
