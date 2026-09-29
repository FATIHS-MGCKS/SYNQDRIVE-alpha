# EXP-021 — S4C engineering start (live same-attempt shadow executor)

| Field | Value |
|-------|-------|
| **Slice** | S4C — provider acquisition + same-attempt S1 compute + T05/T06 completion |
| **Production anchor** | `6952fdf727f236ac7b338e14b85d54af6733fa0f` (unchanged) |
| **Runtime** | **Dormant** — `DiV0S4cExecutor` implemented; **not** registered in `AppModule` |

## Path

S4B claim → attempt-start recheck (S4B) → S4C canonical DB context → `runWithDimoRequestContext(POST_TRIP_ENRICHMENT, BACKGROUND)` → S3A position (+ optional S3B R1) → normalized T05 pin → in-memory S1 → `completeWithS2` (T06) → SETTLED → S4B postcondition.

## Future shadow cohort (non-authoritative product intent)

| Key | Value |
|-----|-------|
| `S4F_SHADOW_COHORT_REQUIREMENT` | `RUPTELA_R1 + API_SYNTHETIC_EV` |
| `FUTURE_SHADOW_COHORT_RUPTELA_R1` | REQUIRED |
| `FUTURE_SHADOW_COHORT_API_SYNTHETIC_EV` | REQUIRED (Tesla via DIMO API_SYNTHETIC) |
| `STANDARDIZED_SIGNAL_SEMANTICS_MAY_GENERALIZE` | YES |
| `SOURCE_TIMING_AND_QUALITY_AUTOMATICALLY_GENERALIZE` | NO |
| `S4F_API_SYNTHETIC_ACTIVATION_GOVERNANCE_REQUIRED` | YES |

This records validation intent only; it does **not** amend frozen S4A/S4F activation authority.

## Provider backpressure

S4C uses the existing DIMO stack (`DimoTelemetryService` → gateway → `DimoRequestExecutor` → budget). No S4C-local unbounded retry loop.

| Key | Value |
|-----|-------|
| `S4C_PROVIDER_BACKPRESSURE_INTEGRATION` | PASS (via `buildDiV0S4cDimoAcquisitionPorts` → `runWithDimoRequestContext`; acquisition transports use `queryGraphQL` budget path) |
| `S4C_UNBOUNDED_PROVIDER_RETRY_POSSIBLE` | NO |
| Residual activation gap | `DI-GAP-S4-PROVIDER-BACKPRESSURE-001` — S4F must prove live cohort behavior under load |

## Tests

- `npm run test:di:s4c`
- `npm run test:di:s4c:postgres` (requires S4A Postgres bootstrap)
