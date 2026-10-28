# DS4 Event Intensity Persistence — PR-2 contract and evidence

**Workstream:** DS4 authoritative assessment migration ([design](../design/DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md), PR-2, blocker **B2**)
**Mode:** Isolated Draft PR · shadow persistence only · no deploy · no flag change · no DS4 authority activation
**Decision:** `DI-DEC-DS4-INTENSITY-PERSIST-001` (PROPOSED — Fable review requested, see §6)
**Evidence ID:** `DI-EVID-DS4-INTENSITY-PERSISTENCE-PR2-001`

---

## 1. Root cause (Phase A, read-only, CONFIRMED)

| Stage | File | Intensity state before PR-2 |
|-------|------|-----------------------------|
| Kinematics → event | `core/kinematics/motion-event-detector.ts` | **Computed**: `meanAccelMps2 = round3(Δv/3.6/max(dur,1))`, `durationS`, `steps`, `coverageRatio`, `startUncertaintyS`/`endUncertaintyS` (`'±1 s label + unvalidated clock offset'`), plus `peakAccel1sMps2`/`peakAccel2sMps2` |
| Plausibility | `core/kinematics/motion-event-plausibility-universal.ts` | Passes `MotionManoeuvreEvent` through (quality/flags only) |
| Event mapping | `motion-core-shadow-worker/di-v0-motion-core-shadow.types.ts` → `mapMotionManoeuvreEventToPersisted` | **DROPPED** — only `kind, startLabel, endLabel, startSpeedKmh, endSpeedKmh, deltaKmh, quality, flags` kept |
| Serialization / persistence | `di-v0-motion-core-shadow-run.repository.ts` → `insertSucceededRun` | `JSON.stringify(payload)` → `maxPayloadUncompressedBytes` check → `gzipSync` → `payload_gzip bytea` + `summary_json jsonb` in `di_v0_motion_core_shadow_runs_v1` |
| Trip-map API | `di-v0-motion-core-shadow-trip-map-read.mapper.ts` → `mapOneEvent` | `peakAccel1sMps2: null` hardcoded; no intensity |
| Trip UI | `frontend/src/rental/components/trips/TripMotionMapPopover.tsx` | Reads `deltaKmh` + `artefactSuspect` only |

**Root cause:** the persisted-row mapper is the single drop point. Detection, admission, plausibility and counts were already correct; only persistence omitted the fields.

### Versioning facts that shaped the contract

- `contract.algorithmVersions.bundle` (`di-v0-motion-core-shadow.bundle.version.ts`, V1/V2_C5_1/V3_FSM_GAP_BRIDGE/V4) is part of the **outbox intent key** (`buildMotionCoreShadowIntentKey`). Bumping it would re-enqueue every eligible trip → **production reprocessing side effect** → forbidden for PR-2.
- `decodePayload` is `JSON.parse` without schema validation; readers tolerate additive optional fields.
- `summary_json` is free-form jsonb; additive keys are safe.

---

## 2. Persistence contract (Phase B)

File: `motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract.ts`

