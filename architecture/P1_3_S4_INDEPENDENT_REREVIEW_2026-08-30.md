# P1.3-S4 Independent Production-Readiness RE-REVIEW

**Reviewer role:** Independent senior production-readiness re-reviewer (read-only)  
**Date:** 2026-08-30  
**Target:** PR #1429 — `cursor/p1-3-s4-readiness-closure-f21f`  
**Repository:** https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha  
**Prior review:** `architecture/P1_3_S4_INDEPENDENT_REVIEW_2026-08-30.md`

---

## 1. Evidence recovery (verified independently)

| Field | SHA | Notes |
|-------|-----|-------|
| **BASE_SHA** | `dc9ab567d16d62ef118e4fbd076747c9f91eba18` | merge-base with `origin/main` |
| **PRE_REMEDIATION_HEAD_SHA** | `6ca076e1ff6dc2aa9ea9540265394aa83e52394a` | Last commit before remediation code (`docs: deutscher Workflow-Handoff`) |
| **CURRENT_HEAD_SHA** | `b3ee003e58908587a1440d188270c505202cb257` | Tip includes remediation (`772757147`) + changelog (`b3ee003e5`) |
| **CI_HEAD_SHA** | *none for current HEAD* | No GitHub Actions runs found for `b3ee003e5` or `772757147`; latest CI success is on `6ca076e1f` (runs `33282532775`, `33282532818`) |

Remediation commits on branch:
- `772757147` — `fix(dimo): P1.3-S4 review remediation — context propagation + cooldown gauge`
- `b3ee003e5` — `docs(changelog): P1.3-S4 independent review remediation entry` (docs-only)

---

## 2. P1-001 re-verification — requestContext propagation

### 2.1 Infrastructure (FIXED)

| Component | Verdict | Evidence |
|-----------|---------|----------|
| Canonical utility | ✅ | `dimo-provider-request-context.util.ts` — `buildDimoProviderRequestContext()` merges `partial` then sets `tokenId`; does **not** overwrite `vehicleId`/`organizationId` with tokenId-only |
| `mergeDimoProviderRequestContext()` | ✅ | Preserves fields from both sides |
| `DimoTelemetryService` | ✅ | All public fetch methods + `queryGraphQL` call `buildDimoProviderRequestContext(tokenId, requestContext)` before `providerGateway.execute()` |
| `DimoSegmentsService` | ✅ | Private `queryGraphQLWithContext()` used for all 13 internal GraphQL calls; optional `requestContext` on all public `fetch*` methods |
| Gateway entry | ✅ | Only production path to `DimoProviderGateway.execute()` is `DimoTelemetryService` (confirmed by `dimo-telemetry-gateway-coverage.spec.ts`) |
| Canary resolution | ✅ | `resolveCanaryEnforcement()` uses `organizationId` / `vehicleId`; percent bucket requires one of them (`rollout.util.ts:77-79`) |

### 2.2 Production caller audit (repository-wide)

#### Paths remediated with full `{ organizationId, vehicleId, tokenId }` where available

| Path | Status |
|------|--------|
| `DimoSnapshotProcessor` → `fetchLatestVehicleSnapshot` | ✅ |
| `DimoDtcProcessor` → `queryGraphQL` | ✅ |
| `EnergyEventsService` → `fetchEnergyEventSegments` | ✅ |
| `TripReconciliationService` → `fetchTripSegments` | ✅ |
| `TripDetectionOrchestrationService` → segments fetches (via `dimoProviderContext()`) | ✅ |
| `BatteryCapabilityPreflightService` | ✅ |
| `DimoAvailableSignalsPreflightService` | ✅ |
| `executeDimoRechargeSegmentsGraphQL` / `DimoRechargeSegmentsClient.fetchForVehicle` | ✅ |
| `DimoRechargeSegmentsClient.fetchForToken` | ✅ accepts optional context; energy path passes it |

#### Paths with tokenId-only context (acceptable — no vehicle/org available at call site)

