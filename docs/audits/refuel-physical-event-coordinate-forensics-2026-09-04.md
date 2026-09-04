# REFUEL physical event + fuel-station coordinate forensics (2026-09-04)

**Workstream:** Tankstellenerkennung / Energy Event Detection  
**Phase:** Forensic reconstruction + production-ready design (no implementation)  
**Incident date:** 2026-09-04 (Europe/Berlin)  
**Vehicle:** KS MX 2024 — `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` (DIMO token `187336`)  
**Owner ground truth station:** Esso, Ysenburgstraße 22, 34125 Kassel (`way/260122108`)

---

## 1. Repository and deployment SHAs

| Reference | Value | Provenance |
|-----------|-------|------------|
| `origin/main` (forensic branch base) | `95234b28bfa88b328430bb7af769e57ad30a275a` | `git fetch origin main` |
| Production deployed SHA | `5b788a223d0461f29b96b142e51388c9831366a2` | `architecture/P1_8_3_5_INC_07_PRODUCTION_VALIDATION_BASELINE_2026-09-03.md` |
| Production release | `20260903211138_v4994` | Same + prior read-only VPS audit |
| **Production ≠ main** | **Yes** | Main advanced after 2026-09-03 deploy |

---

## 2. Raw telemetry sources accessed

| Source | Status | Notes |
|--------|--------|-------|
| Production Postgres (`vehicle_energy_events`) | **SUCCESS** | Read-only SELECT on both incident rows (prior forensic pass) |
| Production Postgres (`vehicle_energy_event_fuel_station_enrichments`) | **SUCCESS** | COMPLETED / NOT_FOUND for both |
| Production PostGIS (`osm.fuel_stations`) | **SUCCESS** | Esso + nearby Aral probes |
| Production PM2 / env flags | **SUCCESS** (prior pass) | N=2 replicas; `SCHEDULER_LEADER_ELECTION_ENABLED=null` |
| ClickHouse `telemetry_hf_points` | **SUCCESS (partial)** | 274 speed/OBD rows; **no GPS/fuel** in CH for this vehicle/window. See G1.1 closure. |
| DIMO route `signals(7s)` + fuel `signals(30s)` | **SUCCESS** | 207 GPS points; 41 fuel samples. Forecourt dwell confirmed. |

**Authoritative ClickHouse access path (for implementation phase):** `CLICKHOUSE_URL` + `CLICKHOUSE_USER` + `CLICKHOUSE_PASSWORD` + `CLICKHOUSE_DATABASE` via `@clickhouse/client` (`clickhouse.service.ts`). Table: `synqdrive.telemetry_hf_points` (not legacy `high_frequency_telemetry` / `telemetry_hf_points` with `ts` column assumed by draft extract scripts).

---

## 3. Real-world timeline reconstruction

All local times CEST (UTC+2). Owner times are approximate human recollection.

| Phase | Local (CEST) | UTC | Evidence | Interpretation |
|-------|--------------|-----|----------|----------------|
| A. Approach | ~05:38–05:43 | ~03:38–03:43 | Event A segment start 05:40:45; owner ~05:43 arrival | Vehicle approaching Esso area; DIMO segment A start GPS is **not** at station (1,038 m from Esso) |
| B. Arrival / dwell | ~05:43 | ~03:43 | Owner recollection | Physical stop at Esso forecourt — **station identity authoritative** |
| C. Physical fueling | ~05:43–05:47 | ~03:43–03:47 | Owner payment + pump recollection | True refuel interval; duration ~4 min (uncertain) |
| D. Departure | ~05:47 | ~03:47 | Owner recollection | Vehicle likely moving before fuel signal rise completes |
| E. DIMO segment B start | 05:48:43 | 03:48:43.109 | Event B `startTime` | Provider segment anchor **478 s after A**; GPS 721 m from Esso |
| F. Delayed fuel rise (A) | 05:47:45 → 05:52:45 | 03:47:45 → 03:52:45 | Event A `fuelLevelRise*` | Rise begins **~5 min after** owner departure; ends **~6 min after** |
| G. Delayed fuel rise (B) | 05:49:13 → 05:52:43 | 03:49:13 → 03:52:43 | Event B `fuelLevelRise*` | Nested suffix rise inside A |
| H. Stabilization | — | 03:55:10 | Both events `endTime` | Plateau 28 L / 43.14 %; same odometer 187740 |
| I. Persistence B | — | 04:33:44 | Event B `createdAt` | ~45 min after A — scheduled reconciliation cadence |

