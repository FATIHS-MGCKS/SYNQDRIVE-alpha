# M3.3F F5.1 — Bounded read-only natural calibration report (engineering)

**Date:** 2026-09-28  
**Governance `origin/main` @ engineering:** includes F5.0 evidence (PR #1834 or equivalent)  
**Prerequisite:** **`F5_DATA_PIPELINE_RESULT=PASS`** (F5.0 read-only bootstrap)

## Purpose

Reusable operator CLI that reproduces F5.0 scientific analysis **deterministically** without ad-hoc `/tmp` scripts.

| Field | Value |
|-------|-------|
| `REPORT_CONTRACT_VERSION` | **`M3_3F_F5_NATURAL_CALIBRATION_REPORT_V1`** |
| `CLI_COMMAND` | **`npm run battery:f5:natural-calibration-report -- --cohort=f46_sustained --as-of=<ISO-UTC>`** |
| `PRODUCTION_OPT_IN_REQUIRED` | **`BATTERY_F5_ALLOW_PRODUCTION_READONLY=true`** |
| `READ_ONLY_TRANSACTION_ENFORCED` | **`SET TRANSACTION READ ONLY`** + `SHOW transaction_read_only=on` |

## Bounds (V1)

| Field | Value |
|-------|-------|
| `MAX_REVISIONS_DEFAULT` | **500** |
| `MAX_REVISIONS_HARD` | **2000** |
| `REPORT_TIMEOUT_MS_DEFAULT` | **30000** |

## Cohort authority

| Cohort | Role |
|--------|------|
| **`f46_sustained`** | Primary calibration statistics (`materializedAt >= F4_6_T0`) |
| **F4.5R / F4.5R1** | Reported in `provenance.*` only — **not** pooled into primary |

## Scientific reuse (no duplication)

| Component | Source |
|-----------|--------|
| D4 | `LongitudinalIntegrityInspectionService` |
| E1 | `buildLongitudinalAssessmentInputV1` |
| E3 | `evaluateM3_3E_LongitudinalHealthEvaluationV1` @ **`M3_3E_CALIBRATION_UNSET_V1`** only |
| Maturity | Pure functions in `f5-calibration-maturity.ts` |

**D4 unit semantics:** `eligibleObservationPercent` = eligible **default observations** / total **default observations** (not sessions from provisional/excluded slices).

## Explicit non-actions

| Field | Value |
|-------|-------|
| Nest HTTP controller | **NO** |
| Scheduler / worker | **NO** |
| Production E3 runtime | **NO** |
| DB writes | **NO** |
| Numeric calibration adoption | **NO** |
| M3.3G ground truth | **`linkageAvailable=false`**, **`replacementLabelsAvailable=false`** (owners **M3.3G**) |

## Tests

```bash
cd backend
npm run test:battery:v2:f5-natural-calibration-report
BATTERY_F5_NATURAL_CALIBRATION_REPORT_INTEGRATION=1 npm run test:battery:v2:f5-natural-calibration-report:postgres
npm run test:battery:v2:f5-natural-calibration-report:postgres:ci
```

CI: F5.1 PostgreSQL integration runs inside **Battery V2 — Longitudinal Postgres CI** job **D3 longitudinal profile materialization PostgreSQL** (embedded after D3 integration; avoids separate `.github/workflows` authority gate).

## Machine-readable summary

```
M3_3F_F5_1_BOUNDED_READ_ONLY_REPORT_ENGINEERING_RESULT=PASS
REPORT_CONTRACT_VERSION=M3_3F_F5_NATURAL_CALIBRATION_REPORT_V1
E3_RUNTIME_REACHABLE_BY_TOOL=NO
F5_1_ENGINEERING_RECOMMENDED=IMPLEMENTED
```
