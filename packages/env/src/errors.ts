import { ConfigError } from "effect";

export type EnvIssueCode = "missing" | "invalid" | "unavailable";

export interface EnvIssue {
  readonly key: string;
  readonly code: EnvIssueCode;
  readonly message: string;
}

const formatMessage = (issues: readonly EnvIssue[]): string =>
  issues.map((issue) => `${issue.key}: ${issue.message}`).join("; ");

const safeInvalidMessage = (message: string): string =>
  message === "must not be blank" || message.startsWith("must be one of: ")
    ? message
    : "Value does not match its schema";

export class EnvError extends Error {
  // fallow-ignore-next-line unused-class-member -- Public discriminant for typed consumers.
  readonly _tag = "EnvError";
  readonly issues: readonly EnvIssue[];

  constructor(issues: readonly EnvIssue[]) {
    super(formatMessage(issues));
    this.name = "EnvError";
    this.issues = issues;
  }
}

export const issuesFromConfigError = (
  key: string,
  error: ConfigError.ConfigError,
): readonly EnvIssue[] =>
  ConfigError.reduceWithContext<void, readonly EnvIssue[]>(undefined, {
    andCase: (_context, left, right) => [...left, ...right],
    invalidDataCase: (_context, _path, message) => [
      {
        code: "invalid",
        key,
        message: safeInvalidMessage(message),
      },
    ],
    missingDataCase: (_context, _path, _message) => [
      { code: "missing", key, message: "Required value is missing" },
    ],
    orCase: (_context, left, right) => [...left, ...right],
    sourceUnavailableCase: (_context, _path, _message) => [
      { code: "unavailable", key, message: "Configuration source is unavailable" },
    ],
    unsupportedCase: (_context, _path, _message) => [
      { code: "unavailable", key, message: "Configuration is unsupported" },
    ],
  })(error);
