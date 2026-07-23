# Telemetry Ingestion Enforcement (Prompt 17)

Authorization Decision Engine bound to telemetry ingestion **before** raw persistence. Configurable **shadow mode** is default; production **fail-closed** is gated behind coverage and tests.

## Environment flags

| Variable | Default | Effect |
|----------|---------|--------|
| `DATA_AUTH_INGEST_SHADOW_MODE` | `true` | DENY is audited + metered but persistence still allowed |
| `DATA_AUTH_INGEST_FAIL_CLOSED` | `false` | When `true` (and shadow off), DENY blocks PG/CH/raw writes |

Fail-closed must not be enabled in production until all ingestion paths are wired and shadow metrics are stable.

## Core service

`TelemetryIngestionEnforcementService` (`telemetry-ingestion-enforcement/`)

- Action: `INGEST`
- Validates tenant vehicle scope before decision
- Delegates to `AuthorizationDecisionService` — **no legacy OrgDataAuthorization fallback**
- Provider errors remain upstream (throw); authorization DENY returns `shouldRetry: false`
- Records in-process metrics via `TelemetryIngestionEnforcementMetricsService`
- Fail-closed skip → `INGESTION_SKIPPED` audit event

## Wired ingestion paths (initial coverage)

| Path | Service identity | Category | Purpose |
|------|------------------|----------|---------|
| DIMO snapshot poll worker | `synqdrive-dimo-snapshot-worker` | `TELEMETRY_DATA` | `FLEET_ANALYTICS` |
| DIMO DTC poll worker | `synqdrive-dimo-dtc-worker` | `DTC_CODES` | `VEHICLE_HEALTH` |
| DIMO DTC webhook | `synqdrive-dimo-webhook` | `DTC_CODES` | `VEHICLE_HEALTH` |
| DIMO RPM webhook | `synqdrive-dimo-webhook` | `TELEMETRY_DATA` | `VEHICLE_HEALTH` |
| HM Telemetry MQTT | `synqdrive-hm-telemetry-ingest` | `TELEMETRY_DATA` | `FLEET_ANALYTICS` |
| HM Health MQTT | `synqdrive-hm-health-ingest` | `HEALTH_SIGNALS` | `VEHICLE_HEALTH` |

Gate placement: **after provider fetch/parse, before** `vehicleLatestState` upsert, DTC upsert, HM stream log / VLS write, ClickHouse mirror.

## Shadow-mode metrics (in-process)

Labels: `path | sourceSystem | dataCategory | outcome`

Outcomes: `allow`, `deny`, `shadow_would_deny`, `ingestion_skipped`, `scope_mismatch`, `resolver_error`

Prometheus export for ingest metrics is a remaining gap — use `TelemetryIngestionEnforcementMetricsService.snapshot()` in tests/diagnostics until wired.

## Remaining gaps

- Trip backfill / replay workers (constants defined, gate not yet wired)
- Device-connection webhook inbox processing
- Battery V2 observation enqueue (downstream of snapshot gate)
- Trip tracking / enrichment processors
- Raw event store direct writes
- Dedicated Prometheus counters for ingest gate
- HM messages without linked `synqdriveVehicleId` (no vehicle scope — gate skipped)

## Fail-closed prerequisites

1. Shadow metrics show stable DENY/ALLOW ratio per path for ≥1 release cycle
2. All high-volume paths wired (snapshot, DTC, HM, webhooks, trip pipeline, CH mirror)
3. `INGESTION_SKIPPED` audit backlog monitored
4. Integration tests green for DENY → no PG/CH write
5. Explicit ops runbook for `DATA_AUTH_INGEST_FAIL_CLOSED=true`

## Policy resolver

`HIGH_MOBILITY` added to `POLICY_RESOLVER_SOURCE_SYSTEM`.

## Tests

`telemetry-ingestion-enforcement.service.spec.ts` covers:

- ALLOW / DENY / shadow / fail-closed
- Expired policy, revoked grant, foreign vehicle
- Replay/backfill `effectiveTimestamp`
- Cache invalidation (multi-worker shared policy version cache)
- Redis-independent in-memory metrics
- PG/CH gate semantics (fail-closed)

Run:

```bash
cd backend && npm test -- --testPathPattern="telemetry-ingestion-enforcement|data-authorizations"
```
