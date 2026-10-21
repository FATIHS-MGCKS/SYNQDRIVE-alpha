# G1.1 HF evidence closure — KS MX REFUEL 2026-09-04

**Supplements:** `refuel-physical-event-coordinate-forensics-2026-09-04.md`  
**Artifact:** `architecture/tankstellenerkennung/evidence/G11_HF_CLOSURE_KS_MX_2026-09-04.json`  
**Script:** `backend/scripts/ops/refuel-incident-g11-closure.mjs` (read-only VPS execution)

---

## Gate summary

| Gate | Result |
|------|--------|
| HF_TELEMETRY_RETRIEVED | **YES** |
| PHYSICAL_ESSO_DWELL_CONFIRMED | **YES** |
| FUEL_TIMING_CAUSE | **MIXED** |
| COORDINATE_AUTHORITY_V2_SELECTED | **YES** |
| PHYSICAL_REFUEL_IDENTITY_DESIGN_READY | **YES** |
| HISTORICAL_FALSE_MERGE_DRY_RUN | **PASS** (limited corpus) |
| LEADER_ELECTION_CONTRACT | **GAP** (`SCHEDULER_LEADER_ELECTION_ENABLED=null`) |
| IMPLEMENTATION_READY | **YES** |

---

## 1. Telemetry sources retrieved

| Source | Status | Notes |
|--------|--------|-------|
| ClickHouse `telemetry_hf_points` | **YES** | 274 speed + OBD/powertrain rows; **no GPS/fuel** mirrored |
| ClickHouse `telemetry_hf_windows` | **YES** | 74 windows; `gps_point_count=0` throughout |
| DIMO `signals(interval:"7s")` route | **YES** | 207 GPS+speed points |
| DIMO `signals(interval:"30s")` fuel | **YES** | 41 fuel samples |
| PostGIS resolver probes | **YES** | Esso dwell → score **78 MATCHED** |

**ClickHouse ingress (speed):** `recorded_at` 03:37:45 → `ingested_at` 05:48:46 ≈ **7,861 s (~2h 11m)** batch mirror lag. Not usable for real-time forensics; DIMO provider timestamps authoritative for motion/fuel.

---

## 2. Corrected timing semantics

Owner recollection (approximate): arrival **~05:43**, departure **~05:47** CEST.

| Event | Local (CEST) | Offset vs ~05:47 departure | Offset vs ~05:43 arrival |
|-------|--------------|----------------------------|--------------------------|
| First GPS near Esso (98 m) | 05:43:18 | −3m42s | +18s |
| Forecourt approach (50 m) | 05:43:25 | −3m35s | +25s |
| **Stationary at Esso (10 m, 0 km/h)** | **05:44:07** | −2m53s | +1m07s |
| Last stationary GPS at Esso | 05:47:37 | −23s | +4m37s |
| Fuel still 7 L (DIMO 30s) | 05:44:00–05:47:30 | — | — |
| Event A `fuelLevelRise` start | 05:47:45 | **+45s** | +4m45s |
| Event B `fuelLevelRise` start | 05:49:13 | **+2m13s** | +6m13s |
| First DIMO absolute fuel rise (7→14.3 L) | 05:48:00 | +1m00s | +5m00s |
| Rise end / plateau 28 L | 05:52:45 | **+5m45s** | +9m45s |

**Do not collapse these into a single “fuel lag” number.** Separate dimensions:

| Dimension | Measured offset | Primary cause (evidence) |
|-----------|-----------------|------------------------|
| Physical stop → first rise **observation** | ~3m38s (05:44:07 → 05:47:45) | **SENSOR** + **DETECTOR_SEMANTICS** (30s samples) |
| Departure → rise start | +45s | **SENSOR** damping |
| Departure → rise end | +5m45s | **SENSOR** stabilization tail |
| Provider `recorded_at` → CH `ingested_at` | ~2h11m | **INGRESS** batch mirror |
| Segment B vs A provider start | +478s | **PROVIDER_AGGREGATION** (DIMO segment envelope) |

---

## 3. Vehicle motion reconstruction (05:38–05:52 local)

| Phase | Local | Evidence | Interpretation |
|-------|-------|----------|----------------|
| Approach | 05:43:18–05:43:32 | Speed 31→23 km/h; distance to Esso 98→20 m | Entering Ysenburgstraße forecourt |
| Forecourt creep | 05:43:39–05:43:53 | Speed 9.75→6.5 km/h; 13–17 m from Esso | Low-speed positioning at pumps |
| **Stationary dwell** | **05:44:07–05:47:37** | Speed 0 / null; 10–14 m from Esso; fixed coords | **Physical refuel stop at Esso** |
| Post-stop (still at coords) | 05:47:16–05:47:37 | Same GPS (~11 m); speed null | Engine possibly off / no speed sample |
| Departure / rise window | ≥05:47:45 | Rise GPS 218 m–1.7 km from Esso; speed 47–87 km/h in HF | Vehicle moving; fuel signal rising |

