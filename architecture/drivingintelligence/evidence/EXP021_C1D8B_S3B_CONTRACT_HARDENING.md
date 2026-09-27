# EXP-021 C1D.8B — S3B contract hardening / red-team closure (PR #1805)

**Evidence ID:** DI-EVID-EXP021-C1D8B-001  
**Date:** 2026-09-27  
**Starting head:** `4815a54bd5ceedce101119a0157757914eb04084` (C1D.8) · **Baseline:** `main` @ `ee26a1bf6acec7fe0fe27f81340dfc162601aec5`  
**Closes:** C1D.8A red-team findings P1-1..P1-4 and P2 (R1 duplicate buckets, hold/release tests, WOB control binding, ignition semantics, field authority).  
**Predecessor evidence (unchanged, historical):** [EXP021_C1D8_S3B_R1_OBD_NATIVE_EVENT_ADAPTERS.md](EXP021_C1D8_S3B_R1_OBD_NATIVE_EVENT_ADAPTERS.md)

Fixed semantic design (unchanged): POSITION/L3 is the primary numeric kinematic authority; R1 OBD is `INTERVAL_ONLY` (corroborate / conflict / provenance only); native events are a distinct observation channel; neither may override L3.

## Closure matrix

| Finding | BEFORE (C1D.8) | CHANGE (C1D.8B) | Test proof |
|---------|----------------|-----------------|------------|
| P1-1 native calibration escalation | `record.calibrationState ?? 'UNCALIBRATED'` → caller `VALIDATED` produced `L2` | **Design A** — input record has no calibration/claim field; adapter constant `UNCALIBRATED`; `maxClaimForUncalibratedNative('UNCALIBRATED')` = `L1` | smuggled `calibrationState=VALIDATED/PILOT_SUPPORTED`, `maxClaimLevel=L2/L3`, `claimLevel=L3` → all `UNCALIBRATED`/`L1` |
| P1-2 native context binding | only `vehicleId` + family passed; no per-record check | `DiV0NativeEventExpectedContext {organizationId, vehicleId, tripId, windowStart, windowEnd, sourceFamily, provider}` passed separately; every record checked; mismatches → `CONTEXT_MISMATCH` (L0) with reasons + observed values, in snapshot | correct / wrong org / null org / wrong vehicle / wrong trip / unassigned trip / wrong or missing provider / wrong family / before / after window / missing / invalid timestamp / mixed set with one foreign event |
| P1-3 native duplicates by eventId | two records with same id → two events | group by `id`; identical (canonical variant digest) collapse; any differing field → `CONFLICTING_DUPLICATE` (L0, excluded, fields + sorted variant digests in snapshot) | identical ×3; metadata key order; conflicting type/vehicle/timestamp/provider/payload/fingerprint; distinct ids same ts+type; 3 input orders → equal result + digest |
| P1-4 NO_EVENT vs source failure | `records: []` ≡ NO_EVENT; no failure concept | source envelope `SOURCE_SUCCESS {records}` / `SOURCE_FAILURE {failureCode}` → derived `SOURCE_SUCCESS_WITH_EVENTS` / `SOURCE_SUCCESS_NO_EVENTS` / `SOURCE_FAILURE`; status `EVENT_SOURCE_FAILURE` never `NO_EVENT`; `readDiV0NativeEventSource` S4 boundary | `[]` → NO_EVENT; throw → EVENT_SOURCE_FAILURE (no message leak); non-array / malformed row → EVENT_SOURCE_FAILURE |
| Combined identity | `[channel, version]`; channels optional → omitted ≡ empty | V0_2: all 3 channels required once, `[channel, state, version]`; states `PRESENT` / `NO_EVENT` (native only) / `SOURCE_FAILURE` / `NOT_AVAILABLE`; state/version consistency enforced | 7 state combinations → 7 distinct identities; order-independent; missing/duplicate/inconsistent pins throw |
| P2 R1 duplicate buckets | `if (!rowsByIndex.has(index))` first-row-wins | rows collected per label; per-signal merge: agreement collapses, any disagreement (incl. value vs null) → `CONFLICTING_DUPLICATE`, value withheld, sorted distinct `conflictingValues`; no averaging, no majority vote; `providerRowCount` + conflict values in snapshot | identical; 50 vs 60; speed conflict + rpm 2000/2000 valid; value vs null; 3-row 50/50/70; out-of-order → equal buckets + digest |
| P2 HOLD/RELEASE + R1 | not covered | dedicated golden tests | see golden binding |
| P2 WOB control | synthetic 1-in-11 pattern, unrelated window | bound to committed FULL-R1-002 golden (identity, token, window, bucket count) | `di-v0-s3b-wob-control.spec.ts` |
| P2 ignition | `isIgnitionOn(agg: AVG)` queried, unit `boolean_avg` | **removed** from S3B query (V0_2) | query string + spec assert absence |
| P2 field authority | none | per-signal `fieldAuthority` in query spec + snapshot | spec asserts all `REPO_CONTRACT_ONLY` |

