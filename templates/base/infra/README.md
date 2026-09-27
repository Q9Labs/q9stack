# Infrastructure

This directory contains the OpenTofu stacks for the template Worker and its optional Cloudflare DNS records. The `dev` and `prod` stacks use the same modules and separate S3 state keys.

## Checks

Run these commands from the repository root before a change is merged:

```sh
tofu fmt -check -recursive infra
tofu -chdir=infra/stacks/dev init -backend=false
tofu -chdir=infra/stacks/dev validate
tofu -chdir=infra/stacks/prod init -backend=false
tofu -chdir=infra/stacks/prod validate
trivy config infra
```

Initialization with the backend enabled needs an S3 bucket named `__APP_SLUG__-tofu-state`. OpenTofu's S3 native lockfile is enabled with `use_lockfile = true`; no DynamoDB lock table is used.

## Inputs

Both stacks require `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `APP_URL`, and `OPENROUTER_API_KEY`. `CLOUDFLARE_ZONE_ID`, `CUSTOM_DOMAIN`, `SENTRY_DSN`, and `DNS_RECORDS` are optional. `OPENROUTER_API_KEY` is server-only and must be supplied through the deployment environment, not committed files.

The Worker binds `APP_ENV`, `APP_URL`, `LOG_LEVEL`, and the optional public `SENTRY_DSN` as plain text. It binds `OPENROUTER_API_KEY` as a Cloudflare Worker secret.
