# G2.2 Physical Refuel V2 — First Natural Production REFUEL Forensics (WOB L 7503)

**Date:** 2026-09-05 (Stage A audit ~T+38m after user-reported refuel)  
**Auditor mode:** READ-ONLY (no production mutation)  
**Vehicle:** WOB L 7503 (`19fedd4b-c4e8-4de8-a125-dab293326e7e`)  
**User ground truth:** physical refuel ~2026-09-05T15:29:00+02:00 (= ~2026-09-05T13:29:00Z)  
**V2 cutover:** `2026-09-04T18:40:13.000Z`  
**Epistemic status:** `PRODUCTION_OBSERVATION_IN_PROGRESS` — physical stop corroborated; DIMO/SynqDrive REFUEL row not yet present; V2 chain not entered

## 0. Production runtime (independent)

| Field | Value |
|-------|-------|
| CURRENT_REPO_MAIN_SHA | `3d5040b67abfdc7e95c1b507e13f45d1bc65af11` |
| PRODUCTION_RUNNING_SHA_REPLICA_A/B | `3d5040b67abfdc7e95c1b507e13f45d1bc65af11` |
| PRODUCTION_RELEASE_ID | `20260905085841_v4994` |
| Replicas healthy | YES (:3001 / :3002 `status=ok`) |
| PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED | `true` |
| PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED | `true` |
| PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT | `2026-09-04T18:40:13.000Z` |
| PHYSICAL_REFUEL_ROUTE_EVIDENCE_STABILIZATION_MS | unset → code default 2h (INFERRED) |

Production deploy SHA differs from original G2.2 cutover SHA (`43c9ae6c`); this audit uses the runtime actually processing the vehicle.

## 1. Vehicle identity

| Field | Value |
|-------|-------|
| vehicleId | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| license_plate | `WOB L  7503` |
| vehicle_name | Volkswagen Tiguan |
| organizationId | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| dimo_vehicle_id | `ded052d6-642d-4498-beed-3753afa7e36c` |
| DIMO tokenId | `192922` |

Exactly one matching production vehicle row.

## 2. Forensic window

Search window: `2026-09-05T12:45:00Z` → `2026-09-05T14:15:00Z` (expandable).

## 3. Source telemetry / physical corroboration

### Route / motion (trip `a1b914bb-4d6d-4551-a1e2-4a18c0d88d69`)

| Time (UTC) | Observation |
|------------|-------------|
| 13:24–13:26 | Slow/stop manoeuvring near `51.340°N, 9.480°E` |
| 13:25:47–13:26:22 | **Stationary dwell** at `51.3404166, 9.4804716` (~35s) |
| 13:27:53 | **91s telemetry gap**, then position jump to `51.4079°N, 9.6683°E` |
| 13:29:03 | **Driving** ~58.5 km/h at `51.407°N, 9.660°E` (not stationary) |
| 13:41:26 | Trip `end_time` (COMPLETED in DB) |

### OSM plausibility at dwell point

Nearest fuel station to dwell coordinate: **Shell**, **~85m** (`osm.fuel_stations`).

### Fuel level (SynqDrive latest state)

| Source | Value | Timestamp |
|--------|-------|-----------|
| `vehicle_latest_states.fuel_level_relative` | **14.9%** | `2026-09-05T13:40:25Z` |
| `vehicle_latest_states.fuel_level_absolute` | 8 (unit as stored) | same |
| `dimo_vehicles.fuel_percent` | 26.67% (stale) | `last_signal=2026-09-04T18:01:15Z` |

**No persisted fuel-rise time series** was available in PostgreSQL for this forensic pass. Current relative fuel **does not show a post-refuel rise** in SynqDrive state as of 13:40Z.

### REFUEL_SOURCE_EVIDENCE_PRESENT

**PARTIAL** — strong geospatial stop at Shell forecourt; **no** confirmed DIMO fuel-rise segment ingested yet.

