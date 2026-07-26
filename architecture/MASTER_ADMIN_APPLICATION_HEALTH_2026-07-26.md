# Master Admin — Application Health (Phase 2F.5)

**Date:** 2026-07-26

## Summary

Unified application dependency health with real probes for Postgres, Redis, ClickHouse, BullMQ, DIMO, Stripe, AI, Notification Engine V2, and document storage.

## Endpoints

| Route | Role |
|-------|------|
| `GET /api/v1/health` | Liveness (no I/O) |
| `GET /api/v1/health/readiness` | Hard deps; HTTP 503 when not ready |
| `GET /api/v1/health/dependencies` | Full parallel probe report |

## Architecture

- `ApplicationHealthModule` — probe wiring, imported by `HealthModule` and `ObservabilityModule`
- `ApplicationHealthService` — probe implementations with `withProbeTimeout` (3s)
- `MetricsRefreshService` — publishes `synqdrive_dependency_up` every 30s
- `alerts-app-health.yml` — 11 Prometheus alert rules

## Readiness gates

Hard: postgres, redis, workers, queue, documentExtraction (error only).

Soft: clickhouse, dimo, stripe, ai, notification, storage.

## Related

- `docs/remediation/application-health.md`
