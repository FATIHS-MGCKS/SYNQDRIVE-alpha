# IAM Access Review — Security Audit (2026-07)

## Scope

Prompt 19: privileged access review campaigns, effective-access snapshots, reviewer decisions, lifecycle-only application.

## Findings

| Area | Status |
|------|--------|
| Effective access snapshots at item creation | PASS |
| Decisions require reviewer + reason + timestamps | PASS |
| MODIFY/SUSPEND/REMOVE via JML lifecycle only | PASS |
| No auto-deactivation without review decision | PASS |
| Last-admin block on suspend/remove | PASS |
| Break-glass candidate block on suspend/remove | PASS |
| Stale membershipVersion rejection | PASS |
| Cross-tenant isolation | PASS |
| Transactional audit outbox on create/start/decide/apply | PASS |
| Overdue campaign status refresh | PASS |

## Test coverage

11 scenarios in `iam-access-review.security.spec.ts`.

## Operational notes

- Reviewer must be active `ORG_ADMIN` or `SUB_ADMIN`
- Re-campaigns create fresh snapshots with new `snapshotVersion`
- `ESCALATE` records decision without lifecycle mutation for manual follow-up
