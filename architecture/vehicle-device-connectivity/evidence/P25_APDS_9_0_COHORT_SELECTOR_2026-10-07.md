# P2.5 APDS-9.0 — Fail-closed authorized cohort selector (engineering only)

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-P25-APDS-9-0-001 |
| **Production base SHA** | `0c19eb62cef292e4e26ebeb2cf3b8f8afcbca2a2` |
| **Scope** | Cohort gate for APD shadow observe-only path — **no** poll suppression / activation |
| **Production deploy** | **NO** |
| **Shadow enabled** | **NO** (`WORKER_APD_SHADOW_ENABLED=false` invariant preserved until APDS-9) |

## Defect closed (APDS-9 blocker)

At production base, `isApdShadowEnabled()` evaluated only `WORKER_APD_SHADOW_ENABLED`. Scheduler called `apdShadow?.isEnabled()` → global enable would reach the full reconciliation fleet (including stale token **190497**).

## Config contract

- Env: `WORKER_APD_SHADOW_COHORT_JSON`
- Version: `P25_APD_LTE_R1_COHORT_V1`
- Runtime authority: `organizationId` + `vehicleId` (no tokenId/VIN/plate in selector)
- Max members: 100 (authorized LTE_R1 cohort = 5)

## Fail-closed parser states

`DISABLED` | `READY` | `MISSING` | `INVALID` | `EMPTY` | `UNSUPPORTED_VERSION` | `TOO_LARGE`

## Defense in depth

- `AdaptivePollingShadowService.isEnabledForVehicle(org, vehicleId)`
- Scheduler: `isEnabledForVehicle` before `observePrePoll`
- `observePrePoll` / `observePostPoll`: `assertCohortVehicleAllowed`

## Tenant-safe shadow memory

- Before: `vehicleId` map key
- After: ``${organizationId}\u0000${vehicleId}``

## Preflight (read-only)

`backend/scripts/ops/p25-apd-shadow-cohort-production-preflight.sh` — verifies configured members against Production DB bindings; expected R9 token allowlist used **only** in preflight (not runtime).

## Replica parity

`getCohortVerificationSummary()` → `cohortConfigFingerprintSha256` (sorted pairs + version). Not exposed as Prometheus labels.

## Metrics

`synqdrive_apd_shadow_cohort_excluded_total{reason}` — bounded reasons only.
