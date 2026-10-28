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

## Fable final remediation (PR #2212)

| Finding | Remediation |
|---------|-------------|
| S4A dormant audit | DS4-local postgres harness (`ds4-assessment-postgres-harness.ts`); no `s4a-foundation` test imports |
| Production DB guard | Regenerated `production-database-guard-bundle.manifest.sha256` after `backend/package.json` script pins (`46b1fea1…` → `6301292b…`) |
| Discovery starvation | Terminal outbox rows for `DISCOVERY_PAYLOAD_REQUIRED` / `DISCOVERY_SOURCE_IDENTITY_MISMATCH` (`SKIPPED_INELIGIBLE`) |
| Versioned outbox | Migration `20261028160000`; unique `(source_motion_run_id, assessment_version)`; `qualityPolicyVersion` in input fingerprint |
| Postgres coverage | Worker integration spec + 14-test CI gate (`discoverFromSucceededMotionRuns`, `runPass`, `processMotionRun`, poison recovery, version terminal) |
| Legacy isolation | Frozen column baseline + unique index `trip_driving_impact_trip_id_key` (no DS4 columns on legacy table) |
