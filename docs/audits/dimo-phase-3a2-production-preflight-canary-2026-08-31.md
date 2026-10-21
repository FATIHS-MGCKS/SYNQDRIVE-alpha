# Phase 3A.2 — Production Deployment + Runtime Preflight + Controlled LTE_R1 Canary

**Date:** 2026-08-31  
**Status:** DONE (canary passed)  
**Scope:** Deploy merged Phase 3A.1 (#1468), production runtime preflight, controlled stationary LTE_R1 canary — **not** the instrumented reference drive.

---

## 1. SHA / deployment record

| Item | Value |
|------|-------|
| **MAIN_SHA (#1468 merge)** | `af6fb4299` |
| **DEPLOYED_SHA_BEFORE** | `bfcf9ddb7` (P1.8.1 pre-#1468) |
| **DEPLOYED_SHA_AFTER (final)** | `d6cbcd842` |
| **Release IDs** | `20260831204639_v4994` (3A.1+DI fix), `20260831210804_v4994` (dataSummary fix) |
| **Production host** | `srv1374778.hstgr.cloud` |

### Deploy blockers resolved

1. **WorkersModule DI** (`b88da0c9a`) — `ReferenceCaptureProcessor` could not resolve `ReferenceCaptureConfig` because reference-capture providers were not exported from `VehicleIntelligenceModule`. Boot check failed on first deploy attempt; production left at `bfcf9ddb7`.
2. **dataSummary GraphQL 422** (`d6cbcd842`) — `buildDataSummaryQuery` used `firstSignalSeen`/`lastSignalSeen`; live DIMO schema exposes `firstSeen`/`lastSeen`. Preflight aborted with HTTP 422 before reaching READY.

---

## 2. Production topology (preserved)

| Item | Observed |
|------|----------|
| PM2 | Single process `synqdrive`, **fork** mode, port **3001** |
| nginx upstream | `127.0.0.1:3001` + `127.0.0.1:3002` configured; **only 3001 listening** |
| Scale topology | **Not changed** (no second replica started) |
| Scheduler ownership | Unchanged — snapshot/trip schedulers active |

---

## 3. Preflight evidence (pre-canary)

| Check | Result |
|-------|--------|
| Pre-deploy DB backup | OK (deploy script) |
| PostgreSQL | OK (migrations applied) |
| Redis | `PONG` |
| BullMQ | Queue registered; reference-capture processor in WorkersModule |
| Migrations | `20260831180000`, `20260831200000`, `20260831210000` applied |
| Tables | `reference_capture_sessions`, `reference_capture_observations` exist |
| DIMO credentials | OK (preflight + canary reached DIMO) |
| Manifest v1.1.0 | Loads in production |
| `REFERENCE_CAPTURE_ENABLED` (initial) | unset → verified healthy with flag **disabled** |
| `REFERENCE_CAPTURE_ENABLED` (canary) | `true` in `/opt/synqdrive/shared/backend.env` |

---

## 4. Canary vehicle selection

Evidence-based selection from audit org `faa710c9-6d91-4079-a7d5-91fdccdec14a`:

| Field | Value |
|-------|-------|
| **vehicleId** | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| **Label** | VW Tiguan — WOB L 7503 |
| **connection profile** | `DIMO_LTE_R1` (`hardware_type=LTE_R1`) |
| **powertrain** | `ICE_GASOLINE` (`fuel_type=GASOLINE`) |
| **DIMO tokenId** | `192922` |
| **connectionStatus** | CONNECTED |
| **last_seen_at** | 2026-08-31 19:50:40 UTC (most recent LTE_R1 fleet telemetry) |

---

## 5. Session lifecycle

**Session ID:** `e8613cc7-223b-4436-8f30-0f8002ff8919`

| Stage | Result |
|-------|--------|
| CREATED | OK |
| PREFLIGHT | OK |
| READY | OK — `deploymentPreflightReady=true` |
| START → RECORDING | OK — BullMQ runner enqueued |
| Autonomous cycles | **5** complete (`cycleCount=5`) |
| STOP → COMPLETED | OK at 2026-08-31 21:15:28 UTC |
| Post-stop zombies | **0** BullMQ keys; status remains `COMPLETED` |

### Preflight summary

- `availableSignals`: **31**
- `broadObservationFieldCount`: **31**
- `manifestVersion`: **1.1.0**
- `deploymentPreflightReady`: **true**
- Blockers: `reference_drive_canary_not_executed` (expected pre-canary; cleared by successful canary)

---

## 6. Acquisition / persistence evidence

| Metric | Value |
|--------|-------|
| Total observations | **52** |
| Mapped (`canonical_key` set) | **33** |
| Unmapped (retained `DIMO::<field>`) | **18** |
| Native events | **0** (`SUPPORTED_NO_DATA` — stationary) |
| Sequence range | 1–51 |
| Timestamp contract violations | **0 / 52** (`requestStartedAt ≤ synqReceivedAt ≤ requestCompletedAt`) |

### Surface counts

| Surface | Count | Verdict |
|---------|-------|---------|
| `LATEST_LIVE` | 25 | DATA_CAPTURED |
| `LATEST_SLOW` | 26 | DATA_CAPTURED |
| `VALIDATION_FLIGHT_RECORDER` | 1 | PREFLIGHT metadata |
| `HF_HISTORICAL` | 0 | SUPPORTED_NO_DATA (hf watermark advanced; no HF rows persisted) |
| `NATIVE_EVENT_INCREMENTAL` | 0 | SUPPORTED_NO_DATA (event watermark set; no events during stationary window) |

### Unmapped field sample (broad capture proof)

Unmapped provider fields retained with `canonical_key=null` and `raw_identity=DIMO::<exactProviderField>`:

- `currentLocationCoordinates` → `DIMO::currentLocationCoordinates`
- `isIgnitionOn` → `DIMO::isIgnitionOn`
- `lowVoltageBatteryCurrentVoltage` → `DIMO::lowVoltageBatteryCurrentVoltage`
- … (18 total unmapped signal observations)

---

## 7. Multi-replica / BullMQ serialization

Production currently runs **one** PM2 backend process (fork on 3001). True cross-replica contention was **not exercised** because port 3002 is not listening.

Within the single worker:

- `ReferenceCaptureProcessor` concurrency = **1**
- `activeCycleJobId` cleared between cycles (`null` at rest)
- `cycleCount` incremented monotonically to 5 without overlap
- No duplicate simultaneous cycle execution observed
- Pending delayed job cleared on COMPLETED (`pending_cycle_job_id` null)

**Verdict:** Serialization semantics verified on current production topology; full dual-replica contention test deferred until/if port 3002 is activated.

---

## 8. Production isolation

| Check | Result |
|-------|--------|
| New `vehicle_trips` during canary (Tiguan) | **0** |
| Session left RECORDING after stop | **No** |
| Failed persistence batch | **None observed** |
| Normal DIMO snapshot scheduler | Continued (unrelated 403 on other token during window) |

---

## 9. Resource observation (short canary)

| Metric | Observation |
|--------|-------------|
| Canary duration | ~26s recording window |
| DIMO requests | ~3–5 per cycle × 5 cycles (estimate from surface mix) |
| DB writes | 52 observation rows + 1 session row |
| Rate-limit / 422 during canary | **None** on canary vehicle after dataSummary fix |
| Redis queue depth post-stop | **0** |

---

## 10. Runtime warnings (non-blocking)

- ClickHouse migration checksum drift (pre-existing)
- HM MQTT cert files missing (pre-existing)
- Unrelated DIMO 403 on token `190497` during canary window (other fleet vehicle)

---

## 11. Decision

| Flag | Value |
|------|-------|
| **Phase 3A.2** | **DONE** |
| **REFERENCE_DRIVE_READY** | **YES** |
| **Instrumented reference drive** | **NOT STARTED** (explicitly out of scope for 3A.2) |

### Readiness rationale

All required gates passed after deploy fixes: healthy deployment, migrations, feature flag, LTE_R1 preflight READY, ≥3 autonomous BullMQ cycles (5), durable broad capture, timestamp contract, clean STOP, no production regression. HF/event surfaces returned no data during stationary canary — acceptable per spec (`SUPPORTED_NO_DATA`).

---

## 12. Files changed during 3A.2

| Path | Purpose |
|------|---------|
| `backend/src/modules/vehicle-intelligence/vehicle-intelligence.module.ts` | Export reference-capture providers for WorkersModule |
| `backend/src/workers/workers-reference-capture.di.spec.ts` | DI regression test |
| `backend/src/modules/dimo/queries/data-summary.query.ts` | Fix DIMO schema field names |
| `backend/scripts/ops/reference-capture-lte-r1-production-canary.ts` | Production canary runner |
| `backend/scripts/ops/reference-capture-preflight-422-probe.ts` | Preflight DIMO probe |
| `docs/audits/driving-intelligence-reconstruction-master-plan-2026-08-30.md` | Status tracker update |
