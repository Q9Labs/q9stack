# @q9labsai/diagnostics

Browser- and Node-compatible contracts for `DiagnosticCode/v1`, `DiagnosticEvent/v1`, and `DiagnosticTraceBrief/v1`. Import the Zod schemas to validate at capture, ingestion, and lookup boundaries. The package stores no data and grants no access: a diagnostic code is a lookup key, never authorization.

Use `sanitizeDiagnosticEvent` before queueing. The server must validate again, derive identity and receipt time itself, and expire stored events after its stated policy. See [the Convex recipe](../../recipes/diagnostics-convex.md).
