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

## 9. Stage B — automatic recheck (read-only)

Do **not** mutate production. Recheck when:

1. **Fast repair passes** (every 15m) may fetch DIMO refuel segments silently.
2. **Warm reconciliation** ~`2026-09-05T17:05:00Z` (12h window, all 6 DIMO vehicles).

**EARLIEST_REQUIRED_RECHECK_AT = `2026-09-05T14:30:00Z`** (allow post-finalize fast passes + DIMO propagation), then **`2026-09-05T17:05:00Z`** if still absent.

Re-run read-only:

```sql
SELECT id, kind, start_time, created_at, fuel_delta_percent
FROM vehicle_energy_events
WHERE vehicle_id = '19fedd4b-c4e8-4de8-a125-dab293326e7e'
  AND kind = 'REFUEL'
  AND created_at >= '2026-09-05 12:00:00+00';
```

If a row appears, continue full G2.2 chain forensics (reconciliation → finality → coordinate → enrichment).

## 10. Blockers

| Severity | Count | Detail |
|----------|-------|--------|
| P0 | 0 | — |
| P1 | 0 | No confirmed permanent miss yet — provider/scheduling delay still plausible at T+38m |
| P2 | 1 | Trip detection `POSSIBLE_END` while `vehicle_trips` already COMPLETED |

## 11. Canonical evidence nodes

- **FST:** `FST-EVID-G22-FIRST-NATURAL-PRODUCTION-REFUEL-WOB-L-7503-2026-09-05-001`
- **EED:** `EED-EV-0040`

Cross-reference: `FST-EVID-G22-PRODUCTION-POST-CUTOVER-T60-2026-09-04-001`, `EED-EV-0039`.