### Latency estimates (G1.1 — measured, do not collapse)

| Dimension | Offset | Notes |
|-----------|--------|-------|
| Owner departure (~05:47) → Event A rise **start** | **+45 s** | Not “5–6 min lag” |
| Owner departure → Event B rise start | **+2 m 13 s** | |
| Owner departure → rise **end** | **+5 m 45 s** | Stabilization tail |
| Owner arrival (~05:43) → A rise start | **+4 m 45 s** | |
| Physical stop at Esso (05:44:07) → A rise start | **+3 m 38 s** | Sensor + 30s sampling |
| Fuel flat 7 L at Esso → first absolute rise | **~4 m** (05:44→05:48) | **SENSOR** |
| CH `recorded_at` → `ingested_at` (speed) | **~2 h 11 m** | **INGRESS** batch mirror |
| Provider segment B vs A start | **478 s** | **PROVIDER_AGGREGATION** |

**FUEL_TIMING_CAUSE = MIXED** (sensor damping, 30s provider sampling, detector window semantics, CH ingress batch lag).

Full tables: `refuel-g11-hf-evidence-closure-2026-09-04.md`.

---

## 4. Physical stop coordinate (G1.1 confirmed)

**PHYSICAL_ESSO_DWELL_CONFIRMED = YES** via DIMO 7s route telemetry.

| Candidate | Coordinates | Distance to Esso | Resolver |
|-----------|-------------|------------------|----------|
| Event A segment start | 51.3305883, 9.5126383 | 1,038 m | NOT_FOUND |
| Event B segment start | 51.3150216, 9.5170483 | 721 m | NOT_FOUND |
| Rise-start GPS | 51.3194166, 9.5152783 | 218 m | NOT_FOUND (score 8) |
| Rise-window medoid | 51.3063400, 9.5140433 | 1,668 m | NOT_FOUND |
| Global pre-rise dwell (wrong) | 51.3353366, 9.506155 | 1,665 m | NOT_FOUND |
| **Forecourt dwell medoid (V2)** | **51.321263, 9.514558** | **~11 m** | **MATCHED (score 78)** |

Stationary interval: **05:44:07 → 05:47:37** local at 10–14 m from Esso.

---

## 5. Nearby OSM fuel-station candidates (500 m from Esso)

| OSM | Name / brand | Distance from Esso |
|-----|--------------|-------------------|
| `way/260122108` | Esso | 0 m (ground truth) |
| `way/697554280` | Aral | ~297 m |

Dataset version: `geofabrik-germany-20260830`.

---

## 6. Why Event A + Event B are one physical fill

| Evidence dimension | Observation |
|--------------------|-------------|
| Terminal fuel state | Identical 28 L / 43.14 % |
| End time / odometer | Identical `03:55:10Z`, 187740 km |
| Temporal containment | B window ⊂ A window |
| Fuel transition suffix | A: 7→28 L; B: 21→28 L (B is tail of same rise) |
| Rise overlap | B rise ⊂ A rise envelope |
| Owner ground truth | Single visit to Esso |
| Provider identity | Same token `187336`, different segment IDs |

**Conclusion:** One physical refuel at Esso; two DIMO provider segments describing overlapping partial views of the same fuel transition.

---

## 7. Arrival-order bug / reconciliation behavior