Test fixture defect fixed: `RUPTELA_DEVICE_IDENTITY` used `{aftermarketDeviceSerial, hardwareType}`, which the shared resolver maps to `UNKNOWN`; now canonical `{aftermarketDevice: {serial: 'R1-…'}, syntheticDevice: null}` → `RUPTELA_R1` (asserted).

## Calibration authority model

- Native calibration authority is **not caller-suppliable**. No runtime trusted-authority object exists.
- Any future `PILOT_SUPPORTED` / `VALIDATED` native state requires a separate, explicitly reviewed trusted-authority contract (e.g. a sealed calibration registry keyed by provider × source family × event type) — **not** a record field.
- Native fusion remains **NEEDS_VALIDATION**. Nothing in C1D.8B validates native accuracy.

## Context binding — what is provable

`DrivingEvent` columns available for binding: `id`, `organizationId` (nullable), `vehicleId`, `tripId` (nullable), `provider` (nullable), `providerFingerprint`, `recordedAt` (→ `providerTimestamp`). There is **no DIMO token id** on the row, so token binding is not provable at this layer and is not invented; vehicle binding stands in for it (vehicle ↔ token is owned by `DimoVehicle`).

Fail-closed rules: null `organizationId` → `ORGANIZATION_UNPROVABLE`; trip-scoped context + null `tripId` → `TRIP_UNPROVABLE`; asserted provider + null `provider` → `PROVIDER_UNPROVABLE`. Window inclusive both ends. Invalid expected context throws `DiV0NativeEventContextError` (programmer error, not evidence).

Precedence: duplicate classification runs first per eventId; a conflicting duplicate is reported as `CONFLICTING_DUPLICATE` regardless of context. Identical duplicates collapse, then the single variant is context-checked. Timestamps compare as raw strings for duplicate detection (differing ISO renderings of one instant are a conflict — fail-closed).

## Status vocabulary

| `status` | `sourceOutcome` | `channelState` | Meaning |
|----------|-----------------|----------------|---------|
| `EVENTS_PRESENT` | `SOURCE_SUCCESS_WITH_EVENTS` | `PRESENT` | ≥1 accepted event |
| `NO_ACCEPTED_EVENT` | `SOURCE_SUCCESS_WITH_EVENTS` | `PRESENT` | records read, none accepted (all mismatched/conflicting; audited) |
| `NO_EVENT` | `SOURCE_SUCCESS_NO_EVENTS` | `NO_EVENT` | read succeeded with 0 records |
| `EVENT_SOURCE_FAILURE` | `SOURCE_FAILURE` | `SOURCE_FAILURE` | read failed — absence of events is **unknown**, not NO_EVENT |

## S4 DB-reader boundary (future, not implemented)

S4 wraps its repository read in `readDiV0NativeEventSource(() => repo.find…(scope))`:
- resolves to an array (including `[]`) → `SOURCE_SUCCESS` → `NO_EVENT` when empty;
- throws → `SOURCE_FAILURE/READ_THREW` → `EVENT_SOURCE_FAILURE`; error text is **not** carried into evidence;
- resolves to a non-array or a row missing `id`/`vehicleId`/`providerEventName`/`sourceFamily` or with non-string/non-null `organizationId`/`providerTimestamp` → `SOURCE_FAILURE/MALFORMED_READ_RESULT`.
The S4 query must still scope by org + vehicle; per-record binding is defence in depth, not a substitute.

## Ignition conclusion

