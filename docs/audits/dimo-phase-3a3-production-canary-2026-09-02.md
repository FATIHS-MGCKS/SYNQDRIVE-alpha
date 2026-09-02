# Phase 3A.3 — Combined Production Cutover + Stationary Canary

**Date:** 2026-09-02  
**Evidence ID:** DI-EV-0022  
**Governance:** `docs/audits/driving-intelligence-evidence-governance-2026-09-01.md`  
**Scope:** 3A.3.1 FAST PRE-ARM/GO + 3A.3.2 HF watermark / physical identity migration + stationary canary  
**RD002:** NOT AUTHORIZED (this record does not authorize RD002)

---

## Cutover authority

| Item | Value | Evidence class |
|------|-------|----------------|
| `CUTOVER_TARGET_SHA` (code authority) | `bf1be9b6b351066eb74126b56e85f6848b16812c` | CONFIRMED_FROM_CODE |
| `PRE_CUTOVER_PRODUCTION_SHA` | `3772d992dae012bc9d794184e05e8ad39db09df4` | CONFIRMED_FROM_PRODUCTION_RUNTIME |
| Post-migration deploy SHA (3A.3 code release) | `bf1be9b6b351066eb74126b56e85f6848b16812c` | CONFIRMED_FROM_PRODUCTION_RUNTIME |
| Canonical runner-race fix deploy (`82f3d9c5c`) | **NOT VERIFIED** — hot-patch only; VPS GitHub clone auth blocked canonical redeploy | CONFIRMED_FROM_PRODUCTION_RUNTIME |
| Runner-race hotfix SHA (main) | `82f3d9c5c428c745b8224db2e045902238e157fa` | CONFIRMED_FROM_CODE |
| Runner-race hotfix on VPS | Hot-patched `reference-capture-session.service.ts` + `npm run build` + PM2 reload (canonical redeploy of `82f3d9c` blocked: VPS GitHub clone auth) | CONFIRMED_FROM_PRODUCTION_RUNTIME |

---

## Pre-migration safety gate (reconfirmed)

| Gate | Result |
|------|--------|
| `DUPLICATE_IDENTITY_GROUPS` | 0 |
| `ACTIVE_REFERENCE_CAPTURE_SESSIONS` | 0 |
| `ACTIVE_LEGACY_V1_SESSIONS` | 0 |
| `REFERENCE_CAPTURE_ACTIVE_WRITES` | NO |
| `PRISMA_MIGRATION_CHAIN_CLEAN` | YES |

---

## Migration `20260902103000_reference_capture_physical_sample_unique`

| Check | Result |
|-------|--------|
| `MIGRATION_APPLIED` | YES (`finished_at` 2026-09-02 10:13:18 UTC) |
| `UNIQUE_INDEX_PRESENT` | YES (`refcap_obs_session_physical_fp_uq`) |
| `UNIQUE_INDEX_VALID` | YES |
| `UNIQUE_INDEX_UNIQUE` | YES |
| Indexed columns | `(session_id, physical_sample_fingerprint)` |
| Pre-migration rows | 3504 total / 1333 non-null fingerprints |
| Post-canary global duplicates | 0 |

---

## Production blocker discovered + remediated

**Symptom:** FAST GO entered `RECORDING` but `cycleCount` remained 0 for 15s; BullMQ cycle job enqueued while session status was still `STARTING`, worker skipped job (`session not RECORDING`), `pendingCycleJobId` pointed at removed job.

**Fix:** `reference-capture-session.service.ts` — transition `STARTING → RECORDING` **before** `startRunner()` enqueue. Merged to `main` at `82f3d9c5c`. Hot-applied on VPS for canary completion.

---

## Canary vehicle (canonical RD001 authority)

| Field | Value |
|-------|-------|
| `CANARY_ORGANIZATION_ID` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `CANARY_VEHICLE_ID` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| `CANARY_LICENSE_PLATE` | WOB L 7503 |
| `CANARY_CONNECTION_PROFILE` | `DIMO_LTE_R1` |
| `CANARY_POWERTRAIN_PROFILE` | `ICE_GASOLINE` |
| Vehicle `last_signal` at cutover | ~15h stale (stationary/offline) |

---

## PRE-ARM (attempt FINAL)

