# CI-R3B1A — Historical replay blocker authority audit

**Phase:** CI-R3B1A (historical dependency authority; no repair implementation)  
**Prior status:** `CI_R3B021_FINAL_CONVERGENCE_COMPLETED`, `CI_R3B1_FRESH_REPLAY_PROOF_FAILED`  
**PR:** [#1031](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1031)  
**Outcome:** `CI_R3B1A_HISTORICAL_REPLAY_AUTHORITY_COMPLETED`

---

## 15.1 Baseline

| Field | Value |
|-------|-------|
| Branch | `fix/ci-r3b-vehicle-trips-migration-replay-2026-08` |
| `PRE_R3B1A_SHA` | `035508dad54531de1d1305fc2d15b030c2283cd8` |
| PR | #1031 (OPEN, Draft) |
| Working tree at audit start | clean |

Authority chain read:

- `docs/audits/ci-recovery/ci-r3a-vehicle-trips-migration-authority-audit-2026-08.md`
- `docs/audits/ci-recovery/ci-r3a8-u042-u043-decision-package-2026-08.md`
- `docs/audits/ci-recovery/ci-r3b-bootstrap-predecessor-shape-ledger-2026-08.md`
- `docs/audits/ci-recovery/ci-r3b-executable-contract-2026-08.md`
- `docs/audits/ci-recovery/ci-r3b1-fresh-replay-proof-2026-08.md`
- `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json`

Terminal convergence marker verified: **`CI_R3B021_FINAL_CONVERGENCE_COMPLETED`**.  
R3B.1 outcome preserved: **`CI_R3B1_FRESH_REPLAY_PROOF_FAILED`** (full replay never reached R3B target region).

---

## 15.2 First replay blocker

Reproduced read-only on disposable PostgreSQL 16.14 database `synqdrive_r3b1a_replay` via `npx prisma migrate deploy` (no manual DB patching).

| Field | Value |
|-------|-------|
| Migration | `20260412030000_platform_hardening_phase1` |
| SQLSTATE | `42P01` |
| Statement class | `ALTER TABLE "org_tasks" ADD COLUMN …` |
| Missing relation | `org_tasks` |
| Replay ordinal | **15** (of 287 migrations) |
| Successfully applied before failure | **14** |

Confirmed: no earlier migration failed; blocker unchanged from R3B.1 report.

---

## 15.3 org_tasks history

### A. First migration reference

Earliest committed migration referencing `"org_tasks"`:

| Migration | Operation |
|-----------|-----------|
| `20260412030000_platform_hardening_phase1` | `ALTER TABLE "org_tasks"` + index on `created_by_user_id` |

### B. First actual CREATE

```bash
rg 'CREATE TABLE.*"org_tasks"' backend/prisma/migrations
# (no matches)
```

**No historical CREATE TABLE for org_tasks found.**

### C. Prisma model origin

| Field | Value |
|-------|-------|
| First commit containing `model OrgTask` | `77c26dad` — *Initial commit - SynqDrive alpha monorepo* |
| Table mapping | `@@map("org_tasks")` |
| Initial columns (77c26dad) | `id`, `organization_id`, `title`, `description`, `category`, `status` (`TaskStatus`), `priority` (`TaskPriority`), `vehicle_id`, `fine_id`, `invoice_id`, `assigned_to`, `due_date`, `completed_at`, `created_at`, `updated_at` |
| PK | `id` TEXT |
| FKs (schema) | optional `fine_id` → `fines`, `invoice_id` → `org_invoices` (`ON DELETE SET NULL`) |
| Initial indexes | `organization_id`, `status`, `fine_id`, `invoice_id` |
| Enum dependencies | `TaskStatus`, `TaskPriority` |
| Platform-hardening sync commit (`17019787`) | schema already documents `created_by_user_id` / `updated_by_user_id`, but those columns are introduced by `20260412030000` at migration layer |

Evidence: `git show 77c26dad:backend/prisma/schema.prisma` (OrgTask block); `git show 17019787:backend/prisma/schema.prisma` (post-hardening fields in schema only).

### D. Expected predecessor shape (immediately before `20260412030000`)

Minimum table that must exist for the hardening migration to execute:

- Relation `"org_tasks"` present.
- Columns through `updated_at` per initial model; **`created_by_user_id` and `updated_by_user_id` must be absent** (added by the failing migration).
- Enums `TaskStatus`, `TaskPriority` available.
- FK constraints to `fines` / `org_invoices` are **not required** for `ALTER TABLE … ADD COLUMN` (nullable FK targets may be added later when invoice/fine tables exist).

---

## 15.4 Dependency audit summary

Static scan: init → `20260425000000_retire_user_assignment_and_speeding_severity` inclusive (**33 migrations**, **298** table-level dependency checks).

Machine-readable inventory: `docs/audits/ci-recovery/data/ci-r3b1a-migration-dependency-inventory-2026-08.json`

| Classification | Count |
|----------------|------:|
| Dependencies audited | 298 |
| VALID | 281 |
| INTENTIONAL | 5 |
| MISSING_HISTORY | 12 |
| ORDERING_DEFECT | 0 |
| CONDITIONAL_SAFE | 0 |
| FALSE_POSITIVE | 0 |
| **UNRESOLVED** | **0** |

**Unique missing-predecessor objects (6):**

| Object | First consumer | Notes |
|--------|----------------|-------|
| `org_tasks` | `20260412030000_platform_hardening_phase1` | first runtime blocker |
| `brake_health_current` | `20260413183000_brake_health_canonical_refactor` | latent after org_tasks repair |
| `battery_evidence` | `20260413220000_battery_evidence_unique_dedup` | late creator `20260614120300_battery_health_tables_guard` exists **after** consumer |
| `org_invoices` | `20260413230000_add_composite_indexes_batch_c` | latent |
| `vehicle_dtc_events` | `20260413230000_add_composite_indexes_batch_c` | latent |
| `vehicle_driving_impact_current` | `20260422010000_vehicle_current_safety_score` | latent before R3B pre-shim |

`org_tasks` is **the first reached** by PostgreSQL on zero-state replay; the other five are **latent** defects that would surface sequentially if only `org_tasks` were repaired.

### `20260412030000_platform_hardening_phase1` assumption inventory

| Object | Type | Operation | Assumed predecessor | Creator migration | Creator exists |
|--------|------|-----------|---------------------|-------------------|----------------|
| `refresh_tokens` | table | CREATE TABLE + indexes + FK | none (self-created) | same migration | YES (same file) |
| `users` | table | FK target | init | `20260311224040_init` | YES |
| `vehicle_data_source_links` | table | ADD CONSTRAINT FK | table + `vehicles` | `20260408120000_high_mobility_phase1` | YES |
| `vehicles` | table | FK target / ALTER ADD COLUMN | init | `20260311224040_init` | YES |
| `hm_signal_group_states` | table | ADD CONSTRAINT FK | table + `vehicles` | `20260409120000_hm_signal_group_state` | YES |
| **`org_tasks`** | **table** | **ALTER ADD COLUMN + index** | **table must exist** | **none** | **NO** |

Conclusion: **`org_tasks` is the only missing predecessor within this migration**, and it is the first missing object encountered on the replay path.

---

## 15.5 All genuine defects

### 1. `org_tasks`

| Field | Value |
|-------|-------|
| First failing consumer | `20260412030000_platform_hardening_phase1` |
| Historical expected shape | §15.3D (initial OrgTask columns; no audit columns) |
| Evidence | schema `77c26dad`; zero CREATE in migrations |
| Later evolution | hardening adds audit columns; task-domain v2 migrations from `20260614000100` onward |
| Data backfill | not required for replay (empty table) |
| Repair insertion point | append-only bootstrap **immediately before** `20260412030000_platform_hardening_phase1` |

### 2. `brake_health_current`

| Field | Value |
|-------|-------|
| First failing consumer | `20260413183000_brake_health_canonical_refactor` (`ALTER TABLE` adds canonical columns) |
| Historical expected shape | base brake health row store per schema at sync commit `17019787` **without** columns added in that migration (`state_class`, `anchor_validation_status`, …) |
| Evidence | model present in initial schema; no CREATE migration |
| Repair insertion point | before `20260413183000_brake_health_canonical_refactor` |

### 3. `battery_evidence`

| Field | Value |
|-------|-------|
| First failing consumer | `20260413220000_battery_evidence_unique_dedup` (`DELETE` + unique index) |
| Historical expected shape | minimal row store matching dedup key columns: `id`, `vehicle_id`, `scope`, `value_type`, `source_type`, `observed_at` (+ supporting enums) |
| Evidence | first migration use precedes `20260614120300_battery_health_tables_guard` CREATE |
| Repair insertion point | before `20260413220000_battery_evidence_unique_dedup` |

### 4. `org_invoices`

| Field | Value |
|-------|-------|
| First failing consumer | `20260413230000_add_composite_indexes_batch_c` |
| Historical expected shape | initial OrgInvoice model (`77c26dad`) |
| Evidence | model in initial schema; no CREATE migration |
| Repair insertion point | before `20260413230000_add_composite_indexes_batch_c` |

### 5. `vehicle_dtc_events`

| Field | Value |
|-------|-------|
| First failing consumer | `20260413230000_add_composite_indexes_batch_c` |
| Historical expected shape | initial VehicleDtcEvent model (`77c26dad`) incl. `DtcSeverity` enum |
| Evidence | model in initial schema; no CREATE migration |
| Repair insertion point | before `20260413230000_add_composite_indexes_batch_c` (may share bootstrap with `org_invoices`) |

### 6. `vehicle_driving_impact_current`

| Field | Value |
|-------|-------|
| First failing consumer | `20260422010000_vehicle_current_safety_score` |
| Historical expected shape | initial VehicleDrivingImpactCurrent model (`77c26dad`) without `safety_score` (added by consumer) |
| Evidence | model in initial schema; no CREATE migration |
| Repair insertion point | before `20260422010000_vehicle_current_safety_score` |

---

## 15.6 Recommended repair topology

**Outcome B** — multiple missing predecessor objects at different historical points. **Five** narrowly scoped append-only predecessor bootstrap migrations are required (not one combined “make everything exist” migration):

| # | Insert before | Objects | Rationale |
|---|---------------|---------|-----------|
| 1 | `20260412030000_platform_hardening_phase1` | `org_tasks` (+ `TaskStatus`, `TaskPriority`) | first runtime blocker |
| 2 | `20260413183000_brake_health_canonical_refactor` | `brake_health_current` | next latent defect |
| 3 | `20260413220000_battery_evidence_unique_dedup` | `battery_evidence` (+ required enums) | precedes dedup migration; supersedes late `20260614120300` ordering |
| 4 | `20260413230000_add_composite_indexes_batch_c` | `org_invoices`, `vehicle_dtc_events` (+ enums) | shared consumer migration |
| 5 | `20260422010000_vehicle_current_safety_score` | `vehicle_driving_impact_current` | last latent defect before R3B pre-shim slot |

**Not authorized in CI-R3B1A:** implementation of the above repairs.

R3B trip-repair chain (bootstrap / pre-shim / unchanged target / post-shim / reconciliation) remains separate and unchanged except for the pre-shim guard correction documented below.

---

## 15.7 New R3B guard audit

### Pre-shim (`20260424235959_ci_r3b_trip_casing_pre_shim`)

**Required prerequisite set (authority: ledger §4 vehicle_trips columns 5–7; decision package S1/S4/S6/S9):**

- `assignment_status`
- `assignment_subject_type`
- `assignment_subject_id`
- enum types `TripAssignmentStatus`, `TripAssignmentSubjectType`

**Guard before (defect):** `NOT EXISTS (… column_name IN ('assignment_status','assignment_subject_type'))` — satisfied when **any one** of two columns exists.

**Guard after (fixed):** exact-count check `COUNT(*) = 3` over all three required column names; fails if any single prerequisite is absent.

**Targeted disposable-DB validation (PRE-FC08 fragment only, not full replay):**

| Case | Result |
|------|--------|
| all three columns present | PASS |
| missing `assignment_subject_id` | FAIL (expected) |
| missing `assignment_status` | FAIL (expected) |
| only one column present | FAIL (expected) |

### Other new R3B migrations

| Migration | Guards audited | Defects |
|-----------|----------------|---------|
| `20260325161141_ci_r3b_bootstrap_trip_schema_baseline` | per-enum/table `IF NOT EXISTS`; FK guards | none |
| `20260425000001_ci_r3b_trip_casing_post_shim` | enum label set equality via `array_agg`; relation presence | none |
| `20260814130000_ci_r3b_post_replay_parity_reconciliation` | single-column `EXISTS` for `trip_status` | none (single-column check is correct) |

| Counter | Value |
|---------|------:|
| Known Pre-Shim guard defect | **FIXED** |
| Additional defective guards | **0** |

---

## 15.8 SHA evidence correction

R3B.1 evidence report updated (`ci-r3b1-fresh-replay-proof-2026-08.md`):

| Concept | Meaning |
|---------|---------|
| `PRE_R3B1_SHA` | `d5fbe427ebf2dcee94a85a86caf7bd6276c5e774` — immutable tree immediately before R3B.1 migration implementation |
| `REPLAY_TESTED_SHA` | `035508dad54531de1d1305fc2d15b030c2283cd8` — exact tree whose migration SQL was replay-tested |
| Post-push HEAD | verified externally in Cursor response; **not** embedded as self-referential invariant |

Removed stale self-referential `POST_R3B1_SHA` / remote / PR HEAD equality claims that predated subsequent evidence commits.

Failed replay status remains explicit; convergence gates are **not** marked passed.

---

## 15.9 Immutability and safety

| Check | Value |
|-------|-------|
| Target migration | `backend/prisma/migrations/20260425000000_retire_user_assignment_and_speeding_severity/migration.sql` |
| Authority SHA-256 | `1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974` |
| Current SHA-256 | `1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974` |
| `git diff d5fbe427 -- target` | no diff |
| Historical migrations modified | **NO** |
| Historical replay blocker repair implemented | **NO** |
| Production accessed | **NO** |
| Production data modified | **NO** |
| Deployment performed | **NO** |
| Merge performed | **NO** |

---

## Terminal status

**CI_R3B1A_HISTORICAL_REPLAY_AUTHORITY_COMPLETED**

Repair topology established; `UNRESOLVED = 0`. Awaiting independent review before historical predecessor repair implementation.