| Element | Value |
|---------|-------|
| Legacy event-row contract (implicit) | `DI_V0_MOTION_CORE_EVENT_ROW_V1_BOUNDARY_ONLY` — payloads with **no** `contract.persistence` block |
| New event-row contract | `DI_V0_MOTION_CORE_EVENT_ROW_V2_INTENSITY_ORDINAL_V1` |
| Where declared | `payload.contract.persistence.eventRowContract` and `summary_json.eventRowContract` |
| Algorithm bundle versions | **Unchanged** (V1…V4); intent keys unchanged; no reprocessing |
| New optional field per event row | `intensity?: { meanAccelMps2, durationS, steps, coverageRatio, startUncertaintyS, endUncertaintyS }` |
| Omission rule | `intensity` is **omitted** (not zero-filled, not nulled) when any constituent is non-finite, negative, non-integer (`steps`) or empty — never fabricated |
| Excluded by contract | `peakAccel1sMps2`, `peakAccel2sMps2` (declared in `contract.persistence.intensityExcludedFields`) |
| Usage policy | `contract.persistence.intensityUsagePolicy = ORDINAL_ONLY_NOT_PHYSICALLY_VALIDATED` with Fable B3 attenuation note |
| `meanAccelMps2` semantics | Positive **secant magnitude** `|Δv|/3.6/max(durationS,1)` from unrounded C4/C5.1 speeds; **direction exclusively in `kind`** (not sign). Kernel-attenuated (B3); ordinal/relative only — no absolute m/s² thresholds (`meanAccelMps2Semantics` constant) |
| `coverageRatio` semantics | Usable 1 Hz samples in `[startLabel,endLabel]` ÷ `(span+1)`, including repaired/synthetic samples; **not** threshold-coverage (`coverageRatioSemantics`). Persisted only when **(0, 1]** (reject ≤0 or >1) |
| Event `flags` | `eventFlagsSemantics = OPAQUE_CLASSIFICATION_TOKENS`; `eventFlagsConsumptionPolicy = MUST_NOT_PARSE_FLAGS_FOR_ACCEL_OR_PEAK_VALUES` — PR-3 must not recover 1 s step accelerations or peaks from flag strings (e.g. `SPIKE_BRACKET_PRE=…`) |
| Contract resolution | `resolveMotionCoreShadowEventRowContract` → V1 legacy (no `contract.persistence`), V2 (recognised string), or **`UNKNOWN`** (unrecognised/future `eventRowContract` or persistence block without contract) |
| Reader helpers | `readPersistedMotionEventIntensity(row)` validates block only; **`readPersistedMotionEventIntensityForPayload(payload, row)`** is the fail-closed PR-3 entry (returns `null` unless contract is V2) |

### Preserved semantics (regression-tested)

- Event `kind`, `startLabel`, `endLabel`, `startSpeedKmh`, `endSpeedKmh`, `deltaKmh`, `quality`, `flags` are byte-identical to the V1 projection.
- `eventCount`, `eventAcceptedCount`, `eventArtefactSuspectCount` unchanged.
- Trip-map DTO (`DiV0MotionCoreShadowTripMapEventDto`) unchanged: `peakAccel1sMps2` stays `null`, no `intensity` key → **no Trip UI change**.
- C4/C5.1 kinematics, FSM, gap bridge, motion repair, speed authority selection, plausibility: **untouched**.
- Tire DS4 shadow adapter consumes the trip-map DTO only → unaffected.

### Not in PR-2

- Driving Impact V2 scoring, DS4 assessment L2, any consumer reading `intensity`.
- Tire / Brake / Rental / DriverScore productive calculation changes.
- Schema migration (payload is opaque gzip JSON; no DDL).
- Flag/allowlist/deploy changes.

---

## 3. Validation (Phase C)

| Check | Artifact / command | Result |
|-------|--------------------|--------|
| Unit: mapping, omission rules, serialization, gzip round-trip, legacy compat, counts/boundaries regression, DTO non-exposure | `motion-core-shadow-worker/__tests__/di-v0-motion-core-shadow-event-intensity-persistence.unit.spec.ts` | 21 passed |
| Existing motion-core shadow unit suite | `npx jest src/modules/vehicle-intelligence/driving-intelligence/motion-core-shadow-worker --testPathIgnorePatterns=postgres.integration` | 14 suites / 72 tests passed |
| PostgreSQL round-trip (insert via `insertSucceededRun`, read via `findLatestSucceededRunForTrip` + `decodePayload`; legacy V1 raw row decode) | `DI_V0_S4A_POSTGRES_INTEGRATION=1 npx jest --runInBand --forceExit …/di-v0-motion-core-shadow-event-intensity.postgres.integration.spec.ts` (local ephemeral PostgreSQL 16, `127.0.0.1`; fixtures cleaned up) | 2 passed |
| Backend typecheck | `npx tsc --noEmit -p tsconfig.json` (after `prisma generate`) | exit 0 |
| Backend production build | `npm run build` (`nest build`) | exit 0 |

