# DSRG — CI graph validator gate

| Item | Value |
|------|-------|
| **Validator** | `bash architecture/dsrg/scripts/validate-graph.sh` |
| **CI integration** | Chained at end of `bash architecture/scripts/validate-module-registry.sh` |
| **Workflow** | `.github/workflows/module-registry-governance.yml` (existing `architecture/**` paths; **no workflow edit required for R4**) |
| **Dependency strategy** | Pinned `js-yaml` in `architecture/dsrg/scripts/package.json` + `package-lock.json`; install into `architecture/dsrg/scripts/node_modules` only |
| **Local / read-only** | Missing deps → exit **2** with install instructions; **does not** run `npm ci` against `backend/` |
| **CI bootstrap** | When `GITHUB_ACTIONS=true` and deps missing, `validate-graph.sh` logs and runs `npm ci --ignore-scripts --prefix architecture/dsrg/scripts` once |

## Self-tests (R4)

| Check | Command | Expected |
|-------|---------|----------|
| Positive graph | `bash architecture/dsrg/scripts/validate-graph.sh` | exit 0 |
| Negative fixture | `bash architecture/dsrg/scripts/validate-graph.sh --fixture-negative` | exit 1 (duplicate node id) |
| Missing deps | Unset `GITHUB_ACTIONS`, remove `architecture/dsrg/scripts/node_modules` | exit 2, clear message |

**Fail-closed:** Registry governance job fails if DSRG graph validation fails.