## 4. REFUEL detection result

| Metric | Value |
|--------|-------|
| REFUEL_EVENT_DETECTED | **NO** |
| Events in forensic window | 0 |
| Post-cutover REFUEL rows (fleet) | still **0** |
| Energy events fleet-wide on 2026-09-05 | **0** |

### Why no row yet (Stage A assessment)

| Hypothesis | Evidence |
|------------|----------|
| **A. DIMO/provider delay** | Architecture ingests REFUEL via `detectEnergyEvents` → DIMO native refuel segments; no fleet REFUEL created today; fetch outcomes logged at DEBUG (not visible in production INFO logs) |
| **B. Scheduling window** | Warm reconciliation ran **13:05Z** (before stop); next warm **~17:05Z**; fast reconciliation runs every 15m but only logs when trip repairs > 0 — energy step still executes silently |
| **C. Fuel-rise not yet in provider detector** | Latest SynqDrive fuel 14.9% at 13:40 — no rise visible |
| **D. User time vs telemetry** | Strongest stop evidence **13:25–13:26Z**; at user-stated **13:29Z** vehicle already driving |

**Not classified as V2 defect** — V2 ownership/reconciliation/enrichment never started without a `VehicleEnergyEvent` row.

## 5. Trip / scheduler context

- Long trip `a1b914bb`: `09:48Z` → `13:41:26Z` COMPLETED.
- `vehicle_trip_detection_states` still `POSSIBLE_END` with same `active_trip_id` at audit time (14:09Z) — **P2 observability drift** vs COMPLETED trip row.
- Trip stuck POSSIBLE_END warnings 13:07–13:29; activity resumed 13:29:26; end validation from 13:49; CUSUM finalize attempts from 14:01.

## 6. V2 pipeline status (all pending — no event)

| Stage | Status |
|-------|--------|
| V2_OWNERSHIP | PENDING (no event) |
| RECONCILIATION_CREATED | NO |
| Identity matrix | N/A |
| Finality | N/A |
| Coordinate selection | N/A |
| Route stabilization | N/A |
| BullMQ enrichment | N/A |
| Persisted enrichment | N/A |
| LEGACY_RECOVERY_G2_BYPASS | NO (nothing to bypass) |
| DUPLICATE_ENRICHMENT | NO |

Physical-refuel recovery backlog remained all-zero through audit window (expected with zero reconciliation rows).

## 7. Ground-truth timing accuracy

User-stated instant **13:29Z** does **not** align with stationary refuel semantics; telemetry shows **highway driving** then.

Best telemetry-aligned physical stop: **~13:25:47–13:26:22Z** at Shell (~85m).

| Metric | Value |
|--------|-------|
| DETECTED_REFUEL_TIME_ERROR_SECONDS | NONE (no REFUEL row) |
| REFUEL_TIME_ACCURACY | **NOT_MEASURABLE** (detection pending) |
| Physical stop vs user time | ~3–4 min earlier than user-stated instant |

## 8. Stage A verdict

| Field | Value |
|-------|-------|
| PRODUCTION_REFUEL_V2_OBSERVED | **NO** |
| PRODUCTION_REFUEL_V2_VALIDATED | **NO** |
| PRODUCTION_REFUEL_V2_VALIDATION_STATE | **IN_PROGRESS** (blocked at EED ingestion) |
| PRODUCTION_RUNTIME_STABILITY | PASS (V2 recovery healthy; unrelated trip FSM drift P2) |

## 9. Stage B1 — post-fast-repair recheck (read-only, ~14:38Z)

**Audit timestamp:** `2026-09-05T14:38:13Z` (after `EARLIEST_REQUIRED_RECHECK_AT` 14:30Z)  
**Mode:** READ-ONLY — no mutation, replay, synthetic events, or manual detection.

### 9.1 Production runtime (re-verified)

