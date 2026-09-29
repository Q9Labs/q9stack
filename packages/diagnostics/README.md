# @q9labsai/diagnostics

Browser- and Node-compatible contracts for `DiagnosticCode/v1`, `DiagnosticEvent/v1`, and `DiagnosticTraceBrief/v1`. Import the Zod schemas to validate at capture, ingestion, and lookup boundaries. The package stores no data and grants no access: a diagnostic code is a lookup key, never authorization.

Use `sanitizeDiagnosticEvent` before queueing. The server must validate again, derive identity and receipt time itself, and expire stored events after its stated policy. See [the Convex recipe](../../recipes/diagnostics-convex.md).

`FlowDefinition/v1` is a validated ordered graph of diagnostic steps. `flowDefinitionSchema` checks references, branch outcomes, cycles, and durations; `checkFlowRun(definition, events, now)` is a pure read-time check returning step statuses, deadlines, unexpected events, and a run verdict. The optional `flows` field on `DiagnosticTraceBrief/v1` holds these results. See [the flows recipe](../../recipes/diagnostics-flows.md) and the [resume import fixture](fixtures/resume-import-flow.v1.json).

Trace briefs may include an opaque `nextCursor` for another page, source names on `visibilityGaps`, allowlisted span attributes, redacted `logLines` attached to server spans, and correlated `serverLogs` when the log dataset is a separate source. See the [Axiom](../../recipes/diagnostics-axiom.md) and [command](../../recipes/diagnostics-command.md) source recipes.
