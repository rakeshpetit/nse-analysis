# NSE web

The front-end: a React Router v7 app (framework mode) whose server loaders read the pipeline's
Postgres tables directly. See [ADR 0004](../docs/adr/0004-web-reads-pipeline-tables-directly.md),
[GLOSSARY.md](../GLOSSARY.md) and the [web issues](../issues/web). It shares no code with `packages/`.

## Setup

```sh
asdf install                      # Node pinned in .tool-versions
yarn install                      # from the repo root
export DATABASE_URL=postgres://localhost/nse_pipeline
```

The database must already hold pipeline data: from `pipeline/`, run `yarn migrate`, `yarn fetch`
and `yarn build` (or `yarn daily`).

## Commands

Run from `web/`:

| Command          | What it does                                                          |
| ---------------- | --------------------------------------------------------------------- |
| `yarn dev`       | Dev server on http://localhost:5173. Needs `DATABASE_URL`.            |
| `yarn build`     | Production build into `build/`.                                       |
| `yarn start`     | Serves the production build. Needs `DATABASE_URL`.                    |
| `yarn test`      | vitest. Needs a local Postgres; each test file creates and drops its own database, migrated with `../pipeline/migrations`. |
| `yarn typecheck` | `react-router typegen` then `tsc --noEmit`.                           |

`TEST_ADMIN_URL` overrides the database used to create test databases
(default `postgres://localhost/postgres`).

## Layout

- `app/data.server.ts`: the data-access module. Every query lives here, and its connections are
  opened with `default_transaction_read_only=on`, so a write fails. The pipeline stays the only writer.
- `app/routes/`: one file per page. `/` is the Top 30 Securities by Market Cap on the latest Trading Day.
- `app/routes/company.tsx`: `/companies/:symbol`, one Security's Adjusted close as a `lightweight-charts` line (`app/PriceChart.tsx`), with 3M/6M/1Y ranges (`?range=`, default 1Y) counted from the latest Trading Day in the database. The symbol is the Security's current one; an unknown or retired symbol is a 404.
- `app/format.ts`: Indian digit grouping (`18,07,135 Cr`) and signed percentages.
- `test/`: data-access tests against a real, migrated Postgres.

A pipeline schema change can break the queries; the tests run against the pipeline's migrations so
that shows up as a failure here.