| Field | Value |
|-------|-------|
| CURRENT_REPO_MAIN_SHA | `3d5040b67abfdc7e95c1b507e13f45d1bc65af11` |
| PRODUCTION_RUNNING_SHA_A/B | `3d5040b67abfdc7e95c1b507e13f45d1bc65af11` |
| PRODUCTION_RELEASE_ID | `20260905085841_v4994` |
| Replicas healthy | YES (`:3001` / `:3002` `status=ok`) |
| PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED | `true` |
| PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED | `true` |
| Config changes since Stage A | **NONE** |

### 9.2 REFUEL event population (12:45Z → now)

```sql
-- Result: 0 rows (vehicle + fleet)
SELECT id, kind, start_time, created_at FROM vehicle_energy_events
WHERE vehicle_id = '19fedd4b-c4e8-4de8-a125-dab293326e7e'
  AND start_time >= '2026-09-05 12:45:00+00';
```

| Metric | Value |
|--------|-------|
| REFUEL_DETECTED_NOW | **NO** |
| REFUEL_EVENT_ID | **NONE** |
| Fleet REFUEL rows since 12:45Z | **0** |
| Fleet REFUEL rows on 2026-09-05 | **0** |

### 9.3 Fast-repair execution proof (since Stage A)

**Scheduler:** `TripReconciliationScheduler.fastRepair` — every 15 min, 45 min window, leader-guarded.  
**Cohort:** WOB L 7503 eligible via `POSSIBLE_END ∈ ACTIVE_TRIP_DETECTION_STATES` (`fast-reconciliation-cohort.ts`).

| Evidence | Finding |
|----------|---------|
| Cohort membership at B1 | YES — `vehicle_trip_detection_states.state=POSSIBLE_END`, `vehicle_id=19fedd4b…` |
| Post-14:30 fast ticks | Expected at ~14:05, 14:20, 14:35 (15 min cadence from 09:05 deploy) |
| `Fast repair [19fedd4b…]` log | **Absent** — scheduler only logs when `repairsProposed > 0 \|\| repairsApplied > 0` |
| `Trip reconciliation skipped vehicle=19fedd4b` | **Absent** (no mutex skip) |
| `Fast repair failed for 19fedd4b` | **Absent** |
| `Energy-event detection failed for vehicle 19fedd4b` | **Absent** |
| `DIMO energy-event fetch failed … tokenId=192922` | **Absent** |
| DIMO snapshot polls 13:45–14:36 | SUCCESS every ~60s (`dimo_poll_logs` job_type=SNAPSHOT) |

| Metric | Value |
|--------|-------|
| FAST_REPAIR_RAN | **YES** (cohort eligible; post-14:30 ticks expected; no skip/fail logs) |
| FAST_REPAIR_RESULT | **SILENT_NO_OP** — zero trip repairs logged; energy step completes without WARN (DEBUG-only fetch logs) |

Classification: **(A)** provider still returned no persistable REFUEL evidence — not (B) did-not-run, (C) wrong window, or (E) hard failure. **(D)** received-data-but-ignored is **not supported** — no fuel-rise segment visible in any persisted store.

### 9.4 Fuel telemetry — second pass (13:15Z–14:15Z)

| Source | Value | Timestamp | Notes |
|--------|-------|-----------|-------|
| `vehicle_latest_states.fuel_level_relative` | **14.90196%** | `2026-09-05T13:40:25Z` (`last_seen_at`) | Unchanged from Stage A; poll `updated_at` advances (14:36Z) but fuel timestamp frozen |
| `vehicle_latest_states` position/speed | 51.3337°N, 9.5135°E @ 13 km/h | poll `updated_at=14:36:56Z` | Live polls healthy; fuel sample not advancing |
| `dimo_vehicles.fuel_percent` | 26.67% (stale cache) | `last_signal=2026-09-04T18:01:15Z` | Not authoritative for intraday forensics |
| `vehicle_trip_detection_states.start_fuel_level` | 14% | trip start | No post-stop rise recorded |
| Persisted fuel time series (PG) | **NONE** | — | No historical fuel samples table beyond latest state |

