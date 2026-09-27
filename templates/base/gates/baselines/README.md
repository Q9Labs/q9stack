# Gate baselines

Baselines are reviewed project data, not generated output. A baseline records the
current finding count and the reason the finding is accepted. A lane fails when
its count increases. Use `q9gate accept-baseline <lane> --message "<reason>"`
for the only supported baseline update.

Each JSON baseline follows the shape `{ "count": 0, "entries": [],
"acceptedAt": "...", "message": "..." }`.
