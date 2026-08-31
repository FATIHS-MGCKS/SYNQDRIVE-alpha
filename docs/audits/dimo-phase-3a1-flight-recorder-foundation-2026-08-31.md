# Phase 3A.1 — DIMO LTE_R1 Flight Recorder Foundation + Pre-Recorder Preflight

**Date:** 2026-08-31  
**Status:** DONE (implementation)  
**Authority:** `DIMO_LTE_R1_REFERENCE_MANIFEST` v1.1.0  
**Branch:** `cursor/dimo-phase-3a1-flight-recorder-foundation-7d78`

---

## 1. Purpose

First **implementation** phase of the Driving Intelligence Reconstruction workstream. Delivers an isolated DIMO LTE_R1 reference-capture (Flight Recorder) foundation with:

- Dynamic broad per-vehicle observation discovery
- Versioned wire/storage contract
- Replayable Postgres persistence
- Session lifecycle (no production trip coupling)
- PRE_RECORDER_BLOCKER resolution (RP-010, RP-039, RP-040, RP-044, RP-045)

**No reference drive executed.** No scoring formula changes.

---

## 2. Implementation paths

| Component | Path |
|-----------|------|
| Module root | `backend/src/modules/vehicle-intelligence/reference-capture/` |
| REST API | `GET/POST …/organizations/:orgId/vehicles/:vehicleId/reference-capture/…` |
| Feature gate | `REFERENCE_CAPTURE_ENABLED` (default `false`) |
| Env config | `backend/src/config/reference-capture.config.ts` |
| Prisma models | `ReferenceCaptureSession`, `ReferenceCaptureObservation` |
| Migration | `backend/prisma/migrations/20260831180000_reference_capture_sessions_and_observations/` |
| DIMO category | `REFERENCE_CAPTURE` in `dimo-provider-category.types.ts` |
| Ingress timing | `DimoTelemetryService.queryGraphQLWithIngressTiming()` |
| Frozen manifest | `docs/audits/manifests/dimo-lte-r1-reference-manifest-v1.json` |

---

## 3. Architecture

### 3.1 Isolation

- Gated by `REFERENCE_CAPTURE_ENABLED` — default off
- Uses dedicated DIMO budget category `REFERENCE_CAPTURE` (BACKGROUND priority)
- Does **not** modify: snapshot scheduler, active-trip tick, enrichment, native event pipeline, driver/vehicle scores, brake/tire health
- `ReferenceCaptureConfig.isTripDetectionAffected()` = **false**
- `ReferenceCaptureConfig.replacesProductionScheduler()` = **false**

### 3.2 Two-layer capture model (manifest v1.1.0)

| Layer | Scope |
|-------|--------|
| `CANONICAL_ANALYSIS_SET` | 33 `CAN_*` keys — mapped where manifest defines `providerField` |
| `BROAD_REFERENCE_OBSERVATION_SET` | **DYNAMIC_PER_VEHICLE** — all `availableSignals` + observed `signalsLatest` fields |

Unmapped fields: `canonicalKey: null`, `rawIdentity: DIMO::<providerField>`

### 3.3 Session lifecycle

```
CREATED → PREFLIGHT → READY → RECORDING → STOPPING → COMPLETED
                              ↘ FAILED / ABORTED
```

Endpoints:

- `POST …/sessions` — create (CREATED)
- `POST …/sessions/:id/preflight` — broad discovery (READY or FAILED)
- `POST …/sessions/:id/start` — RECORDING
- `POST …/sessions/:id/tick` — single acquisition tick (server-side, no long-lived agent)
- `POST …/sessions/:id/stop` — STOPPING → COMPLETED
- `POST …/sessions/:id/abort` — ABORTED

### 3.4 Wire/storage contract (RP-040)

- `envelopeVersion`: **`1.0.0`**
- Validated by `reference-capture.contract.ts`
- Nullable `canonicalKey`; required `rawIdentity`, `rawValue`, `synqReceivedAt`
- Separate `providerTimestamp` (never overwritten by receive time)

### 3.5 Timestamp contract (RP-039)

Every observation preserves:

- `providerTimestamp` — from provider sample when available
- `synqReceivedAt` — captured at GraphQL HTTP response boundary via `queryGraphQLWithIngressTiming`
- `requestStartedAt` / `requestCompletedAt` — DIMO API latency bounds
- `requestCorrelationId`, `sequenceNumber` where applicable

**Not** using DB `createdAt` as `synqReceivedAt`.

### 3.6 Event capture

- Broad native events via unfiltered `events(tokenId, from, to)` query
- Known analysis events (`behavior.*`) are minimum, not ceiling
- Unknown event names retained with `canonicalKey: null`
- `observationKind: NATIVE_EVENT`, `temporalClass: EVENT`