| Metric | Value |
|--------|-------|
| FUEL_RISE_NOW_VISIBLE | **NO** |
| Pre-refuel level (best available) | ~14–15% relative at dwell |
| Post-refuel rise | **Not observed** in SynqDrive stores as of B1 |

### 9.5 Route discontinuity forensics (~15 km in 91 s)

**Waypoint evidence** (`vehicle_trip_waypoints`, trip `a1b914bb…`):

| Time (UTC) | Lat | Lon | Speed |
|------------|-----|-----|-------|
| 13:26:22.371 | 51.3404166 | 9.4804716 | — (dwell end) |
| *91 s gap — zero waypoints* | | | |
| 13:27:53.371 | 51.407915 | 9.6682683 | 6 km/h |
| 13:29:03.371 | 51.4070866 | 9.66022 | 58.5 km/h |

**Computed displacement:** 15.04 km in 91 s → implied 595 km/h (non-physical).

**Tracking-run correlation** (`vehicle_trip_tracking_runs`):

| Time | Run type | Result | Summary |
|------|----------|--------|---------|
| 13:25:26 | POSSIBLE_END_CHECK | RESTING | `hard_timeout_fallback` |
| 13:27:26 | POSSIBLE_END_CHECK | RESTING | `hard_timeout_fallback` |
| 13:29:26 | POSSIBLE_END_CHECK | ACTIVE_TRIP | `activity_resumed` |
| 13:29:57 | ACTIVE_TRACKING | ACTIVE_TRIP | `route_points_count=59` batch ingest after resume |

**Interpretation:** Regular ~7 s waypoint cadence until 13:26:22, then a **91 s DIMO route-stream gap** during stationary dwell. Position at 13:27:53 arrived via **late route-point catch-up** (batch of 59 points at 13:29:57), not continuous motion. `MID_GAP_SPLIT` logic in `TripDetectionOrchestrationService` rejects splits when inter-point drift exceeds stationary threshold — consistent with **signal dropout**, not a true 15 km jump.

| Metric | Value |
|--------|-------|
| ROUTE_DISCONTINUITY_CONFIRMED | **YES** (artifact in trip waypoints) |
| ROUTE_DISCONTINUITY_CAUSAL_TO_REFUEL_MISS | **NOT_PROVEN** — energy detection uses DIMO native refuel segments (`detectEnergyEvents` → `fetchEnergyEventSegments`), not trip waypoints |

### 9.6 Trip state inconsistency (current)

| Store | Value |
|-------|-------|
| `vehicle_trips.trip_status` | **COMPLETED** (`end_time=2026-09-05T13:41:26.375Z`) |
| `vehicle_trip_detection_states.state` | **POSSIBLE_END** (`active_trip_id=a1b914bb…`, `end_validation_attempts=3`, `cusum_validated_at` empty, `updated_at=14:35:27Z`) |

**Code causality review:** `TripReconciliationService.executeReconcileWindow` Step 5 calls `energyEventsService.detectEnergyEvents` in an isolated try/catch — **not gated** on trip FSM state. Fast-repair cohort explicitly includes `POSSIBLE_END`. Ongoing CUSUM/end-validation retries affect trip FSM observability but do **not** block the reconciliation energy step.

| Metric | Value |
|--------|-------|
| TRIP_STATE_INCONSISTENCY_CAUSAL_TO_REFUEL_MISS | **NO** (architecture does not gate energy detection on POSSIBLE_END; fast repair eligible) |

Severity remains **P2 observability drift** (not upgraded to P1 blocker at B1).

### 9.7 Detector execution trace

Direct DEBUG logs are not retained at production INFO level. Negative and positive indirect proof:

