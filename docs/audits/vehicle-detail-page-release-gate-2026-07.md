# Vehicle Detail Page — Release Gate & Observability Audit

| Field | Value |
|-------|-------|
| **Audit ID** | `vehicle-detail-page-release-gate-2026-07` |
| **Prompt** | **32 of 36** — Observability & CI release gates |
| **Audit date** | 2026-07-24 UTC |
| **Scope** | Vehicle Detail page (Rental): live telemetry polling, map, device connection, status mutations, tenant isolation |
| **Method** | Code inspection, metrics inventory, CI workflow definition, Playwright E2E (Prompt 31) |

---

## Executive Summary

Vehicle Detail previously had **strong functional coverage** (E2E suite Prompt 31) but **limited production observability** on telemetry/GPS/device-connection paths and **no dedicated CI workflow**.

This audit documents:

1. **Existing vs added technical observability** (Prometheus + structured logs + client signals)
2. **Privacy constraints** for logs/metrics (no coordinates, tokens, PII)
3. **Exact CI jobs and blocking criteria** for release gating

### Release recommendation: **CONDITIONAL GO** (with CI green)

Deploy Vehicle Detail changes when the GitHub workflow `Vehicle Detail — Production Readiness CI` passes on `main` (or the release branch). No separate analytics product was introduced.

---

## Observability Inventory

### Backend — HTTP endpoints (Vehicle Detail polling/mutations)

| Endpoint | Prior state | Added (Prompt 32) |
|----------|-------------|-------------------|
| `GET …/telemetry` | Generic request logging interceptor only | `synqdrive_vehicle_detail_request_total{endpoint="telemetry",result}` + duration histogram; inline DIMO GPS refresh outcome counter |
| `GET …/live-gps` | Single `logger.warn` on total DIMO failure | Request metrics; `synqdrive_vehicle_detail_live_gps_source_total{source=dimo\|cache}`; provider outcome (`success`, `cache_fallback`, `timeout`, `rate_limited`, `provider_error`) |
| `GET …/device-connection` | None | Request metrics; structured warn on failure (`errorClass` only) |
| `PATCH …/status` | Fleet-map cache invalidation only | Request metrics; `synqdrive_vehicle_detail_status_mutation_total{field,result}` |
| `GET …/fleet-map` (feeds detail) | Redis debug on failure | `synqdrive_vehicle_detail_cache_outcome_total{outcome=hit\|miss}` |

**Prometheus metric prefix:** `synqdrive_vehicle_detail_*`  
**Implementation:** `backend/src/modules/vehicles/observability/` + instrumentation in `VehiclesController` / `VehiclesService`.

### Backend — Adjacent (pre-existing, not replaced)

| System | Route label / scope | Notes |
|--------|---------------------|-------|
| Rental Health | `vehicle_detail` route in `FleetHealthObservabilityService` | Health tab only — not GPS/telemetry |
| Fleet Connectivity | `synqdrive_connectivity_*` | Webhook/runtime — not HTTP vehicle-detail polling |
| Request logging | `RequestLoggingInterceptor` | Prod suppresses 2xx unless `HTTP_LOG_SUCCESS=true` |

### Frontend — client technical signals (DEV console + in-memory counters)

| Signal | Source | Notes |
|--------|--------|-------|
| `telemetry_poll_success` / `telemetry_poll_error` | `useLiveVehicleTelemetry` | No coordinates in logs |
| `gps_poll_success` / `gps_poll_error` | `useLiveVehicleTelemetry` | `source` label only (`dimo`/`cache`) |
| `polling_bound` / `polling_unbound` | `useLiveVehicleTelemetry` | Polling lifecycle |
| `telemetry_poll_aborted` / `gps_poll_aborted` | Hook cleanup | Tab leave / vehicle switch |
| `map_init_success` / `map_init_error` | `LiveMapOverview` | Mapbox init |
| `map_token_missing` | `LiveMapOverview` | Test/CI environments without token |
| `device_connection_error` | `VehicleDeviceConnectionCard` | Card hidden on error (existing UX) |
| `status_mutation_error` | `App.tsx` `persistCleaningStatus` | Toast + counter |

**Implementation:** `frontend/src/rental/lib/vehicle-detail-observability.ts`  
**Not shipped to analytics backends** — counters for tests/DEV diagnostics only.

### Signal coverage matrix (requested → implemented)

| Signal | Backend | Frontend |
|--------|---------|----------|
| GPS request count | ✅ `live_gps` request_total | ✅ `gps_poll_*` |
| Telemetry request count | ✅ `telemetry` request_total | ✅ `telemetry_poll_*` |
| Provider latency | ✅ request_duration histogram | — (prefer backend) |
| Cache hit/miss | ✅ cache_outcome_total | — |
| Timeouts | ✅ provider_outcome `timeout` | — |
| 429 / rate limit | ✅ provider_outcome `rate_limited` | — |
| Provider errors | ✅ provider_outcome + structured logs | ✅ poll errors |
| Retry count | — (no client/server retry on these paths) | — |
| Status mutation errors | ✅ status_mutation_total | ✅ `status_mutation_error` |
| Device connection errors | ✅ request + structured log | ✅ client signal |
| Map init errors | — | ✅ `map_init_error` |
| Aborted requests | — | ✅ `*_poll_aborted` |
| Polling loops | — | ✅ bound/unbound + abort |
| Tenant/permission denials | ✅ `permission_denied_total` + `result=forbidden` | — |

