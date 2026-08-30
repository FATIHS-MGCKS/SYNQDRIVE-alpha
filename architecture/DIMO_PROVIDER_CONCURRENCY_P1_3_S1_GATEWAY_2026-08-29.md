# P1.3-S1 — Canonical DIMO Provider Gateway Foundation

**Date:** 2026-08-29  
**Status:** IMPLEMENTED (S1 slice)  
**Baseline:** P1.2 merged (PR #1409), Phase-0 audit Draft PR #1418  
**Verdict:** Semantic pass-through gateway on telemetry hot path — **no limiter, no behavior change**

---

## 1. Phase-1 audit verification (call-site matrix)

Phase-0 audit (`architecture/DIMO_PROVIDER_CONCURRENCY_P1_3_PHASE0_AUDIT_2026-08-29.md`, PR #1418) was re-verified against `main` HEAD (`a212edec7`). **No material disagreement.**

### 1.1 `DimoTelemetryService.queryGraphQL` callers (production)

| Caller | Service module | Network exit | Auth | Timeout | Retries | Return/error semantics |
|--------|----------------|--------------|------|---------|---------|------------------------|
| `fetchLatestVehicleSnapshot` | dimo-telemetry | GQL POST | Vehicle JWT (caller) | 15s | None | Throws on GQL no-data; returns `data` |
| `fetchAvailableSignals` | dimo-telemetry | GQL POST | Vehicle JWT | 15s | None | Returns string[] |
| `fetchBatteryCapabilityPreflightSnapshot` | dimo-telemetry | GQL POST | Vehicle JWT | 15s | None | Catch → degrade object |
| `probeRechargeSegments` | dimo-telemetry | GQL POST | Vehicle JWT | 15s | None | Catch → empty segments |
| `fetchLastSeenLocation` | dimo-telemetry | GQL POST | Vehicle JWT | 15s | None | Returns data |
| `DimoSegmentsService` (13 call sites) | dimo-segments | GQL POST | Vehicle JWT via `getVehicleJwt` | 15s | Internal pagination sleep only | Mix throw / swallow per method |
| `DimoDtcProcessor` | worker | GQL POST | Vehicle JWT | 15s | BullMQ 3× | Throws → job fail |
| `DimoRechargeSegmentsClient` | recharge-segments | GQL POST | Vehicle JWT | 15s | **3× HTTP** (recharge only) | Throws after exhaust |
| `DimoAvailableSignalsPreflightService` | driving-capability | GQL POST ×2 parallel | Vehicle JWT | 15s | None | Propagates |
| `DimoController.queryGraphQL` | dimo (admin) | GQL POST | Vehicle JWT | 15s | None | HTTP error to client |
| `battery-capability-preflight` | battery-health | via telemetry helpers | Vehicle JWT | 15s | None | Degrade paths |

### 1.2 Direct telemetry axios bypasses (pre-S1)

| Method | Timeout | Error semantics | S1 action |
|--------|---------|-----------------|-----------|
| `fetchVehicleSummary` | **10s default** (client config) | HTTP throw; GQL errors ignored → null fields | Wrapped in gateway **with identical invoke** |
| `fetchVehicleVin` | **10s default** | catch-all → `null` | Wrapped in gateway **with identical invoke** |

**Not migrated through `queryGraphQL`** — would have changed timeout (15s), error handling, and logging.

### 1.3 Missing from Phase-0 inventory

| Exit | Notes |
|------|-------|
| Ops scripts (`backend/scripts/ops/*`, `probe-dimo-events.ts`) | Standalone axios — **out of production path**; documented as tech debt |
| `battery-capability-preflight.service` | Uses telemetry helpers (already via `queryGraphQL`) — implicit coverage |

### 1.4 `DimoSegmentsService` telemetry access

All segment/event/route/energy fetches call `this.telemetry.queryGraphQL` — **automatically covered** by S1 gateway routing (no segment service edits required).

---

## 2. Files changed

| File | Change |
|------|--------|
| `backend/src/modules/dimo/provider/dimo-provider-gateway.types.ts` | **NEW** — operation enum + execute params |
| `backend/src/modules/dimo/provider/dimo-provider-gateway.service.ts` | **NEW** — S1 pass-through gateway |
| `backend/src/modules/dimo/provider/dimo-provider-gateway.service.spec.ts` | **NEW** |
| `backend/src/modules/dimo/dimo-telemetry.service.ts` | Route all `client.post` through gateway |
| `backend/src/modules/dimo/dimo-telemetry.service.spec.ts` | **NEW** — HTTP/GQL parity tests |
| `backend/src/modules/dimo/dimo-telemetry-gateway-coverage.spec.ts` | **NEW** — static guard |
| `backend/src/modules/dimo/dimo.module.ts` | Register/export `DimoProviderGateway` |
| `frontend/src/master/components/ChangesView.tsx` | Changelog entry |
| `frontend/src/master/components/ArchitekturView.tsx` | Gateway architecture note |

**Not changed:** `DimoAuthService`, token exchange, identity API, triggers, worker concurrency, schedulers, queues.

---

## 3. Gateway API

```typescript
enum DimoProviderOperation {
  TELEMETRY_GRAPHQL,
  TELEMETRY_VEHICLE_SUMMARY,
  TELEMETRY_VEHICLE_VIN,
}

interface DimoProviderExecuteParams<T> {
  operation: DimoProviderOperation;
  requestContext?: { tokenId?: number; vehicleId?: string; organizationId?: string };
  invoke: () => Promise<T>;
}

class DimoProviderGateway {
  async execute<T>(params: DimoProviderExecuteParams<T>): Promise<T> {
    return params.invoke(); // S1: pass-through only
  }
}
```

**S1 explicitly does NOT implement:** limiter, Redis, waiting, backpressure, priority, circuit breaker, retries, error translation.

---

## 4. Before / after execution graph

### Before (S1)

```
Callers → DimoTelemetryService.queryGraphQL → axios.post (15s)
         → fetchVehicleSummary/fetchVehicleVin → axios.post (10s default)
```

### After (S1)

```
Callers → DimoTelemetryService
           → DimoProviderGateway.execute (pass-through)
              → invoke() → axios.post (unchanged timeouts/headers/body)
```

All production telemetry HTTP exits in `DimoTelemetryService` are gateway-wrapped. `DimoSegmentsService` callers inherit gateway via `queryGraphQL`.

---

## 5. Semantic parity proof (trip-correctness invariants)

| Invariant | S1 impact |
|-----------|-----------|
| 1. Missed physical trips | **NONE** — snapshot/trip paths unchanged |
| 2. Delayed trip-start detection | **NONE** — same HTTP timing (15s GQL cap) |
| 3. Duplicate canonical trips | **NONE** |
| 4. Partial-trip regression | **NONE** — FINAL-3/31/32 pass |
| 5. Boundary repair regression | **NONE** |
| 6. Reconciliation suppression | **NONE** |
| 7. Swallowed failures now thrown | **NONE** — no new catch paths |
| 8. Degraded failures now thrown | **NONE** — summary/VIN preserve legacy semantics |
| 9. GraphQL parsing unchanged | **YES** — `postGraphQL` is prior body of `queryGraphQL` |
| 10. JWT/cache unchanged | **YES** — `DimoAuthService` untouched |

No `catch → []` introduced.

---

## 6. Trip-loss regression results

| Suite | Result |
|-------|--------|
| `p12-final6-current-prod-release-gate.spec.ts` | **PASS** |
| `p12-final5-production-scale-gate.spec.ts` | **PASS** |
| `partial-boundary-repair.final3.spec.ts` | **PASS** |
| `partial-boundary-repair.final31.spec.ts` | **PASS** |
| `partial-boundary-repair.final32.spec.ts` | **PASS** |
| `dimo-snapshot.trip-start-isolation.spec.ts` | **PASS** |
| `snapshot-throughput-capacity.spec.ts` | **PASS** |

---

## 7. HTTP / error parity matrix

| Case | Test | Result |
|------|------|--------|
| A. Success | `dimo-telemetry.service.spec.ts` | PASS |
| B. GQL 200 + errors (no data) | throws `DIMO GraphQL error` | PASS |
| B2. GQL 200 + errors (partial data) | returns data | PASS |
| C. HTTP 401 | propagates same Error | PASS |
| D. HTTP 403 | propagates same Error | PASS |
| E. HTTP 429 | propagates same Error | PASS |
| F. HTTP 5xx | propagates same Error | PASS |
| G. Timeout 15s on queryGraphQL | `timeout: 15000` in post options | PASS |
| H. Gateway pass-through | invoke executes HTTP | PASS |
| I. Body/variables | unchanged | PASS |
| J. Authorization header | `Bearer ${jwt}` | PASS |
| Summary default timeout | no 15s override | PASS |
| VIN catch-all → null | on 403 | PASS |

---

## 8. Remaining direct DIMO exits (not gateway-covered)

| Exit | Scope | P1.3 debt |
|------|-------|-----------|
| `DimoAuthService` | auth.dimo.zone + token-exchange | **P1.3-S4** |
| `DimoApiSyncService` | identity-api.dimo.zone | Later slice |
| `DimoTriggersService` | vehicle-triggers-api | Later slice |
| Ops scripts (`scripts/ops/*`) | standalone axios | Non-production; optional follow-up |

**TELEMETRY GATEWAY CANONICAL (production):** **YES** for `DimoTelemetryService` HTTP exits.

---

## 9. Tests added

- `dimo-provider-gateway.service.spec.ts` (2 tests)
- `dimo-telemetry.service.spec.ts` (14 tests)
- `dimo-telemetry-gateway-coverage.spec.ts` (2 static guard tests)

---

## 10. Build

```
cd backend && npm run build
```

**Result:** PASS

---

## 11. CI

CI status recorded at commit push time — see PR checks.

---

## 12. Rollback procedure

1. Revert commit(s) on branch or set `git revert <sha>`.
2. No env vars introduced — no production config change.
3. `DimoModule` removes `DimoProviderGateway` provider registration on revert.
4. Safe at N≤100 — restores direct axios path inside `DimoTelemetryService`.

---

## 13. Unresolved risks

1. **Ops scripts** still bypass gateway (non-production).
2. **Gateway is pass-through** — no actual throttling yet; N≈1000 still uncertified.
3. **`fetchVehicleSummary` / `fetchVehicleVin`** use separate operations with different timeout/error semantics — limiter in S2 must treat them as distinct operation classes.
4. Phase-0 audit doc not yet on `main` (Draft PR #1418) — reference only.

---

## 14. Recommended P1.3-S2 scope

1. Redis hybrid limiter (shadow mode first: `DIMO_LIMITER_SHADOW_MODE=true`)
2. Attach limiter inside `DimoProviderGateway.execute` only — no caller changes
3. Metrics: `dimo_requests_total`, `dimo_requests_inflight`, `dimo_limiter_waiting`
4. Config contract: `DIMO_GLOBAL_MAX_CONCURRENCY`, `DIMO_GLOBAL_MAX_REQUESTS_PER_SECOND`
5. Keep trip semantics unchanged — shadow observes would-block counts only

---

*End of P1.3-S1 record.*