| Path | Status | Rationale |
|------|--------|-----------|
| `DimoApiSyncService` enrichment loop | ⚠️ tokenId-only | Pre-registration identity sync; no SynqDrive `vehicleId`/`organizationId` yet |
| `DimoController.refreshVehicleSnapshot` | ⚠️ tokenId-only | Non-registered `dimoVehicle`; no tenant vehicle link |
| `DimoController.queryGraphQL` | ⚠️ tokenId-only | Debug/admin endpoint; passes `{ tokenId }` |

These paths **cannot** participate in org/vehicle/percent canary by design; they remain shadow unless global enforce (not default).

#### Paths NOT remediated — vehicleId + organizationId available but NOT passed

| File | Function / lines | In-scope identity | Gap |
|------|------------------|-------------------|-----|
| `trips.service.ts` | `enrichTrip` ~299-305 | `organizationId`, `vehicleId`, `tokenId` | `fetchRouteEnrichment`, `fetchEnvironmentTemperature`, `fetchPerformance` called without `requestContext` |
| `trip-behavior-enrichment.service.ts` | HF enrich ~324-328 | `vehicleId`, `organizationId`, `tokenId` | `fetchHighFrequency` without context |
| `trip-behavior-enrichment.service.ts` | fuel summary ~530-534 | same | `fetchFuelSummary` without context |
| `trip-behavior-enrichment.service.ts` | LTE path ~778, ~894 | same | `fetchHighFrequency`, `fetchFuelSummary` without context |
| `lte-r1-behavior-enrichment.service.ts` | `buildHfContextMap` ~421 | parent `enrichTrip` has `vehicleId`, `organizationId` | `fetchHighFrequency` without context |
| `dimo-braking-event-intake.service.ts` | `fetchDrivingEventsPaginated` ~79-84 | callers (LTE_R1) have org/vehicle | wrapper does not accept/pass `requestContext` |
| `dimo-braking-event-intake.service.ts` | `fetchEventDataSummary` ~75-76 | same | no context param |
| `lte-r1-behavior-enrichment.service.ts` | ~168, ~182 | `vehicleId`, `organizationId` in `enrichTrip` | intake calls without context |
| `shadow-detector-enrichment.service.ts` | `buildExecutionContext` ~81 | `input.organizationId`, `input.vehicleId`, `tokenId` | `fetchHighFrequency`, `fetchTripSegmentsForMechanism` without context |
| `event-context-enrichment.service.ts` | `enrichAnchorContext` ~295 | `event.organizationId`, `event.vehicleId` at caller | `fetchContextSignals` → `fetchHighFrequency` without context |

**Ops scripts** (`repair-vehicle-trips-from-dimo.ts`, energy standalone fetch scripts) also omit context; these are manual/ops paths, not scheduler-canonical.

### 2.3 Regression tests (P1-001)

`dimo-provider-request-context-propagation.spec.ts` — **7 tests PASS** locally:
- Verifies telemetry paths forward full context for GraphQL, vehicle summary, VIN, snapshot
- Verifies gateway percent-canary enforce when `vehicleId` present; shadow when only `tokenId`

**Gap:** Tests do not cover `DimoSegmentsService` caller paths listed above (trip enrichment subsystem).

### 2.4 P1-001 verdict

**P1_001=NOT_FIXED**

**Reason:** Infrastructure and several high-priority scheduler paths are correctly remediated, but a **repository-wide audit** still finds production trip-enrichment routes that reach the DIMO gateway limiter without `vehicleId`/`organizationId` even though that identity is in scope. Percent/vehicle/org canary enforcement remains **inconsistent** on:
- interactive trip enrichment (`TripsService.enrichTrip`)
- post-trip HF/fuel/LTE_R1 behavior enrichment
- DIMO braking event intake (driving events pagination)

This is the same defect class as the original P1-001 finding, not a new category.

---

## 3. P1-002 re-verification — cooldown gauge lifecycle

### 3.1 Current implementation trace

```
HTTP 429 (gateway)
  → classifyDimoProviderHttpError → retryAfterSeconds
  → limiter.setProviderCooldown(bounded, maxSeconds)
      → Redis SET dimo:provider:limiter:cooldown (Lua: max(existingEnd, newEnd), TTL from now)
      → syncCooldownMetrics(bounded * 1000) → recordCooldownActive()
  → metrics.recordProviderCooldown() (gateway, counter + recordCooldownActive duplicate)

Every limiter.begin():
  → getProviderCooldownRemainingMs() [Redis GET]
  → syncCooldownMetrics(remainingMs)
      → remainingMs > 0: recordCooldownActive(ceil(remaining/1000))
      → remainingMs == 0: recordCooldownCleared()
  → if cooldown active: return WOULD_WAIT, no in-flight lease (no retry storm)
```