- DIMO MCP: namespace in `error` state; `mcp_auth` timed out → provider schema **not verifiable** in this slice.
- Repo evidence only: `high-frequency.query.ts` `isIgnitionOn(agg: AVG)`; `trip-detection-core.query.ts` `isIgnitionOn(agg: MAX)`; `latest-vehicle-snapshot.query.ts` `{ timestamp value }`; `dimo-segments.service.ts` coerces `typeof s.isIgnitionOn === 'number' ? s.isIgnitionOn >= 0.5 : null` ("AVG ≥ 0.5"); webhook delivers boolean. Two aggregations in use (AVG, MAX) with an unverified numeric fraction interpretation.
- **Decision:** remove `isIgnitionOn` from the S3B queried subset (fail-safe). S3B carries **no ignition claim**. Query spec id bumped `DI_V0_R1_OBD_QUERY_V0_1` → `DI_V0_R1_OBD_QUERY_V0_2`; adapter/snapshot versions bumped to `V0_2`. **Provider query change: YES (field removed only)**; no field added, no aggregation changed, no production query touched (legacy HF/trip-detection queries unchanged).

## R1 field authority matrix

| Field | Aggregation | Unit | Authority | Basis |
|-------|-------------|------|-----------|-------|
| `speed` | AVG | km/h | REPO_CONTRACT_ONLY | legacy HF query + VSS naming; MCP unavailable |
| `powertrainCombustionEngineSpeed` | AVG | rpm | REPO_CONTRACT_ONLY | legacy HF query |
| `obdThrottlePosition` | AVG | % | REPO_CONTRACT_ONLY | legacy HF query |
| `obdEngineLoad` | AVG | % | REPO_CONTRACT_ONLY | legacy HF query |
| `powertrainCombustionEngineECT` | AVG | °C | REPO_CONTRACT_ONLY | legacy HF query |
| `powertrainTransmissionCurrentGear` | AVG | gear | REPO_CONTRACT_ONLY | legacy HF query; AVG of a discrete gear can be fractional — interval-only corroboration, never a gear claim |
| `isIgnitionOn` | — | — | UNVERIFIED → **not queried** | see ignition conclusion |

No field is `PROVIDER_SCHEMA_VERIFIED`. Upgrade requires DIMO MCP / provider schema verification in a later slice.

## FULL-R1-002 golden binding

- Position: committed S3A golden `full-r1-002-golden.fixture.ts` (C1E extraction, sealed package), identity `R1-865918076209847`, token 192922, window 19:07:13Z–19:08:20Z (67 buckets), sealed ROW_ABSENT gap 19:07:20–19:07:49.
- R1 rows: **no captured R1 OBD rows exist in the repository** for this run. `full-r1-002-s3b-structural.fixture.ts` places adversarial `STRUCTURAL_DERIVED` rows on the golden timeline (gap 80 km/h, hold 45, release 30, post-release 35, valid-L3 label 140). Not calibration material.
- Observed S1 states (probe): 19:07:30 `ROW_ABSENT` null L0; 19:07:53–55 `FROZEN_MOVEMENT_SUPPORTED` null L2; 19:08:02 `RELEASE` null L0; 19:08:03 `FRESH` null L1; 19:08:10 `FRESH` 17.85 km/h L2.
- With R1: every interval's `estimatedSpeedKmh` identical to the no-R1 run; HOLD/RELEASE/post-release remain null; claim levels unchanged; native channel `NO_EVENT`.

## Non-effects

No worker, scheduler, queue, Nest registration, DB read/write, migration, customer API, UI behavior, provider mutation, deploy, S4, fusion weights, or acceleration/braking/coasting logic. S1 core (`compute-trip-intervals`, `claim-confidence`) unchanged — `maxClaimForUncalibratedNative('VALIDATED') = L2` remains in core for a future trusted authority but is unreachable from S3B.

## Validation (local)

- S1/S2/S3A/S3B Jest: 25 suites passed (1 pre-existing DB-integration suite skipped), 254 tests passed.
- S3B only: 6 suites / 75 tests (17 of them in `di-v0-s3b-r1-closure.spec.ts`).
- `tsc -p tsconfig.build.json --noEmit` clean; ESLint clean on S3B packages.
- Remaining: CI on exact final head (see PR #1805).
