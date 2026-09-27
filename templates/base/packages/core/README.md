# `@__APP_SLUG__/core`

`@__APP_SLUG__/core` is the provider-free domain kernel for the scaffold. It exports branded Effect Schema identifiers and a small sample lifecycle state machine.

```ts
import { SampleId, createDraftSample, transitionSample } from "@__APP_SLUG__/core";
```

`SampleId` and `WorkspaceId` validate non-empty strings and carry distinct inferred brands. `createDraftSample` creates the initial state. `transitionSample` accepts `publish`, `archive`, and `restore` commands and returns a discriminated `{ ok: true, entity }` or `{ ok: false, error }` result. The legal cycle is `draft → published → archived → draft`.
