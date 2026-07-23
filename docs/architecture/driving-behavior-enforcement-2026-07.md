# Driving Behavior, Misuse & Profiling Enforcement (Prompt 20)

Authorization Decision Engine bound to driving behavior detection, misuse aggregation, driver profiling, and automated assessments.

## Profiling boundary

| Processing kind | Action | Purpose | Notes |
|-----------------|--------|---------|-------|
| Technical event detection | `DERIVE` | `TECHNICAL_OVERVIEW` | Harsh accel/brake, cornering, launch, impact |
| Safety analysis | `DERIVE` | `TECHNICAL_OVERVIEW` | Route/speeding enrich |
| Fleet operations | `DERIVE` | `FLEET_ANALYTICS` | Vehicle stress / driving impact (not driver quality) |
| Driver profiling | `PROFILE` | `RENTAL_ANALYTICS` | Aggregated driver scores |
| Misuse detection | `PROFILE` | `ABUSE_MISUSE_DETECTION` | Misuse aggregation, damage suspect |
| Automated assessment | `PROFILE` | `RENTAL_ANALYTICS` | Trip decision summary / Fahrbewertung |
| Booking risk | `PROFILE` | `RENTAL_ANALYTICS` | Rental driving analysis recompute |

**Profiling cannot be implied by general telemetry policies** — `mayProfile()` rejects non-profiling purposes; `mayDerive()` rejects profiling purposes.

## DPIA gates

High-risk combinations (policy resolver):

| Category | Purpose | DPIA required |
|----------|---------|---------------|
| `DRIVING_BEHAVIOR` | `ABUSE_MISUSE_DETECTION` | Yes |
| `DRIVING_BEHAVIOR` | `RENTAL_ANALYTICS` | Yes |

Missing DPIA evidence on legal basis → `DPIA_MISSING` → DENY (fail-closed when enabled).

## Environment

| Variable | Default | Effect |
|----------|---------|--------|
| `DATA_AUTH_DRIVING_BEHAVIOR_SHADOW_MODE` | `true` | DENY logged; processing may continue |
| `DATA_AUTH_DRIVING_BEHAVIOR_FAIL_CLOSED` | `false` | Blocks derive/profile/read when enabled |

## Protected processes

| Process | Action | Gate location |
|---------|--------|---------------|
| Behavior enrichment (HF/native events) | DERIVE | `TripEnrichmentOrchestratorService.runEnrichmentSync` |
| Safety route enrich | DERIVE | `runRouteSafetyEnrichment` |
| Driving impact compute | DERIVE | `enqueueDrivingImpact`, `DrivingImpactProcessor` |
| Misuse aggregation | PROFILE | `runMisuseAggregation`, `MisuseCaseReconcileService` |
| Trip decision summary | PROFILE | `TripDecisionSummaryService.computeAndPersist` |
| Booking risk analysis | PROFILE | `RentalDrivingAnalysisService.recomputeForBooking` |
| Behavior events API | READ | `VehicleIntelligenceController.getTripBehaviorEvents` |
| Driver score API | READ | `getDriverScore` |
| Driving impact rolling | READ | `getDrivingImpactRolling` |

## Follow-up actions (NOTIFY)

`mayNotify()` uses explicit `NOTIFY` action — separate from PROFILE/DERIVE. Wire at notification emission sites as they are hardened.

## Data lifecycle

- **Revocation:** blocks new PROFILE/DERIVE; `effectiveTimestamp` on reprocess/backfill — no retroactive bypass.
- **Existing assessments:** retained per retention policy; READ deny returns empty/redacted scores.
- **No alerts/scores from DENY data:** empty driver score, redacted behavior events, denied trip decision summary.

## Tests

```bash
cd backend && npm test -- --testPathPattern="driving-behavior-enforcement|data-authorizations"
```

**Result (2026-07-23):** 36 suites, **240 passed**, 0 failed.

Covers: DERIVE vs PROFILE purpose separation, DPIA deny (ABUSE_MISUSE_DETECTION + RENTAL_ANALYTICS), misuse profile deny, driver score READ, AI/export/notify actions, tenant/booking scope, reprocess timestamp, resolver error without legacy fallback.

## Remaining gaps

- NOTIFY wiring at misuse notification emission sites
- Dedicated behavior bulk export HTTP endpoint
- AI behavior analysis service gate (when dedicated endpoint exists)
- Historical backfill job explicit gate in `TripDrivingImpactBackfillService`