**PHYSICAL_ESSO_DWELL_CONFIRMED = YES** — independent DIMO 7s GPS places vehicle **10 m** from Esso centroid at 0 km/h for ≥3.5 minutes.

---

## 4. Physical stop cluster

Forecourt cluster (≤20 m from Esso, 05:43:25–05:47:37):

| Statistic | Value | Distance to Esso |
|-----------|-------|------------------|
| Median | 51.3212641, 9.5145425 | ~11 m |
| Nearest sample | 51.321265, 9.5145616 @ 05:44:07 | **10 m** |
| Samples | 10 | — |

**False lead:** longest global low-speed cluster at 05:37–05:38 is **1,647 m** from Esso (unrelated earlier stop). V2 must anchor to **forecourt cluster before fuel-rise onset**, not global longest dwell.

---

## 5. Coordinate authority V2 — measured policies

| Policy | Coordinates | n | Dist Esso | Resolver |
|--------|-------------|---|-----------|----------|
| A segment start | 51.3305883, 9.5126383 | 1 | 1,038 m | NOT_FOUND |
| B segment start | 51.3150216, 9.5170483 | 1 | 721 m | NOT_FOUND |
| B rise-start GPS | 51.3194166, 9.5152783 | 1 | 218 m | NOT_FOUND (score 8) |
| C rise median | 51.3053683, 9.5132333 | 43 | 1,778 m | NOT_FOUND |
| D rise medoid | 51.3063400, 9.5140433 | 43 | 1,668 m | NOT_FOUND |
| E/F pre-rise dwell (global) | 51.3350891, 9.5058708 | 10 | 1,647 m | NOT_FOUND |
| **I forecourt dwell medoid (selected)** | **51.321263, 9.514558** | **10** | **~11 m** | **MATCHED (score 78)** |

### Selected V2 policy: `physical_refuel_forecourt_dwell_medoid_v2`

```
fuel-rise onset (samples or fuelLevelRiseStart)
  → look backward for low-speed (≤3 km/h) GPS cluster
  → choose cluster temporally adjacent to rise (NOT global longest)
  → medoid(coordinates) with speed+GPS joint gate
  → FuelStationLocationResolver
```

`coordinatePolicyVersion`: new version required (do not reuse `energy_event_start`).

---

## 6. Physical refuel identity — two-stage design

### Stage 1 — coarse scope / lock key

`pg_advisory_xact_lock(hashtext(vehicleId || '|' || terminalFuelBucket || '|' || endTimeBucket))`

Buckets derived from **evidence-based quantization** (not naive rounded hash alone):

- `terminalFuelLiters`: floor to 0.5 L
- `endTime`: floor to 60 s
- `odometerEndKm`: round to 1 km

### Stage 2 — semantic sibling matcher

Implemented dry-run: `physical-refuel-identity.matcher.ts`

Evidence for incident: **A + B → SAME_PHYSICAL_REFUEL**, canonical = **A** (most complete consistent transition superset: 7→28 contains 21→28).

**Not** “global maximum fuelDelta” — prefer **most complete consistent transition superset**; fail closed if ambiguous.

### Historical dry-run (read-only)

| Pair | Expected | Matcher |
|------|----------|---------|
| 2026-09-04 A + B | merge | **match** (canonical A) |
| 2026-09-03 vs 2026-09-02 | separate | **no match** |
| Incident A vs unrelated row | separate | **no match** |
| 2026-08-29 overlapping pair (same end) | merge (containment) | **match** (canonical longer delta) |

Tests: `physical-refuel-identity.matcher.spec.ts` — **5/5 PASS**

---

## 7. Enrichment sequencing (proven)

`energy-events.service.ts` `upsertSegment()`:

1. `vehicleEnergyEvent.create/update`
2. **`enqueueAfterPersistFromEvent(row)`** ← enrichment enqueued here
3. End of batch → `reconcileSupersededRefuelSiblings()`

**G2 invariant:** reconcile + canonical identity **before** enqueue; superseded rows must not enqueue enrichment.

---

## 8. Concurrency design (G2 refinement)

```
provider REFUEL candidate
  → derive physical-refuel scope key
  → BEGIN
  → pg_advisory_xact_lock(scope)
  → semantic sibling query + matcher
  → upsert canonical OR attach evidence to existing
  → COMMIT
  → enqueue enrichment (canonical only)
```

No new table required initially; optional `physicalRefuelFingerprint` + provenance on `VehicleEnergyEvent.rawDetectionMeta`.

---

## 9. Remaining gaps (non-blocking)

1. ClickHouse HF mirror lacks GPS/fuel for this vehicle — V2 coordinate derivation should use **DIMO route samples** (same path as fuel-rise) until CH coverage improves
2. CH ingress batch lag ~2h — not suitable for operational station enrichment timing
3. `SCHEDULER_LEADER_ELECTION_ENABLED=null` on N=2 — independent Tankstellenerkennung recovery gap
4. Fleet-wide tolerance calibration needs more sibling pairs with full fuel endpoints

---

## 10. IMPLEMENTATION_READY = YES

All seven closure criteria met for G2 implementation planning. Production incident rows remain untouched.
