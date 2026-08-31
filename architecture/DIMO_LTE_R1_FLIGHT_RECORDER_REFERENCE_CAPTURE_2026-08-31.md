# DIMO LTE_R1 Flight Recorder — Reference Capture Architecture (Phase 3A.1)

**Date:** 2026-08-31  
**Phase:** 3A.1 — Foundation + Pre-Recorder Preflight  
**Manifest:** `DIMO_LTE_R1_REFERENCE_MANIFEST` v1.1.0

---

## Overview

Isolated reference-capture subsystem for DIMO LTE_R1 vehicles. Captures broad provider telemetry and native events into replayable Postgres storage without affecting production trip detection, scoring, or schedulers.

## Data flow

```
Operator/API (REFERENCE_CAPTURE_ENABLED=true)
  → ReferenceCaptureSessionService (lifecycle)
    → ReferenceCapturePreflightService (availableSignals + signalsLatest → broad field set)
    → ReferenceCaptureAcquisitionService (DIMO GraphQL via REFERENCE_CAPTURE category)
      → DimoTelemetryService.queryGraphQLWithIngressTiming (synqReceivedAt at HTTP boundary)
    → ReferenceCaptureObservationWriterService (batch + backpressure)
      → reference_capture_observations (append-only)
```

## Storage

| Table | Role |
|-------|------|
| `reference_capture_sessions` | Session state, preflight JSON, mass binding, manifest version |
| `reference_capture_observations` | Versioned observation envelopes (raw + normalized + timestamps + provenance) |

Retention: 180 days default; purge via `ReferenceCaptureRetentionService`.

## Isolation guarantees

- Feature flag: `REFERENCE_CAPTURE_ENABLED` (default false)
- DIMO category: `REFERENCE_CAPTURE` (BACKGROUND)
- No hooks into `DimoSnapshotScheduler`, `TripTrackingProcessor`, or DI scoring pipelines
- Reference sessions never create production `VehicleTrip` rows

## API surface

Base: `/api/v1/organizations/:orgId/vehicles/:vehicleId/reference-capture`

Permission: `fleet-condition` read/write

## Related documentation

- Audit: `docs/audits/dimo-phase-3a1-flight-recorder-foundation-2026-08-31.md`
- Manifest: `docs/audits/manifests/dimo-lte-r1-reference-manifest-v1.json`
- Master plan: `docs/audits/driving-intelligence-reconstruction-master-plan-2026-08-30.md`