Audited code: `energy-events.service.ts` (upsert → `enqueueAfterPersist` → `reconcileSupersededRefuelSiblings`), `refuel-sibling-reconciliation.ts`, `energy-events.pipeline.ts` (coalesce).

### Failure chain

1. **Coalesce:** gap 478 s > `COALESCE_GAP_SECONDS_REFUEL` (300); start distance ~1,758 m > `COALESCE_GEO_RADIUS_M` (250) → **two groups**.
2. **Upsert key:** `dimoSegmentId` unique per segment → **two rows**.
3. **Sibling reconcile (ORDER 1 — A first):** B not in DB → candidates `[]` → **no delete**.
4. **Sibling reconcile (ORDER 2 — B later):** canonical batch `[B]` only; `shouldSupersedeRefuelSibling(B,A)` fails — B shorter (386 < 865 s) → **no delete**.
5. **Sibling reconcile (ORDER 3 — same batch):** `shouldSupersedeRefuelSibling(A,B)` fails `areFuelTransitionsCompatible` — `|31.76 − 8.63| = 23.13 > 20` → **no delete**.

### Offline replay (proven by test)

`refuel-sibling-reconciliation.sept04-2026.spec.ts` — all orders leave **two rows**.

### Concurrency (ORDER 4)

N=2 replicas can run `detectEnergyEvents` concurrently on overlapping windows. Upsert is idempotent per `dimoSegmentId`, but sibling reconcile is **not transactional** with cross-replica visibility — race can persist both before either reconcile pass. **Separate from root cause** (logic would fail even single-replica with delayed B).

---

## 8. Coordinate policy experiment matrix (offline)

| Policy | Algorithm | Esso distance (this incident) | Production verdict |
|--------|-----------|------------------------------|-------------------|
| **A** Segment start | `startLatitude/startLongitude` from DIMO segment start | 721–1,038 m | **Fails** — current V1 |
| **B** First fuel-rise sample GPS | GPS at `fuelLevelRiseStart` | Unknown without HF; likely post-departure | **Risky** — lag |
| **C** Rise-window median GPS | Median lat/lon while fuel rising | Unknown; likely biased late | **Risky** |
| **D** Rise-window medoid GPS | Min-sum-distance sample in rise window | Same as C | **Risky** |
| **E** Pre-rise stationary cluster | Last sustained speed&lt;5 km/h cluster before rise | **Best candidate** — needs HF | **Recommended V2** |
| **F** Dwell around physical stop | Max-duration low-speed window in segment envelope | Needs HF + stop detector | **Recommended V2** |
| **G** Last stationary before movement | Final cluster before sustained speed &gt;15 km/h | Robust for pay-inside / engine-on | **Strong candidate** |
| **H** Segment end coordinate | `endLatitude/endLongitude` | Not measured this incident | Unknown |

### Policy design requirements (all strategies)

- Robust primitives: cluster, median, medoid (not arithmetic midpoint of segment bounds)
- Explicit `coordinatePolicyVersion` bump on semantic change
- Failure mode: ambiguous multi-station → AMBIGUOUS, not widen radius
- Sparse HF: fall back to coarser windows table or segment envelope with widened **candidate search** only after confidence scoring — **not** global radius inflation

---

## 9. Physical REFUEL identity contract (design)

### Problem

`dimoSegmentId` ≠ `PHYSICAL_REFUEL_IDENTITY`. Current reconcile assumes **longer segment = canonical**, which fails when partial segment arrives later with incompatible percent deltas.

### Proposed fingerprint (arrival-order independent)

```
PHYSICAL_REFUEL_FINGERPRINT =
  hash(vehicleId, terminalFuelLiters_q, terminalFuelPercent_q, endTime_bucket, endOdometer_q)
```

Quantization from sensor evidence:

