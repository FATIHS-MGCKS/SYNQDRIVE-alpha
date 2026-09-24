# EXP-021 C0.3 — Minimal R1 temporal-safety containment (2026-09-24)

| Field | Value |
|-------|-------|
| **Evidence ID** | DI-EVID-EXP021-C03-001 (containment record) · DI-TEST-R1-CONTAINMENT-001 (tests) |
| **Decision** | DI-DEC-R1-TEMPORAL-CONTAINMENT-001 (`VALIDATED` — code + focused tests; **not** production-validated) |
| **Invariant** | DI-INV-R1-OBD-NO-POINT-CLAIM-001 (`CONDITIONAL_INVARIANT`, active containment) |
| **Nature** | **ACTIVE CONTAINMENT — not the final source-quality architecture** |
| **Branch / PR** | `cursor/exp021-c03-r1-temporal-containment-7d78` · draft PR #1755 (not merged, not deployed) |
| **Starting HEAD** | `3067fad1aad509c29b2c83a6f3f0b16135da7a63` (`origin/main`) |
| **Production** | No deploy, no data mutation, no migration, no backfill, no reprocessing |

---

## 1. Upstream evidence (EXP-021 C0 → C0.2, read-only audits)

Full reports were produced as agent artifacts (not committed). Only the findings this containment relies on are restated here, without customer coordinates.

| Phase | Gate | Finding relied upon |
|-------|------|---------------------|
| C0 source integrity | `C0_GATE_1` | R1 OBD-family rows contradict independent fresh GNSS in 40/44 checked windows; DIMO GraphQL row timestamps are query-grid bucket starts anchored at `from`, not source observation times. |
| C0.1 temporal provenance | `C01_GATE_B` (P2) | R1 OBD fields share one misdating pattern (speed, RPM, load, odometer). Apparent offset \|P50\| **14 s**, \|P90\| **45 s** (descriptive, not a correction). Direction is mixed, mostly earlier. Backlog records carry foreign GPS snapshots. Root layer: `UNKNOWN`. |
| C0.2 output impact | `C02_GATE_A` (P1 scoped) | `FULL_BRAKING` 5/5: 0 supported, 2 contradicted, 3 unassessable, 4 physically implausible inputs, 1 foreign backlog. `ENGINE_SHUTDOWN_WHILE_DRIVING` 6/6: 4 single-record RPM dropouts, 2 unknown, 0 sustained evidence. Event context: 58/739 (7.8 %) assessable anchors contradicted, 29 % at 0–15 km/h. `hardware_type` is semantically unreliable (the Tesla is `LTE_R1`). Canonical discriminator is `dimo_vehicles.raw_json`. `TEMPORAL_SEMANTIC_OVERCLAIM_COUNT=12`. |

**Explicit override:** the C0.2 proposal to accept `ENGINE_SHUTDOWN_WHILE_DRIVING` after "≥2 consecutive low-RPM records over ≥3 s" was **not** implemented, per the C0.3 instruction. R1 is fail-closed for this event.

---

## 2. Scientific record

