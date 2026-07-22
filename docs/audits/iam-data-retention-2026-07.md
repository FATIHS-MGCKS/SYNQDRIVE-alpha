# IAM Data Retention — Security Audit (2026-07)

## Scope

Prompt 20: configurable retention, legal holds, DSAR exports, global user pseudonymization.

## Findings

| Area | Status |
|------|--------|
| Retention disabled by default (`IAM_DATA_RETENTION_ENABLED=false`) | PASS |
| Dry-run default prevents uncontrolled deletes | PASS |
| Per-category batch limits + retry | PASS |
| Legal hold blocks retention mutations | PASS |
| Org policy overrides require explicit `enabled` + approval fields | PASS |
| DSAR export tenant-scoped via membership check | PASS |
| Cross-tenant idempotency key rejected | PASS |
| DSAR step-up required (`PRIVACY_DATA_EXPORT`) | PASS |
| Export audited via transactional outbox | PASS |
| Global deletion assesses cross-org dependencies | PASS |
| Pseudonymization when hard delete unsafe | PASS |
| IP pseudonymization (no raw indefinite retention without policy) | PASS |
| Retention run audited (`IamRetentionRunLog` + API audit) | PASS |
| Legal hold place/release audited | PASS |

## Test coverage

13 scenarios in `iam-data-retention.security.spec.ts`.

## Operational notes

- Set `IAM_DATA_PSEUDONYMIZATION_SALT` before enabling IP pseudonymization in production
- Run dry-run retention before disabling `IAM_DATA_RETENTION_DRY_RUN`
- Legal holds should be placed before litigation-related retention runs
