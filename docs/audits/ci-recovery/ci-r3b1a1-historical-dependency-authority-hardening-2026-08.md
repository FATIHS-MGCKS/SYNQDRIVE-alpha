# CI-R3B1A.1 — Historical dependency authority hardening

**Phase:** CI-R3B1A.1 (authority/evidence hardening only — no repair implementation)  
**PR:** [#1031](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1031)  
**Outcome:** `CI_R3B1A1_HISTORICAL_DEPENDENCY_AUTHORITY_HARDENED`

> **Supersession (CI-R3B1A.2):** The R3B1A.1 analyzer output (619-row matrix and predecessor contracts in `ci-r3b1a1-*` artifacts) is **superseded** as static authority candidate due to semantic analyzer defects (Prisma types as PostgreSQL types, relation navigation fields as columns, truncated defaults, missing FK/unique authority, migration-level vs statement-level ordering). **Current authority candidate:** `ci-r3b1a2-*` artifacts and `ci-r3b1a2-analyzer-ddl-contract-remediation-2026-08.md`. Full R3B.1 fresh replay status remains **FAILED**.

---

## Baseline

| Field | Value |
|-------|-------|
| Branch | `fix/ci-r3b-vehicle-trips-migration-replay-2026-08` |
| `PRE_R3B1A1_SHA` | `a39b68a71cec8d0121fa4e59eae8594c4d9a3823` |
| PR | #1031 (OPEN, Draft) |

Prior statuses preserved: `CI_R3B021_FINAL_CONVERGENCE_COMPLETED`, `CI_R3B1_FRESH_REPLAY_PROOF_FAILED`.

---

## Scan scope

| Field | Value |
|-------|-------|
| First migration scanned | `20260311224040_init` |
| Last migration scanned | `20260425000000_retire_user_assignment_and_speeding_severity` |
| Migrations scanned | **34** |
| Dependency checks generated | **619** |

Audit dimensions: tables, columns, enums/types, constraints (FK/REFERENCES), indexes, renames, DELETE/UPDATE targets.  
Generator: `docs/audits/ci-recovery/tooling/ci_r3b1a1_build_dependency_matrix.py`  
Validator: `docs/audits/ci-recovery/tooling/ci_r3b1a1_validate_artifacts.py`

Full matrix: `docs/audits/ci-recovery/data/ci-r3b1a1-full-migration-dependency-matrix-2026-08.json`

---

## Classification totals (derived from matrix)

| Classification | Count |
|----------------|------:|
| **TOTAL** | **619** |
| VALID | 527 |
| INTENTIONAL | 53 |
| MISSING_HISTORY | 32 |
| ORDERING_DEFECT | 7 |
| CONDITIONAL_SAFE | 0 |
| FALSE_POSITIVE | 0 |
| **UNRESOLVED** | **0** |

`sum(classifications) = 619` — mechanically verified by validator.

---

## Classification correction

### `battery_evidence` (mandatory fix)

| Field | Value |
|-------|-------|
| First consumer | `20260413220000_battery_evidence_unique_dedup` (order **18**) |
| Creator migration | `20260614120300_battery_health_tables_guard` (order **52**) |
| Previous R3B1A classification | `MISSING_HISTORY` (**incorrect**) |
| Correct classification | **`ORDERING_DEFECT`** |
| Evidence | matrix rows `018-00480` (DELETE) and index/column rows — all 7 checks |

Creator exists but executes **later** than first consumer.

---

## Genuine defect object comparison

| | Objects |
|---|---------|
| Previous suspected (R3B1A) | org_tasks, brake_health_current, battery_evidence, org_invoices, vehicle_dtc_events, vehicle_driving_impact_current |
| New audited unique defects | **7** (see below) |
| **Added** | `InsightType` |
| **Removed** | none |
| **Reclassified** | `battery_evidence`: MISSING_HISTORY → **ORDERING_DEFECT** |

### Unique genuine historical defect objects

| Object | Type | Classification | First consumer | Creator |
|--------|------|----------------|----------------|---------|
| `org_tasks` | table | MISSING_HISTORY | `20260412030000_platform_hardening_phase1` | none |
| `brake_health_current` | table | MISSING_HISTORY | `20260413183000_brake_health_canonical_refactor` | none |
| `battery_evidence` | table | **ORDERING_DEFECT** | `20260413220000_battery_evidence_unique_dedup` | `20260614120300_battery_health_tables_guard` |
| `org_invoices` | table | MISSING_HISTORY | `20260413230000_add_composite_indexes_batch_c` | none |
| `vehicle_dtc_events` | table | MISSING_HISTORY | `20260413230000_add_composite_indexes_batch_c` | none |
| `InsightType` | enum | MISSING_HISTORY | `20260417180000_add_battery_critical_insight_type` | none |
| `vehicle_driving_impact_current` | table | MISSING_HISTORY | `20260422010000_vehicle_current_safety_score` | none |

`org_tasks` remains the **first runtime blocker** on zero-state replay (order 15). Others are **latent** until reached sequentially.

---

## Exact predecessor contracts

Machine-readable authority: `docs/audits/ci-recovery/data/ci-r3b1a1-predecessor-ddl-contracts-2026-08.json`

Each contract includes: columns/types/nullability/defaults, PK, enum dependencies, required pre-existing indexes, **`not_present_yet`** exclusions, and repair insertion boundaries.

### Special review — `org_tasks`

| Field | Value |
|-------|-------|
| First consumer | `20260412030000_platform_hardening_phase1` |
| First model commit | `77c26dad` |
| Historical authority | `77c26dad:backend/prisma/schema.prisma` (`model OrgTask`) |
| Required columns before consumer | 17 columns (see contract JSON) |
| Consumer itself adds | `created_by_user_id`, `updated_by_user_id`, index `org_tasks_created_by_user_id_idx` |
| **NOT PRESENT YET** (mandatory) | audit columns + index listed in contract `not_present_yet` |

Future bootstrap must **not** pre-create objects the consumer migration is responsible for.

### Special review — `battery_evidence`

| Field | Value |
|-------|-------|
| First consumer | `20260413220000_battery_evidence_unique_dedup` |
| Creator migration | `20260614120300_battery_health_tables_guard` |
| Consumer order | 18 |
| Creator order | 52 |
| Classification | **ORDERING_DEFECT** |
| Predecessor authority | `17019787` (`model BatteryEvidence` first appears) |
| **NOT PRESENT YET** | unique index `battery_evidence_dedup_key` (created by consumer) |

Predecessor shape is reconstructed from historical model at `17019787`, **not** copied wholesale from the late creator migration.

### Special review — `InsightType` (new defect)

| Field | Value |
|-------|-------|
| First consumer | `20260417180000_add_battery_critical_insight_type` |
| Prisma enum at `77c26dad` | `TIGHT_HANDOVER`, `RETURN_NEEDS_INSPECTION`, `STATION_SHORTAGE`, `LOW_UTILIZATION`, `SERVICE_WINDOW`, `SERVICE_BEFORE_BOOKING` |
| **NOT PRESENT YET** | label `BATTERY_CRITICAL` (added by first consumer) |
| No `CREATE TYPE "InsightType"` | anywhere in migration history |

---

## Final repair topology (validated against matrix — not implemented)

Previous five-migration hypothesis **superseded**. Validated topology:

| Repair # | Execute after | Execute before | Objects | Grouping reason |
|----------|---------------|----------------|---------|-----------------|
| 1 | `20260412020000_hm_latest_state_tables` | `20260412030000_platform_hardening_phase1` | `org_tasks` (+ `TaskStatus`, `TaskPriority`) | first runtime blocker |
| 2 | `20260412040000_audit_consent_provenance` | `20260413183000_brake_health_canonical_refactor` | `brake_health_current` | next latent table defect |
| 3 | `20260413183000_brake_health_canonical_refactor` | `20260413220000_battery_evidence_unique_dedup` | `battery_evidence` (+ enums) | ORDERING_DEFECT — must precede dedup migration |
| 4 | `20260413220000_battery_evidence_unique_dedup` | `20260413230000_add_composite_indexes_batch_c` | `org_invoices`, `vehicle_dtc_events` (+ enums) | shared consumer migration |
| 5 | `20260417160000_add_mqtt_only_hm_sync_status` | `20260417180000_add_battery_critical_insight_type` | `InsightType` enum | new enum defect — separate boundary |
| 6 | `20260421120000_add_pickup_overdue_insight_type` | `20260422010000_vehicle_current_safety_score` | `vehicle_driving_impact_current` | last latent defect before R3B pre-shim |

**Repair migration count: 6** (append-only; **not created in this phase**).

---

## Evidence files

| File | Purpose |
|------|---------|
| `data/ci-r3b1a1-full-migration-dependency-matrix-2026-08.json` | 619-row complete dependency matrix |
| `data/ci-r3b1a1-predecessor-ddl-contracts-2026-08.json` | 7 structured DDL contracts |
| `tooling/ci_r3b1a1_build_dependency_matrix.py` | matrix generator |
| `tooling/ci_r3b1a1_validate_artifacts.py` | validator (`UNRESOLVED = 0` gate) |
| `data/ci-r3b1a-migration-dependency-inventory-2026-08.json` | **superseded** (partial summary only) |

---

## Immutability

| Check | Result |
|-------|--------|
| Historical migrations modified | **NO** |
| Existing R3B migration SQL modified (this phase) | **NO** |
| `schema.prisma` modified | **NO** |
| Historical target hash unchanged | **YES** — `1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974` |

R3B migration SQL SHA-256 at PRE_R3B1A1_SHA (unchanged this phase):

| Migration | SHA-256 |
|-----------|---------|
| bootstrap | `0b41ce77…` |
| pre-shim | `45aa0370…` |
| post-shim | `aef68c22…` |
| reconciliation | `90c3288f…` |

---

## Runtime status

| Check | Value |
|-------|-------|
| Full fresh replay rerun in R3B1A.1 | **NO** |
| Previous R3B.1 replay status | **FAILED** |
| R3B target/pre/post/reconciliation runtime proven | **NOT RUNTIME PROVEN** |
| 19-object convergence | **NOT RUNTIME PROVEN** |

Static audit and runtime proof remain explicitly separated.

---

## Safety

| Statement | Value |
|-----------|-------|
| Production DB accessed | **NO** |
| Production data modified | **NO** |
| Deployment performed | **NO** |
| Merge performed | **NO** |
| Repair migrations implemented | **NO** |

---

## Terminal status

**CI_R3B1A1_HISTORICAL_DEPENDENCY_AUTHORITY_HARDENED**

Awaiting independent review before historical predecessor repair implementation.