### 3.7 Persistence

**Postgres only** (replayable historical evidence):

- `reference_capture_sessions` — session metadata, preflight JSON, mass binding
- `reference_capture_observations` — append-only observation envelopes

Indexes: `(session_id, synq_received_at)`, `(session_id, provider_field)`, org/vehicle scoping.

**Not** using `VehicleLatestState` as historical storage.

### 3.8 Retention (RP-045)

- Default **180 days** (`REFERENCE_CAPTURE_RETENTION_DAYS`)
- Justification: manifest validation → replay → calibration cycle
- Volume estimate (80 signals @ ~1 Hz): ~512 B/obs × 4800 obs/min × 60 ≈ **~1.4 GB/hour** broad upper bound
- `ReferenceCaptureRetentionService.purgeExpiredObservations()` for lifecycle enforcement

### 3.9 Long-session stress (RP-010)

- Batch writes: `REFERENCE_CAPTURE_BATCH_SIZE` (default 250)
- Backpressure: `REFERENCE_CAPTURE_MAX_PENDING` (default 5000) — throws `ReferenceCaptureBackpressureError`
- Synthetic stress validated in unit tests (no hours-long drive required)

### 3.10 Vehicle mass binding (RP-044)

- Reads `Vehicle.curbWeightKg` + `frontWeightDistributionPct`
- `massSource: MANUFACTURER_CURB_WEIGHT` when present
- Does **not** invent passenger/cargo mass
- Persisted in `ReferenceCaptureSession.massBindingJson`

---

## 4. PRE_RECORDER_BLOCKER matrix

| ID | Status | Evidence |
|----|--------|----------|
| **RP-010** | **RESOLVED** | Batch writer + max pending cap + stress unit tests; volume estimates in retention service |
| **RP-039** | **RESOLVED** | `queryGraphQLWithIngressTiming` + contract tests requiring distinct `synqReceivedAt` |
| **RP-040** | **RESOLVED** | Envelope v1.0.0 + `reference-capture.contract.spec.ts` fixtures |
| **RP-044** | **RESOLVED** | `ReferenceCaptureMassBindingService` + unit tests; no invented runtime mass |
| **RP-045** | **RESOLVED** | 180-day policy + volume justification + purge API |

---

## 5. Test coverage

| Test file | Coverage |
|-----------|----------|
| `reference-capture.contract.spec.ts` | Wire format, timestamps, unmapped retention |
| `reference-capture-preflight.service.spec.ts` | Dynamic broad discovery, temporal classes |
| `reference-capture-observation-writer.service.spec.ts` | Batching, backpressure, duplicate/out-of-order |
| `reference-capture-mass-binding.service.spec.ts` | RP-044 |
| `reference-capture-retention.service.spec.ts` | RP-045, RP-010 estimates |
| `reference-capture-session.service.spec.ts` | Lifecycle, feature gate, abort |
| `reference-capture-ingress-timing.spec.ts` | RP-039 |

---

## 6. Known limitations

1. **Cadence measurement metrics** (P50/P95 delta-t, jitter, latency distributions) — data model supports timestamps; computation deferred to post-capture analysis phase
2. **Controlled schema probes** — classification types defined; continuous unsupported-field polling not implemented
3. **ClickHouse mirror** — not used; Postgres is canonical Flight Recorder store for Phase 3A.1
4. **Reference drive** — not executed; `captureTick` is manual/operator-triggered
5. **PHEV/BEV GT vehicles** — mass binding works; reference vehicle binding for GT sync remains `PENDING_REFERENCE_VEHICLE` per manifest

---

## 7. Exit criteria

| Criterion | Met |
|-----------|-----|
| Flight Recorder implementation exists | ✅ |
| DIMO_LTE_R1 only | ✅ (hardwareType gate in preflight) |
| Isolated from production | ✅ |
| Dynamic broad capture | ✅ |
| Unmapped fields retained | ✅ |
| Broad provider events | ✅ |
| providerTimestamp retained | ✅ |
| synqReceivedAt at ingress | ✅ |
| Versioned wire contract | ✅ |
| Replayable persistence | ✅ |
| Session lifecycle | ✅ |
| Temporal acquisition classes | ✅ |
| RP-010..RP-045 resolved | ✅ |
| Automated tests | ✅ |
| No scoring changes | ✅ |
| No reference drive | ✅ |

---

## 8. Readiness

**REFERENCE_DRIVE_READINESS = READY**

All PRE_RECORDER_BLOCKER items resolved. System ready for controlled reference drive operation (Phase 3A.2+), not executed in 3A.1.

**Phase status:** Phase 3A.1 **DONE** · Phase 3A Ground Truth analysis **NOT STARTED**
