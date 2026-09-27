# EXP-021 C1D.8 — S3B R1 OBD + native event evidence adapters

**Evidence ID:** DI-EVID-EXP021-C1D8-001  
**Date:** 2026-09-27  
**Baseline:** `main` @ `ee26a1bf6acec7fe0fe27f81340dfc162601aec5` (S1 + S2 + S3A merged)

## Scope

Two **separate**, **dormant** evidence channels:

| Channel | Path | Semantics |
|---------|------|-----------|
| A — R1 historical OBD | `r1-obd-acquisition/` | `INTERVAL_ONLY`; corroboration/conflict only vs L3 |
| B — native provider events | `native-event-evidence/` | `NATIVE_EVENT_OBSERVATION`; default `UNCALIBRATED` max claim `L1` |

No fusion, no worker, no DB write, no customer effect.

## Data path ownership (Step 1)

| Concern | Owner |
|---------|--------|
| DIMO HF GraphQL query shape | `dimo/queries/high-frequency.query.ts` (legacy enrichment); S3B uses a **documented subset** in `di-v0-r1-obd-query.ts` |
| DIMO auth + GraphQL transport | `DimoAuthService` + `DimoTelemetryService` via `DimoTelemetryDiV0HistoricalR1ObdTransport` (not Nest-registered) |
| Source family | `telemetry-source-family.ts` via `resolveDiV0SourceFamily` (S3A helper) |
| R1 temporal containment (production read paths) | `r1-temporal-containment.ts`, misuse/unified-behavior presentation |
| Native event ingest + mapping | `dimo-native-driving-events/*`, `DrivingEvent` persistence, ingest jobs (unchanged) |
| S1 cross-source relation | `core/claims/cross-source-relation.ts` |
| S2 snapshot pinning (future) | `evidence-input/di-v0-combined-input-identity.ts` |

## Frozen contracts

- R1 OBD: **no fixed time correction**; bucket label is not exact physical event time.
- R1 speed: **not** continuous kinematic authority; **cannot override L3**.
- Native events: distinct provenance; fusion **NEEDS_VALIDATION**; WOB full trip had **0** native events (does not validate accuracy).
- KS MX 2024: future candidate when sealed calibrated native evidence exists — **not VALIDATED** here.

## Validation

- S3B Jest suites (R1 + native + dormancy + WOB structural control + performance smoke)
- S1 / S2 / S3A regression suites
- Static dormancy: no Nest registration of S3B acquisition entrypoints
