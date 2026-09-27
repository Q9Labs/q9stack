# ADR 0001: Runtime stack

- Status: accepted
- Date: `__YEAR__`

## Context

The generated `__APP_NAME__` application needs one small stack that works for
local development and Cloudflare Workers deployment.

## Decision

Use pnpm workspaces, Turbo, strict TypeScript, TanStack Start, Vite, Tailwind
CSS, Lingui with English and Arabic catalogs, OpenTofu, and `@q9labsai/*`
packages. Keep domain code in `@__APP_SLUG__/core`, auth ports in
`@__APP_SLUG__/auth`, environment parsing in `@__APP_SLUG__/env`, and the web
edge in `@__APP_SLUG__/web`.

## Consequences

The base stays variant-neutral. Backend, persistence, and contract details are
added by an overlay, while the same gate and deployment contract remains.