| Field | Value |
|-------|-------|
| **BEFORE** | R1 HF abuse detectors treated row labels as physical time. `FULL_BRAKING` (≥7.5 m/s²), `POSSIBLE_IMPACT` (≥12 m/s²) and `ENGINE_SHUTDOWN_WHILE_DRIVING` were created, persisted, counted, fed to the braking ledger, impact scoring and brake wear, and could drive SEVERE/CRITICAL misuse ratings. Event-context DTOs exposed anchor-relative "nearest sample 0 ms" and pre/post values. |
| **WHY** | Point-in-time conjunctions need a defensible record instant; R1 historical OBD records do not provide one (C0–C0.2). Containment is minimal: no data rewrite, no estimator change, fully reversible. Alternatives rejected: threshold tuning (does not fix time semantics); a 2-record ≥3 s shutdown proof (explicitly prohibited); invalidating ledger rows or misuse cases (not authorized; would trigger RESOLVED_STALE churn); branching on `hardware_type` (would contain the Tesla). |
| **CHANGE** | See §3. |
| **EXPECTED_EFFECT** | New R1 trips produce no contained point-in-time abuse. Existing contained rows stop contributing to presentation, counters, brake wear, impact and misuse escalation. Tesla, SMART5 and unknown vehicles are unchanged. |
| **VALIDATION** | Focused unit/regression suites (§5); backend `tsc` clean; the `vehicle-intelligence` Jest tree has the same 16 failing suites as the base commit, plus one load-dependent flake (§5). |
| **OBSERVED_EFFECT** | `UNKNOWN` — not deployed. |
| **NON_EFFECTS** | Speeding, max speed, trip end/FSM, map matching, waypoints, DIMO query-grid anchoring, aggregation choice, position holds, L3, B6B, estimator architecture, `hardware_type`, routing. Historical rows, events, misuse cases and ClickHouse are untouched. |
| **TRADEOFFS** | Some real hard stops on R1 are no longer called FULL_BRAKING (fail-closed). Provider EXTREME_BRAKING remains. Read-time containment adds a few small queries on trip lists and stats. |
| **REMAINING_GAPS** | See §6 (DI-GAP-R1-CONTAINMENT-RESIDUAL-001, DI-GAP-R1-OVERCLAIM-WORDING-001). |
| **STATUS** | `VALIDATED` (code + tests). Production validation requires an authorized deploy plus observation. |
| **EVIDENCE** | DI-EVID-EXP021-C03-001, DI-TEST-R1-CONTAINMENT-001 |

---

## 3. Containment design (code paths)

### 3.1 Integration source family

`backend/src/modules/vehicle-intelligence/telemetry-source-family.ts` resolves the family from `DimoVehicle.rawJson`:

| Family | Rule |
|--------|------|
| `RUPTELA_R1` | `aftermarketDevice.serial` is a string with `trim().startsWith('R1-')` and no `syntheticDevice` |
| `API_SYNTHETIC` | `syntheticDevice` is an object and `aftermarketDevice` is null/absent |
| `UNKNOWN` | Anything else (missing, malformed, conflicting, other serial families). **Fails closed; never treated as R1.** |

`Vehicle.hardwareType` is not consulted. Routing is unchanged.

### 3.2 Contained event types

`r1-temporal-containment.ts` defines `FULL_BRAKING`, `POSSIBLE_IMPACT` and `ENGINE_SHUTDOWN_WHILE_DRIVING` (ABUSE category) as contained.

`POSSIBLE_IMPACT` is included because it is the same Δv/Δt mini-window scanner at a higher threshold. Its dedupe also absorbs overlapping `FULL_BRAKING`, so containing `FULL_BRAKING` alone would re-label the same R1 artefact as an impact.

### 3.3 Future derivation (both enrichment paths)

`trip-behavior-enrichment.service.ts` (`enrichTrip` SMART5/UNKNOWN path and `enrichTripLteR1`):

- Detections are filtered by `containR1HfAbuse`, which emits a bounded log line: `R1_HF_ABUSE_CONTAINED trip=<id> suppressed={type:count}`. There are no coordinates or payloads in it.
- The replace scope (`buildBehaviorEventReplaceScope`) excludes contained ABUSE rows for R1, so re-enrichment never deletes historical contained rows.
- `behaviorSummaryJson.r1TemporalContainment = { version, containedEventTypes }` marks trips whose counters already exclude contained types.

### 3.4 Read / consumer boundaries for existing rows (no mutation)

