# DS4 Trip Assessment L2 Contract (V1)

| Field | Value |
|-------|-------|
| **Document ID** | `DI-CONTRACT-DS4-TRIP-ASSESSMENT-L2-V1` |
| **Status** | `IMPLEMENTED` — worker **OFF** by default (PR-A) |
| **Table** | `di_v0_ds4_trip_assessment_v1` |
| **Assessment version** | `DS4_TRIP_ASSESSMENT_V1` |

## Input source (exclusive)

- `di_v0_motion_core_shadow_runs_v1` with `shadow_status = SUCCEEDED`
- Decoded payload via existing gzip reader
- Intensity via `readPersistedMotionEventIntensityForPayload` only

## Trip assessment statuses

| Status | Meaning |
|--------|---------|
| `RATED` | Ordinal trip rating allowed **only** when `ordinalTripRatingApproved` quality policy flag is true |
| `UNRATED_COUNTS_ONLY` | Manoeuvre counts / observation valid; ordinal trip rating withheld |
| `INSUFFICIENT_EVIDENCE` | Missing or ambiguous evidence (labels, speed authority, etc.) |
| `UNSUPPORTED` | Provider / motion contract cannot supply DS4 assessment evidence (not used for vehicle allowlist) |
| `PENDING` | No motion run available yet |
| `FAILED` | Processing/contract/source identity failure |

## Fail-closed rules

- No legacy HF / TripBehaviorEvent / TripDrivingImpact inputs
- Unknown event-row contract → assessment `FAILED`
- No fabricated zero stress; zero event counts only when observation valid and no accepted manoeuvres

## Code

- Engine: `backend/src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-trip-assessment-v1.engine.ts`
- Fleet admission: `ds4-assessment-eligibility-policy.v1.ts` (tenant-safe scope; fleet-wide). Calibration cohort: `ds4-assessment-calibration-cohort.v1.ts` (tests/eval only)
