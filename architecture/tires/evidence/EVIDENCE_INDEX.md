# Tires Health — Evidence Index

Graph nodes `TIRE-EVID-*` (evidence) and `TIRE-TEST-*` (test evidence). Each entry states source type, locator and verification reference.

| ID | Source type | Locator | Verified | Epistemic |
|----|-------------|---------|----------|-----------|
| TIRE-EVID-CODE-WEAR-MODEL-V2-001 | CURRENT_CODE | `backend/src/modules/vehicle-intelligence/tires/tire-wear-model.service.ts`, `tire-health.config.ts`, `tire-health.service.ts`, `vehicle-intelligence.controller.ts` | `1c1e3bfa4`, 2026-10-24 | CONFIRMED |
| TIRE-EVID-CODE-DI-IMPACT-FOR-TIRE-001 | CURRENT_CODE | `backend/src/modules/vehicle-intelligence/driving-impact/driving-impact.service.ts` (`getVehicleImpactForTire`) | `1c1e3bfa4` | CONFIRMED |
| TIRE-EVID-CODE-TRIP-USAGE-LEDGER-001 | CURRENT_CODE | `tires/tire-trip-usage.service.ts`, `trips/trip-analysis-coordinator.service.ts`, `trips/trip-behavior-enrichment.service.ts` | `1c1e3bfa4` | CONFIRMED |
| TIRE-EVID-CODE-DS4-EVENT-TYPES-001 | CURRENT_CODE | `driving-intelligence/core/kinematics/motion-event.types.ts`, `motion-event-detector.ts`, `motion-event-physics-envelope.ts` | `1c1e3bfa4` | CONFIRMED |
| TIRE-EVID-CODE-DS4-PERSISTED-EVENT-ROW-001 | CURRENT_CODE | `motion-core-shadow-worker/di-v0-motion-core-shadow.types.ts`, `di-v0-motion-core-shadow-trip-map-read.types.ts`, `backend/prisma/schema.prisma` | `1c1e3bfa4` | CONFIRMED |
| TIRE-EVID-CODE-DS4-CONTROL-PLANE-001 | CURRENT_CODE | `motion-core-shadow-worker/di-v0-motion-core-shadow-control-plane.ts`, `di-v0-motion-core-shadow.bundle.version.ts` | `1c1e3bfa4` | CONFIRMED |
| TIRE-EVID-PROD-BASELINE-2026-10-24-001 | PRODUCTION_OBSERVATION | [`PRODUCTION_BASELINE.md`](PRODUCTION_BASELINE.md) §Tire module tables | `c169ddfab`, 2026-10-24T17:21–17:23Z | CONFIRMED |
| TIRE-EVID-PROD-DS4-SHADOW-RUNS-2026-10-24-001 | PRODUCTION_OBSERVATION | [`PRODUCTION_BASELINE.md`](PRODUCTION_BASELINE.md) §DS4 motion-core shadow | `c169ddfab`, 2026-10-24T17:22Z | CONFIRMED |
| TIRE-EVID-DS4-FABLE-REVIEW-2026-10-24-001 | AUDIT_DOCUMENT | `research/driving-intelligence/evaluations/ds4-accel-brake-fable-review-20261024/REPORT.md`, `P2_UNIVERSAL_PLAUSIBILITY.md`; PR #2153 / #2154 | `1c1e3bfa4` | CONFIRMED |
| TIRE-EVID-AUDIT-READINESS-2026-07-001 | AUDIT_DOCUMENT | `docs/audits/tire-health-production-readiness-2026-07.md`, `docs/audits/tire-health-post-remediation-readiness-2026-07.md` | historical | HISTORICAL |
| TIRE-TEST-REGRESSION-MATRIX-001 | CURRENT_TEST | `backend/src/modules/vehicle-intelligence/tires/tire-health-regression-matrix.spec.ts` | present at `1c1e3bfa4`; not executed in this docs-only PR | CONFIRMED (existence) |
| TIRE-TEST-DS4-P1-P2-HARNESS-001 | CURRENT_TEST | `backend/scripts/test/motion-event-p1-p2-four-drive-regression.harness.ts` | present at `1c1e3bfa4`; owned by Driving Intelligence | CONFIRMED (existence) |

## Evidence not available / not claimed

- No test-run output is recorded for tire specs in this PR (documentation only); the Tire Module audit earlier on 2026-10-24 executed tire specs read-only — results are not re-cited here because they were not persisted into the repository.
- No PM2 process evidence (`PM2_READ_UNAVAILABLE`).
- No per-vehicle DS4 allowlist membership (ids redacted).
