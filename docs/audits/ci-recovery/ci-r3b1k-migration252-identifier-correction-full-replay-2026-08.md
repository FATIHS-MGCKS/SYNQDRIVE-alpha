# CI-R3B1K — Migration 252 Identifier Correction & Full Replay

**Phase:** R3B1K  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Branch:** `fix/ci-r3b1k-migration252-identifier-correction-2026-08`  
**Status:** `CI_R3B1K_MIGRATION252_IDENTIFIER_CORRECTION_FULL_REPLAY_COMPLETED`

---

## Baseline

| Field | Value |
|-------|-------|
| BASE_R3B1J1_SHA | `b9ca9b0fb2431ec42004e2b14c1ae52fc78a0c74` |
| evidence_input_sha | `b9ca9b0fb2431ec42004e2b14c1ae52fc78a0c74` |
| IMPLEMENTATION_AUTHORITY_SHA256 | `a2e8e728268bbd7d896a629787d8b207973f2e21182416d618145d08e8a64416` |
| Production exposure | **E_UNKNOWN** |

---

## Historical exception authority

| Field | Value |
|-------|-------|
| Repair mode | `HISTORICAL_MIGRATION_IDENTIFIER_ONLY_CORRECTION` |
| Append-only feasibility | `APPEND_ONLY_NOT_FEASIBLE` |
| Reason | `POSTGRESQL_IDENTIFIER_COLLISION_REPRODUCIBILITY_CORRECTION` |
| Approved identifier mappings | 5 |

---

## Original vs corrected migration 252

| Field | Value |
|-------|-------|
| Migration | `20260721270000_iam_role_assignment_drift_reconciliation` |
| Original SHA-256 | `12bf2015a256fdd898365019335b586d9d67c9f9722a5ae3f69937a5be7ba6d9` |
| Corrected SHA-256 | `415f741ebf6d810c10e4d1524bc2d4bda79d557f0f2a6d3594ec43c49338adee` |
| Original bytes | 1647 |
| Original lines | 32 |
| Statement count | 5 |

---

## Five token changes

| Historical | Corrected |
|------------|-----------|
| `organization_role_assignment_drift_reconciliation_applications_pkey` | `org_role_asgn_drift_recon_apps_pkey` |
| `organization_role_assignment_drift_reconciliation_applications_idempotency_key_key` | `org_role_asgn_drift_recon_apps_idem_key` |
| `organization_role_assignment_drift_reconciliation_applications_organization_id_membership_id_created_at_idx` | `org_role_asgn_drift_recon_apps_org_mbr_created_idx` |
| `organization_role_assignment_drift_reconciliation_applications_organization_id_fkey` | `org_role_asgn_drift_recon_apps_org_id_fkey` |
| `organization_role_assignment_drift_reconciliation_applications_membership_id_fkey` | `org_role_asgn_drift_recon_apps_mbr_id_fkey` |

| Gate | Result |
|------|--------|
| Changed tokens | 5 |
| Approved changed tokens | 5 |
| Unapproved token changes | 0 |
| Statement count unchanged | YES |

---

## Targeted PostgreSQL proof

| Check | Result |
|-------|--------|
| Fresh pre-252 DB | PASS |
| Table absent before M252 | PASS |
| Corrected actual migration | PASS |
| Manual interventions | 0 |

### Statement results

| Statement | Result |
|-----------|--------|
| 1 | PASS |
| 2 | PASS |
| 3 | PASS |
| 4 | PASS |
| 5 | PASS |

---

## Strict semantic parity

| Check | Result |
|-------|--------|
| Column types (exact format_type) | PASS |
| Nullability | PASS |
| Defaults | PASS |
| PK / UNIQUE / INDEX / FK | PASS |
| CHECK constraints | PASS |
| No truncated collision names | PASS |
| Total semantic mismatches | 0 |

---

## Full zero-state replay

| Field | Value |
|-------|-------|
| PostgreSQL version | 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1) |
| Database | `synqdrive_r3b1k_full_replay` |
| Migration directories | 305 |
| Normal migrations applied | 305 |
| Special migrations | 1 |
| Failed migrations | 0 |
| Manual interventions | 0 |
| Reached absolute HEAD | YES |
| R3B1G repair | PASS |
| R3B1I repair | PASS |
| Migration 249 | PASS |
| Migration 252 corrected | PASS |

---

## Final convergence

| Gate | Result |
|------|--------|
| 19/19 objects | 19/19 |
| 9/9 tables | 9/9 |
| 10/10 enums | 10/10 |
| 54/54 properties | 37/37 |
| R3B parity pass | True |

---

## Historical immutability exception

| Field | Value |
|-------|-------|
| Changed historical migrations | 1 |
| Changed migration | migration 252 only |
| Unchanged migration count | 304 |
| schema.prisma changed | False |
| runtime changed | False |

---

## Remaining migration immutability

All migrations except `20260721270000_iam_role_assignment_drift_reconciliation` retain baseline SHA-256 from R3B1J.1.

---

## Exposure

| Field | Value |
|-------|-------|
| Production mutation | NO |
| Production migration | NO |
| Deployment | NO |
| Merge | NO |
| R3B.2 | NO |

---

## Safety

This phase applies a documented historical exception to migration 252 only. No production action authorized.

---

## Report ↔ machine consistency

Report mismatch count: **0** (required: 0)
