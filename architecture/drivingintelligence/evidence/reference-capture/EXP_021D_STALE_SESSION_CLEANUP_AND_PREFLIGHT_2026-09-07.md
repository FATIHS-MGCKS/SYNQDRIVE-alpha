# EXP-021D — Stale Session Cleanup + Live Telemetry Qualification + Final Drive Go Gate

**Date:** 2026-09-07  
**Type:** EXP-021D (production ops — **no physical drive started**)  
**Production SHA:** `ccc2324db1aead2ab84dc854883713ce2948bafe` (PR #1558 merged)  
**Vehicle:** KS MX 2024 — `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` / token `187336`  
**Organization:** `faa710c9-6d91-4079-a7d5-91fdccdec14a`

---

## A. Stale session forensic classification

| Field | Value |
|-------|-------|
| `STALE_SESSION_ID` | `66f09794-fc00-444c-86a3-c398b20e1ce5` |
| `organizationId` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `vehicleId` | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| `tokenId` | `187336` |
| `createdAt` | `2026-09-07T04:25:38.519Z` |
| `startedAt` | `2026-09-07T04:25:39.215Z` |
| `last activity` | `updatedAt=2026-09-07T05:01:31.936Z` (pre-abort); terminalized `2026-09-07T19:41:06.343Z` |
| `calibration series` | `49e2e8a7-712b-4279-80c1-357df14f7ea0` — **not** EXP-019 series `4d79843d-…` |
| `phase records` | Single stuck 10s phase only (phaseOrder `[10000]`); never advanced to 20/30/60 |
| `HF provenance` | 372 cycles; orphan `activeCycleJobId` with **zero** BullMQ job at abort time |
| `stop requested` | **NO** — session remained `RECORDING` until EXP-021D cleanup |
| `abort requested` | **YES** — canonical `abortSession` via recovery script at EXP-021D |
| `terminalization failed initially` | **YES** — first `abortSession` returned 409 quiescence timeout (orphan cycle lock) |
| `live runner active` | **NO** — metadata-only orphan; BullMQ recording queue empty |
| `BullMQ jobs` | **NO** pending/active/delayed jobs for session |

**Classification:**

```
STALE_SESSION_BELONGS_TO_EXP019 = NO
```

Rationale: EXP-019 canonical session is `2508b697-f101-4155-a0d3-8436e46bb779` (`COMPLETED`, four phases 10/20/30/60, series `4d79843d-…`). Stale session predates EXP-019 start (`04:25` vs `04:31`) and is an abandoned pre-EXP-019 orphan on the same vehicle/manifest.

```
STALE_SESSION_HAS_LIVE_RUNNER = NO
STALE_SESSION_HAS_PENDING_JOBS = NO
STALE_SESSION_HAS_UNFINALIZED_EVIDENCE = YES (prior to abort; series lacked terminalFinalizationAt)
```

---

## B. Safe terminalization

| Field | Value |
|-------|-------|
| `STALE_SESSION_TERMINALIZATION_METHOD` | `releaseCycleLockAndUpdateState` + canonical `abortSession` via `reference-capture-exp-021d-stale-session-recover.ts` |
| `STALE_SESSION_FINAL_STATUS` | `ABORTED` |
| `STALE_SESSION_EVIDENCE_PRESERVED` | `YES` — **4459** observations retained |
| `failureReason` | `exp021d_stale_pre_exp019_orphan_cleanup` |
| `STALE_SESSION_PENDING_JOBS_AFTER` | `0` |
| `STALE_SESSION_ACTIVE_RUNNERS_AFTER` | `0` |

No raw SQL status mutation. No evidence deletion. Historic phase/HF provenance preserved in `acquisitionStateJson`.

---

## C. Global RC / shadow clean-state proof (post-abort, post-shadow enable)

| Metric | Count |
|--------|------:|
| `ACTIVE_RC_SESSIONS` | 0 |
| `ACTIVE_CALIBRATION_SERIES` | 0 |
| `ACTIVE_SETTLEMENT_EXPERIMENTS` | 0 |
| `SETTLEMENT_SCHEDULES_PENDING` | 0 |
| `ORPHAN_SETTLEMENT_SCHEDULES` | 0 |
| `SETTLEMENT_QUEUE_WAITING` | 0 |
| `SETTLEMENT_QUEUE_ACTIVE` | 0 |
| `SETTLEMENT_QUEUE_DELAYED` | 0 |

RC recording queue also empty (waiting/active/delayed = 0).

---

## D. Live telemetry qualification (DIMO authority, not CONNECTED flag)

**Important:** `VehicleLatestState` DB snapshot remained stale (`sourceTimestamp=2026-09-07T04:57:29Z`, `online=false`) while live DIMO `signalsLatest` returned contemporary observations — qualifying via provider query surface as required.

| Field | Value |
|-------|-------|
| `WALL_CLOCK_NOW_UTC` | `2026-09-07T19:49:29.105Z` (re-check) |
| `LATEST_PROVIDER_TIMESTAMP` | `2026-09-07T19:49:16Z` |
| `LATEST_INGEST_TIMESTAMP` | `2026-09-07T19:49:30.839Z` |
| `TELEMETRY_PROVIDER_AGE_SECONDS` | 15 |
| `TELEMETRY_INGEST_AGE_SECONDS` | 0 |
| `FRESH_FOR_EXP021` | `YES` (threshold 600s) |
| `LIVE_TELEMETRY_READY` | `YES` |
| `VEHICLE_WAKE_REQUIRED` | `NO` |

Script: `backend/scripts/ops/reference-capture-exp-021d-telemetry-qualify.ts`

---

## F. Settlement shadow enablement

Gates satisfied before enable:

- `ACTIVE_RC_SESSIONS = 0`
- `ACTIVE_SETTLEMENT_EXPERIMENTS = 0`
- `ORPHAN_SETTLEMENT_SCHEDULES = 0`
- `LIVE_TELEMETRY_READY = YES`

Production env (`/opt/synqdrive/shared/backend.env`):

```
REFERENCE_CAPTURE_ENABLED=true
REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED=true
```

Rolling restart: `synqdrive` (:3001) healthy → `synqdrive-b` (:3002) healthy.  
Backup: `backend.env.bak-exp021d-shadow-20260907194738`

Post-restart effective flags verified; **no experiment auto-created**.

---

## G. Final EXP-021 preflight

```
EXP021_PREFLIGHT_PASS = YES
NEXT_SEQUENCE = 60_30_20_10
organizationId = faa710c9-6d91-4079-a7d5-91fdccdec14a
vehicleId = a60c0749-a7cd-494e-b5b9-dea3c6b97d63
tokenId = 187336
```

All checks PASS including `SETTLEMENT_SHADOW_ENABLED`, `NO_STALE_CALIBRATION_SESSION`, `NO_STALE_SHADOW_JOBS`, `PERSISTENCE_WRITABLE`.

---

## H. Physical drive

```
startRecording = NOT CALLED
physical capture session = NOT CREATED
phase 60 = NOT STARTED
```

**STOP AND WAIT FOR OPERATOR.**

---

## J. Machine-readable gate (final)

```
STALE_SESSION_FOUND = YES
STALE_SESSION_BELONGS_TO_EXP019 = NO
STALE_SESSION_FINALIZED = YES
STALE_SESSION_FINAL_STATUS = ABORTED
STALE_SESSION_EVIDENCE_PRESERVED = YES

ACTIVE_RC_SESSIONS = 0
ACTIVE_CALIBRATION_SERIES = 0
ACTIVE_SETTLEMENT_EXPERIMENTS = 0
ORPHAN_SETTLEMENT_SCHEDULES = 0

SETTLEMENT_QUEUE_WAITING = 0
SETTLEMENT_QUEUE_ACTIVE = 0
SETTLEMENT_QUEUE_DELAYED = 0

KS_MX_2024_VEHICLE_ID = a60c0749-a7cd-494e-b5b9-dea3c6b97d63
KS_MX_2024_TOKEN_ID = 187336

WALL_CLOCK_NOW_UTC = 2026-09-07T19:49:29.105Z
LATEST_PROVIDER_TIMESTAMP = 2026-09-07T19:49:16Z
LATEST_INGEST_TIMESTAMP = 2026-09-07T19:49:30.839Z
TELEMETRY_PROVIDER_AGE_SECONDS = 15
TELEMETRY_INGEST_AGE_SECONDS = 0

LIVE_TELEMETRY_READY = YES
VEHICLE_WAKE_REQUIRED = NO

REFERENCE_CAPTURE_ENABLED_EFFECTIVE = true
SETTLEMENT_SHADOW_ENABLED_EFFECTIVE = true

PRODUCTION_REPLICAS_HEALTHY = YES
REDIS_HEALTHY = YES
BULLMQ_HEALTHY = YES
DATABASE_HEALTHY = YES

NEXT_SEQUENCE = 60_30_20_10

EXP021_PREFLIGHT_PASS = YES

PRODUCTION_HF_PATH_CHANGED = NO
PRODUCTION_SCORE_CHANGED = NO
PRODUCTION_DETECTORS_CHANGED = NO
PRODUCTION_TIRE_BRAKE_CHANGED = NO

READY_FOR_EXP021_PHYSICAL_DRIVE = YES
```

Operator: proceed with timestamped video GT (CEST UTC+2) and explicit `startRecording` when ready. Do **not** assume DB `VehicleLatestState.online` alone — re-run telemetry qualification if vehicle was parked for extended period.