---

## Privacy & Redaction Rules

| Rule | Enforcement |
|------|-------------|
| No exact coordinates in general error logs | `redactVehicleDetailLogContext()` strips lat/lng/coordinates; live-gps warn logs use `errorClass` only |
| No provider secrets / tokens | Redaction util + client forbidden keys; Mapbox token never logged |
| No unnecessary PII | Metrics use bounded labels only — **no** `vehicleId`, `orgId`, `licensePlate`, `email` |
| PII redaction | Shared redaction helper; client DEV logs filter token/coordinate/name fields |

---

## CI Workflow

**File:** `.github/workflows/vehicle-detail-production-readiness.yml`  
**Triggers:** PRs touching `backend/**`, `frontend/**`, vehicle-detail audit/docs; pushes to `main` and `cursor/vehicle-detail-*`.

### Jobs (all blocking unless noted)

| Job ID | Name | Command / action | Blocks release |
|--------|------|------------------|----------------|
| `install-lockfile` | Install (lockfile) | `npm ci` backend + frontend | ✅ (via dependents) |
| `lint` | Lint | `npm run lint:all` (backend + frontend) | ✅ |
| `typecheck` | Typecheck | `npx tsc --noEmit` (backend), `npx tsc -b` (frontend) | ✅ |
| `backend-unit` | Backend unit tests | `npm run test:vehicle-detail:verify:unit` | ✅ |
| `backend-security` | Backend security tests | `npm run test:vehicle-detail:security` | ✅ |
| `frontend-component` | Frontend component tests | `npm run test:vehicle-detail:unit` | ✅ |
| `playwright-e2e` | Playwright E2E | `npm run test:vehicle-detail:e2e` | ✅ |
| `accessibility` | Accessibility (axe) | `npm run test:vehicle-detail:a11y` | ✅ |
| `production-build` | Production build | `npm run build` backend + frontend | ✅ |
| `security-scan` | Dependency scan | `bash scripts/audits/audit-dependencies.sh` | ✅ |
| `ci-gate` | CI gate (aggregator) | Requires all jobs above | ✅ **Final gate** |

### Blocking criteria

1. **Any critical job failure → NO RELEASE** for Vehicle Detail–scoped changes.
2. **E2E + Axe are mandatory** — not optional smoke tests.
3. **Security negative matrix must pass** (`vehicle-detail-security-negative.spec.ts`).
4. **Playwright artifacts** uploaded only on failure (`trace: on-first-retry`, `screenshot: only-on-failure` per `e2e/playwright.config.ts`).
5. **`ci-gate` job** is the merge/deploy signal — equivalent to legal-documents/booking gate pattern.

### Local verification commands

```bash
# Backend
cd backend && npm run test:vehicle-detail:verify

# Frontend unit
cd frontend && npm run test:vehicle-detail:unit

# Full E2E + responsive + axe (CI-equivalent)
cd frontend && npm run test:vehicle-detail:e2e && npm run test:vehicle-detail:a11y
```

---

## Test Assets (Prompt 31 + 32)

| Asset | Path |
|-------|------|
| E2E flows (24) | `frontend/e2e/vehicle-detail-flow.spec.ts` |
| E2E responsive (3) | `frontend/e2e/vehicle-detail-responsive.spec.ts` |
| E2E a11y (3) | `frontend/e2e/vehicle-detail-a11y.spec.ts` |
| Mock fixtures | `frontend/e2e/vehicle-detail-fixtures.ts` |
| Security negatives | `backend/src/modules/vehicles/vehicle-detail-security-negative.spec.ts` |
| Metrics unit tests | `backend/src/modules/vehicles/observability/*.spec.ts` |
| Client observability test | `frontend/src/rental/lib/vehicle-detail-observability.test.ts` |

---

## Out of Scope (explicit)

- No new product analytics dashboards or operator-facing metrics UI
- No client-side retry/backoff changes (retry count N/A until implemented)
- No Prometheus alert rules in this prompt (metrics ready for ops follow-up)
- Architektur doc not updated (observability extension only; no routing/data-flow change)

---

## Go / No-Go Checklist

| Criterion | Status |
|-----------|--------|
| Prometheus metrics for telemetry/GPS/device-connection/status | ✅ Added |
| PII-safe structured logs | ✅ Added |
| Client map/polling signals (frontend-capturable) | ✅ Added |
| Dedicated CI workflow with aggregator gate | ✅ Added |
| Vehicle Detail E2E in CI | ✅ Wired |
| Axe in CI | ✅ Wired |
| Backend security characterization tests | ✅ Added |
| No release on failed critical CI jobs | ✅ Documented + enforced via `ci-gate` |

**Verdict:** **CONDITIONAL GO** — merge when CI workflow is green on target branch.