Synthetic drive used for detector-driven tests: 1 Hz, 0→72 km/h over 10 s, 10 s cruise, 10 s braking to 0, 5 s hold (`__tests__/di-v0-motion-core-shadow-synthetic-drive.fixture.ts`); yields ≥1 ACCELERATION and ≥1 DECELERATION with finite intensity on every event.

**Not wired into CI by this PR:** the motion-core-shadow Postgres specs (existing outbox spec and the new intensity spec) have no `package.json`/workflow entry; they run only with `DI_V0_S4A_POSTGRES_INTEGRATION=1` locally. Tracked as follow-up under `DI-GAP-S4A-POSTGRES-CI-WIRING-001` scope.

---

## 4. Backward compatibility matrix

| Stored payload | `contract.persistence` | `events[].intensity` | Resolved contract | Reader outcome |
|----------------|------------------------|----------------------|-------------------|----------------|
| Pre-PR-2 production rows (85 SUCCEEDED runs @ 2026-10-24 baseline) | absent | absent | V1 legacy | `readPersistedMotionEventIntensity` → `null`; trip-map unchanged |
| Post-PR-2 rows, reliable detector values | V2 | present | V2 | block returned verbatim |
| Post-PR-2 rows, unreliable constituent | V2 | omitted for that row | V2 | `null` for that row only |
| Malformed/partial block (defensive) | any | partial | as declared | `null` (never partially trusted) |
| Future/unrecognised `eventRowContract` | present | any | **UNKNOWN** | `readPersistedMotionEventIntensityForPayload` → `null` (fail closed; trip-map/legacy row shape still readable) |
| `coverageRatio` outside (0,1] | V2 | block present | V2 | omitted on write; `null` on read |

No backfill, replay or rewrite of existing rows. New intensity appears only on runs produced after deploy of PR-2 (deploy **not** part of this PR).

---

## 5. Cross-workstream safety

| Workstream | Impact |
|------------|--------|
| C4 / C5.1 / FSM / gap bridge / motion repair | None (files untouched) |
| Outbox / intent key / bundle versions | None (bundle constants unchanged; intent-key test asserts no `EVENT_ROW` token) |
| Trip-map read API / Trip UI | None (DTO unchanged; tests assert `peakAccel1sMps2 === null`, no `intensity`) |
| Tires DS4 shadow adapter | None (DTO consumer); closes data precondition of `TIRE-GAP-DS4-PERSISTED-INTENSITY-FIELDS-001` for **future** rows only |
| Brakes / Rental / DriverScore | None |
| Production | No deploy, no flag, no data mutation |

---

## 6. Fable review request

**Scope requested:**

1. Persistence contract shape (`contract.persistence` + optional per-row `intensity`), independence from bundle version/intent key, and legacy-V1 resolution rule.
2. **Ordinal-only restriction**: `intensityUsagePolicy = ORDINAL_ONLY_NOT_PHYSICALLY_VALIDATED` — confirm that B3 attenuation (−0.13…−0.55 m/s² vs reference on the four-drive set) forbids any absolute m/s² threshold on persisted `meanAccelMps2`, and that `durationS`/`coverageRatio`/`steps` may be used as ordinal/coverage qualifiers only.
3. Exclusion of `peakAccel1sMps2`/`peakAccel2sMps2` from persistence (kernel-sensitive artefact amplifiers).
4. Omission-over-fabrication rule (no zero-fill, no null-fill for unreliable constituents).
5. Whether `startUncertaintyS`/`endUncertaintyS` as free-text labels are acceptable for the persisted contract or should become structured before any consumer binds to them.

**Status:** `FABLE_REVIEW = PASS_WITH_CONDITIONS` (2026-10-28 read-only review on PR #2209 @ `129f9509…`). Follow-up hardening on the same PR applied: secant/ordinal semantics, `(0,1]` coverageRatio gate, UNKNOWN contract fail-closed reader, opaque flags policy. Decision `DI-DEC-DS4-INTENSITY-PERSIST-001` remains **PROPOSED** (persistence contract validated; DS4 authority not activated).
