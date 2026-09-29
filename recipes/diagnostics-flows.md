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

For custom-stack capture, use the [Go recipe](diagnostics-go.md) or [Elixir recipe](diagnostics-elixir.md); both show the span-event and correlated-log conventions, Axiom source, and current Chalk deviations.

Run `q9 diag trace <code> --json` to read `flows`: each run has a verdict, per-step `status`, any satisfying event, observed time, expected deadline, and unexpected steps. Text output puts flows before events. A pending deadline means the check is not final. `not_observable` means the branch was inactive or its prerequisite could not be established. The check runs on read, not in a background worker, and does not alert. For cross-trace runs, implement the run lookup in the [Convex](diagnostics-convex.md) or [command](diagnostics-command.md) adapter; otherwise the CLI checks only visible trace events and marks the brief `partial` with `flow_run_lookup_unavailable`. Unexpected run events are bounded to 100 per flow result; further evidence sets `truncated`.
