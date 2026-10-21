# KG-EED Discovery — Energy Event Detection

**Date:** 2026-09-01  
**Status:** DISCOVERY ONLY — not canonical  
**Repository SHA anchor:** `origin/main` @ `c5dce7a9d` (2026-09-01)  
**Authority:** Evidence for future `architecture/knowledge-graphs/energy-event-detection/` — not yet canonical.

---

## 0. Scope boundary

**KG-EED owns:** How SynqDrive detects and interprets REFUEL and RECHARGE events.

**KG-EED does NOT own:** Trip scheduler, enrichment orchestration, reconciliation mutex, leader election → cross-reference **KG-ATE**.

---

## C1 — Source signal graph

### REFUEL signals

| SIGNAL_ID | PROVIDER | QUERY / SOURCE | USED_FOR | NOT_USED_FOR | LIMITATIONS |
|-----------|----------|----------------|----------|--------------|-------------|
| EED-SIG-RF-001 | DIMO | `segments(mechanism:refuel, config:{minIncreasePercent:5})` | Segment boundaries, `durationSeconds` | Physical pump duration | Detector sensitivity OEM-dependent |
| EED-SIG-RF-002 | DIMO | `powertrainFuelSystemRelativeLevel` MIN/MAX in segment | `fuelDeltaPercent`, rise derivation input | Persist gate alone | Default config missed KS MX; prod uses 5% |
| EED-SIG-RF-003 | DIMO | `powertrainFuelSystemAbsoluteLevel` MIN/MAX | `fuelDeltaLiters` | Percent-only persist | Gate: `fuelDeltaLiters > 1.0` |
| EED-SIG-RF-004 | DIMO | `powertrainTransmissionTravelledDistance` MIN/MAX | Odometer envelope | Hard reject in prod | Plausibility flags in recovery only |
| EED-SIG-RF-005 | DIMO | Segment lat/lon start/end | Geo coalesce (250 m) | — | Nullable |
| EED-SIG-RF-006 | DIMO | `signals(interval:"30s")` via `fetchFuelLevelSamples` | `fuelLevelRise*` derivation | DIMO segment boundary | ≥3 samples; conservative null |

### RECHARGE signals

| SIGNAL_ID | PROVIDER | QUERY / SOURCE | USED_FOR | NOT_USED_FOR | LIMITATIONS |
|-----------|----------|----------------|----------|--------------|-------------|
| EED-SIG-RC-001 | DIMO | `segments(mechanism:recharge)` default detector | Segment boundaries, `durationSeconds` | Fuel fields | 31-day window chunking |
| EED-SIG-RC-002 | DIMO | `powertrainTractionBatteryStateOfChargeCurrent` MIN/MAX | `socDeltaPercent` | — | Persist if ≥1% |
| EED-SIG-RC-003 | DIMO | `powertrainTractionBatteryStateOfChargeCurrentEnergy` MIN/MAX | `energyDeltaKwh` | — | Storage precision fix (15 sig digits) |
| EED-SIG-RC-004 | DIMO | `chargingIsCharging`, `cableConnected`, `addedEnergy` | Normalizer only | **Not persisted** on `VehicleEnergyEvent` | Available in recharge normalizer |
| EED-SIG-RC-005 | DIMO | Odometer in recharge query | `odometerStartKm/EndKm` | — | Same as refuel |

**Fetch orchestration:** `DimoSegmentsService.fetchEnergyEventSegments` — per-mechanism isolated outcomes (E1).

---

## C2 — REFUEL detection graph

```
DIMO refuel segments (config minIncreasePercent:5)
  → parseDimoEnergyEventSegment (parse-energy-event-segment.ts)
  → EnergyEventsService.detectEnergyEvents
       → isSegmentPersistable (liters > 1.0, !ongoing, duration > 0)
       → coalesceSegments (gap ≤300s, geo ≤250m)
       → deriveRefuelFuelLevelRise (fetchFuelLevelSamples 30s + algorithm)
       → buildUpsertPayload / scoreConfidence
       → upsert by unique dimoSegmentId
       → reconcileSupersededRefuelSiblings (token-matched overlap guard)
       → pruneStaleCoalescedSubSegments (coalesce provenance only)
  → toEnergyEventDto
  → GET energy-events | GET trips-timeline
  → TripTimelineEnergyCard (REFUEL semantics)
```

