# Infrastructure

This directory contains the OpenTofu stacks for the template Worker and its optional Cloudflare DNS records. The `dev` and `prod` stacks use the same modules and separate S3 state keys. The Node API and PostgreSQL service are deployed outside these Cloudflare Worker modules; the stacks expose placeholders for their public API URL and server-side credentials.

## Checks

```sh
tofu fmt -check -recursive infra
tofu -chdir=infra/stacks/dev init -backend=false
tofu -chdir=infra/stacks/dev validate
tofu -chdir=infra/stacks/prod init -backend=false
tofu -chdir=infra/stacks/prod validate
trivy config infra
```

Initialization with the backend enabled needs an S3 bucket named `__APP_SLUG__-tofu-state`. OpenTofu's S3 native lockfile is enabled with `use_lockfile = true`; no DynamoDB lock table is used.

Both stacks require `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `APP_URL`, `API_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `OPENROUTER_API_KEY`. `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `OPENROUTER_API_KEY` are sensitive inputs and must come from the deployment environment, not committed files. `CLOUDFLARE_ZONE_ID`, `CUSTOM_DOMAIN`, `SENTRY_DSN`, and `DNS_RECORDS` are optional.

The Worker receives public app/API settings. The API and its PostgreSQL connection are deployed externally from this v1 infrastructure module, so no database provider or resource is declared here.