| Check | Result |
|-------|--------|
| Mutex skip for vehicle | NO |
| `Energy-event detection failed` WARN | NO |
| `DIMO energy-event fetch failed` for token 192922 | NO |
| Fast repair reconcileWindow completion | INFERRED YES (no failure path) |
| Persisted REFUEL after detector window | NO |

| Metric | Value |
|--------|-------|
| REFUEL_DETECTOR_RAN | **YES** (inferred — Step 5 inside completed fast-repair passes) |
| REFUEL_DETECTOR_DECISION | **RUN_NO_EVIDENCE** (no fetch failure; zero persistable segments; no fuel rise in stores) |

### 9.8 V2 chain (not entered — Section 8 N/A)

No `VehicleEnergyEvent` REFUEL row → V2 ownership, reconciliation, settlement, enrichment **not started**.

| Field | Value |
|-------|-------|
| V2_OWNERSHIP | PENDING |
| RECONCILIATION_CREATED | NO |
| FIRST_OBSERVED_AT | NONE |
| SETTLEMENT_EXPECTED_CLOSE_AT | NONE |
| FINALITY_STATE | PENDING |
| LEGACY_RECOVERY_G2_BYPASS_OBSERVED | NO |

### 9.9 Stage B1 severity decision

| Classification | Rationale |
|----------------|-----------|
| **UPSTREAM_PROVIDER_EVIDENCE_PENDING** | No fuel-rise in SynqDrive stores; DIMO `dimo_vehicles` fuel cache stale; fleet-wide zero REFUEL ingest; detector ran without hard failure |
| P1 `REAL_REFUEL_DETECTOR_MISS` | **Not raised** — fuel-rise evidence absent; cannot distinguish detector miss from provider delay |
| P1 `REFUEL_RECOVERY_SCHEDULING_FAILURE` | **Not raised** — fast repair eligible and inferred executed |
| P1 `TRIP_STATE_BLOCKS_ENERGY_EVENT_DETECTION` | **Not raised** — code path not gated on POSSIBLE_END |

| Severity | Count | Detail |
|----------|-------|--------|
| P0 | 0 | — |
| P1 | 0 | Provider/scheduling delay still plausible ~T+69m after physical stop |
| P2 | 1 | Trip COMPLETED vs detection `POSSIBLE_END` drift persists |

| Field | Value |
|-------|-------|
| PRODUCTION_REFUEL_V2_VALIDATION_STATE | **IN_PROGRESS** |
| NEXT_REQUIRED_RECHECK_AT | **`2026-09-05T17:05:00Z`** (warm reconciliation ~12 h window, all DIMO vehicles) |

If a REFUEL row appears before 17:05Z via fast repair, that becomes **Stage B2** immediately.

## 10. Stage B2+ — automatic recheck (read-only)

Do **not** mutate production.

1. **Fast repair** (every 15m) continues silent DIMO refuel-segment fetch.
2. **Warm reconciliation** ~`2026-09-05T17:05:00Z` — primary next checkpoint.

Re-run read-only:

```sql
SELECT id, kind, start_time, created_at, fuel_delta_percent
FROM vehicle_energy_events
WHERE vehicle_id = '19fedd4b-c4e8-4de8-a125-dab293326e7e'
  AND kind = 'REFUEL'
  AND created_at >= '2026-09-05 12:00:00+00';
```

If a row appears, continue full G2.2 chain forensics (reconciliation → finality → coordinate → enrichment).

## 11. Canonical evidence nodes

- **FST:** `FST-EVID-G22-FIRST-NATURAL-PRODUCTION-REFUEL-WOB-L-7503-2026-09-05-001` (Stage A + B1)
- **EED:** `EED-EV-0040` (Stage A + B1)

Cross-reference: `FST-EVID-G22-PRODUCTION-POST-CUTOVER-T60-2026-09-04-001`, `EED-EV-0039`.