| NODE_ID | STAGE | SOURCE | TRANSFORMATION | DROP / MERGE | PERSIST |
|---------|-------|--------|----------------|--------------|---------|
| EED-N-RF-01 | DIMO fetch | `dimo-segments.service.ts` | JWT + GraphQL | mechanism failure isolated | — |
| EED-N-RF-02 | Parse | `parse-energy-event-segment.ts` | posDelta MIN/MAX | non-positive delta | segment DTO |
| EED-N-RF-03 | Persist gate | `energy-events.pipeline.ts` | `isSegmentPersistable` | liters ≤1.0 | — |
| EED-N-RF-04 | Coalesce | `coalesceSegments` | merge nearby same-mechanism | gap >300s or geo >250m | parent id `dimo-refuel-coalesced-*` |
| EED-N-RF-05 | Fuel rise | `refuel-fuel-rise.ts` | telemetry bracketing | insufficient → null | nullable fields |
| EED-N-RF-06 | Upsert | `energy-events.service.ts` | Prisma upsert | — | `VehicleEnergyEvent` |
| EED-N-RF-07 | Sibling reconcile | `refuel-sibling-reconciliation.ts` | delete superseded partial | token mismatch / incompatible delta | REFUEL-only |
| EED-N-RF-08 | Prune subsegments | `pruneStaleCoalescedSubSegments` | delete coalesced children | no provenance | — |
| EED-N-RF-09 | API | `vehicle-intelligence.controller.ts` | DTO mapping | — | read |
| EED-N-RF-10 | UI | `trip-timeline-shared.tsx` | detection window + signal rise | no bare envelope minutes | render |

---

## C3 — RECHARGE detection graph

```
DIMO recharge segments (default detector, window-split ≤31d)
  → DimoRechargeSegmentsClient → normalize → mapRechargeSegmentToEnergyEvent
  → (shared pipeline from persist gate)
       → isSegmentPersistable (socDelta≥1 OR energyDelta>0)
       → coalesceSegments (gap ≤1800s)
       → fuelLevelRise* forced null
       → upsert + pruneStaleCoalescedSubSegments (recharge coalesce only)
  → API/UI (durationSeconds as charging envelope; emerald card)
```

**Authority boundary — Battery V2 / HV Charge Session:**
- `HvChargeSession` + Battery-V2 ingest = **separate authority** (feature-flagged)
- `VehicleEnergyEvent` RECHARGE = trips timeline / fleet energy ops
- **No automatic linkage** between the two today
- EED documents consumption on timeline; Battery V2 owns HV session lifecycle

---

## C4 — Duration semantics authority (CRITICAL)

| FIELD | REFUEL_MEANING | RECHARGE_MEANING | SOURCE | OBSERVED_OR_DERIVED | CAN_BE_NULL | UI_ALLOWED | UI_FORBIDDEN |
|-------|----------------|------------------|--------|---------------------|-------------|------------|--------------|
| `durationSeconds` | DIMO **detection envelope** (stationary/context window) | Charging **session/detection envelope** | DIMO segment `duration`; recomputed on coalesce | Provider-reported envelope | NO | RECHARGE: charging duration minutes | REFUEL: bare “80 min” as pump time |
| `startTime`/`endTime` | Envelope boundaries | Envelope boundaries | DIMO segment | Observed | NO | Time range label | — |
| `fuelLevelRiseStart` | First material rise sample | **N/A (always null)** | `fetchFuelLevelSamples` + derive | Derived | YES | — | — |
| `fuelLevelRiseEnd` | Plateau bracket end | **N/A** | derive | Derived | YES | — | — |
| `fuelLevelRiseDurationSeconds` | Observed fuel-level transition; **NOT nozzle time** | **N/A** | derive | Derived | YES | “Signal change ~N min” | “Tank duration N min” from envelope |
| `fuelDeltaLiters` | Material fuel added (min/max) | N/A | DIMO MIN/MAX | Observed | YES | Primary delta | — |
| `socDeltaPercent` | N/A | SOC rise | DIMO MIN/MAX | Observed | YES | Primary delta | — |