- `terminalFuelLiters_q`: round to 0.5 L (28.0 L shared)
- `terminalFuelPercent_q`: round to 0.1 % (43.1 % shared)
- `endTime_bucket`: floor to 60 s (`03:55:10` shared)
- `endOdometer_q`: round to 1 km (187740 shared)

### Merge rule (symmetric sibling reconciliation v2)

Two REFUEL rows are **physical siblings** iff:

1. Same `vehicleId`
2. Same terminal fuel liters (±0.5 L) AND percent (±0.2 %)
3. Same `endTime` (±60 s) AND `odometerEndKm` (±1 km)
4. Windows overlap OR fuel-rise windows overlap OR fuel transitions are **suffix-compatible** (e.g. 7→28 and 21→28)

**Canonical selection** (not duration-first, not global max-delta):

- Prefer **most complete consistent transition superset** (A: 7→28 contains B: 21→28)
- Fail closed if no clear superset
- Two-stage design: coarse advisory lock scope + semantic matcher (`physical-refuel-identity.matcher.ts`)

### False-merge protection (negative fixtures required)

| Case | Must NOT merge |
|------|----------------|
| Two stations minutes apart | Different dwell clusters &gt;500 m |
| Partial top-up + second fill | Different terminal fuel / end odometer |
| Fuel sensor correction | No overlapping rise; incompatible deltas |
| Similar final % only | Different end times / odometer |
| Different vehicles | `vehicleId` mismatch |
| RECHARGE | Kind guard (existing `EED-INV-006`) |

---

## 10. Enrichment sequencing recommendation

**Current:** `enqueueAfterPersist` fires **immediately** on each upsert, **before** `reconcileSupersededRefuelSiblings`.

**Defect:** Both A and B receive enrichment jobs; if B were later deleted, enrichment row would remain orphaned on deleted event (here both survived).

**Desired invariant:** Only **canonical physical refuel** is enrichment subject.

**Design options:**

| Option | Mechanism | Pros | Cons |
|--------|-----------|------|------|
| **A** Reorder: reconcile → enqueue | Move enqueue after sibling reconcile in same transaction scope | Simple | Late sibling still triggers second pass |
| **B** Enqueue with fingerprint; cancel superseded | BullMQ job keyed by `physicalRefuelFingerprint`; delete/update enrichment on supersede | Idempotent | Requires enrichment lifecycle extension |
| **C** Deferred enqueue (short delay / outbox) | Wait for reconcile window | Race reduction | Latency |

**Recommendation:** **A + B** — reconcile before enqueue in `detectEnergyEvents`; enrichment fingerprint includes `physicalRefuelFingerprint`; superseded rows mark enrichment `SKIPPED_SUPERSEDED` (new terminal state or lifecycle reason).

---

## 11. Concurrency / idempotency design

| Concern | Design |
|---------|--------|
| Repeated reconciliation | Symmetric fingerprint merge; `deleteMany` → soft-supersede flag preferred over hard delete for audit |
| Delayed provider segments | Re-run reconcile on each detect pass with ±2 h search (existing) |
| Process restart | DB-backed fingerprint unique index `(vehicleId, physicalRefuelFingerprint)` |
| N=2 replicas | Transaction-scoped `SELECT … FOR UPDATE` on fingerprint row OR advisory lock per `(vehicleId, fingerprint)` during canonical upsert |
| Crash safety | Outbox or reconcile-first enqueue |

**Do not** widen `COALESCE_GEO_RADIUS_M` as primary fix.

---

## 12. Versioning / provenance

| Field | Change |
|-------|--------|
| `coordinatePolicyVersion` | New: `physical-stop-v2` |
| `FUEL_STATION_ENRICHMENT_COORDINATE_SOURCE` | Extend enum beyond `energy_event_start` |
| `resolverVersion` | Bump when input coordinate semantics change |
| Enrichment `inputFingerprint` | Include `coordinatePolicyVersion` + `physicalRefuelFingerprint` |
| Observability | Log dwell cluster sample count, rise lag seconds, policy version |

