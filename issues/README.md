# Issues

Local issue tracker. Each issue is one markdown file, `NNNN-slug.md`, filed under the product whose visible outcome it changes:

- [pipeline/](pipeline/README.md): turning NSE files into clean data in Postgres
- [web/](web/README.md): the front-end in `web/` that reads that data

An issue that touches both lives where its outcome shows. Numbers are global across both directories, so `#0013` always means one issue.

Each issue has frontmatter:

- `status`: `ready` | `in-progress` | `done`
- `type`: `AFK` (an agent can do it end to end) | `HITL` (needs a human)
- `blocked_by`: issue numbers that must be `done` first, from either directory

Vocabulary: [GLOSSARY.md](../GLOSSARY.md). Decisions: [docs/adr/](../docs/adr/).
