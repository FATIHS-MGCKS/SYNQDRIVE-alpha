# P1.2 FINAL — Trip-Loss Safety Gate Audit

| Field | Value |
|-------|-------|
| **PR** | #1409 |
| **Branch** | `cursor/p12-activity-tier-snapshot-polling-f21f` |
| **Scope** | Trip-integrity audit for activity-tier snapshot polling |
| **Verdict** | **SAFE TO MERGE P1.2** (with promotion-semantics fix in this gate) |

---

## A. Promotion semantics — FIXED & VERIFIED

### Bug found

`requiresImmediateSnapshotPollOnPromotion()` previously ignored
`previousEffectiveTier`. A vehicle remaining `RECENTLY_ACTIVE` with persistent
activity signals could bypass its 60s interval on every 30s scheduler tick.

### Fix

Promotion bypass now requires **strict tier promotion** via
`isFasterSnapshotPollingTier(rawTier, previousEffectiveTier)` plus authoritative
activity/FSM signals. Persistent activity on the same tier respects cadence.

### Deterministic timeline tests (added)

| Tick | State | `providerFetchedAt` | Expected |
|------|-------|---------------------|----------|
| T0 | RESTING_STANDBY | now | not due (just polled) |
| T0+30s | promote → RECENTLY_ACTIVE | T0 | **immediate enqueue** |
| T0+60s | RECENTLY_ACTIVE (steady) | T0+30s | **not due** (30s < 60s interval) |
| T0+90s | RECENTLY_ACTIVE (steady) | T0+30s | **due** (60s elapsed) |

Equivalent ACTIVE_DRIVING timeline: promotion at T0+30s, not due at T0+45s,
due at T0+60s.

### N=1000 simulation

Steady-state model unchanged: ~376.7 jobs/min vs ~2000 legacy (5.3× reduction).
Promotion fix affects burst behavior only, not steady-state load model.

---

## B. Trip-start bootstrap audit

### DIMO LTE_R1 (primary production hardware)

| Field | Writers without snapshot poll? | Source class |
|-------|-------------------------------|--------------|
| `VehicleLatestState.sourceTimestamp` | No (primary) | 1 — DIMO snapshot polling |
| `VehicleLatestState.lastSeenAt` | No (primary) | 1 — DIMO snapshot polling |
| `speedKmh` / `isIgnitionOn` | No (primary) | 1 — DIMO snapshot polling |
| `VehicleTripDetectionState.state` | No for **new** trip start | 1 — snapshot → `evaluateSnapshotForTripStart()` |
| `VehicleTripDetectionState.lastActivityAt` | Only after trip already started | 1 — snapshot FSM + 5 — `ACTIVE_TICK` worker |

**Webhook (DTC only):** `dimo-webhook.controller.ts` updates `obdDtcList`,
`lastDtcPollAt` — **not** speed/ignition/FSM.

**HM Full Telemetry:** MQTT/webhook → `hmLatestTelemetryState` — **not**
`vehicleLatestState`; no live trip FSM path today.

### Bootstrap answer

A vehicle in `RESTING_STANDBY` (5min poll) or `LONG_IDLE` (30min poll) **cannot**
live-detect a new trip start before the next scheduled snapshot poll on LTE_R1.
Once a trip is detected, `dimo.trip-tracking` `ACTIVE_TICK` (~30s) maintains it.

**Safety net:** tiered reconciliation (fast/warm/cold) + DIMO segment fallback.

---

## C. Worst-case short-trip matrix

| Case | Live FSM | Max live delay | Fast recon | Warm recon | Cold recon | DIMO segment | Canonical trip | Enrichment | Driver Score | Permanent loss? |
|------|----------|----------------|------------|------------|------------|--------------|----------------|------------|--------------|-----------------|
| C1 RESTING 2min trip between polls | NO | ≤5min | YES ≤15min | YES ≤4h | YES ≤24h | YES | YES (repair) | YES | YES (post-repair) | **NO** |
| C2 RESTING 4min between polls | NO | ≤5min | YES | YES | YES | YES | YES | YES | YES | **NO** |
| C3 LONG_IDLE 5min, no push | NO | ≤30min | NO* | YES ≤4h | YES ≤24h | YES | YES | YES | YES | **NO** |
| C4 LONG_IDLE trip within 30min cadence | NO | ≤30min | NO* | YES | YES | YES | YES | YES | YES | **NO** |
| C5 Redis/backend outage during trip | NO | outage duration | after recovery | YES | YES | YES | YES | YES | YES | **NO** |
| C6 DIMO snapshot fails / retries exhaust | NO | until success or recon | YES | YES | YES | YES | YES | YES | YES | **NO** |
| C7 stale DISCONNECTED, segments recovered | NO (no poll) | until warm/cold | NO** | YES | YES | YES (token) | YES | YES | YES | **NO** |

\* Fast repair requires `lastSeenAt` or `providerFetchedAt` within 1h — long-idle
vehicles rely on warm/cold.

\** Snapshot scheduler excludes DISCONNECTED; reconciliation does not.

---

## D. Reconciliation independence from snapshot cohort

