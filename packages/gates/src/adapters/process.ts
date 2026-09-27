import { execa } from "execa";

import type {
  CommandOptions,
  CommandResult,
  EnvironmentVariable,
  GateExec,
} from "../core/types.js";

function environment(
  variables: readonly EnvironmentVariable[] | undefined,
): NodeJS.ProcessEnv | undefined {
  if (variables === undefined) {
    return undefined;
  }
  return Object.fromEntries(variables.map((variable) => [variable.name, variable.value]));
}

export const executeCommand: GateExec = async (
  command: string,
  args: readonly string[] = [],
  options: CommandOptions = {},
): Promise<CommandResult> => {
  const processEnvironment = environment(options.env);
  const result = await execa(command, args, {
    reject: options.reject ?? false,
    all: false,
    preferLocal: true,
    localDir: options.cwd ?? process.cwd(),
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(processEnvironment === undefined ? {} : { env: processEnvironment }),
    ...(options.input === undefined ? {} : { input: options.input }),
  });
  const exitCode = result.exitCode ?? 1;
  return {
    command: [command, ...args].join(" "),
    exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    failed: result.failed || exitCode !== 0,
  };
};
