# CI-R3B1A.2 — Analyzer & exact DDL contract remediation

**Phase:** CI-R3B1A.2 (analyzer/validator/evidence remediation only — no repair implementation)  
**PR:** [#1031](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1031)  
**Branch:** `fix/ci-r3b-vehicle-trips-migration-replay-2026-08`

---

## Baseline

| Field | Value |
|-------|-------|
| Branch | `fix/ci-r3b-vehicle-trips-migration-replay-2026-08` |
| `PRE_R3B1A2_SHA` | `37bc4c9cd163f98f3ecbfbd92ddf25616e3cd107` |
| PR | #1031 (OPEN, Draft) |
| Working tree at start | clean |

Prior statuses preserved: `CI_R3B021_FINAL_CONVERGENCE_COMPLETED`, `CI_R3B1_FRESH_REPLAY_PROOF_FAILED`.

---

## Analyzer defects reproduced (pre-remediation)

Confirmed in `ci-r3b1a1-predecessor-ddl-contracts-2026-08.json` before remediation:

| Defect class | Examples found |
|--------------|----------------|
| Prisma scalar types as `postgres_type` | `"String"`, `"DateTime"`, `"String?"`, `TaskStatus`, `Fine?`, `Vehicle?` |
| Truncated defaults | `uuid(`, `now(`, `autoincrement(` via broken `@default\(([^)]+)\)` regex |
| Relation navigation fields as columns | `fine`, `invoice` on `org_tasks`; `vehicle`, `documentExtraction`, `serviceEvent` on `battery_evidence` |
| Missing FK authority | `org_tasks.foreign_keys: []` despite `@relation(fields: [fineId/invoiceId])` |
| Missing unique authority | `org_invoices.invoice_number` `@unique` not represented |
| Migration-level (not statement-level) ordering | entire migration treated as atomic unit |
| Validator shape-only | JSON counters reconciled but no semantic PostgreSQL gate |

---

## Tooling changes

| Module | Purpose |
|--------|---------|
| `tooling/prisma_schema_authority.py` | Physical PostgreSQL type mapping; separate `prisma_type` / `postgres_type`; balanced-paren defaults; `@map` resolution; navigation-field exclusion; FK/unique/PK extraction |
| `tooling/sql_migration_analyzer.py` | Statement-level SQL splitting (dollar quotes + line comments); per-statement schema state; creator pre-scan across all migrations; enum/table/column/index/constraint dependency checks |
| `tooling/ci_r3b1a2_build_dependency_matrix.py` | Regenerates matrix + exact predecessor contracts + repair topology candidate |
| `tooling/ci_r3b1a2_validate_artifacts.py` | Semantic authority validator (physical types, defaults, navigation exclusion, FK/unique gates) |
| `tooling/ci_r3b1a2_golden_tests.py` | Deterministic fixture tests |

Key remediation behaviors:

- **Physical type resolution:** `String`→`TEXT`, `DateTime`→`TIMESTAMP(3) WITHOUT TIME ZONE`, enums→`"EnumName"`, `@db.*` honored
- **Relation-field filtering:** navigation `@relation` fields excluded from `columns[]`; scalar FK columns retained
- **Default parsing:** complete `uuid()`, `now()`, `autoincrement()`, enum literals
- **FK extraction:** `fine_id→fines.id`, `invoice_id→org_invoices.id`, `vehicle_id→vehicles.id`, battery evidence FK triple
- **Unique extraction:** `org_invoices.invoice_number` `@unique`
- **Statement ordering:** SQL split on `;` outside dollar quotes; state advances per statement
- **Creator authority:** post-scope creators (e.g. `battery_evidence` at `20260614120300_*`) detected via full-repo pre-scan
- **UNRESOLVED gate:** corrected analyzer yields `UNRESOLVED = 0`

Supersession relationship:

- **R3B1A.1 initial analyzer output** → superseded (`ci-r3b1a1-*` artifacts retained for audit trail)
- **R3B1A.2 corrected analyzer output** → current static authority candidate (`ci-r3b1a2-*`)

---

## Golden tests

| Test | Result |
|------|--------|
| Type mapping (`String`, `DateTime`, `Json`, `Int`) | PASS |
| `@map` resolution (`vehicleId`→`vehicle_id`) | PASS |
| Relation exclusion (`OrgTask.fine/invoice`) | PASS |
| FK extraction (`BatteryEvidence`→`vehicles`) | PASS |
| Unique extraction (`OrgInvoice.invoice_number`) | PASS |
| Default parsing (`uuid()`, `now()`, `autoincrement()`) | PASS |
| Enum dependency (use before `CREATE TYPE`) | PASS |
| Statement order use-before-create | PASS |
| Statement order create-before-use | PASS |
| Missing-column detection | PASS |

Command: `python3 docs/audits/ci-recovery/tooling/ci_r3b1a2_golden_tests.py` → exit **0**

---

## Corrected scan scope

| Field | Value |
|-------|-------|
| First migration | `20260311224040_init` |
| Last migration | `20260425000000_retire_user_assignment_and_speeding_severity` |
| Migrations scanned | **34** |
| Dependency records | **626** |

Artifacts:

- `data/ci-r3b1a2-full-migration-dependency-matrix-2026-08.json`
- `data/ci-r3b1a2-predecessor-ddl-contracts-2026-08.json`

---

## Corrected classification totals

| Classification | R3B1A.1 (superseded) | R3B1A.2 (corrected) |
|----------------|---------------------:|--------------------:|
| **TOTAL** | 619 | **626** |
| VALID | 527 | 556 |
| INTENTIONAL | 53 | 35 |
| MISSING_HISTORY | 32 | 28 |
| ORDERING_DEFECT | 7 | 7 |
| CONDITIONAL_SAFE | 0 | 0 |
| FALSE_POSITIVE | 0 | 0 |
| **UNRESOLVED** | 0 | **0** |

`sum(classifications) = 626` — verified by validator.

---

## Defect objects

| | Set |
|---|-----|
| Previous (R3B1A.1) | org_tasks, brake_health_current, battery_evidence, org_invoices, vehicle_dtc_events, vehicle_driving_impact_current, InsightType |
| New (R3B1A.2) | **same 7 objects** |
| Added | none |
| Removed | none |
| Reclassified | none (battery_evidence remains **ORDERING_DEFECT** with statement-level evidence) |

Unique genuine defect objects (7):

1. `org_tasks` — MISSING_HISTORY  
2. `brake_health_current` — MISSING_HISTORY  
3. `battery_evidence` — ORDERING_DEFECT (creator `20260614120300_battery_health_tables_guard` after consumer `20260413220000_battery_evidence_unique_dedup`)  
4. `org_invoices` — MISSING_HISTORY  
5. `vehicle_dtc_events` — MISSING_HISTORY  
6. `InsightType` — MISSING_HISTORY  
7. `vehicle_driving_impact_current` — MISSING_HISTORY  

---

## Exact contracts

Machine-readable authority: `data/ci-r3b1a2-predecessor-ddl-contracts-2026-08.json`

Contract schema uses separate `prisma_type` / `postgres_type`, structured defaults, physical FK records, and `not_present_yet` exclusions.

---

## Manual high-risk verification

| Object | Columns | Physical types | @map | FKs | Uniques | Enum deps | not-present-yet | Result |
|--------|---------|----------------|------|-----|---------|-----------|-----------------|--------|
| `org_tasks` | 15 scalar cols; no `fine`/`invoice` nav cols | TEXT/TIMESTAMP(3)/enum types | yes | fine_id→fines.id; invoice_id→org_invoices.id SET NULL | n/a at 77c26dad | TaskStatus, TaskPriority | created_by/updated_by cols | **PASS** |
| `battery_evidence` | 15 scalar cols; no nav cols | TEXT/FLOAT/JSONB/enums | yes | vehicle/docExt/serviceEvent FKs | n/a pre-dedup | 3 battery enums | dedup index excluded | **PASS** |
| `org_invoices` | 25 cols incl. invoice_number | INTEGER autoincrement semantics | yes | n/a at authority point | invoice_number unique | OrgInvoiceType/Status | composite index excluded | **PASS** |
| `vehicle_dtc_events` | 12 cols | physical types | yes | vehicle_id→vehicles.id | n/a | DtcSeverity | composite indexes excluded | **PASS** |
| `InsightType` | enum-only | `"InsightType"` labels | n/a | n/a | n/a | self | BATTERY_CRITICAL label excluded | **PASS** |

Evidence commits: `77c26dad` (most objects), `17019787` (`battery_evidence`).

---

## Final repair topology (candidate — not implemented)

| Slot | After | Before | Objects |
|------|-------|--------|---------|
| 1 | `20260412020000_hm_latest_state_tables` | `20260412030000_platform_hardening_phase1` | org_tasks |
| 2 | `20260412040000_audit_consent_provenance` | `20260413183000_brake_health_canonical_refactor` | brake_health_current |
| 3 | `20260413183000_brake_health_canonical_refactor` | `20260413220000_battery_evidence_unique_dedup` | battery_evidence |
| 4 | `20260413220000_battery_evidence_unique_dedup` | `20260413230000_add_composite_indexes_batch_c` | org_invoices, vehicle_dtc_events |
| 5 | `20260417160000_add_mqtt_only_hm_sync_status` | `20260417180000_add_battery_critical_insight_type` | InsightType |
| 6 | `20260421120000_add_pickup_overdue_insight_type` | `20260422010000_vehicle_current_safety_score` | vehicle_driving_impact_current |

**Repair migration count: 6** (append-only candidate; **not created in this phase**).

---

## Validation commands

| Command | Exit code |
|---------|----------:|
| `python3 docs/audits/ci-recovery/tooling/ci_r3b1a2_build_dependency_matrix.py` | 0 |
| `python3 docs/audits/ci-recovery/tooling/ci_r3b1a2_validate_artifacts.py` | 0 |
| `python3 docs/audits/ci-recovery/tooling/ci_r3b1a2_golden_tests.py` | 0 |
| `python3 -m json.tool docs/audits/ci-recovery/data/ci-r3b1a2-full-migration-dependency-matrix-2026-08.json` | 0 |
| `python3 -m json.tool docs/audits/ci-recovery/data/ci-r3b1a2-predecessor-ddl-contracts-2026-08.json` | 0 |

---

## Immutability

| Check | Result |
|-------|--------|
| Historical migration SQL modified | **NO** |
| Existing R3B migration SQL modified | **NO** |
| `schema.prisma` modified | **NO** |
| Historical target hash unchanged | **YES** — `1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974` |

---

## Runtime state

| Check | Value |
|-------|-------|
| Full fresh replay performed in R3B1A.2 | **NO** |
| Last full replay status | **FAILED** (`org_tasks` missing at `20260412030000_platform_hardening_phase1`) |

---

## Safety

| Statement | Value |
|-----------|-------|
| Production accessed | **NO** |
| Production modified | **NO** |
| Deployment | **NO** |
| Merge | **NO** |
| Repair migration created | **NO** |

---

## Terminal status

**CI_R3B1A2_ANALYZER_DDL_AUTHORITY_REMEDIATED**

Awaiting independent review before historical predecessor repair implementation (R3B.2 not started).

**Changes / Architektur updated:** NO (audit-only scope; no application architecture change)
