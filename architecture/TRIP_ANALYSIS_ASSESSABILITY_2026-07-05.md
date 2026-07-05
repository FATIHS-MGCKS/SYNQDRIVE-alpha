# Trip Analysis Pipeline — Assessability Refinement (2026-07-05)

## Context

Post-trip `tripAnalysisStatus` (V4.9.201) is separate from trip lifecycle `COMPLETED`.
This refinement fixes overly coarse skip logic where HF data shortage incorrectly marked
the entire analysis as SKIPPED — especially on LTE_R1 where native DIMO driving events
are a valid primary source.

## Migration

- Original: `20260705140000_trip_analysis_status`
- Idempotent guard: `20260705200000_trip_analysis_status_guard` (`ADD COLUMN IF NOT EXISTS`)

Fields covered: `trip_analysis_status`, `analysis_*` timestamps/latency/stages,
`quality_status`, `behavior_summary_status`, `driving_impact_status`.

## Assessability model (API-derived + persisted in `behaviorSummaryJson`)

| Field | Values |
|-------|--------|
| `analysisAssessability` | `FULL` \| `LIMITED` \| `NOT_ASSESSABLE` |
| `analysisLimitReason` | `INSUFFICIENT_HF` \| `NO_NATIVE_EVENTS` \| `LOW_DATA` \| `CAPABILITY` \| `NO_END_TIME` \| null |
| `shortTermMisuseAssessable` | boolean |
| `nativeBehaviorEventsAvailable` | boolean |
| `hfInsufficientForAbuse` | boolean |

## Hardware rules

### LTE_R1
- Native DIMO driving events = primary behavior source.
- Sparse HF sets `hfInsufficientForAbuse=true`, `shortTermMisuseAssessable=false`.
- Does **not** set `tripAnalysisStatus=SKIPPED` when native path completes.
- Zero native events after **successful** native query + sufficient HF → `FULL` (calm trip; absence of events is a reliable signal).
- Zero native events after successful query + insufficient HF → `NOT_ASSESSABLE` / `NO_NATIVE_EVENTS`.
- Legacy persisted `NOT_ASSESSABLE` rows with `nativeQuerySucceeded=true` and sufficient HF are reconciled to `FULL` at read time.

### SMART5 / UNKNOWN
- HF &lt;10 raw or &lt;5 clean → behavior stage skipped, `NOT_ASSESSABLE` / `INSUFFICIENT_HF`.
- `tripAnalysisStatus=SKIPPED` when no assessable source.
- No “unauffällig” semantics from zero events.

## Pipeline stages

`behavior → route → misuse → drivingImpact`

- `PARTIAL`: behavior done; misuse/drivingImpact may still run. `behaviorSummaryStatus=READY`.
- `COMPLETED`: all stages terminal (done/skipped) without failure.
- Stage-specific skips via `TripAnalysisCoordinatorService.onBehaviorSkipped` — no blanket all-stage skip on HF-only limits.

## Recovery

`TripAnalysisRecoveryScheduler` re-triggers misuse aggregation for trips stuck in `PARTIAL`
with `misuse=pending` after process restarts (every 5 min + on boot).

## Diagnostics

Per-trip structured log via `TripAnalysisCoordinatorService.logAnalysisDiagnostics`:
tripId, vehicleId, hardwareType, statuses, assessability, HF points, native event count.

---

## OBD plug state gating (2026-07-05)

DIMO `obdIsPluggedIn` triggers may fire every ~26s while state is unchanged.

**Intake (`DeviceConnectionWebhookService`):**
- `shouldPersistObdPlugStateChange` — only persist on real transitions
- First `plugged=true` without history → baseline ignored (`baseline_already_plugged`)
- Repeated same-state webhooks → `ignored` (`no_state_change`)
- 30s bucket dedup remains as secondary layer

**Read-model:** `collapseConsecutiveDeviceConnectionEvents` filters historical spam for display/counts.

## Timeline API mapping (2026-07-05 evening)

`GET /vehicles/:vehicleId/trips-timeline` now applies `mapTripForVehicleApi` (same as `GET /trips` and `GET /trips/:id`) before device-connection flags and merge — exposes `behaviorReady`, `behaviorEnrichmentStatus`, `detailsLimited`, and assessability fields to the Trips tab without a second detail fetch.

**Frontend:** `deriveTripAssessability` trusts `analysisAssessability=FULL`, `shortTermMisuseAssessable`, and `behaviorReady` when enrichment status is stripped after detail hydration.

## `detailsLimited` (API)

True when: no endTime, quality LOW_DATA/ANOMALY, `tripAnalysisStatus=SKIPPED`,
`behaviorEnrichmentStatus=SKIPPED_NO_HF_DATA`, assessability LIMITED/NOT_ASSESSABLE,
or `hfInsufficientForAbuse=true`.
