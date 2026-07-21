# IAM Role Assignment Drift Reconciliation (Prompt 12/22)

**Date:** 2026-07-21  
**Status:** Implemented (controlled migration path)

## Problem

After Prompt 10 backfill, many memberships retain `MIGRATION_LEGACY_SNAPSHOT` assignments with JSON permission snapshots that may drift from the linked role template. Silent propagation is forbidden (Prompt 11). Operators need a read-only classifier, evidence packages, and a guarded apply path.

## Classifications

| Classification | Meaning | Auto-apply |
|----------------|---------|------------|
| `EXACT_ROLE_MATCH` | Membership snapshot matches current role template | Yes → `FOLLOW_LATEST_APPROVED_VERSION` |
| `STALE_ROLE_SNAPSHOT` | Snapshot matches an older approved role version | Yes → `FOLLOW_LATEST_APPROVED_VERSION` |
| `INTENTIONAL_OVERRIDE` | Delta fully expressible as explicit ALLOW/DENY overrides | Yes → `FOLLOW_LATEST` + override rows |
| `PRIVILEGED_DRIFT` | Effective privileged capabilities differ | Review only |
| `UNKNOWN_ROLE_SOURCE` | No reliable role link or unexplained delta | Review only |
| `INVALID_PERMISSION_KEY` | Unknown module keys in membership JSON | Review only |
| `DISABLED_ROLE_ASSIGNMENT` | Inactive role or non-active membership | Review only |
| `NO_ROLE_ASSIGNMENT` | Missing current assignment row | Review only |

**Rule:** No permission is guessed. Overrides are derived only when recomposed permissions exactly match the membership snapshot.

## Evidence package

Each membership receives a hashed evidence package containing:

- Membership + current permissions
- Current role template
- Historical role versions (when linked)
- Permission and scope diffs
- Audit history (recent activity log entries)
- Session summary
- Classification + recommended assignment mode

## Audit script

`scripts/audits/audit-effective-access.ts`:

- **Default:** read-only (`--drift-audit`)
- **Apply:** requires `--apply`, `--organizationId`, `--evidenceHash`, `--expectedGitCommit`, `--backup-confirmed`, `--operator`, `--reason`, `--batchLimit`

Legacy phase-4 coverage mode remains available without `--drift-audit`.

## Apply flow

`RoleAssignmentDriftReconciliationService.applyDriftReconciliation`:

1. Regenerates read-only report and validates `reportHash`
2. Processes only `applyEligible` classifications (batch-limited)
3. Re-validates per-membership evidence hash against live DB state
4. Transaction:
   - End current assignment
   - Create `FOLLOW_LATEST_APPROVED_VERSION` assignment
   - Persist derived overrides (INTENTIONAL_OVERRIDE)
   - Sync membership JSON from role template (legacy fields preserved, not deleted)
   - Increment `membershipVersion`
   - Enqueue session invalidation intents
   - Record idempotent apply log row
5. Process session intents + audit (`ROLE_ASSIGNMENT_DRIFT_RECONCILED`)

## Data model

`OrganizationRoleAssignmentDriftReconciliationApplication` — idempotent apply log (`idempotencyKey`, `evidenceHash`, `expectedGitCommit`, operator, reason, classification, result JSON).

## Files

- `backend/src/modules/users/policies/role-assignment-drift-reconciliation.policy.ts`
- `backend/src/modules/users/role-assignment-drift-reconciliation.service.ts`
- `scripts/audits/audit-effective-access.ts` (extended)
- Migration: `20260721270000_iam_role_assignment_drift_reconciliation`

## Non-goals (this prompt)

- No deletion of legacy membership JSON fields
- No automatic apply for review-required classifications
- No frontend reconciliation UI (future prompt)
