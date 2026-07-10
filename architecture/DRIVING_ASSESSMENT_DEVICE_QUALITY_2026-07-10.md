# Driving Assessment Device Quality — Implementation (2026-07-10)

See Phase-0 evidence: `DRIVING_ASSESSMENT_DEVICE_QUALITY_PHASE0_2026-07-10.md`.

## Scope

**Fahrbewertung only** — trips, route, fuel, health, rental blocking unchanged.

## Components

| Layer | Module |
|-------|--------|
| Detector (pure) | `driving-assessment-device-quality.detector.ts` |
| Service | `driving-assessment-device-quality.service.ts` |
| Hook | `TripBehaviorEnrichmentService.enrichTripLteR1` (post-transaction) |
| Persistence | `vehicle_driving_assessment_quality` |
| Mängelliste | `TechnicalObservationsService` — `system_import`, `driving_behavior` |
| Notification | `DrivingAssessmentDeviceQualityDetector` → Dashboard Insights |
| Trip API | `deviceQualityWarning`, `analysisLimitReason=DEVICE_NATIVE_EVENT_QUALITY` |
| Assessment | `trip-assessment.service.ts` — cap to `PRUEFHINWEIS`, confidence `LOW` |

## State machine

- **DEGRADED**: ≥2 of last 3 trips flagged
- **RECOVERING**: 1–2 consecutive calm trips after DEGRADED
- **NORMAL**: 3 consecutive calm trips → auto-resolve observation + clear insight

## Ops

```bash
# Diagnose
npx ts-node -r tsconfig-paths/register scripts/analyze-lte-r1-driving-event-quality.ts --plate 7503

# Backfill existing trips → vehicle state + Mängelliste
npx ts-node -r tsconfig-paths/register scripts/backfill-driving-assessment-device-quality.ts --plate 7503
```