| Consumer | File | Containment |
|----------|------|-------------|
| Braking ledger summary | `braking-event-ledger.domain.ts` (`interpretLedgerRowForUncertainObdTime`), `braking-event-ledger.service.ts` (`getCanonicalSummaryForTrip` option) | HF-abuse-won `FULL_BRAKING` is excluded. Provider-won incidents upgraded to FULL by correlation are counted as `EXTREME_BRAKING`. `reconcileTrip` and ledger rows are unchanged. |
| Trip impact | `driving-impact.service.ts` `computeForTrip` | R1 `fullBrakingCount = 0` (the ledger option plus the persisted counter are ignored). |
| Rolling impact and Brake Health readers | `driving-impact.service.ts` (`updateRollingCurrent`, `getTripImpactForBrake`, `getVehicleImpactForBrake`) | R1 `fullBrakingPer100Km` is reported as 0. |
| Brake wear model | `brake-health.service.ts` (both recalculation paths) | The R1 full-braking wear factor uses rate 0. |
| Brake wear fingerprint | `brake-recalculation-input.loader.ts` | Same interpretation for `fullBrakingPer100KmSum` and ledger counts. |
| Trip behaviour event list | `unified-behavior-read-model.ts`, `vehicle-intelligence.controller.ts`, `trip-analytics-canonical.service.ts` | Contained R1 HF rows are omitted. R1 native events withhold point-in-time rpm/throttle/coolant values (row fields, `legacyIngestEvidence`, raw `metadataJson` keys). Their context assessment is contained (§3.5). |
| Trip counters / vehicle stats | `trip-analytics-canonical.service.ts` | R1: `fullBrakingEvents = 0`, `totalBrakingEvents −= fullBrakingEvents`, `abuseEvents −= persisted contained rows`. Trips with the §3.3 marker are skipped to avoid double subtraction. |

### 3.5 Event context (presentation boundary)

`event-context/event-context-r1-temporal-containment.ts` is applied only when the vehicle is R1:

- Anchor-relative fields are nulled: `nearestValueToAnchor`, `nearestSampleDistanceMs`, `valueBeforeAnchor`, `valueAfterAnchor`, `dataQuality.nearestSampleToAnchorMs` and `contextQuality.providerDelayMs`.
- `confidence` and `contextQuality.contextConfidence` are capped at LOW.
- The additive marker `temporalContainment = { version, reason: R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN }` is set.
- Status, classifications and evidence grade are unchanged, which keeps the view consistent with persisted misuse evidence snapshots.
- The persisted assessment (the raw diagnostic record) is **not** rewritten. Misuse escalation is contained separately (§3.6).

Rejected alternatives: capping the evidence grade to C, or nulling fields at generation. Both would silently remove R1 context from misuse review, because the usable filter requires grade ≥ B and cold-engine/launch rules read `coolantAtAnchor`/`preSpeed`. That contradicts "preserve REVIEW_REQUIRED" and would churn fingerprints.

### 3.6 Misuse

- `misuse-case-r1-temporal-containment.ts` tags R1 `TRIP_BEHAVIOR_EVENT` and `EVENT_CONTEXT_ASSESSMENT` evidence with `snapshotJson.temporalProvenance = R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN`. It adds the disclosure `evidenceSummary.r1TemporalContainment` with uncertain and independent counts.
- `misuse-case-rating-reconciliation.ts` `applyTemporalUncertaintyCap`:
  - Uncertain-only evidence: severity ≤ WARNING, confidence ≤ MEDIUM, `temporallyUncertainOnly = true`.
  - Mixed evidence: severity ≤ max(WARNING, the severity the independent evidence supports alone). Trip evidence level and explicit cluster counts are excluded from the ceiling.
  - The audit records `ratingReconciliation.temporalContainment`.
- `misuse-case-persistence.helper.ts` passes lifecycle `proxyOnly = rating.proxyOnly || rating.temporallyUncertainOnly`, so there is no ACTIVE status and REVIEW_REQUIRED is preserved.
- Unchanged: category, case type, evidence set, qualified evidence keys (fingerprints), `isProxyOnlyEvidence`, and the category evidence-strength gate.

---

## 4. Tesla / non-R1 protection

- The resolver never inspects `hardwareType`. A test fixture uses the Tesla shape (`hardwareType = LTE_R1`, synthetic device) and asserts no containment on every path.
- `UNKNOWN` (missing/malformed identity) is **not** contained. This is a deliberate fail-closed choice for the containment trigger: only proven R1 identity activates containment.

---

## 5. Test evidence (DI-TEST-R1-CONTAINMENT-001)

