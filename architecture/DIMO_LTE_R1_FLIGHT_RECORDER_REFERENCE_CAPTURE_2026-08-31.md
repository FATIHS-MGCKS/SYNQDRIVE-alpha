# DIMO LTE_R1 Flight Recorder — Reference Capture Architecture (Phase 3A.1)

**Date:** 2026-08-31  
**Phase:** 3A.1 — Foundation + Pre-Recorder Preflight (correction pass complete)  
**Manifest:** `DIMO_LTE_R1_REFERENCE_MANIFEST` v1.1.0

---

## Overview

Isolated reference-capture subsystem for DIMO LTE_R1 vehicles. Captures broad provider telemetry and native events into replayable Postgres storage without affecting production trip detection, scoring, or schedulers.

## Data flow

```
Operator/API (REFERENCE_CAPTURE_ENABLED=true)
  → ReferenceCaptureSessionService (lifecycle + readiness gating)
    → ReferenceCapturePreflightService
        availableSignals → buildBroadReferenceSignalsLatestQuery (NOT static snapshot)
    → POST /start → ReferenceCaptureRunnerService (BullMQ)
      → ReferenceCaptureProcessor (autonomous cycles)
        → ReferenceCaptureAcquisitionService
            buildAcquisitionCyclePlan (temporal surfaces)
            LATEST_LIVE | HF_HISTORICAL | LATEST_SLOW | NATIVE_EVENT_INCREMENTAL
          → DimoTelemetryService.postGraphQLWithHttpTiming (synqReceivedAt = HTTP response)
        → ReferenceCaptureObservationWriterService (durable batch + retry)
          → reference_capture_observations (append-only)
    → POST /tick (diagnostic only — not required for recording)
```

## Dynamic query builder

`planReferenceCaptureQuery(providerFields[])` validates fields against `reference-capture-signal-schema.registry.ts` and builds:

- `buildBroadReferenceSignalsLatestQuery` — per-vehicle broad live observation
- `buildBroadReferenceHistoricalSignalsQuery` — HF window with provider timestamps
- `buildBroadReferenceEventsQuery` — incremental session-scoped events

Unknown provider fields: retained with `canonicalKey: null`, `rawIdentity: DIMO::<field>`.

## Temporal acquisition

Broad observation breadth ≠ uniform cadence. See `reference-capture-acquisition-planner.ts`.

## Autonomous runner (correction 2)

| Property | Value |
|----------|-------|
| Queue | `reference.capture.recording` |
| Session key | `refcap-session_{sessionId}` (traceability) |
| Cycle job ID | `refcap-cycle_{sessionId}_{cycleNumber}_{uuid}` — unique, colon-free |
| Pending tracking | `reference_capture_sessions.pending_cycle_job_id` |
| Serialization | `activeCycleJobId` DB lock + processor concurrency=1 |
| Start flow | READY → STARTING → enqueue → RECORDING |
| Stop flow | STOPPING → cancel pending delayed job → flush → terminal |

Restart-safe: stale jobs no-op when session not RECORDING; active cycle does not schedule next after STOPPING.

## Event identity

`buildProviderEventFingerprint()` — SHA256(name|timestamp|source|durationNs|metadata). Stored as `providerEventFingerprint`. Overlapping retrieval windows distinguish provider event identity from retrieval observation (`provenance.duplicateRetrieval`).

## Storage

| Table | Role |
|-------|------|
| `reference_capture_sessions` | Session state, preflight, readiness, acquisition state, runner job id, event watermark |
| `reference_capture_observations` | Versioned envelopes + event fingerprints |

**Logical volume** (80 signals @ 1 Hz, 512 B): ~147 MB/hour  
**Postgres estimate** (~2.5× multiplier): ~368 MB/hour

Retention: 180 days default. Purge via `deleteMany WHERE created_at < cutoff`. Index on `created_at`. Scheduled purge requires `REFERENCE_CAPTURE_RETENTION_SCHEDULER_ENABLED=true`.

## Isolation guarantees

- Feature flag: `REFERENCE_CAPTURE_ENABLED` (default false)
- DIMO category: `REFERENCE_CAPTURE` (BACKGROUND)
- No hooks into production snapshot/trip schedulers or DI scoring
- Reference sessions never create `VehicleTrip` rows

## API surface

Base: `/api/v1/organizations/:orgId/vehicles/:vehicleId/reference-capture`

Permission: `fleet-condition` read/write

## Related documentation

- Audit: `docs/audits/dimo-phase-3a1-flight-recorder-foundation-2026-08-31.md`
- Manifest: `docs/audits/manifests/dimo-lte-r1-reference-manifest-v1.json`
- Master plan: `docs/audits/driving-intelligence-reconstruction-master-plan-2026-08-30.md`

## Changes / Architektur

See `architecture/CHANGES_REFERENCE_CAPTURE_3A1_CORRECTION_2026-08-31.md`.
