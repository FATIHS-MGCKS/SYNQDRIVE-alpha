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

## Fable remediation (PR #2212)

| Area | Change |
|------|--------|
| Outbox retry | `FAILED_RETRYABLE` claimable after `next_attempt_at`; `maxProcessingAttempts` → `FAILED_TERMINAL` |
| Lease recovery | Expired `PROCESSING` rows recovered with `FOR UPDATE SKIP LOCKED` |
| Fingerprint | Canonical payload-resolved `eventRowContract` via `computeDs4AssessmentInputFingerprintFromMotionSource` |
| Speed authority | Nullable column; no `C4_ONLY` coercion on persist |
| Latest read | `source_motion_run_created_at DESC`, tie-break `computed_at`, advisory lock on persist |
| Postgres CI | `npm run test:di:ds4-assessment:postgres:ci` in S4A workflow |

Validation: `npm run test:di:ds4-assessment`, `npm run test:di:ds4-assessment:postgres:ci` (disposable PostgreSQL).
