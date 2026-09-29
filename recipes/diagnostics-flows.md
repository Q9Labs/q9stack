# Diagnostic flows

Create `diagnostics/flows.json` in the product root as a **JSON array** of `FlowDefinition/v1` objects. `q9 diag check` and `q9 diag trace` validate the file. For example:

```json
[
  {
    "id": "resume.import",
    "version": 1,
    "steps": [
      { "id": "uploaded" },
      { "id": "parsed", "after": ["uploaded"], "within": "2m" },
      {
        "id": "result",
        "after": ["parsed"],
        "within": "1m",
        "oneOf": ["candidate_created", "duplicate", "failed"]
      },
      {
        "id": "scored",
        "after": ["result:candidate_created"],
        "within": "5m",
        "need": "conditional"
      }
    ]
  }
]
```

Each event for a step is a normal `DiagnosticEvent/v1`. Put the flow ID in `attributes.flow`, a stable run ID shared across traces in `attributes.flow_run`, the step ID in `attributes.flow_step`, and the selected branch outcome in `attributes.outcome`. These values must pass the package's ordinary attribute validation and redaction. `after` can name a step or `step:outcome`; `within` accepts positive seconds, minutes, or hours (`30s`, `2m`, `1h`). `need` defaults to `required`; `conditional` applies only on its named branch and `best_effort` never fails the run.

Axiom-only products do not need a diagnostics table. Emit each step as an OTel span event with these string attributes, a correlated OTel log record with the same attributes, or both. Preserve the active trace and span IDs; when emitting both, use the same millisecond timestamp so they collapse to one diagnostic event. Keep `flow_run` stable across all traces in the run and configure the Axiom traces and/or logs datasets as described in [the Axiom recipe](diagnostics-axiom.md).

For custom-stack capture, use the [Go recipe](diagnostics-go.md) or [Elixir recipe](diagnostics-elixir.md); both show the span-event and correlated-log conventions, Axiom source, and current Chalk deviations.

Run `q9 diag trace <code> --json` to read `flows`: each run has a verdict, per-step `status`, any satisfying event, observed time, expected deadline, and unexpected steps. Text output puts flows before events. A pending deadline means the check is not final. `not_observable` means the branch was inactive or its prerequisite could not be established. The check runs on read, not in a background worker, and does not alert. For cross-trace runs, use the Axiom source or implement run lookup in the [Convex](diagnostics-convex.md) or [command](diagnostics-command.md) adapter. With no lookup-capable source, the CLI checks only visible trace events and marks the brief `partial` with `flow_run_lookup_unavailable`. Unexpected run events are bounded to 100 per flow result; further evidence sets `truncated`.

A step is checked against its first matching event. When a step can repeat, as a delivery that is retried before it succeeds or expires, model the retry as a branch outcome and add a later step for the final result, for example `{ "id": "settled", "after": ["result:retrying"], "within": "24h", "need": "conditional", "oneOf": ["delivered", "expired", "failed"] }`. The run then shows both the first result and the final one.
