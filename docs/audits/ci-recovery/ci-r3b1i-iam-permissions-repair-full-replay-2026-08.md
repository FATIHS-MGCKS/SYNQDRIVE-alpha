# CI-R3B1I — IAM Membership Permissions Repair & Full Replay

**Phase:** R3B1I  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Branch:** `fix/ci-r3b1i-iam-permissions-full-replay-2026-08`  
**Status:** `CI_R3B1I_IAM_PERMISSIONS_REPAIR_FULL_REPLAY_PARTIAL`

---

## Baseline

| Field | Value |
|-------|-------|
| Branch | `fix/ci-r3b1i-iam-permissions-full-replay-2026-08` |
| evidence_input_sha | `37d0904500024bf51dd712fb7398d91dd54c0411` |
| parent_branch_sha | `37d0904500024bf51dd712fb7398d91dd54c0411` |
| authority_source_sha | `{'ci-r3b1h111-exact-predecessor-contracts-2026-08.json': 'c46518999c0130d1bfeb0ef8ef8f1ee029691880fb394bc424c7e81eb0d661b0', 'ci-r3b1h111-targeted-consumer-proof-2026-08.json': '19f347b290741249ccfcf35139ffe1fb8912197f07c360e2a8176b5c64c46517', 'ci-r3b1h111-final-validation-summary-2026-08.json': '4e236ea97e3eb1eca687f5c58559547ef9342112f601cbbd593a68733f20ab09'}` |
| Production exposure | **E_UNKNOWN** |

---

## Preflight tooling closure

| Gate | Result |
|------|--------|
| Context whitelist removed | PASS |
| _repair_log exclusion removed | PASS |
| FALSE_POSITIVE lineage validated | PASS |
| physical_alias_leakage | 0 |
| derived_lineage_gaps | 0 |
| qualified_reference_coverage_gaps | 0 |
| UNRESOLVED | 0 |
| Preflight status | `UNKNOWN` |

---

## Final actionable set

| Field | Value |
|-------|-------|
| Blocking dependency records | n/a |
| Unique actionable gaps | 1 |
| Expected gap | `organization_memberships.permissions` |

---

## IAM contract

| Field | Value |
|-------|-------|
| Relation | `organization_memberships` |
| Column | `permissions` |
| Type | `jsonb` |
| Nullable | true |
| Default | none |
| First consumer | `20260721250000_iam_versioned_role_assignments` |

---

## Repair migration

| Field | Value |
|-------|-------|
| Migration | `20260721245000_ci_r3b_iam_membership_permissions_predecessor` |
| Boundary after | `20260721240000_iam_last_selected_organization` |
| Boundary before | `20260721250000_iam_versioned_role_assignments` |
| Lexical ordering | PASS |
| Contract equivalence | PASS |
| IF NOT EXISTS absent | PASS |

---

## Targeted actual-file PostgreSQL proof

| Check | Result |
|-------|--------|
| Fresh pre-249 DB | PASS |
| permissions absent before repair | PASS |
| Actual IAM repair | PASS |
| Catalog parity | PASS |
| Unchanged migration 249 | PASS |
| Synthetic IAM backfill | PASS |

---

## Full replay

| Field | Value |
|-------|-------|
| Migration directories | 305 |
| Normal migrations applied | 251 |
| Special migrations | 1 |
| Failed migrations | 1 |
| Manual interventions | 0 |
| Last successful | `20260721260000_iam_role_change_applications` |
| HEAD reached | False |
| R3B1I IAM repair | PASS |
| Migration 249 | PASS |


## Full replay blocker

| Field | Value |
|-------|-------|
| First failing migration | `20260721270000_iam_role_assignment_drift_reconciliation` |
| Failure ordinal | 252 |
| SQLSTATE | 42P07 |
| Classification | NEW_UNRELATED_HISTORICAL_DEFECT |
| Last successful migration | `20260721260000_iam_role_change_applications` |


## Final convergence

| Gate | Result |
|------|--------|
| 19/19 objects | NOT_REACHED/19 |
| 9/9 tables | NOT_REACHED |
| 10/10 enums | NOT_REACHED |
| 54/54 properties | NOT_REACHED/54 |
| Type mismatches | NOT_REACHED |
| Nullability mismatches | NOT_REACHED |
| Default mismatches | NOT_REACHED |
| Constraint mismatches | NOT_REACHED |
| Index mismatches | NOT_REACHED |
| Enum mismatches | NOT_REACHED |
| Parity pass | False |

---

## Immutability

| Check | Result |
|-------|--------|
| Preexisting migration SQL modified | 0 |
| New migration directories | 1 |
| R3B1G repair changed | 0 |
| Migration 249 changed | 0 |
| schema.prisma changed | NO |
| runtime changed | NO |

---

## Exposure

- Production exposure: **E_UNKNOWN**

## Safety

- Production DDL/DML: **NO**
- Production migration: **NO**
- Deployment: **NO**
- Merge: **NO**
- R3B.2: **NO**
- Full fresh replay executed: **YES**

---

## Final status

**CI_R3B1I_IAM_PERMISSIONS_REPAIR_FULL_REPLAY_PARTIAL**
