# M3.3A — Generalized Battery Evidence + Rest Session Architecture

**Date:** `2026-09-21`  
**Mode:** architecture + isolated shadow-safe implementation (flag default **OFF**)  
**Predecessor:** `M3_3_R1_8H_REST_EVIDENCE_ARCHITECTURE_AUDIT_2026-09-21.md`

---

## Executive summary

M3.3A separates **raw LV persistence** (unchanged `battery_measurements`) from a **normalized evidence layer** and **open-ended rest sessions** that do not require Trip FSM `COMPLETED` at capture time. R1 ~8h samples are classified as **`REST_WAKE_VOLTAGE`**, not OCV, until production forensics prove otherwise. **`REST_60M` / `REST_6H` remain opportunistic legacy targets** — no authoritative cutover.

---

## 0 — Contract vs observation

| Token | Value (M3.3A) |
|-------|----------------|
| `R1_8H_SIGNAL_AVAILABLE_BY_CONTRACT` | **YES** |
| `R1_8H_NATURAL_PRODUCTION_SEQUENCE_OBSERVED` | **NO** |
| `R1_8H_CADENCE_EMPIRICALLY_VALIDATED` | **NO** |
| `R1_WAKE_LOAD_ORDER_KNOWN` | **NO** |
| `R1_REST_SIGNAL_SEMANTIC` | **`REST_WAKE_VOLTAGE`** |

---

## 1 — Generalized evidence model

**Entity:** `BatteryGeneralizedEvidenceObservation` → table `battery_generalized_evidence_observations`.

- **Immutable source:** `sourceMeasurementId` → `battery_measurements` (`LIVE_VOLTAGE`).
- **Normalized interpretation:** `evidenceClass`, `evidenceConfidence`, vehicle state snapshot fields, M3.2B-aligned provenance (`stateCompleteness`, `stateAlignmentClass`, skew fields).
- **Association (nullable, late):** `tripId`, `restSessionId`.
- **Rest ladder metadata:** `actualRestAgeMs` (authority), `nominalRestIntervalIndex` (derived — **null** in M3.3A), `tolerancePolicyVersion=RESEARCH_PENDING`.
- **`atomicClaim=false`** unless explicitly proven otherwise.

Capture hook: `GeneralizedEvidenceCaptureService.captureFromObservationClassify()` after successful LIVE_VOLTAGE persist in `BatteryV2SnapshotIngestionService` (errors logged; pipeline continues).

**Flag:** `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED` (default **false**).

---

## 2 — Evidence class taxonomy

Enums: `BatteryGeneralizedEvidenceClass`, `BatteryGeneralizedEvidenceConfidence`.

Minimum classes implemented in policy `generalized-evidence-classification.policy.ts`:

- `DRIVING_CHARGING` / `DRIVING_NON_CHARGING`
- `ENGINE_OFF_TRANSITION`
- `REST_WAKE_VOLTAGE`
- `REST_STABLE_VOLTAGE` — **promotion disabled** (`restStablePromotionEnabled: false` in M3.3A)
- `ACTIVE_VEHICLE_CONTAMINATED` / `CHARGING_CONTAMINATED`
- `STALE_REPLAY` / `STATE_AMBIGUOUS` / `UNKNOWN`

**Invariant:** `REST_STABLE_VOLTAGE` is **not** emitted from `actualRestAge >= 8h` alone.

---

## 3 — M3.2B provenance reuse

Field bundle built via `buildShutdownFieldBundleFromSnapshotIngest()` (same timestamp sources: `PROVIDER_FIELD_TIMESTAMP`, `PROVIDER_SNAPSHOT_TIMESTAMP`, `VLS_PROVIDER_FETCHED_AT`, `INGEST_WALL_CLOCK`, `UNKNOWN`). Classification reuses `resolveStateAlignment` / `resolveStateCompleteness` from shutdown policy.

---

## 4 — Raw persistence independence

```
RAW_LV_SURVIVES_WITHOUT_FINALIZED_TRIP=YES
GENERALIZED_EVIDENCE_REQUIRES_FINALIZED_TRIP=NO
```

Generalized capture uses `activeTripId` for optional `tripId` linkage only — **no** `TripStatus.COMPLETED` gate (contrast M3.2B shadow).

---

## 5 — Rest session model

**Entity:** `BatteryRestSession` → `battery_rest_sessions`.

| Field | Role |
|-------|------|
| `anchorType` | `PHYSICAL_SHUTDOWN` initially; `TRIP_END_CONFIRMED` after late association |
| `anchorAt` | Physical shutdown evidence time |
| `candidateTripId` / `confirmedTripId` | Nullable until Trip FSM confirms |
| `sessionStatus` | `CANDIDATE` → `CONFIRMED` / `RESTING` → `ENDED` / `INVALIDATED` |
| `validRestObservationCount` | Count of linked rest-class observations |

No fixed `REST_8H` / `REST_16H` columns — ladder is observation-level `actualRestAgeMs`.

---

## 6 — Engine-off anchor vs trip finalization

```
PHYSICAL_SHUTDOWN_EVIDENCE → open CANDIDATE session (ENGINE_OFF_TRANSITION)
TRIP_FINALIZATION_CONFIRMATION → LateTripAssociationService (read-only Trip Detection)
```

Trip FSM may **confirm**, **associate**, or **invalidate** sessions later — it must **never** delete raw measurements or rewrite provider timestamps.

---

## 7–8 — Rest ladder and tolerance

- **Authority:** `actualRestAgeMs` on each observation.
- **Nominal index:** reserved for M3.3B+ after forensics (`R1_NOMINAL_REST_CADENCE_MS` is metadata-only constant).
- **`INITIAL_TOLERANCE_POLICY=RESEARCH_PENDING`** — no exact 8h equality gating.