| Tier | `connectionStatus` filter? | `Vehicle.status` filter? | Token required? |
|------|--------------------------|--------------------------|-----------------|
| Fast (15min) | **No** | **No** | implicit via VLS recency |
| Warm (4h) | **No** | **No** | `dimoTokenId != null` |
| Cold (daily) | **No** | **No** | `dimoTokenId != null` |
| Resume backfill | **Yes** (CONNECTED) | AVAILABLE/RENTED | tokenId |

`reconcileWindow()` has no eligibility filters — uses `vehicle.dimoVehicle.tokenId`
for DIMO segment fallback directly.

**Tests added:** `trip-reconciliation.scheduler.spec.ts`

---

## E. `connectionStatus` recovery audit

### Writers to `DimoVehicle.connectionStatus`

| Writer | Trigger | Mutates field? |
|--------|---------|----------------|
| `DimoApiSyncService` / `DimoVehicleSyncService` | 24h identity sync | **YES** |
| `dimo.controller.ts` | Admin manual refresh | **YES** |
| Device-connection webhooks | OBD plug/unplug | **NO** (episode/VLS DTC only) |
| `DeviceConnectionEpisodeResolutionService` | Episode policy | **NO** (operational projection) |
| `DimoSnapshotProcessor` | Snapshot poll | **NO** (reads only) |

### Consequence

Stale `DISCONNECTED` can exclude a physically recovered vehicle from snapshot
polling for up to **24h**. Trip reconciliation (warm/cold) still repairs via
`dimoTokenId` without requiring `connectionStatus = CONNECTED`.

---

## F. Vehicle status eligibility

Snapshot scheduler: `AVAILABLE` | `RENTED` only.

Schema also has: `IN_SERVICE`, `OUT_OF_SERVICE`, `RESERVED`.

Reconciliation does **not** filter by vehicle status. A vehicle in MAINTENANCE
or RESERVED with a valid DIMO token can still be repaired via warm/cold tiers.

**Contract:** Live FSM may miss trips for non-AVAILABLE/RENTED vehicles between
snapshot polls; reconciliation is the safety net. No cohort change in this gate
(evidence does not prove current restriction is unsafe for permanent loss).

---

## G. End-to-end repair finalization — VERIFIED

Integration test: `trip-repair-enrichment-chain.spec.ts`

Chain proven:

```
DIMO segment candidate
  → overlap/coverage (NOT_TRIGGERED, empty trips)
  → TripDecisionEngine.createRepairedTrip + finalizeRepairedTrip
  → TripRepair APPLIED
  → postFinalizeAnalysisProducer.produceAfterPersistedCompletion (REPAIR_FINALIZE)
  → enrichmentOrchestrator.enqueueBehaviorEnrichment
```

---

## H. Production-safe rollback

| Check | Result |
|-------|--------|
| `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=true` | Restores O(N) every-tick enqueue |
| DB migration required | **No** |
| Stale memory issue | Hysteresis map repopulates; safe on restart |
| Duplicate jobs | `jobId=snapshot-{vehicleId}` unchanged |
| Reconciliation affected | **No** — independent schedulers |
| Trip finality semantics | **Unchanged** |

### Rollback procedure

1. Set `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=true` in production `backend.env`
2. `pm2 restart synqdrive-backend` (or standard VPS deploy)
3. Verify scheduler logs show `activity_tier=false`
4. Monitor snapshot queue depth returns to pre-P1.2 pattern
5. Leave reconciliation schedulers running (unchanged)

To re-enable P1.2: unset or set `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=false`,
restart backend.

---

## I. Final acceptance matrix

| Scenario | LIVE | RECOVERED | MAX DELAY | PERMANENT LOSS? | PASS/FAIL |
|----------|------|-----------|-----------|-----------------|-----------|
| 1. Normal ACTIVE trip | YES | n/a | 30s poll + FSM | NO | **PASS** |
| 2. RESTING short trip | NO* | YES (fast/warm) | ≤15min recon | NO | **PASS** |
| 3. LONG_IDLE short trip | NO* | YES (warm/cold) | ≤4h warm | NO | **PASS** |
| 4. Snapshot provider failure | NO | YES (recon + retry) | tier interval + recon | NO | **PASS** |
| 5. Redis/backend outage | NO | YES (post-recovery) | outage + recon | NO | **PASS** |
| 6. Stale DISCONNECTED | NO | YES (warm/cold token) | ≤4h warm | NO | **PASS** |
| 7. Worker restart | brief gap | YES (resume backfill + recon) | ≤3min backfill window | NO | **PASS** |
| 8. Duplicate scheduler tick | deduped | n/a | 0 (jobId dedup) | NO | **PASS** |
| 9. Repaired historical trip | NO | YES | warm/cold tier | NO | **PASS** |
| 10. Repaired enrichment chain | n/a | YES | post-apply immediate | NO | **PASS** |

\* Live FSM requires snapshot observation; short trips between polls are expected
gaps filled by reconciliation — not permanent loss.

---

## Verdict

**SAFE TO MERGE P1.2**

Blocker resolved: promotion bypass cadence leak fixed with explicit tier-transition
semantics. No credible permanent trip-loss path identified across audited scenarios.

P1.3+ untouched.
