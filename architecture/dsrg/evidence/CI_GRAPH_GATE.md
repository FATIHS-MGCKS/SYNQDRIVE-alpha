# DSRG — CI graph validator gate

| Item | Value |
|------|-------|
| **Validator** | `bash architecture/dsrg/scripts/validate-graph.sh` |
| **CI integration** | Chained at end of `bash architecture/scripts/validate-module-registry.sh` |
| **Workflow** | `.github/workflows/module-registry-governance.yml` (existing `architecture/**` paths) |
| **Bootstrap** | `validate-graph.sh` runs `npm ci --ignore-scripts` in `backend/` when `js-yaml` is missing (CI runners) |
| **i18n authority** | No separate `.github/workflows` edit required in R3 (avoids `GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL` on workflow-only diffs) |

**Fail-closed:** Registry governance job fails if DSRG graph validation fails.
