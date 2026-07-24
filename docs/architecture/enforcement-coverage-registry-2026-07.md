# Enforcement Coverage Registry (Prompt 23)

Central registry and readiness status for all data-authorization enforcement flows (Prompts 16–22).

## Registered data flows

25 productive flows across 8 domains — see `enforcement-coverage-catalog.ts` and baseline CSV:

`docs/audits/data/data-authorization-enforcement-coverage-baseline-2026-07.csv`

| Domain | Example flowIds |
|--------|-----------------|
| live-gps | `live-gps-fleet-map-read`, `live-gps-trips-route-read` |
| telemetry-ingest | `telemetry-dimo-snapshot-ingest`, `telemetry-trip-backfill-ingest` (partial) |
| trip-location | `trip-create-ingest`, `trip-route-read`, `trip-enrich-derive` |
| vehicle-health | `health-dtc-ingest`, `health-ai-use`, `health-export` |
| driving-behavior | `behavior-enrich-derive`, `misuse-reconcile-profile` |
| notification | `notification-ingest`, `notification-delivery`, `notification-deep-link` |
| external-access | `external-fleet-chat-ai`, `external-voice-mcp-tool`, `external-reporting-export` (partial) |
| authorization-decision | `authorization-decision-engine` |

## Current coverage (expected at shadow-mode defaults)

With default shadow-mode env vars (`DATA_AUTH_*_SHADOW_MODE=true`), most flows report **PARTIALLY_ENFORCED** because fail-closed is not active in production yet. Known gaps:

- `telemetry-trip-backfill-ingest` — ingest gate not wired at worker
- `external-reporting-export` — registry only, no controller wiring

`fullyProtected: true` only when **all** productive flows are `ENFORCED` and no unregistered paths exist.

## Status logic

| Status | Condition |
|--------|-----------|
| `DISABLED` | `flow.disabled === true` |
| `ENFORCEMENT_ERROR` | Domain runtime health = ERROR (e.g. `resolver_error` in metrics) |
| `NOT_IMPLEMENTED` | Zero implemented enforcement points |
| `PARTIALLY_ENFORCED` | Missing required points, shadow mode active, or missing tests |
| `ENFORCED` | All required points implemented + tests on disk + no shadow mode + no runtime error |

**UI rule:** `fullyProtected` is `true` only when every productive flow is `ENFORCED`.

## Build / commit binding

`coverageVersion` = `{catalogVersion}@{gitCommit|buildVersion|local}`

Resolved from (in order):

1. `GIT_COMMIT_SHA` / `GITHUB_SHA`
2. `git rev-parse --short HEAD`
3. `BUILD_VERSION` / `npm_package_version`

## API

| Endpoint | Permission |
|----------|------------|
| `GET .../data-authorizations/coverage` | `data_processing.coverage_view` |
| `GET .../data-authorizations/coverage/metrics` | `data_processing.coverage_view` |
| `GET .../data-authorizations/coverage/integrity` | `data_processing.coverage_view` |

No secrets or PII in responses — aggregate status and counter snapshots only.

## Health integration

`EnforcementCoverageHealthService` aggregates in-process metrics from domain `*MetricsService.snapshot()` calls. Health checks use counter keys only (no vehicle/customer payloads).

## Audit

Status transitions are recorded via `DataAuthorizationAuditService.recordIngestionSkipped` with `ingestionPath=enforcement-coverage:{flowId}`.

## CI

```bash
cd backend && npm run test:data-auth:coverage
```

Validates:

- Baseline CSV ↔ catalog alignment
- Test spec files exist for all productive flows
- Unique flowIds
- Registry integrity API (`validateRegistryIntegrity`)

## Tests

```
enforcement-coverage-registry.service.spec.ts — status logic, shadow mode, audit
enforcement-coverage-ci.spec.ts — baseline drift, test presence
```

## Remaining gaps

- Prometheus export for coverage metrics (in-process only today)
- Frontend readiness UI consuming coverage API
- Auto-discovery scan for new `processingPath` literals in `backend/src`
