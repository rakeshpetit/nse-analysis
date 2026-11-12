# Web app reads the pipeline's tables directly

The front-end lives in `web/`, a new React Router v7 app in framework mode that shares no code with the older `packages/`. Its server loaders query the pipeline's Postgres tables (`adjusted.daily_bar`, `core.security_symbol`, Issue Size) directly, through one data-access module, over connections opened with `default_transaction_read_only=on`. There is no API service and no published views. With one client running locally, an API would only be a second deploy and a second schema to keep in step. The pipeline stays the only writer.

## Considered Options

- **SPA plus a separate API** (the old `packages/frontend` + `packages/backend` shape). Rejected for now. An API earns its place when a second client (mobile, public API) appears, and it can grow out of React Router resource routes when that happens.
- **Static JSON export from the pipeline.** Rejected: every build would need an extra export step before the UI showed it.
- **Pipeline-owned SQL views as the contract.** Rejected as more ceremony than one in-repo reader needs. The data-access module is the seam instead.

## Consequences

- A pipeline schema change can break `web/`. The data-access module's tests run against the migrated schema, so such a break shows up as a test failure, not in production.
- Hosting is undecided. When it happens, the read-only connection option is replaced by a real read-only Postgres role.