| Suite | Scope |
|-------|-------|
| `r1-temporal-containment.spec.ts` | Resolver (R1, Tesla, 12 fail-closed shapes); helpers; detector-level regressions. The R1 dropout (two low-RPM records over 3 s at speed) is shown to fire the raw detector and to be suppressed; point deceleration FULL/IMPACT is suppressed for R1 and unchanged for UNKNOWN. |
| `trips/trip-behavior-enrichment.r1-containment.spec.ts` | Suppression + bounded log; replace scope protects historical rows |
| `brakes/braking-event-ledger.r1-containment.spec.ts` | Ledger interpretation; service option (no writes); fingerprint loader R1 vs Tesla |
| `brakes/brake-health.r1-containment.spec.ts` | Wear model: the R1 full-braking rate has no effect; the Tesla rate still accelerates wear |
| `driving-impact/driving-impact.service.spec.ts` (C0.3 cases) | Trip impact R1 vs Tesla; brake readers R1 vs Tesla |
| `event-context/event-context-r1-temporal-containment.spec.ts` | Field containment; purity/idempotence; non-R1 untouched |
| `trips/unified-behavior-read-model.r1-containment.spec.ts` | Contained rows omitted; native point-in-time values withheld; DTO marker; non-R1 unchanged |
| `trips/trip-analytics-canonical.service.spec.ts` (C0.3 cases) | Counter containment, Tesla/UNKNOWN untouched, marker prevents double subtraction, vehicle stats |
| `misuse-cases/misuse-case-r1-temporal-containment.spec.ts` | Tagging; fingerprint-key stability; rating caps (uncertain-only / mixed / independent SEVERE kept); rules end-to-end; persistence → REVIEW_REQUIRED at WARNING with disclosure |

**Regression comparison:** the full `src/modules/vehicle-intelligence` Jest tree was run on the base commit and on this branch.

- Base: 16 failing suites / 26 failing tests.
- Branch: the same 16 suites plus `misuse-case-rating-reconciliation.spec.ts` under full-tree load. That spec passes in isolation and within the misuse folder. Its determinism test compares audits containing `new Date()` (`evaluatedAt`), a pre-existing timing flake.

---

## 5.1 C0.3B read-presentation closure (2026-09-24)

Without mutating persistence:

| Surface | Closure |
|---------|---------|
| Canonical trip / vehicle stress scores | `shouldWithholdR1PersistedDrivingStressScore` — when R1 and persisted full-braking / contained-abuse indicators exist, `drivingStressScore` is withheld (`scoreSource = r1_temporal_containment_unavailable`); no fabricated correction |
| Misuse case list/detail API | `misuse-case-read-presentation.ts` — retroactive R1 evidence tagging + `reconcileMisuseCaseRating` caps existing persisted SEVERE rows at presentation; `temporalPresentationContainment` discloses stored vs presented severity |
| Provider-native braking | **INDEPENDENT** stream (`DimoSegmentsService.fetchDrivingEvents` → `DrivingEvent` TELEMETRY_EVENTS); not the HF Δv/Δt scanner. Ledger FULL_BRAKING upgrades from HF correlation remain downgraded at read for R1 |

Deferred admin-only raw counters (`trips.service.getStats`, platform logbook) remain unchanged.

## 6. Static bypass search (Step 13) and deferred paths

Search terms: `FULL_BRAKING`, `POSSIBLE_IMPACT`, `ENGINE_SHUTDOWN_WHILE_DRIVING`, `fullBrakingCount`, `fullBrakingEvents`, `possibleImpactCount`, `abuseEvents`, `nearestSampleDistanceMs`, `providerDelayMs`, `hardwareType`/`LTE_R1`, brake wear and impact consumers.

