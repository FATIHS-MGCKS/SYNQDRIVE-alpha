# DS4 Assessment PR-A Evidence

| Field | Value |
|-------|-------|
| **PR** | PR-A Assessment L2 + Driving Impact V2 |
| **Worker flags** | `DI_V0_DS4_ASSESSMENT_ENABLED`, `DI_V0_DS4_ASSESSMENT_WORKER_ENABLED` — default **OFF** |
| **Internal API** | `GET /api/v1/vehicles/:vehicleId/trips/:tripId/ds4-assessment` |
| **Tests** | `npm run test:di:ds4-assessment` (unit); postgres when `S4A_POSTGRES_LIVE` |

## Open calibration (owner / Fable)

- `ordinalTripRatingApproved` in quality policy (default false)
- `ds4_reference_distribution_v1` percentile model for `operationalLoadIndex`
- Impact V2 weights and exposure normalization

## Fable review requested

- Assessment quality policy V1
- Ordinal-only intensity consumption on V2 event rows
- Null score publication contract
