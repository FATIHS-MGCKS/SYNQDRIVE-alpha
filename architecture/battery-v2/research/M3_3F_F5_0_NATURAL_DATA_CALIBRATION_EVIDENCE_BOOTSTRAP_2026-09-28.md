# M3.3F F5.0 — Natural-data calibration evidence bootstrap (read-only **PASS**)

**Date:** 2026-09-28  
**Governance `origin/main` @ evidence authoring:** `7653cf2b8b70d7062857ca41c1147ff954678e1c` (includes merged PR #1831 / F4.6 forensics)  
**Authoritative accepted Battery runtime (longitudinal acceptance):** `7f5f8fdf2d158c59e19323efee979aee1a0757e0` / `20260928095512_v4994`  
**Live root-PM2 process release @ analysis:** `20260928175908_v4994` / git `6952fdf727f236ac7b338e14b85d54af6733fa0f` (both replicas; **not** re-baselined in this task)  
**Analysis window anchor:** **`F4_6_T0=2026-09-28T17:31:48.494Z`** · **`F_D3_T0=2026-09-28T09:18:31.393Z`** (unchanged)

## Executive summary

**F5.0** performed **read-only** production scientific inventory + **offline** D4 → E1 → E3 (`M3_3E_CALIBRATION_UNSET_V1`) descriptive analysis on naturally materialized D3 revisions while **D3 sustained shadow remains ON**. No numeric calibration thresholds were set. Customer Battery Health remains **unavailable**; E3 runtime remains **OFF**.

| Result | Value |
|--------|-------|
| `F5_DATA_PIPELINE_RESULT` | **PASS** |
| `F5_CALIBRATION_MATURITY` | **DISTRIBUTIONS_EMERGING** (early fleet; not repeatability-ready) |
| `D3_SUSTAINED_SHADOW_ACTIVE` | **YES** (unchanged) |
| `E3_RUNTIME_ACTIVATED` | **NO** |

## Read-only production analysis guarantees

| Field | Value |
|-------|-------|
| `PRODUCTION_DB_ANALYSIS_MODE` | **READ_ONLY** |
| `DEFAULT_TRANSACTION_READ_ONLY` | **ON** (verified via explicit `BEGIN READ ONLY` PostgreSQL session before inventory cross-check) |
| Production DB writes | **None** |
| `E3_RUNTIME_CALLS` | **0** |
| `E3_PERSISTENCE_WRITES` | **0** |
| `CUSTOMER_EFFECT` | **NO** |

Ephemeral VPS runner: `/tmp/f50-natural-calibration-bootstrap.ts` → `/tmp/f50-result.json` (not committed). Uses `LongitudinalIntegrityInspectionService` **outside** Nest production runtime.

## Runtime posture @ analysis (~`2026-09-28T20:22Z`)

| Field | Value |
|-------|-------|
| `D3_EFFECTIVE_A/B` | **ON** (`BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED=true`) |
| `BATCH_SIZE_EFFECTIVE` | **1** |
| `RECONCILIATION_INTERVAL_MS` | **900000** |
| `E3_RUNTIME_REACHABLE` | **NO** (no production E3 persistence / customer publication path) |

## Inventory (Postgres read-only)

| Field | Value |
|-------|-------|
| `C3_ROWS_TOTAL` | **54** |
| `C3_ROWS_POST_F_C3_T0` | **54** (`F_C3_T0=2026-09-26T11:09:12Z`) |
| `D3_REVISION_ROWS_TOTAL` | **9** |
| `ACK_ROWS_TOTAL` | **9** |
| `D3_REVISIONS_POST_F_D3_T0` | **9** |
| `D3_REVISIONS_POST_F4_6_T0` | **7** |
| `UNIQUE_ORGS_WITH_D3` | **1** |
| `UNIQUE_VEHICLES_WITH_D3` | **4** |
| `FIRST_D3_REVISION_AT` | **`2026-09-28T09:33:42.623Z`** |
| `LATEST_D3_REVISION_AT` | **`2026-09-28T19:42:18.210Z`** |
| `D3_EVIDENCE_SPAN_HOURS` | **~10.14** |
| `PARTIAL_REVISION_WITHOUT_ACK_COUNT` | **0** |
| `CROSS_TENANT_MISMATCH_COUNT` | **0** |

## Provenance segmentation (do not pool blindly)

| Cohort | Count | Role |
|--------|------:|------|
| **A** `F4_5R_CONTROLLED_CANARY` | **1** | `@09:33Z` post-`F_D3_T0` |
| **B** `F4_5R1_CONTROLLED_CANARY` | **1** | `@15:00Z` |
| **C** `F4_6_SUSTAINED_NATURAL_SHADOW` | **7** | **`materialized_at >= F4_6_T0`** (includes **2** post-gate natural ticks through ~`19:42Z`) |

| Field | Value |
|-------|-------|
| `F46_UNIQUE_VEHICLES` | **4** |
| `F46_EVIDENCE_SPAN_HOURS` | **~1.93** (first→last sustained revision in cohort C at analysis time) |

**Primary calibration authority:** cohort **C** only. A/B listed as supporting context.

## D4 integrity (`M3_3D_D4_INTEGRITY_INSPECTION_V1`) — cohort C only

Aggregated **default-session** disposition counts across **7** sustained revisions:

| Metric | Count |
|--------|------:|
| `D4_ELIGIBLE_COUNT` | **48** |
| `D4_QUARANTINED_COUNT` | **0** |
| `D4_SOURCE_EVIDENCE_LIMITED_COUNT` | **0** |
| `D4_PROVISIONAL_COUNT` (sessions) | **3** |
| `D4_EXCLUDED_COUNT` (sessions) | **59** |
| `D4_SELF_INTEGRITY_FAILED_COUNT` | **0** |
| `D4_ELIGIBLE_PERCENT` | **100%** of default observations |

Non-eligible sessions are **reported separately** (excluded/provisional), not silently discarded.

## F5 primary scientific cohort (C + D4-eligible E1 + supported contract/policy)

| Field | Value |
|-------|-------|
| `F5_PRIMARY_REVISION_COUNT` | **7** |
| `F5_PRIMARY_UNIQUE_VEHICLES` | **4** |
| `F5_PRIMARY_UNIQUE_ORGS` | **1** |
| `F5_PRIMARY_EVIDENCE_SPAN_HOURS` | **~1.93** (revision cadence window; per-revision observation spans up to **~54.3h**) |

Contract/policy: all revisions **`M3_3D_LONGITUDINAL_PROFILE_V1` / `M3_3D_PROFILE_POLICY_V1`**. Offline E3 @ **`M3_3E_CALIBRATION_UNSET_V1`**: **7/7 OK** (descriptive only).

## CAL maturity (descriptive — **no thresholds adopted**)

| CAL ID | `CURRENT_MATURITY` | Support (cohort C) | Primary limitation | `CAN_ADVANCE_TO_F6_NOW` |
|--------|-------------------|--------------------|--------------------|-------------------------|
| CAL-M3.3E-001 | **DISTRIBUTION_VISIBLE** | 1–13 assessment-grade obs/revision; 1–3 revisions/vehicle | Fleet still tiny | **NO** |
| CAL-M3.3E-002 | **DISTRIBUTION_VISIBLE** | Eligible span **0–~54.3h** across revisions | Short sustained window vs long profile spans | **NO** |
| CAL-M3.3E-003 | **COLLECTING** | Multi-revision growth visible; concentration not stable | Needs longer natural windows | **NO** |
| CAL-M3.3E-004 | **DISTRIBUTION_VISIBLE** | `maxActualRestAgeMs` non-null **~42%**; median **~1.77h** among non-null | High null share | **NO** |
| CAL-M3.3E-005 | **COLLECTING** | Rest-timing proxies sparse; many null observation spans | `firstRestPointAgeMs` not populated on E1 scalars | **NO** |
| CAL-M3.3E-006 | **COLLECTING** | **≤3** sustained revisions/vehicle | Insufficient same-condition repeat pairs | **NO** |
| CAL-M3.3E-007 | **COLLECTING** | Step-change candidates not labeled | **NAT-M3.3F-009** owned by **M3.3G** | **NO** |
| CAL-M3.3E-008 | **COLLECTING** | UNSET profile → no MAD multiplier flags | Needs richer repeat + residual samples | **NO** |
| CAL-M3.3E-009 | **DISTRIBUTION_VISIBLE** | Temperature known **~58%** of eligible obs | Trip-exterior-only context | **NO** |
| CAL-M3.3E-010 | **DISTRIBUTION_VISIBLE** | **100%** `chargeOpportunityClass=UNKNOWN` | C2 classifier not informative yet | **NO** |
| CAL-M3.3E-011 | **DISTRIBUTION_VISIBLE** | Points/session visible (1–13) | Session minima not calibratable | **NO** |

### Fleet descriptive snapshots (cohort C, eligible observations)

**CAL-001 — series counts:** revisions/vehicle **min 1 · med 1.5 · max 3**; obs/revision **min 1 · med 4 · max 13**.

**CAL-002 — evidence span (eligible window hours):** **min 0 · p25 ~13.7 · med ~46.1 · max ~54.3**.

**CAL-004 — maxActualRestAgeMs (non-null):** **min ~7.8m · med ~1.77h · max ~32.1h**; null share **~58%**.

**CAL-009 — temperature:** known **28** / missing **20** → **~58.3%** coverage.

**CAL-010 — charge class:** known **0** / unknown **48** → **0%** known; **UNKNOWN dominates**.

## NAT-M3.3F maturity

| ID | Status | Notes |
|----|--------|-------|
| **NAT-M3.3F-001** | **DISTRIBUTION_VISIBLE** | Fleet-scale C3 + D3 rows exist (small connected fleet) |
| **NAT-M3.3F-002** | **DISTRIBUTION_VISIBLE** | Offline E1/E3 descriptors visible per revision |
| **NAT-M3.3F-003** | **COLLECTING** | Repeatability insufficient for slope noise floor |

## M3.3G-owned evidence (preserved)

| Field | Value |
|-------|-------|
| `GROUND_TRUTH_LINKAGE_AVAILABLE` | **NO** (**NAT-M3.3F-008** → M3.3G) |
| `REPLACEMENT_LABELS_AVAILABLE` | **NO** (**NAT-M3.3F-009** → M3.3G) |

These do **not** block F5 descriptive work; they **do** block validated causal/health interpretation.

## Calibration readiness rollup

| Field | Value |
|-------|-------|
| `CAL_ITEMS_TOTAL` | **11** |
| `CAL_ITEMS_COLLECTING` | **5** (003, 005, 006, 007, 008) |
| `CAL_ITEMS_DISTRIBUTION_VISIBLE` | **6** (001, 002, 004, 009, 010, 011) |
| `CAL_ITEMS_REPEATABILITY_VISIBLE` | **0** |
| `CAL_ITEMS_CALIBRATION_CANDIDATE` | **0** |
| `CAL_ITEMS_VALIDATION_PENDING` | **0** |

## F5 gate classification

| Field | Value |
|-------|-------|
| `F5_DATA_PIPELINE_RESULT` | **PASS** — read-only extraction, D4, offline E1/E3, provenance segmentation succeeded; integrity/tenant checks clean |
| `F5_CALIBRATION_MATURITY` | **DISTRIBUTIONS_EMERGING** |

**Natural accumulation still needed:** more **sustained** cohort-C revisions per vehicle, lower null shares on rest-depth/timing scalars, non-UNKNOWN charge context, temperature coverage stability, and repeatability pairs for CAL-006/008.

**D3 remains ON** — do not idle waiting for a new activation gate.

## Reusable tooling gap

| Field | Value |
|-------|-------|
| `REUSABLE_F5_ANALYSIS_TOOL_EXISTS` | **NO** (revision inspect CLI alone insufficient) |
| `F5_1_ENGINEERING_RECOMMENDED` | **YES** |

### Proposed **M3.3F F5.1** (not implemented here)

| Item | Proposal |
|------|----------|
| Command | `npm run battery:f5:natural-calibration-report -- --cohort=f46_sustained --as-of=<iso>` |
| Inputs | Org scope optional; cohort selector; as-of timestamp; `BATTERY_F5_ALLOW_PRODUCTION_READONLY=true` |
| Guarantees | Postgres `READ ONLY` transaction; no Nest registration; no writes; no E3 persistence |
| Output | `M3_3F_F5_NATURAL_CALIBRATION_REPORT_V1` JSON (inventory, provenance, D4 rollups, CAL/NAT maturity blocks) |
| Bounds | Max revisions scanned; timeout; explicit production host guard |
| Tests | Ephemeral Postgres fixture mirroring F5.0 golden JSON shape |

## Explicit non-actions

No D3 disable · no env change · no PM2 restart · no deploy · no schema/migration · no backfill/replay · no manual materialization · no E3 runtime · no customer health publication · no numeric calibration adoption.

## Machine-readable summary

```
M3_3F_F5_0_NATURAL_DATA_CALIBRATION_EVIDENCE_BOOTSTRAP_RESULT=PASS
F5_DATA_PIPELINE_RESULT=PASS
F5_CALIBRATION_MATURITY=DISTRIBUTIONS_EMERGING
D3_SUSTAINED_SHADOW_ACTIVE=YES
E3_RUNTIME_ACTIVATED=NO
REUSABLE_F5_ANALYSIS_TOOL_EXISTS=NO
F5_1_ENGINEERING_RECOMMENDED=YES
```
