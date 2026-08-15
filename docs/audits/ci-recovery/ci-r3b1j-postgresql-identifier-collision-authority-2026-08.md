# CI-R3B1J — PostgreSQL Identifier Collision Authority

**Phase:** R3B1J  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Branch:** `fix/ci-r3b1j-identifier-collision-authority-2026-08`  
**Status:** `CI_R3B1J_IDENTIFIER_COLLISION_AUTHORITY_COMPLETED`

---

## Baseline

| Field | Value |
|-------|-------|
| evidence_input_sha | `27d49551c8093ae475bf9cdc9815713968ceb08c` |
| BASE_R3B1I_SHA | `27d49551c8093ae475bf9cdc9815713968ceb08c` |
| Production exposure | **E_UNKNOWN** |

---

## R3B1I failure

| Field | Value |
|-------|-------|
| Last successful migration | `20260721260000_iam_role_change_applications` |
| First failing migration | `20260721270000_iam_role_assignment_drift_reconciliation` |
| Observed error class | duplicate relation after identifier truncation |

---

## Exact statement-level reproduction

| Field | Value |
|-------|-------|
| Pre-252 replay | PASS |
| Migration 252 statement count | 5 |
| First failing statement | 2 |
| SQLSTATE | 42P07 |
| Error | relation already exists after truncation |
| Deterministic reproduction | PASS |

Failing SQL:

```sql
CREATE UNIQUE INDEX "organization_role_assignment_drift_reconciliation_applications_idempotency_key_key"
  ON "organization_role_assignment_drift_reconciliation_applications"("idempotency_key")
```

Existing object at failure: PK backing index / constraint normalized to `organization_role_assignment_drift_reconciliation_applications_`.

---

## PostgreSQL identifier limit

| Field | Value |
|-------|-------|
| max_identifier_length | 63 |
| Migration-252 identifiers scanned | 7 |
| Overlength identifiers | 6 |
| Collision groups | 1 |
| Observed collision physical name | `organization_role_assignment_drift_reconciliation_applications_` |

---

## Collision root cause

Migration 252 creates a PRIMARY KEY constraint whose normalized identifier collides with subsequent UNIQUE INDEX, composite INDEX, and FOREIGN KEY constraint names after PostgreSQL byte-level truncation to 63 bytes.

| Check | Result |
|-------|--------|
| PK backing index collision | PASS |
| Explicit unique index collision at stmt 2 | PASS |
| Additional migration-252 collisions (would fail later) | 4 more identifiers in same normalized group |

---

## Historical Prisma/repository authority

| Field | Value |
|-------|-------|
| Introduction commit | `c3166e3efba83871ec4200a4f6ba37db3e2acbab` |
| Identifier names | PRISMA_GENERATED_NAME |
| Runtime depends on physical constraint names | False |

---

## Append-only feasibility

| Field | Value |
|-------|-------|
| Strategies tested | 3 |
| Unchanged migration 252 can be made safe append-only | NO |
| Decision | APPEND_ONLY_NOT_FEASIBLE |

---

## Temporary identifier-only corrected migration proof

| Field | Value |
|-------|-------|
| Candidate generated | PASS |
| Only names changed | PASS |
| Corrected migration executes | PASS |
| Catalog semantic parity | PASS |
| Semantic mismatch count | 0 |

---

## 252→HEAD collision sweep

| Field | Value |
|-------|-------|
| Range | 252 → HEAD |
| Migrations scanned | 54 |
| Additional identifier collision groups | 1 |
| UNRESOLVED | 0 |

Later collision example: `20260722250000_legal_document_retention_legal_hold` (`organization_legal_document_retention_policies_organization_id_key` vs `_fkey`).

---

## Final repair-mode decision

**HISTORICAL_MIGRATION_IDENTIFIER_ONLY_CORRECTION**

Allowed next-phase boundary: identifier name tokens only. Forbidden: table/column/type/default/semantics/data logic changes.

---

## Replay-harness evidence improvement

Statement ordinal capture helper added for migration-level failures (`ci_r3b1j_statement_failure_capture.py`).

---

## Immutability

| Check | Result |
|-------|--------|
| Existing migration SQL changed | 0 |
| New Prisma migration directories | 0 |
| Migration 252 changed | 0 |
| R3B1I repair changed | 0 |
| schema.prisma changed | NO |
| runtime changed | NO |

---

## Golden tests

| Result | True |

---

## Safety

- Production mutation: **NO**
- Full replay beyond 252: **NO**
- Deployment: **NO**
- Merge: **NO**
- R3B.2: **NO**

---

## Report ↔ machine consistency

Mismatch count: **0** (required 0)

---

## Final status

**CI_R3B1J_IDENTIFIER_COLLISION_AUTHORITY_COMPLETED**
