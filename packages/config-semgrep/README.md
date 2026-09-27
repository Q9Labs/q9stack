# @q9labsai/config-semgrep

Shareable Semgrep rules for the q9labs TypeScript and JavaScript stack. The
package contains three independent YAML packs:

- `@q9labsai/config-semgrep/type-safety`
- `@q9labsai/config-semgrep/shape-heuristics`
- `@q9labsai/config-semgrep/security`

Semgrep accepts the resolved package path directly:

```sh
semgrep --metrics=off \
  --config node_modules/@q9labsai/config-semgrep/rules/type-safety.yml .
```

The package root exports `semgrepRulePacks`, a typed map of the three package
subpaths. Each YAML file can be copied into a project when a Semgrep runner
cannot resolve package exports.

The type-safety pack carries the data-structure discipline rules. It rejects
type assertions that bypass narrowing, shapeless `Record`/index-signature
types, and guards that erase unknown values into a record. These checks keep
domain states explicit so callers can rely on discriminated unions or schema
validation instead of recovering shape assumptions later. Suppressions need a
same-line reason because an unexplained exception is otherwise indistinguishable
from an accidental escape hatch.

The shape pack reports low-confidence design smells as warnings. It identifies
object types with four or more optional fields and no discriminant, optional
boolean flag pairs, and direct property access on unvalidated `JSON.parse`
results. It also rejects physical left/right Tailwind utilities in TSX so
shared UI stays compatible with LTR and RTL layouts. It deliberately omits
stringly-typed ID detection: a type named `*Id` does not reliably identify an ID
field, and a broad `id: string` pattern would create false positives for
external identifiers and serialized values.

The security pack rejects dynamic code, unsanitized HTML injection, external
links without `noopener`, template strings passed to `child_process.exec`, and
hard-coded provider-style `sk-` or AWS `AKIA` tokens. Sanitizers whose names
include `sanitize`, `purify`, `escape`, `encode`, `parse`, `decode`, `validate`,
or `schema` are treated as explicit boundaries where the rule needs to avoid a
duplicate finding; they still need their own security review.