### 3.2 Criteria checklist

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| A. First 429 activates gauge | ✅ | `setProviderCooldown` → `syncCooldownMetrics` → `recordCooldownActive`; test A PASS |
| B. Active during cooldown | ✅ | `begin()` reads Redis, `recordCooldownActive(remaining)`; test B PASS |
| C. Natural expiry → inactive | ✅ | Redis key absent/expired → `remainingMs=0` → `recordCooldownCleared()`; test C PASS |
| D. Explicit clear | ✅ | Same as C — no separate timer; Redis GET is source of truth |
| E. Repeated 429 extends | ✅ | Lua `max(existingEnd, newEnd)`; test D PASS |
| F. Multi-replica coherent | ✅ | Shared Redis key; test E PASS |
| G. No process-local timer divergence | ✅ | No local timers; only Redis GET in `getProviderCooldownRemainingMs` |
| H. No retry storm | ✅ | Cooldown path returns WOULD_WAIT without lease; test F PASS |
| I. S5 GO/NO-GO observability | ✅ | Gauge tracks Redis on every `begin()`; suitable for ops gates |

**NestJS wiring:** `DimoProviderLimiterService` receives `DimoProviderMetricsService` via constructor (`@Optional()`); both registered in `dimo.module.ts` — metrics sync active in production module graph.

**Minor note (P3):** `setProviderCooldown` syncs metrics using `bounded * 1000` rather than post-Lua actual remaining; subsequent `begin()` calls correct from Redis.

### 3.3 P1-002 verdict

**P1_002=FIXED**

---

## 4. Regression review (remediation touch areas)

| Area | Regression found? | Notes |
|------|-------------------|-------|
| Trip enrichment semantics | NO | No trip boundary/FSM logic changed; only optional context param added |
| Energy events | NO | Context added; detection pipeline unchanged; 170 energy tests PASS |
| Telemetry / GraphQL variables | NO | `variables` param unchanged; context is separate gateway arg |
| DTC | NO | Context added before query; diff logic unchanged |
| Recharge segments | NO | Context threaded; retry/backoff unchanged |
| Trip reconciliation | NO | Context added to segment fetch only |
| Trip orchestration | NO | Context helper added; FSM unchanged |
| Provider auth/JWT | NO | No auth changes |
| Scheduler/backpressure | NO | Priority model unchanged |
| Redis limiter / token bucket | NO | Cooldown Lua extended; rate scripts unchanged |
| Canary logic | NO | `resolveCanaryEnforcement` unchanged |
| Observability | IMPROVED | Cooldown gauge lifecycle fixed |
| Duplicate provider calls / N+1 | NO | No new call sites introduced |
| Wrong identity | NO | Where passed, `buildDimoProviderRequestContext` preserves org/vehicle |

No material trip-loss or semantic regression detected in remediation diff.

---

## 5. Production safety invariants

| Invariant | Verdict | Evidence |
|-----------|---------|----------|
| `PRODUCTION_DEFAULT=SHADOW` | ✅ | `parseMode()` defaults `'shadow'` (`dimo-provider-limiter.config.ts:68`) |
| `GLOBAL_ENFORCE_ACTIVE=NO` | ✅ | Requires explicit `DIMO_PROVIDER_LIMITER_MODE=enforce`; not set in PR |
| `PERMANENT_TRIP_LOSS=NO` | ✅ | No trip deletion; admission timeout → BullMQ retry unchanged |
| Rollback available | ✅ | Env-only rollback documented; no DB migration |

---

## 6. Energy / fuel / charging boundary

| Field | Value |
|-------|-------|
| `ENERGY_PIPELINE_ARCHITECTURALLY_SOUND` | YES |
| `REAL_WORLD_FUEL_EVENT_PROVEN` | NO |
| `REAL_WORLD_CHARGING_EVENT_PROVEN` | NO |