| Path | Status |
|------|--------|
| Enrichment creation (both paths) | CONTAINED |
| Braking ledger reconcile/persistence | UNCHANGED by design (read-time interpretation) |
| Impact per trip / rolling / brake readers | CONTAINED |
| Brake wear model + fingerprint | CONTAINED |
| Unified event list + DTO + trip assessment builder input | CONTAINED |
| Canonical trip summary counters, vehicle stats, `trip-api.mapper` | CONTAINED |
| Misuse rules / damage-incident canonical / rating / lifecycle | CONTAINED (tag + cap) |
| Historical per-trip stress scores (`brakingStressScore` etc.) that already embed FULL_BRAKING, and their rolling averages | **DEFERRED:** persisted historical data (no rewrite authorized); ages out of the rolling window |
| `trips.service.ts` stats aggregate (`totalAbuseEvents`), `platform-admin/vehicle-logbook.service.ts` (`abuseEventCount`) | **DEFERRED:** raw persisted counters, not hydrated through the canonical summary |
| `trip-assessability` (`possibleImpactCount`, `abuseEvents` as damage-evidence presence) | **DEFERRED:** assessability labelling only, not a claim |
| Context misuse rules reading `coolantContext.nearestValueToAnchor` / `speedContext.valueBeforeAnchor` from persisted assessments | **DEFERRED by design:** escalation contained by the rating cap; the grade/field change was rejected (§3.5) |
| Notification `possible-impact` registry | No producer found; new R1 rows no longer created |
| `vehicle_trips.abuseScore`, `possibleImpactCount` persisted on historical trips | **DEFERRED:** not rewritten |
| Frontend rendering of `temporalContainment` | **DEFERRED:** no new UI copy (i18n: 9-locale keys required before rendering) |

### 6.1 Deferred item — 12 temporal semantic overclaim sites (DI-GAP-R1-OVERCLAIM-WORDING-001)

The C0.2 inventory (`TEMPORAL_SEMANTIC_OVERCLAIM_COUNT=12`) is **not** reworded in this PR. Only touched surfaces carry containment. Items:

1. DI v2 `PRIMARY_KINEMATIC_AUTHORITY.physicalEventTime='providerTimestamp'`
2. `hf-acceleration` / `hf-braking` / `hf-abuse` Δt from row labels
3. `hf-window-producer` Δt from row labels
4. `event-context-stats` / `event-context-quality` "actual sample timestamps"
5. `trip-cusum` end = 20 s bucket start
6. Reference-capture HF `providerTimestamp` as sample identity
7. `rd003-video-gt-export` "Provider-reported sample timestamp"
8. `vehicle_trips.max_speed_kmh` naming (last-tick 20 s AVG max)
9. Speeding `startedAt`/`endedAt`/`durationSeconds` bucket-start labels
10. `vehicle_trip_waypoints.recorded_at` + RAND coordinate as a fix
11. Trip-end `candidateClockSource: PROVIDER_EVENT_TIME` for R1 OBD-derived movement
12. `contextAssessment.speedContext.nearestSampleDistanceMs: 0`. Contained at the API boundary for R1 by this PR; source wording is still deferred.

---

## 7. Cross-module registry review

| Module | Registry status | Effect |
|--------|-----------------|--------|
| Driving Intelligence | `AUTHORITY_ACTIVE` | Owner of this containment; authority updated |
| Automatic Trip Enrichment | `AUTHORITY_ACTIVE` | Enrichment write-path gate + replace scope; authority updated |
| Brakes Health | `NOT_STARTED` | Minimal consumer-boundary read change in `brake-health.service.ts` + `brake-recalculation-input.loader.ts`. No Brakes Health authority exists; the change is recorded here. Brakes Health must be audited per `MODULE_AUTHORITY_STANDARD.md` before substantive work. |
| Vehicle & Device Connectivity | `AUDIT_IN_PROGRESS` | Integration discriminator note (device identity in `rawJson`); no VDC code change |

---

## 8. Post-deploy effects (for the authorizing reviewer)

This PR is not deployed. If authorized later:

- R1 brake-health fingerprints change wherever the persisted full-braking rate was non-zero. The next scheduled recalculation then recomputes wear without it (a normal runtime write, not a backfill).
- Misuse reconcile of an R1 trip (on any normal re-evaluation trigger) re-rates and tags evidence; category and fingerprint are stable.
- The rolling impact current is recomputed with an R1 full-braking rate of 0 on the next trip.
- No automatic reprocessing is introduced.

## 9. Reversibility

Reverting the PR restores prior behaviour exactly. The only new persisted additions — the summary marker and the evidence snapshot tag/disclosure — are written only for R1 trips processed after deploy, and they are inert for old code.