**Canonical doc:** `architecture/P1_3_S5_ENERGY_REFUEL_SEMANTICS_2026-08-30.md`

---

## C5 — KS MX 2024 case study (first-class decision node)

**Vehicle:** KS MX 2024 · tokenId `187336` · 2026-08-28

| Step | Observation | Evidence |
|------|-------------|----------|
| 1 | UI showed ~80 min as if tank duration | `trip-enrichment-driver-score-energy-events-audit-2026-08.md` |
| 2 | Raw DIMO segment `durationSeconds=4818` (~80.3 min) | Production DB + fixture |
| 3 | Parser/coalescer preserved 4818 unchanged | E2 calibration docs |
| 4 | DB/API preserved envelope | Forensic audit |
| 5 | Telemetry fuel rise ~280–330s (22:09–22:15 UTC) | `refuel-fuel-rise.spec.ts`, prod reprocess |
| 6 | Stale sibling 685s overlapping partial segment | Production pre-reprocess |
| 7 | Decision: separate envelope vs `fuelLevelRise*` | PR #1443 / P1.3-S5 |
| 8 | Additive migration; no historical `durationSeconds` rewrite | Migration `20260830140000_*` |
| 9 | Sibling reconciliation guard | `refuel-sibling-reconciliation.ts` |
| 10 | Forward-correctness only; backfill optional | `P1_3_ENERGY_REFUEL_HISTORICAL_BACKFILL_CANDIDATES_*` |
| 11 | Production deploy + controlled reprocess | `P1_3_S6_PRODUCTION_DEPLOY_*` |

**Decision node ID (proposed):** `EED-DEC-KS-MX-2024-001`

---

## C6 — Sibling / deduplication lifecycle

### Runtime (production path)

1. DIMO may emit overlapping refuel segments (canonical long + partial short).
2. Canonical upsert with longer `durationSeconds` + compatible fuel delta.
3. `shouldSupersedeRefuelSibling()` requires: same token, overlap/containment, canonical longer, compatible %/L.
4. `deleteMany({ id in siblings, vehicleId })` — **vehicle-scoped, REFUEL-only**.

### KS MX 685s case

| Row | durationSeconds | Role |
|-----|-----------------|------|
| Canonical | 4818 | Full detection envelope |
| Stale sibling | 685 | Partial overlap inside canonical window |

**Why “delete all overlapping refuels” is unsafe:**
- Independent nearby sessions (R1/R2 recharge pattern analog) must survive
- Requires token match + fuel transition compatibility + containment/overlap ratio
- E3A Jul-16 recharge: temporal overlap without coalesce provenance → **no prune authority**

**Coalesce prune (separate):** `pruneStaleCoalescedSubSegments` only when `coalescedFromSegmentIds.length > 1` in same run.

---

## C7 — Historical decisions (EED)