---

## 9 — Session termination

`BatteryRestSessionService` ends sessions on driving/charging/contamination classes, active trip + speed, or `SESSION_TIMEOUT` (`DEFAULT_REST_SESSION_MAX_DURATION_MS`).

---

## 10 — Retroactive association

`LateTripAssociationService.associatePendingSessions()`:

- Matches `COMPLETED` trips within ±120s of `anchorAt` (read-only).
- Updates `confirmedTripId`, optional `candidateTripId`, observation `tripId`.
- **Does not** mutate provider timestamps on measurements or evidence rows.

```
LATE_TRIP_ASSOCIATION_SUPPORTED=YES
ASSOCIATION_IDEMPOTENT=YES
RAW_PROVIDER_TIMESTAMP_UNCHANGED=YES
```

---

## 11 — Legacy REST targets

```
REST_60M_DISPOSITION=OPPORTUNISTIC_LEGACY_TARGET
REST_6H_DISPOSITION=OPPORTUNISTIC_LEGACY_TARGET
```

Unchanged in M3.3A.

---

## 12 — Database design

```
NEW_TABLES=
  battery_generalized_evidence_observations
  battery_rest_sessions

EXTENDED_TABLES=
  (relations on Organization, Vehicle, VehicleTrip, BatteryMeasurement)

UNCHANGED_AUTHORITATIVE_TABLES=
  battery_assessments
  battery_publications
  battery_measurements (semantics unchanged — new rows reference via FK)
  battery_measurement_sessions / REST_60M / REST_6H pipelines
  battery_shutdown_evidence_observations (M3.2B shadow — parallel)
```

Migration: `20260921130000_battery_m3_3a_generalized_evidence`.

---

## 13 — Idempotency / multi-replica

- Evidence: `@@unique([organizationId, vehicleId, idempotencyKey])` with key `gen-ev:{vehicleId}:{sourceMeasurementId}`.
- Session open: `rest-session:{vehicleId}:{anchorAtMs}`.
- Duplicate inserts → `P2002` → `'duplicate'` (no second logical row).

---

## 14 — Test matrix (unit coverage)

Policy + session specs cover scenarios A–F, I–M, K (idempotency keys), authority isolation (no assessment imports), capture contract G/H (no COMPLETED gate).

---

## 15 — Observability

Stub metrics in `generalized-evidence.metrics.ts` (no noisy per-poll logs). Prometheus wiring deferred to M3.3B activation work.

---

## 16 — No health logic

```
HEALTH_SCORE_CHANGED=NO
FAILURE_RISK_IMPLEMENTED=NO
CHARGE_RETENTION_SCORE_IMPLEMENTED=NO
AUTHORITATIVE_PUBLICATION_CHANGED=NO
```

---

## 17 — Migration narrative

Fixed **REST_60M / REST_6H** observability remains for Stage-2 authoritative paths. M3.3A adds a **parallel shadow ladder** keyed by **actual rest age** and **REST_WAKE_VOLTAGE** semantics for R1 hardware. Historical M3.1/M3.2 conclusions are preserved in `CHANGE_LEDGER.md`.

---

## 18 — Code map

| Path | Role |
|------|------|
| `generalized-evidence/generalized-evidence.module.ts` | Nest DI |
| `generalized-evidence-capture.service.ts` | Classify + persist + session + late trip |
| `battery-rest-session.service.ts` | Session lifecycle |
| `late-trip-association.service.ts` | Read-only trip link |
| `generalized-evidence.repository.ts` | Idempotent writes |
| `jobs/battery-v2-snapshot-ingestion.service.ts` | Post-LV hook |

---

## FINAL MACHINE-READABLE BLOCK

```
M3_3A_RESULT=COMPLETE

R1_8H_SIGNAL_AVAILABLE_BY_CONTRACT=YES
R1_8H_NATURAL_PRODUCTION_SEQUENCE_OBSERVED=NO
R1_8H_CADENCE_EMPIRICALLY_VALIDATED=NO
R1_WAKE_LOAD_ORDER_KNOWN=NO

RAW_LV_SURVIVES_WITHOUT_FINALIZED_TRIP=YES
GENERALIZED_EVIDENCE_REQUIRES_FINALIZED_TRIP=NO

BATTERY_EVIDENCE_MODEL_CREATED=YES
REST_SESSION_MODEL_CREATED=YES
LATE_TRIP_ASSOCIATION_SUPPORTED=YES
ASSOCIATION_IDEMPOTENT=YES

REST_LADDER_SUPPORTS_OPEN_ENDED_INTERVALS=YES
ACTUAL_REST_AGE_IS_AUTHORITY_WHEN_PROVIDER_TIME_QUALIFIED=YES
EXACT_8H_EQUALITY_REQUIRED=NO

M3_3A_1_HARDENING=YES (see research/M3_3A_1_PRE_MERGE_HARDENING_2026-09-21.md)
PARKED_REST_CANDIDATE_CLASS=YES

M3_2B_PROVENANCE_REUSED=YES

REST_60M_DISPOSITION=OPPORTUNISTIC_LEGACY_TARGET
REST_6H_DISPOSITION=OPPORTUNISTIC_LEGACY_TARGET

MULTI_REPLICA_DUPLICATE_PROTECTION=YES (DB unique idempotency keys)

AUTHORITATIVE_BATTERY_BEHAVIOR_CHANGED=NO
HEALTH_SCORE_CHANGED=NO
FAILURE_RISK_IMPLEMENTED=NO
PRODUCTION_CHANGED=NO

IMPLEMENTATION_READY_FOR_M3_3B=YES (forensics + nominal index + metrics activation)
NEXT_PHASE=M3.3B
```
