# Tire Intelligence P1 — Tire Wear Model V2 ↔ DS4 Motion Engine Integration Audit

**Mode:** documentation only · read-only verification · no implementation. **Date:** 2026-10-24. **Repo:** `1c1e3bfa4`. **Production:** `c169ddfab` (`VERIFIED_READ_ONLY`).

Owner frame: keep the existing tire stack; V2 is frozen and will be superseded in a controlled way; DS4 Motion Events are the future driving-load basis; new calculation is shadow-only; **no new wear formula in this PR**.

---

## 1. Comparison matrix

| Investigation | Result |
|---------------|--------|
| **Current V2 inputs** | `DrivingImpactService.getVehicleImpactForTire(vehicleId)` → `vehicle_driving_impact_current` {windowDays, distanceKmWindow, citySharePct, highwaySharePct, countryRoadSharePct, longitudinalStressScore, brakingStressScore, stopGoStressScore, highSpeedStressScore, drivingStressScore}. Weights: usage city 1.12 / highway 0.95 / country 1.03 (clamp 0.93–1.15); behaviour 0.50 longitudinal + 0.35 braking + 0.15 drivingStress → anchors 0→0.97 … 100→1.35 (clamp 0.97–1.35). Stress scores come from HF-derived hardAccel/hardBrake per 100 km (trip behaviour enrichment), aggregated per `trip_driving_impact` and rolled up per vehicle. Ledger additionally stores per-trip `drivingImpactSummary` and deprecated `harsh*` counters. Temperature (90-day trip start temp), pressure, axle/load, season, regen are **independent of DS4** and unchanged. |
| **DS4 acceleration** | `kind='ACCELERATION'`. Detector `HF_THRESHOLDS_V1`: entry 1.5 m/s², continue 1.2 m/s², ≥2 steps, Δv ≥ 4.0 km/h (3.0 km/h continuation). In-memory event: `startSpeedKmh, endSpeedKmh, deltaKmh, meanAccelMps2, peakAccel1sMps2, peakAccel2sMps2, durationS, steps, coverageRatio, quality, flags`. **Persisted** row: only `kind, startLabel, endLabel, startSpeedKmh, endSpeedKmh, deltaKmh, quality, flags`. Intensity therefore must be re-derived as Δv / (endLabel − startLabel). Fable B3: mean intensities systematically attenuated by −0.13…−0.55 m/s² (implicit 3-s kernel on C4 differences); peak1s must not be exposed. Production sample: 187 events / 34 trips. |
| **DS4 braking** | `kind='DECELERATION'`, same thresholds on negative acceleration, same field set and persistence limits. Production sample: 262 events / 34 trips (braking dominates). Same B3 caveat. |
| **Data availability** | **Main:** detector + shadow worker + P1/P2 merged (#2154). **Production:** deployed (`c169ddfab`), shadow + C5.1 + FSM gap-bridge flags ON for allowlisted org/vehicles; 85 SUCCEEDED runs, 34 trips, **4 of 6 vehicles**. **Shadow only:** events exist solely inside gzip payloads of `di_v0_motion_core_shadow_runs_v1` (+ `summary_json`); no product table, no productive consumer. **Replay:** post-trip retrospective; reprocessing per bundle version creates additional runs per trip (latest SUCCEEDED per trip must be selected). |
| **Data quality** | Quality labels persisted: OK 394 · DEGRADED 21 · LIMITED 32 · ARTEFACT_SUSPECT 2 (latest run per trip). `quality` encodes **speed-sample provenance and internal consistency**, not physical validation (`TIRE-INV-DS4-QUALITY-IS-NOT-PLAUSIBILITY-001`). Suitable as model input **only ordinally / as counts and durations** after admission gating; absolute m/s² thresholds are not defensible (B3, `TIRE-GAP-DS4-INTENSITY-ATTENUATION-B3-001`). Speed authority differs between trips (C4_ONLY 29 vs C5_1_PREFERRED 5) → version by bundle (`TIRE-GAP-DS4-SPEED-AUTHORITY-MIX-001`). |
| **Integration — smallest adapter** | Read-only tire-side adapter on `DiV0MotionCoreShadowTripMapReadService.readForTrip(organizationId, vehicleId, tripId)` (org-scoped; exported by `DiV0MotionCoreShadowModule`). **Not** invoked synchronously inside `attributeTireUsageOnCanonicalFinalization` or any trip-finalization transaction — that path must stay fast and must not block on DS4 latency or retries. Instead: an **asynchronous, retry-capable tire shadow consumer** (dedicated BullMQ queue + processor in `tires/`, leader-guarded scheduler or outbox drain) enqueues work when a ledger row exists (or on periodic catch-up for trips with ledger but no tire-shadow row yet). Processor calls `readForTrip`; on `status=PENDING` or missing `SUCCEEDED` run it **re-schedules with backoff** (same pattern as `di_v0_motion_core_shadow_outbox_v1.attemptCount` / `nextAttemptAt`) until DS4 completes or a terminal tire-side give-up policy applies — work is never silently dropped because DS4 was still running. On `SUCCEEDED` / `SUCCEEDED_EMPTY`, apply admission §2 and persist to the tire shadow table (identity §4.1). No DI module change, no new DI export; must never run inside the productive recalculation transaction or rental-health path. |
| **Fallback** | **Neutral**, mirroring V2 (`impact === null → 1.0`): vehicles/trips without admissible DS4 events contribute **no** load delta and are flagged `coverage=NONE|PARTIAL`. Conservative means "do not claim load you cannot evidence", never "assume worst case". A conservative *penalising* fallback is explicitly rejected (`TIRE-INV-NEUTRAL-FALLBACK-001`). |

---

## 2. Quality classes — conservative admission policy (PROPOSED, `TIRE-DEC-DS4-CONSERVATIVE-ADMISSION-POLICY-001`)

| Quality | Counts / durations | Ordinal intensity (Δv/duration class) | Notes |
|---------|--------------------|---------------------------------------|-------|
| `OK` | admissible | admissible (ordinal only) | 394/449 in Production sample |
| `DEGRADED` | admissible | **UNRATED** (excluded) | Fable B3 recommendation |
| `LIMITED` | **excluded** from load; counted for coverage reporting | excluded | mostly gap/coverage-limited |
| `ARTEFACT_SUSPECT` | excluded | excluded | K3 / P1 / P2 artefacts; already excluded by contract |

Additional rules: never use `peakAccel1sMps2`; derive intensity only from `deltaKmh` and label-derived duration; keep ACCELERATION and DECELERATION as separate channels (no net sum); record `speedAuthority` and `bundle` on every shadow row; events from trips whose latest SUCCEEDED run predates `_EVENT_V0_3_PLAUS_V0_2` are not admissible for intensity. No numeric class boundaries are defined in this PR (no speculative weightings).

---

## 3. No double counting (`TIRE-DEC-NO-DOUBLE-COUNTING-001`)

| Existing V2 consumer of acceleration/braking evidence | Source chain | Rule |
|------|------|------|
| behaviorFactor (0.50/0.35/0.15) | DI stress scores ← HF hardAccel/hardBrake per 100 km | keep as-is in V2; DS4 must not enter |
| heatStress.drivingWeight 0.15 | behaviorFactor | same |
| interactionPenalty | behaviorFactor | same |
| ledger `harshAccelCount/harshBrakeCount` | deprecated alias of HF hard counts | informational; not a second source |
| **Future shadow load** | DS4 events only | separate column family; compared side by side with DI stress, never summed |

---

## 4. Minimal target architecture (documentation only)

```
Trip canonical finalization (existing) ──▶ tire_trip_usage_ledger row (existing, sync)
        │
        │ enqueue only (no await on DS4)
        ▼
  Tire DS4-shadow queue (new, tires/) ── retry/backoff ──▶ Tire shadow processor
        │                                                      │
        │                                                      ▼
        │                              DiV0MotionCoreShadowTripMapReadService.readForTrip(org, vehicle, trip)
        │                                 PENDING → requeue (DS4 outbox/worker still running)
        │                                 FAILED (no SUCCEEDED yet) → requeue until policy limit / newer SUCCEEDED
        │                                 SUCCEEDED* → admission §2 → persist tire shadow row (identity §4.1)
        ▼
DS4 shadow run (DI) ── existing ──▶ di_v0_motion_core_shadow_runs_v1 (+ outbox)

Future successor model (not this PR) ──▶ shadow prediction ──▶ compare vs V2 snapshot + tread measurements
```

### 4.1 Shadow row identity (DS4 run + input binding)

Each tire shadow row must be attributable to **one concrete DS4 evaluation**, not merely “latest events for trip”. Minimum stored identity (from `readForTrip` / `DiV0MotionCoreShadowRunV1`):

| Field | Role |
|-------|------|
| `diV0MotionCoreShadowRunId` | `runId` — primary DS4 run row (`di_v0_motion_core_shadow_runs_v1.id`) whose payload was consumed |
| `combinedInputIdentity` | DI-computed input binding for that run (detects re-run with different upstream inputs) |
| `pinnedSnapshotHash` | S4 evidence snapshot pin used for the run |
| `contentFingerprint` | Run-level content fingerprint (from DS4 run row; aids dedupe across re-materializations) |
| `shadowBundleVersion` | `algorithmVersions.bundle` / `shadow_bundle_version` — **version-bound** adapter target |
| `workItemId` | Optional trace to S4 work item |
| `speedAuthority`, `eventsAlgorithmVersion` | Contract slice used for admission |
| `adapterVersion` | Tire adapter semver/hash (independent of DS4 bundle) |
| `tireTripUsageLedgerId` (or stable ledger fingerprint) | Links to productive attribution without re-deriving setup |
| `tireSetupId`, `tripId`, `organizationId`, `vehicleId` | Tenant + attribution |

**Uniqueness (idempotent upsert):** `(tireTripUsageLedgerId, diV0MotionCoreShadowRunId, adapterVersion)` — same DS4 run + adapter version → one row; a **new** DS4 run (replay, bundle bump, new `combinedInputIdentity`) → **new** row; older rows retained for audit.

**DS4 run selection (version-bound, mirrors trip-map read):**

1. Consumer calls `readForTrip`, which already selects `findLatestSucceededRunForTrip` for event payload.
2. Persist only when `status` is `SUCCEEDED` or `SUCCEEDED_EMPTY`; store returned `runId`, `combinedInputIdentity`, `pinnedSnapshotHash`, `algorithmVersions.bundle`, `speedAuthority`.
3. `status=PENDING` → DS4 outbox/worker still active → **retry**, do not write a terminal tire row.
4. `status=FAILED` with no succeeded run → **retry** (DS4 may succeed on a later attempt); optional observability row with `coverage=AWAITING_DS4` is allowed, but must not be treated as load input.
5. When `status=SUCCEEDED` but `newerFailedRunId` is set (a later DS4 attempt failed) → **keep** the succeeded row already bound; do **not** delete tire shadow input; optionally enqueue a reconciliation job to refresh if a newer **SUCCEEDED** run appears with a higher `createdAt` and matching adapter bundle policy.
6. When a **newer SUCCEEDED** DS4 run exists for the same trip with a **different** `shadowBundleVersion` or `combinedInputIdentity` → new tire shadow row (replay comparison), never overwrite in place.

| Check | Assessment |
|-------|------------|
| Trip / tire-setup attribution | Reuse the ledger row's `tireSetupId` for the trip (single ACTIVE setup invariant); shadow rows reference the ledger row, never re-derive the setup. |
| Tenant isolation | `readForTrip` requires `organizationId`; adapter resolves org from the vehicle (same as controller `resolveOrganizationId`), never from the job payload alone; shadow table carries `organizationId`. |
| Dedupe / replay | Idempotent on `(ledgerId, diV0MotionCoreShadowRunId, adapterVersion)`; DS4 replays and bundle changes create **additional** rows; productive ledger idempotency (`sourceFingerprint`) remains independent. |
| Model / source versioning | Columns `source='DS4'`, `shadowBundleVersion`, `combinedInputIdentity`, `speedAuthority`, `eventsAlgorithmVersion`, `adapterVersion`; V2 side already stamps `tire-wear-v2`. |
| Data gaps / fallback | Neutral contribution + `coverage` flag; uncovered vehicles (not allowlisted) produce no rows. |
| Ground truth | Successor and V2 are both validated against `vehicle_tire_tread_measurements`; V2 output is never ground truth. |
| Rental safety | `tire-rental-health.policy.ts`, `TireHealthSummary`, snapshots and alerts read **no** shadow table; proven by a negative test in the implementation PR. |

---

## 5. Integration gaps (canonical IDs in `contradictions/KNOWLEDGE_GAPS.md`)

1. `TIRE-GAP-DS4-PERSISTED-INTENSITY-FIELDS-001` — mean/duration/peak not persisted (B7); re-derivation inherits B3 bias.
2. `TIRE-GAP-DS4-COVERAGE-ALLOWLIST-001` — 4 of 6 vehicles.
3. `TIRE-GAP-DS4-OUT-OF-SAMPLE-VALIDITY-001` — tuned on four drives.
4. `TIRE-GAP-DS4-INTENSITY-ATTENUATION-B3-001` — ordinal use only.
5. `TIRE-GAP-DS4-SPEED-AUTHORITY-MIX-001` — C4 vs C5.1 per trip.
6. `TIRE-GAP-DI-GRAPH-NO-DS4-NODE-001` — DI authority has no motion-core node to attach the consumer edge to.
7. `TIRE-GAP-V2-GROUND-TRUTH-SPARSE-001` — 5 measurements, 0 wear points: no model can be validated yet.

---

## 6. Risk verdict

**LOW for this PR** (documentation only, no runtime diff). **MEDIUM for the first implementation PR** if the adapter is read-only, shadow-table-only and tested for non-influence; **HIGH** if any DS4-derived value reaches `TireHealthSummary`, snapshots, alerts or the rental policy before ground-truth validation.

## 7. Fable requirement

**FABLE_REQUIRED: NO** for the next (async consumer + shadow store) PR — it consumes already reviewed `readForTrip` outcomes under a conservative admission policy, uses existing DS4 run/input identity fields, and changes no DS4 algorithm. **YES** before any successor wear formula uses DS4 intensities numerically (B3 attenuation, out-of-sample validity) or before DS4 persistence is extended with intensity fields.
