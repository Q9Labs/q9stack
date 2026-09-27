import { probeTool } from "../adapters/tool.js";
import type { LaneFinding } from "../core/report.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { outputFindings } from "./lane-report.js";
import { categoryTrigger } from "./trigger.js";

export interface ReactDoctorOptions {
  readonly command?: string;
  readonly scanCommand?: string;
}

const reactScanRuntimeCheck = [
  'const scan = await import("react-scan");',
  'if (typeof scan.scan !== "function" || typeof scan.getReport !== "function") process.exit(1);',
  'const lite = await import("react-scan/lite");',
  'if (typeof lite.instrument !== "function") process.exit(1);',
  "const handle = lite.instrument({ enabled: false, onEvent: () => {} });",
  'if (typeof handle.stop !== "function" || typeof handle.isActive !== "function") process.exit(1);',
  "handle.stop();",
  'const vite = await import("react-scan/react-component-name/vite");',
  'if (typeof vite.default !== "function") process.exit(1);',
  "const plugin = vite.default();",
  'if (typeof plugin?.name !== "string" || plugin.name.length === 0) process.exit(1);',
].join("\n");

function doctorArgs(context: LaneContext): readonly string[] {
  const args = [
    ".",
    "--yes",
    "--scope",
    "changed",
    "--blocking",
    "warning",
    "--no-score",
    "--verbose",
  ];
  if (context.base !== undefined && context.scope !== "full") {
    args.push("--base", context.base);
  }
  return args;
}

function executionFinding(file: string, rule: string, error: unknown): LaneFinding {
  return {
    file,
    rule,
    message: error instanceof Error ? error.message : String(error),
  };
}

async function runDoctorCheck(
  context: LaneContext,
  command: string,
): Promise<readonly LaneFinding[]> {
  const available = await probeTool(
    context.exec,
    {
      command,
      installHint:
        "Install React Doctor with `pnpm add -D react-doctor`, then rerun the React gate.",
    },
    context.repoRoot,
  );
  if (!available.available) {
    return [available.finding];
  }

  try {
    const result = await context.exec(command, doctorArgs(context), { cwd: context.repoRoot });
    if (!result.failed) {
      return [];
    }
    const findings = outputFindings(result.stdout + "\n" + result.stderr, {
      fallbackFile: "react-doctor",
      rule: "react-doctor",
    });
    return findings.length === 0
      ? [
          {
            file: "react-doctor",
            rule: "react-doctor",
            message: `${result.stdout}\n${result.stderr}`.trim() || "React Doctor failed.",
          },
        ]
      : findings;
  } catch (error: unknown) {
    return [executionFinding(command, "execution", error)];
  }
}

async function runScanCheck(
  context: LaneContext,
  command: string,
): Promise<readonly LaneFinding[]> {
  const available = await probeTool(
    context.exec,
    {
      command,
      installHint: "Install React Scan with `pnpm add -D react-scan`, then rerun the React gate.",
    },
    context.repoRoot,
  );
  if (!available.available) {
    return [{ file: "react-scan", rule: "optional-tool", message: available.finding.message }];
  }

  try {
    const runtime = await context.exec(
      process.execPath,
      ["--input-type=module", "-e", reactScanRuntimeCheck],
      { cwd: context.repoRoot },
    );
    if (!runtime.failed) {
      return [];
    }
    return [
      {
        file: "react-scan",
        rule: "runtime",
        message:
          runtime.stderr.trim() ||
          "React Scan runtime, lite instrumentation, or Vite plugin checks failed.",
      },
    ];
  } catch (error: unknown) {
    return [executionFinding("react-scan", "runtime", error)];
  }
}

async function runReactDoctor(
  context: LaneContext,
  options: ReactDoctorOptions,
): Promise<LaneResult> {
  const doctorCommand = options.command ?? "react-doctor";
  const scanCommand = options.scanCommand ?? "react-scan";
  const [doctorFindings, scanFindings] = await Promise.all([
    runDoctorCheck(context, doctorCommand),
    runScanCheck(context, scanCommand),
  ]);
  const findings = [...doctorFindings, ...scanFindings];

  const filesChecked = context.changedFiles.filter((file) => /\.tsx?$/u.test(file)).length;
  const blocking = findings.some((item) => item.rule !== "optional-tool");
  return {
    status: blocking ? "failed" : "passed",
    metrics: { filesChecked },
    ...(findings.length === 0 ? {} : { findings }),
  };
}

export function reactDoctor(options: ReactDoctorOptions = {}): GateLane {
  return {
    id: "react-doctor",
    title: "React Doctor and Scan",
    categories: ["ui"],
    triggers: categoryTrigger(["ui"]),
    run: (context) => runReactDoctor(context, options),
  };
}
