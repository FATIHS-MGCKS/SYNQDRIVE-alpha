# DSRG-03 R4 — Repository hardening (graph validator + break-glass)

| Field | Value |
|-------|-------|
| **Mode** | `REPOSITORY_HARDENING_ONLY` |
| **Production mutations** | **FORBIDDEN** (none performed) |
| **Enforcement activation** | **NO** |
| **BREAK_GLASS_READY** | `NOT_VERIFIED` |
| **Registry coverage** | `AUDIT_IN_PROGRESS` (unchanged) |

## Graph validator strategy

- Pinned dependency: `architecture/dsrg/scripts/package.json` → `js-yaml@^4.1.0`
- Lockfile: `architecture/dsrg/scripts/package-lock.json`
- Runtime install path: `architecture/dsrg/scripts/node_modules` (gitignored)
- **No** `npm ci` against `backend/` during ordinary validation
- CI: explicit logged bootstrap in `validate-graph.sh` when `GITHUB_ACTIONS=true` and deps absent

## Negative / missing-dependency tests

- `--fixture-negative` → duplicate node id → exit 1
- Missing `node_modules` (non-CI) → exit 2 with install command

## Break-glass

Prerequisites BG-A through BG-F documented in `OS_PRIVILEGE_BOUNDARY.md` and `ROLLBACK_AND_CONTAINMENT.md`. Recovery drill (BG-E) not executed in R4.
