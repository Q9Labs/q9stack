import { diagnosticCodeSchema, redactDiagnosticAttributes } from "@q9labsai/diagnostics";

type Operation = "trace" | "run";

function deploymentFrom(flags: string[]): string {
  const [flag, name, extra] = flags;
  if (flag !== "--deployment" || !name || extra) throw new Error("Invalid target");
  if (!/^[a-zA-Z0-9_.:-]{1,96}$/.test(name)) throw new Error("Invalid target");
  return name;
}

function targetFrom(flags: string[]): string {
  if (flags.length === 0) return "development";
  if (flags[0] === "--prod") {
    if (flags.length !== 1) throw new Error("Invalid target");
    return "production";
  }
  return deploymentFrom(flags);
}

function lookupFrom(
  operation: string | undefined,
  value: string | undefined,
): { operation: Operation; value: string } {
  if (operation !== "trace" && operation !== "run") throw new Error("Invalid operation");
  if (!value) throw new Error("Missing lookup value");
  return { operation, value };
}

function validateLookupValue(operation: Operation, value: string): void {
  if (operation === "trace") {
    diagnosticCodeSchema.parse(value);
    return;
  }
  if (redactDiagnosticAttributes({ flow_run: value }).attributes?.flow_run !== value)
    throw new Error("Invalid flow run");
}

// The CLI passes --limit and --after to every command source; this lookup returns one bounded page, so it ignores them.
function withoutPaging(flags: string[]): string[] {
  const kept: string[] = [];
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--limit" || flag === "--after") {
      if (flags[index + 1] === undefined) throw new Error(`Missing value for ${flag}`);
      index += 1;
      continue;
    }
    if (flag !== undefined) kept.push(flag);
  }
  return kept;
}

export function parseArguments(args: string[]): {
  operation: Operation;
  value: string;
  target: string;
} {
  const { operation, value } = lookupFrom(args[0], args[1]);
  validateLookupValue(operation, value);
  return { operation, value, target: targetFrom(withoutPaging(args.slice(2))) };
}
