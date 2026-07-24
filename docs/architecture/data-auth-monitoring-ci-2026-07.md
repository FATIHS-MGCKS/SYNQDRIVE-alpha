# Data Authorization — Monitoring, Alerts & CI Gates (Prompt 41)

**Date:** 2026-07-24  
**Version:** V4.9.824

## Overview

Prompt 41 adds Prometheus metrics, Grafana dashboard, Prometheus alerts with runbooks, and a mandatory GitHub Actions CI workflow for the data authorization / data processing stack.

## Metrics (`data_auth_*`)

Emitted via global `DataAuthObservabilityModule` → `TripMetricsService.registry` on `GET /api/v1/metrics`.

| Metric | Type | Labels | Source |
|--------|------|--------|--------|
| `data_auth_decision_total` | Counter | decision, reason_category, source_system, action | AuthorizationDecisionService |
| `data_auth_resolver_error_total` | Counter | source_system | Decision engine / resolver catch |
| `data_auth_missing_policy_total` | Counter | source_system, action | Decision reason NO_MATCHING_POLICY |
| `data_auth_enforcement_error_total` | Counter | domain | Coverage bridge + registry |
| `data_auth_provider_conflict_total` | Counter | source_system | Provider contradiction reasons |
| `data_auth_revocation_failed_total` | Counter | step | RevocationOrchestratorService |
| `data_auth_audit_outbox_failed_total` | Counter | event_kind | Audit outbox processor |
| `data_auth_audit_dead_letter_total` | Counter | event_kind | Audit outbox processor |
| `data_auth_queue_error_total` | Counter | queue | Revocation queue control (bridge) |
| `data_auth_retention_error_total` | Counter | phase | RetentionDeletionExecutorService |
| `data_auth_deny_switch_propagation_total` | Counter | outcome | DenySwitchMetricsService bridge |
| `data_auth_policy_cache_stale_total` | Counter | — | Cache invalidation |
| `data_auth_unprotected_path_detected_total` | Counter | domain | Coverage registry |
| `data_auth_revocation_in_progress_total` | Gauge | — | DB refresh (5m) |
| `data_auth_expired_policy_total` | Gauge | — | DB refresh |
| `data_auth_overdue_review_total` | Gauge | — | DB refresh |
| `data_auth_overdue_dpia_total` | Gauge | — | DB refresh |
| `data_auth_unregistered_path_total` | Gauge | — | Coverage integrity |
| `data_auth_worker_version_mismatch` | Gauge | — | WorkerRuntimeHealthService |
| `data_auth_dev_bypass_enabled` | Gauge | — | Config refresh |
| `data_auth_enforcement_disabled` | Gauge | — | Config refresh |
| `data_auth_global_deny_switch_enabled` | Gauge | — | Config refresh |
| `data_auth_policy_cache_entries` | Gauge | — | Decision cache size |
| `data_auth_audit_outbox_pending_total` | Gauge | — | DB refresh |
| `data_auth_decision_latency_seconds` | Histogram | source_system, action | Decision engine |
| `data_auth_deny_switch_propagation_latency_seconds` | Histogram | — | Deny-switch bridge |
| `data_auth_build_info` | Info | engine_version, build_version, git_commit | Startup / refresh |

**PII rule:** No `organization_id`, `vehicle_id`, `customer_id`, `user_id`, or policy UUIDs in labels.

## Alerts

Prometheus group: `synqdrive_data_auth` in `backend/monitoring/prometheus/alerts.yml`

| Alert | Severity |
|-------|----------|
| DataAuthAuditOutboxDeadLetter | critical |
| DataAuthDevBypassEnabledInProduction | critical |
| DataAuthEnforcementDisabledInProduction | critical |
| DataAuthUnregisteredProductivePaths | critical |
| DataAuthAuditOutboxRetrySustained | warning |
| DataAuthGlobalDenySwitchActive | warning |
| DataAuthResolverErrorsElevated | warning |
| DataAuthDenyRateSpike | warning |
| DataAuthDecisionLatencyHigh | warning |
| DataAuthWorkerVersionMismatch | warning |
| DataAuthRevocationFailed | warning |
| DataAuthOverdueDpia | warning |
| DataAuthExpiredPolicies | warning |
| DataAuthRetentionJobFailures | warning |
| DataAuthDenySwitchPropagationSlow | warning |
| DataAuthRevocationInProgressElevated | info |
| DataAuthOverdueReviews | info |

Runbooks: `docs/runbooks/data-authorization-incidents.md`, `docs/runbooks/data-authorization-production-rollout.md`

## Dashboard

`backend/monitoring/grafana/dashboards/synqdrive-data-authorization.json`

Panels: build/commit version, safety flags, decision rates, latency, deny reasons, coverage, revocation, audit outbox, compliance gauges, deny-switch propagation.

## CI workflow

`.github/workflows/data-authorization-production-readiness.yml`

| Job | Gate |
|-----|------|
| install-lockfile | `npm ci` (backend + frontend) |
| lint | `lint:all` |
| typecheck | `tsc` |
| prisma-validate | migration timestamps + `prisma:validate` |
| migration-tests | empty + legacy DB (`data-auth-migration-test.sh`) |
| backend-unit | `test:data-auth:verify:unit` |
| backend-integration | `test:data-auth:postgres` |
| backend-security | security-negative postgres suite |
| enforcement-coverage | `data-auth-production-safety-check.sh` |
| monitoring-verify | `verify-data-auth-monitoring.sh` |
| frontend-component | `test:data-auth` |
| playwright-e2e | `test:data-processing:e2e` |
| accessibility | data-processing a11y spec |
| production-build | backend + frontend build |
| security-scan | `audit-dependencies.sh` |
| ci-gate | all jobs must pass |

No silent skips: PostgreSQL integration jobs always run with service containers; skipped paths only in local `data-auth-backend-verify.sh` when `DATA_AUTH_POSTGRES_INTEGRATION` unset.

## Local reproduction

```bash
# Metrics unit tests
cd backend && npm test -- --testPathPattern='data-auth-metrics.service.spec'

# Monitoring artifacts
bash backend/scripts/test/verify-data-auth-monitoring.sh

# Production safety (coverage + config validator)
bash backend/scripts/test/data-auth-production-safety-check.sh

# Migrations (requires local Postgres)
bash backend/scripts/test/data-auth-migration-test.sh all

# Full backend verify with DB
DATA_AUTH_POSTGRES_INTEGRATION=1 DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive?schema=public \
  npm run test:data-auth:verify

# Frontend
cd frontend && npm run test:data-auth && npm run test:data-processing:e2e
```

## Test results (implementation run)

Run during PR validation:

```bash
cd backend && npm test -- --testPathPattern='data-auth-metrics.service.spec'
bash scripts/test/verify-data-auth-monitoring.sh
bash scripts/test/data-auth-production-safety-check.sh
```

## Files

| Path | Role |
|------|------|
| `observability/data-auth-metrics.service.ts` | Prometheus counters/gauges/histograms |
| `observability/data-auth-metrics-refresh.service.ts` | DB gauge refresh |
| `observability/data-auth-metrics-bridge.service.ts` | In-process metrics bridge |
| `scripts/test/data-auth-migration-test.sh` | Empty + legacy migration CI |
| `scripts/test/data-auth-production-safety-check.sh` | Dev bypass + coverage gate |
| `scripts/test/verify-data-auth-monitoring.sh` | Artifact verification |
