# CI-R3B1C — Composite index transaction replay resolution

**Phase:** CI-R3B1C  
**PR:** [#1031](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1031)  
**Outcome:** `CI_R3B1C_COMPOSITE_INDEX_REPLAY_RESOLUTION_PARTIAL` — composite-index special replay path proven; full head replay blocked by unrelated historical defect

---

## Baseline

| Field | Value |
|-------|-------|
| Branch | `fix/ci-r3b-vehicle-trips-migration-replay-2026-08` |
| `PRE_R3B1C_SHA` | `30e77a49141d15ad035b675973e584f836aef29d` |
| PR | #1031 |

R3B1B state confirmed: six repair migrations present, insertion boundaries valid, historical target unchanged, prior full replay failed at `20260413230000_add_composite_indexes_batch_c`.

---

## Original blocker

| Field | Value |
|-------|-------|
| Migration | `20260413230000_add_composite_indexes_batch_c` |
| SQLSTATE | `25001` |
| Error | `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` |
| Statement pattern | 14 × `CREATE INDEX CONCURRENTLY IF NOT EXISTS …` |

Historical migration SQL **unchanged**.

---

## Transaction-sensitive audit

| Metric | Value |
|--------|-------|
| Migrations scanned | **293** |
| Transaction-sensitive statement records | **158** (includes guarded `DO $$` blocks classified **SAFE**) |
| `SPECIAL_EXECUTION_REQUIRED` migrations | **1** (`20260413230000_add_composite_indexes_batch_c`) |
| UNRESOLVED | **0** |

Artifact: `docs/audits/ci-recovery/data/ci-r3b1c-transaction-sensitive-migration-inventory-2026-08.json`

---

## Selected replay strategy

**Strategy B — deterministic special executor + migration-state reconciliation**

Prisma `migrate deploy` (v5.20.x) wraps each migration in a transaction (empirically proven on disposable DB). The composite-index migration cannot execute normally. Authorized path:

1. Normal deploy until failure at composite migration  
2. Checksum-bound special executor parses SQL from immutable `migration.sql`  
3. Execute each `CREATE INDEX CONCURRENTLY` via non-transactional `psql`  
4. Validate all 14 indexes in PostgreSQL catalogs  
5. `prisma migrate resolve --applied 20260413230000_add_composite_indexes_batch_c`  
6. Resume normal deploy  

Harness: `docs/audits/ci-recovery/tooling/ci_r3b1c_full_replay_harness.py`

---

## Special migration authority

| Field | Value |
|-------|-------|
| Migration | `20260413230000_add_composite_indexes_batch_c` |
| SHA-256 | `315ea75619f33af2d3cdd4e61744aa916e461232bcc203738f1eae9c1fae4496` |
| Special executor | `ci_r3b1c_special_composite_index.SpecialCompositeIndexExecutor` |
| Statement count | **14** |
| Script equivalence (`apply-composite-indexes.ts`) | **PASS** (missing=0, unexpected=0) |
| State reconciliation | `prisma migrate resolve --applied` after index validation |

Artifact: `docs/audits/ci-recovery/data/ci-r3b1c-special-replay-authority-2026-08.json`

---

## Evidence-tool fixes (R3B1B hardening)

Shared library: `docs/audits/ci-recovery/tooling/replay_evidence_lib.py`

| Fix | Status |
|-----|--------|
| Enum vs table vs sequence catalog queries | **FIXED** |
| `PASS` / `FAIL` / `NOT_REACHED` semantics | **FIXED** |
| `REPLAY_TESTED_TREE_SHA` + `REPLAY_INPUT_MANIFEST_SHA256` | **FIXED** |
| Deferred-FK parsing from `records[]` / `resolution_slot` | **FIXED** |
| Topology-derived slot object lists | **FIXED** |
| Dynamic failure / SQLSTATE / classification | **FIXED** |

Golden tests: `docs/audits/ci-recovery/tooling/ci_r3b1c_golden_tests.py` (**PASS**)

---

## Targeted special proof

Disposable DB replayed normally to composite migration failure → special executor → resolve → resume: **PASS**

Composite index runtime proof: **PASS** (14/14 indexes valid, 0 mismatches)

Artifact: `docs/audits/ci-recovery/data/ci-r3b1c-composite-index-runtime-proof-2026-08.json`

---

## Full replay

| Metric | Value |
|--------|-------|
| PostgreSQL | 16.14 |
| Database | `synqdrive_r3b1c_replay` (fresh disposable) |
| Migration directories | **293** |
| Normal migrations applied (before new blocker) | **48** |
| Special migrations handled | **1** |
| Migration-state reconciliations | **1** (automated, validated) |
| Manual operator DB interventions | **0** |
| Reached current HEAD | **NO** |

**New first blocker (after composite-index resolution):**

| Field | Value |
|-------|-------|
| Migration | `20260613210000_vendor_management_overhaul` |
| Ordinal | **49** |
| SQLSTATE | `42704` |
| Error | `type "VendorCategory" does not exist` |
| Classification | unrelated historical defect (not authorized in R3B1C audit) |

Artifact: `docs/audits/ci-recovery/data/ci-r3b1c-full-fresh-replay-result-2026-08.json`

---

## Six R3B1B repair slots (full replay runtime)

All six repair migrations: **PASS** (including enum types via corrected catalog queries).

High-risk objects (full replay path): **PASS** for org_tasks, brake_health_current, battery_evidence, vehicle_document_extractions, org_invoices, vehicle_dtc_events, vehicle_driving_impact_current, InsightType.

---

## Composite indexes (final partial-replay DB)

| Metric | Value |
|--------|-------|
| Expected | **14** |
| Valid | **14** |
| Missing | **0** |
| Definition mismatches | **0** |

---

## R3B parity

**NOT RUN** — replay did not reach current HEAD / reconciliation migration.

---

## Immutability

| Check | Result |
|-------|--------|
| Six R3B1B repair migrations modified | **NO** |
| Historical migration SQL modified | **NO** |
| Earlier R3B migration SQL modified | **NO** |
| `schema.prisma` modified | **NO** |
| Target migration hash unchanged | **YES** |

---

## Safety

| Check | Value |
|-------|-------|
| Production accessed | **NO** |
| Production modified | **NO** |
| Deployment | **NO** |
| Merge | **NO** |
| R3B.2 started | **NO** |

---

## Next authorized action

1. Independent review of special replay harness + authority artifacts.  
2. Separate CI-recovery phase for `VendorCategory` / vendor-management historical predecessor (not in R3B1C scope).  
3. Do **not** edit `20260413230000_add_composite_indexes_batch_c` — Strategy B is sufficient.

**Hard stop:** Do not start R3B.2. Do not merge PR #1031. Do not deploy.
