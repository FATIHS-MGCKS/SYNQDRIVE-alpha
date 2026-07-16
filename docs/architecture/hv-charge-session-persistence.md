# HV Charge Session Persistence (Prompt 48/78)

## Purpose

Idempotently persist DIMO `recharge` segments as `HvChargeSession` rows — one segment maps to exactly one session.

## Module

`backend/src/modules/vehicle-intelligence/battery-health/hv-charge-session/`

| File | Role |
|------|------|
| `hv-charge-session.mapper.ts` | `NormalizedDimoRechargeSegment` → `HvChargeSessionDraft` |
| `hv-charge-session.quality.ts` | `dataQuality` assessment (VALID/SHADOW/…) — no capacity math |
| `hv-charge-session.merge.ts` | Safe update rules for ongoing/completed sessions |
| `hv-charge-session.repository.ts` | Prisma create/update by `segmentFingerprint` |
| `hv-charge-session-persist.service.ts` | Idempotent upsert + audit log via `BatteryV2JobObservabilityService` |
| `hv-charge-session-ingest.service.ts` | Fetch from `DimoRechargeSegmentsClient` + persist batch/single |

## Persisted fields

| Field | Source |
|-------|--------|
| `source` | `DIMO_RECHARGE_SEGMENT` |
| `segmentFingerprint` | normalized `fingerprint` (`dimo-recharge-{tokenId}-{startMs}`) |
| `dimoSegmentId` | provider `id` or fingerprint |
| `startAt` / `endAt` / `isOngoing` | segment bounds |
| `startSocPercent` / `endSocPercent` / `deltaSocPercent` | SOC aggregates |
| `startEnergyKwh` / `endEnergyKwh` / `energyAddedKwh` | optional energy aggregates |
| `quality` | segment reliability assessment |
| `metadata` | `providerSegmentFingerprint`, `durationSeconds`, `lastReconciledAt`, charging flags, odometer, change history |
| `idempotencyKey` | `hv-session:{vehicleId}:{fingerprint}` |

## Merge rules

1. **One segment → one session** — unique `(vehicleId, segmentFingerprint)`
2. **Start anchors immutable** — `startAt`, `startSocPercent`, `startEnergyKwh` never overwritten once set
3. **Ongoing sessions** — accept provider updates; completion sets `isOngoing=false` + `endAt`
4. **Completed sessions** — only accept strictly better provider data (higher completeness score or improved quality)
5. **No regression** — weaker late payloads do not reduce end SOC/energy deltas
6. **No capacity calculation** — persistence only; `HvCapacityObservation` is downstream

## Job integration

- `HvRechargeSessionReconcileHandler` → `HvChargeSessionIngestService.ingestSegmentByFingerprint`
- `BatteryV2ReconciliationService` re-enqueues ongoing sessions for provider refresh
- `HV_RECHARGE_SESSION_RECONCILE` idempotent execution allows re-runs for late provider data

## Tests

`hv-charge-session-persist.service.spec.ts` — 9 tests: new, ongoing, completed, re-delivered (better/weaker), mapper, quality.