| Field | Value |
|-------|--------|
| `PREARM_EXECUTED` | YES |
| `PREARM_READY` | YES |
| `SESSION_ID` | `ed06ea20-bb33-47d5-b8fb-8f19810b33ae` |
| `deploymentPreflightReady` | true |
| `SESSION_STATUS` | READY |
| `runnerJobId` / `pendingCycleJobId` | null |
| `startedAt` | unset |
| Domain `PREARM_DURATION_MS` | 1944 |

---

## FAST GO (production HTTP authority)

| Field | Value |
|-------|--------|
| `FAST_GO_EXECUTED` | YES |
| `READY_TO_DRIVE` | YES |
| `goRequestedAt` | `2026-09-02T10:37:48.762Z` |
| `recordingEnteredAt` | `2026-09-02T10:37:48.900Z` |
| `firstCycleCompletedAt` | `2026-09-02T10:37:50.083Z` |
| `readyToDriveAt` | `2026-09-02T10:37:50.083Z` |
| `GO_TO_RECORDING_MS` | **138** |
| `GO_TO_FIRST_CYCLE_MS` | **1321** |
| `GO_TO_READY_TO_DRIVE_MS` | **1321** |
| `FAST_GO_WITHIN_15S` | YES |
| First-cycle `signalPointCount` | 31 |
| `runnerContinuityProven` | true |

**Ops auth note:** `REFERENCE_CAPTURE_OPS_BEARER_TOKEN` not present in `backend.env`; short-lived ORG_ADMIN JWT minted on VPS for HTTP FAST GO only (not persisted).

---

## Stationary runtime observation (6 cycles)

| Metric | Value |
|--------|-------|
| `CANARY_CYCLES_COMPLETED` | 6 |
| `CANARY_SIGNAL_POINT_COUNT` | 82 |
| `CANARY_HF_HISTORICAL_COUNT` | 0 |
| `CANARY_NATIVE_EVENT_COUNT` | 0 |
| `CANARY_TOTAL_OBSERVATION_COUNT` | 83 (incl. 1 SESSION_METADATA) |
| Surfaces | LATEST_LIVE 30, LATEST_SLOW 52, VALIDATION_FLIGHT_RECORDER 1 |
| `HF_PHYSICAL_IDENTITY_VERSION` | `AGGREGATE_BUCKET_V2` |
| `hfQueryCoverageByField` | Advanced for 5 HF-capable fields (no HF_HISTORICAL rows returned — vehicle telemetry stale) |
| `hfWatermarkByField` | `{}` (no durable HF buckets this session) |
| `STOP_CONFIRMED` | COMPLETED |
| Post-stop runner artifacts | all null |
| `POST_CANARY_DUPLICATE_IDENTITY_GROUPS` | 0 |

---

## Validation verdicts

| Flag | Result | Rationale |
|------|--------|-----------|
| `PHASE_3A3_1_PRODUCTION_VALIDATED` | **YES** | Real production PRE-ARM + HTTP FAST GO; READY_TO_DRIVE within 15s |
| `PHASE_3A3_2_PRODUCTION_VALIDATED` | **NO** | No `HF_HISTORICAL` observations; no motion; HF watermark/idempotency not exercised under live HF returns |
| `MOTION_CANARY_COMPLETED` | **NO** | Stationary / stale telemetry |
| `COMBINED_3A3_CANARY_PASSED` | **PARTIAL** | Migration + 3A.3.1 pass; 3A.3.2 awaits motion HF canary |
| `READY_FOR_RD002` | **NO** | Motion + HF runtime evidence required |

---

## HF runtime partial evidence

| Check | Result |
|-------|--------|
| `HF_QUERY_COVERAGE_RUNTIME_VALIDATED` | PARTIAL — coverage cursors advanced; no HF rows |
| `HF_DATA_WATERMARK_RUNTIME_VALIDATED` | NO — no HF buckets persisted |
| `HF_IDEMPOTENCY_RUNTIME_VALIDATED` | PARTIAL — unique index valid; no HF overlap retrieval observed |
| `HF_QUERY_WINDOW_BOUNDED_RUNTIME_VALIDATED` | PARTIAL — coverage not session-pinned for active fields; HF window not observed |

---

## Next required step

Schedule controlled **motion HF canary** on WOB L 7503 after vehicle telemetry is live. **Prerequisite:** canonical VPS redeploy of `82f3d9c5c` (restore GitHub deploy auth — hot-patch alone is insufficient for operational authority). RD002 planning only if motion HF evidence passes.