Remediation improved energy-event DIMO fetch context (`EnergyEventsService`); no energy pipeline regression observed. KS MX 2024 production evidence gate remains a separate post-S4 track.

---

## 7. Tests and CI

### Local execution (re-reviewer VM, `CURRENT_HEAD_SHA`)

```bash
cd backend && npx tsc -p tsconfig.json --noEmit          # PASS
cd backend && npm test -- --testPathPattern="dimo-provider-request-context-propagation|dimo-provider-cooldown-lifecycle" --runInBand
# 13 passed
cd backend && npm test -- --testPathPattern="dimo-provider-request-context|dimo-provider-cooldown-lifecycle|dimo-provider|dimo-telemetry|partial-boundary-repair|energy-event|token-bucket|canary|backpressure|trip-enrichment|observability|chaos"
# 412 passed, 28 skipped (60 suites; 2 skipped)
```

| Field | Value |
|-------|-------|
| `TYPECHECK_STATUS` | PASS |
| `LOCAL_TEST_STATUS` | PASS |
| `LOCAL_TEST_COUNT` | 412 |
| `SKIPPED_TEST_COUNT` | 28 |

Redis integration suite (`npm run test:dimo-provider-limiter:redis`) **not executed** locally (no Redis in review VM). Prior CI on pre-remediation SHA ran these successfully.

### GitHub CI (CURRENT HEAD)

| Field | Value |
|-------|-------|
| `CI_HEAD_SHA` | *none matching `b3ee003e5`* |
| `CI_STATUS` | **PENDING** |
| Last green CI | `6ca076e1f` — runs `33282532775`, `33282532818` (25/25 checks) |

**CI on remediation HEAD is required before merge.** Pre-remediation CI success must not be reused.

---

## 8. New findings classification

### P0 — BLOCKER
*None.*

### P1 — HIGH

| ID | Finding | Status |
|----|---------|--------|
| P1-001 (original) | Incomplete requestContext on trip enrichment / braking intake paths | **UNRESOLVED** — see §2.4 |

### P2 — MEDIUM

| ID | Finding |
|----|---------|
| P2-001 | `canary_selected` logs still emit raw `vehicleId`/`organizationId` (pre-existing) |
| P2-002 | Legacy `DIMO_PROVIDER_CANARY_ENFORCE_ORG_IDS` enables enforce without `ENFORCE_CANARY_ENABLED` (pre-existing) |
| P2-003 | N≈1000 fleet envelope NOT CERTIFIED under enforce (documented) |

### P3 — LOW

| ID | Finding |
|----|---------|
| P3-001 | `setProviderCooldown` metrics sync uses bounded seconds, not post-Lua remaining (self-corrects on next `begin()`) |
| P3-002 | `syncCooldownMetrics(0)` invoked on every non-cooldown `begin()` (idempotent gauge clear; minor overhead) |

**NEW_P0_COUNT=0**  
**NEW_P1_COUNT=0** (residual gaps counted under unresolved P1-001)

---

## 9. Merge gate

| Gate | Result |
|------|--------|
| P1-001 FIXED | ❌ NOT_FIXED |
| P1-002 FIXED | ✅ FIXED |
| No new P0 | ✅ |
| No unresolved new P1 beyond P1-001 | ✅ |
| Typecheck PASS | ✅ |
| Relevant tests PASS (local) | ✅ |
| CI PASS on CURRENT HEAD | ❌ PENDING |
| Production default SHADOW | ✅ |
| Global enforce inactive | ✅ |
| PERMANENT_TRIP_LOSS=NO | ✅ |
| No material regression | ✅ |

**MERGE_PR_1429=NO**

---

## 10. Summary

Remediation **fully addresses P1-002** (cooldown gauge lifecycle) with sound Redis-backed semantics and passing regression tests.

Remediation **partially addresses P1-001**: canonical infrastructure and major scheduler paths are correct, but **production trip-enrichment and braking-intake call sites** still omit `vehicleId`/`organizationId` despite having them in scope. Percent/vehicle/org canary would remain inconsistent on those routes.

CI has **not run** on remediation SHAs (`772757147`, `b3ee003e5`).

---

*End of independent re-review. This file is intentionally not committed to PR #1429 to avoid moving the reviewed HEAD.*