---

## 13. Multi-replica leader-election status

| Check | Finding |
|-------|---------|
| PM2 processes | 2 (`synqdrive`, `synqdrive-b`) — CONFIRMED (prior audit) |
| `SCHEDULER_LEADER_ELECTION_ENABLED` | **null** on production env |
| `fuel_station_enrichment_recovery` leader | **Contract gap** — recovery may run on both replicas without election |
| Relation to duplicate REFUEL | **None** — duplicate caused by EED logic + delayed segment B |

---

## 14. Explicit answers (A–G)

| Q | Answer |
|---|--------|
| **A. Why two REFUEL rows?** | DIMO emitted two overlapping segments; coalesce thresholds not met; sibling reconcile is duration-biased and percent-guard blocks merge; separate upsert keys. |
| **B. Why NOT_FOUND?** | V1 uses segment-start GPS 721–1,038 m from Esso; no station within 250 m; midpoint has candidates but score 8 &lt; 55. |
| **C. Where stationary during fill?** | Esso Ysenburgstraße 22 (owner ground truth). Telemetry anchor **not yet proven** — HF dwell pending. |
| **D. Fuel-rise delay?** | **~5–6 min** after owner departure vs rise window (INFERRED). |
| **E. Robust coordinate authority?** | Pre-rise / dwell stationary cluster (policy E/F/G), not segment start or rise-window GPS. |
| **F. Physical identity rule?** | Terminal-state fingerprint + suffix-compatible transitions; canonical = max delta, not max duration. |
| **G. Missing evidence?** | HF ClickHouse GPS/speed/fuel time series; segment end coordinates; ingress `ingested_at` latency distribution. |

---

## 15. IMPLEMENTATION_READY

**YES** (G1.1 closure 2026-09-04)

HF/route evidence confirms Esso forecourt dwell; V2 coordinate policy `physical_refuel_forecourt_dwell_medoid_v2` resolves MATCHED at score 78; timing semantics corrected; two-stage physical-refuel identity design validated by dry-run tests.

See: `refuel-g11-hf-evidence-closure-2026-09-04.md`

---

## 16. Knowledge graph updates

See commit: FST nodes `FST-EVID-INCIDENT-REFUEL-2026-09-04-001`, gap updates, `FST-HYP-GPS-OFFSET-001` → CONFIRMED; EED `EED-EV-0026`, `EED-OQ-013`.

---

## 17. Tests / validators executed

```bash
cd backend && npm test -- refuel-sibling-reconciliation.sept04-2026.spec.ts
node architecture/tankstellenerkennung/scripts/validate-graph.mjs
node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs
```

---

## 18. Remaining uncertainties

1. Fleet-wide quantization tolerances for physical-refuel identity (single incident measured)
2. ClickHouse HF mirror GPS/fuel completeness for all vehicles (this vehicle: speed-only in CH)
3. DIMO segment start anchor semantics vs physical stop (documented; V2 policy mitigates for enrichment)
4. Production `SCHEDULER_LEADER_ELECTION_ENABLED` remediation timeline (separate from duplicate root cause)
5. G2 implementation: reconcile-before-enqueue ordering and advisory lock scope

---

## Files changed (this forensic PR)

- `docs/audits/refuel-physical-event-coordinate-forensics-2026-09-04.md` (this file)
- `architecture/tankstellenerkennung/evidence/INCIDENT_REFUEL_KS_MX_2026-09-04.md`
- `backend/src/modules/dimo/fixtures/ks-mx-2024-sept04-refuel.fixture.ts`
- `backend/src/modules/vehicle-intelligence/energy-events/refuel-sibling-reconciliation.sept04-2026.spec.ts`
- Tankstellenerkennung + KG-EED graph/documentation updates
- Draft extract scripts (correct schema TBD): `backend/scripts/ops/refuel-incident-*`

**Changes / Architektur:** Updated per workspace rules.