| DECISION_ID | DATE | PROBLEM | DECISION | EVIDENCE | STATUS |
|-------------|------|---------|----------|----------|--------|
| EED-DEC-E1-001 | 2026-08-27 | Recharge 422 blocked all energy | Decouple mechanism fetch outcomes | `ENERGY_EVENTS_E1_RESTORATION_2026-08-27.md` | CONFIRMED |
| EED-DEC-E2-001 | 2026-08-27 | KS MX missed by default detector | `minIncreasePercent: 5` production refuel config | `dimo-energy-detector.config.ts` | CONFIRMED |
| EED-DEC-E2-002 | 2026-08-27 | Recharge over-tuned | DIMO default recharge detector (no config) | same | CONFIRMED |
| EED-DEC-E2-003 | 2026-08-27 | Liters-only persist gate | Keep `fuelDeltaLiters > 1.0` | `isSegmentPersistable` | CONFIRMED |
| EED-DEC-E3A-001 | 2026-08-29 | Storage precision churn | 15-digit canonical equality | pipeline + forensics | CONFIRMED |
| EED-DEC-E3A-002 | 2026-08-29 | Jul-16 recharge siblings | Operator closed-set M1 mutation (16 DELETE) | E3A docs | HISTORICAL |
| EED-DEC-E3A-003 | 2026-08-29 | No prune without provenance | `pruneAuthority=false` without coalesce meta | forensics module | CONFIRMED |
| EED-DEC-S5-001 | 2026-08-30 | UI mislabeled envelope as pump time | Add `fuelLevelRise*` + UI semantic split | PR #1443, P1.3-S5 doc | PRODUCTION_VALIDATED |
| EED-DEC-S5-002 | 2026-08-30 | Stale partial refuel rows | Token-scoped sibling reconciliation | `refuel-sibling-reconciliation.ts` | PRODUCTION_VALIDATED |
| EED-DEC-S5-003 | 2026-08-30 | No fabricated pump duration | Derive rise from samples; null if insufficient | `refuel-fuel-rise.ts` | CONFIRMED |
| EED-DEC-S5-004 | 2026-08-30 | No mass historical rewrite | Forward-only; backfill inventory separate | backfill candidates doc | ACTIVE |
| EED-DEC-FUTURE-001 | — | No dedicated energy scheduler | Still coupled to reconciliation step 5 | audit §30 | PROPOSED |
| EED-DEC-FUTURE-002 | — | `detectorVersion` on row | Not implemented | audit | PROPOSED |
| EED-DEC-FUTURE-003 | — | Persist recharge charging flags | Fetched but not stored | recharge normalizer | PROPOSED |

---

## Triggers (cross-reference ATE)

| Trigger | Entry | Owner |
|---------|-------|-------|
| Reconciliation step 5 | `trip-reconciliation.service.ts` → `detectEnergyEvents` | **ATE invokes; EED owns** |
| Manual API | `POST /vehicles/:id/energy-events/detect` | EED |
| Ops scripts | `backend/scripts/ops/energy-events-*` | EED recovery |

---

## Open questions (EED)

| ID | Question |
|----|----------|
| EED-OQ-01 | Dedicated energy BullMQ scheduler vs reconciliation coupling? |
| EED-OQ-02 | Safe automated backfill for 13 NULL rise rows? |
| EED-OQ-03 | Persist recharge `isCharging` / `addedEnergy` on `VehicleEnergyEvent`? |
| EED-OQ-04 | Link `VehicleEnergyEvent` RECHARGE to `HvChargeSession`? |
| EED-OQ-05 | `detectorVersion` column for forensic replay? |
| EED-OQ-06 | Plausibility flags in production rows vs recovery-only? |
| EED-OQ-07 | Fleet-wide overlapping sibling inventory (3 pairs) remediation policy? |
| EED-OQ-08 | Frontend `POST detect` — should UI ever call it? |
| EED-OQ-09 | Phase F fuel station enrichment card vs EED semantics alignment? |
| EED-OQ-10 | ClickHouse mirror for fuel samples long-term? |
| EED-OQ-11 | RECHARGE duration UI when coalesced multi-hour sessions? |
| EED-OQ-12 | Energy observability SLOs for derivation null rate? |

---

## Inventory summary

| Metric | Count |
|--------|------:|
| **Components (signals + pipeline + API + UI + scripts)** | **52** |
| **Decisions** | **14** |
| **Evidence artifacts cited** | **26** |
| **Open questions** | **12** |
