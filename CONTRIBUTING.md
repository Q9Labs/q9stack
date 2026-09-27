# Contributing

## Propose a recipe

Open a [recipe proposal](https://github.com/Q9Labs/q9stack/issues/new?template=recipe-proposal.yml) with the problem, a reference implementation and its paths, supported stacks, and a conformance check. A recipe is accepted only when its shared invariants and check are clear. It becomes a package only after two projects use materially the same code and a central upgrade is safer than local ownership.

## Report a bug

Open a [bug report](https://github.com/Q9Labs/q9stack/issues/new?template=bug.yml) with what happened, what you expected, steps to reproduce, and relevant environment details. Remove secrets and personal data from logs.

## Run the gate

Use Node 24 and pnpm 11. From the repository root:

```sh
pnpm install
./node_modules/.bin/q9gate run --full
```

Include the gate result with your pull request.
