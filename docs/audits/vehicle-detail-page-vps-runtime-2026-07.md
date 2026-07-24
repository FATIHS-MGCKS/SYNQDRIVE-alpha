# Vehicle Detail Page — VPS Runtime Audit

| Field | Value |
|-------|-------|
| **Audit ID** | `vehicle-detail-page-vps-runtime-2026-07` |
| **Prompt** | **34 of 36** — Runtime audit under controlled load |
| **Audit date** | 2026-07-24 UTC |
| **Environment** | Production VPS `srv1374778.hstgr.cloud` (approved) + controlled Playwright runtime harness (mocked API) |
| **Deployed commit** | `5f76e37` (`cursor/data-auth-migration-fix-26b5`) |
| **Method** | Read-only VPS probes + non-destructive synthetic health load + Playwright runtime measurements (`e2e/vehicle-detail-runtime-audit.spec.ts`) |
| **Production data modified** | **No** |
| **Cross-tenant data exposed** | **No** (synthetic UUIDs only on VPS; E2E uses mock orgs) |

---

## Executive Summary

Runtime behavior of the Vehicle Detail page was audited across **eight controlled test scenarios**. Client-side polling semantics were verified with a **mocked API harness** (deterministic intervals). VPS observations used **localhost health probes**, **unauthenticated endpoint checks**, and **process/DB/Redis metrics** — no authenticated production tenant traffic was captured or logged.

### Verdict: **CONDITIONAL NO-GO** for Vehicle Detail production release on current VPS tip

| Area | Result |
|------|--------|
| Overview polling intervals (5s GPS / 30s telemetry) | ✅ Matches implementation |
| Tab switch stops high-frequency GPS on Documents/Tasks | ❌ **GPS continues** on all vehicle-detail tabs (by design since V4.6.44) |
| Background tab polling reduction | ❌ **Not implemented** (`visibilitychange` absent) |
| Provider failure / timeout handling | ✅ No client retry storm; backend cache fallback |
| Cross-tenant isolation (unauth) | ✅ HTTP 401 on VPS; E2E foreign-org requests = 0 |
| Multi-vehicle binding | ✅ Store `bindToVehicle` / `patchIfBound` + E2E switch test |
| Freshness chain | ✅ Documented end-to-end (code + mocks) |
| VPS runtime observability | ❌ `synqdrive_vehicle_detail_*` metrics **not deployed** |
| Process stability | ⚠️ PM2 **2800** cumulative restarts; heap **~93%** |

**No destructive actions were performed on the VPS.**

---

## 1. Audit Method

### 1.1 Constraints (honored)

- No process restarts, migrations, firewall changes, or data mutations
- No real cross-tenant payloads in documentation
- VPS vehicle endpoints tested only with **zero UUID placeholders** → expect 401
- Playwright harness uses **mock org/vehicles** (`vehicle-detail-fixtures.ts`)

### 1.2 Evidence sources

| Source | Used for |
|--------|----------|
| `frontend/e2e/vehicle-detail-runtime-audit.spec.ts` | Tests RT-1 … RT-6 (controlled browser) |
| `frontend/src/rental/hooks/useLiveVehicleTelemetry.ts` | Expected intervals & cleanup |
| `frontend/src/rental/App.tsx` | `VEHICLE_DETAIL_VIEWS` polling gate |
| `backend/src/modules/vehicles/vehicles.service.ts` | `getLiveGps` cache fallback, freshness fields |
| VPS SSH (read-only) | Health load, 401 probes, PM2/Redis/PostgreSQL snapshots |
| Nginx access log tail | No live vehicle-detail traffic during audit window |

### 1.3 Limitation

**Prompt 32 observability metrics are not on the deployed VPS commit.** Provider latency, cache hit/miss, and backend histograms could not be measured from `/metrics` on production. Findings for those dimensions rely on **code inspection** and **mocked client counts**.

---

## 2. Test Results & Findings

### TEST 1 — Overview (GPS + telemetry polling)

| Field | Value |
|-------|-------|
| **Reproduction** | Open Vehicle Detail Overview for live-tracking vehicle; observe 35s |
| **Measurement** | Playwright RT-1: telemetry Δ **0–2** / 35s; live-gps Δ **5–9** / 35s |
| **Expectation** | GPS ~5s (`GPS_POLL_MS=5000`); telemetry ~30s (`DASHBOARD_POLL_MS=30000`) |
| **Result** | ✅ **PASS** — intervals match code constants |
| **Severity** | INFO |
| **Release Blocker** | No |
| **Evidence** | `useLiveVehicleTelemetry.ts` L17–18; RT-1 passed 2026-07-24 |
| **Remediation** | None required |

| ID | Severity | Release Blocker | Finding |
|----|----------|-----------------|---------|
| VD-RT-001 | INFO | No | Dual independent timers (GPS + dashboard) confirmed under load |

**Parallel requests:** GPS and dashboard cycles schedule independently after initial `fetchDashboard`. No request batching — two concurrent endpoint families.

**Provider latency / cache / backend latency (VPS):** Not observable on deployed commit (`synqdrive_vehicle_detail_*` count = **0**). Unauthenticated probe latency: telemetry **2.6 ms**, live-gps **1.5 ms** (401 rejection only).

---

### TEST 2 — Switch to Documents / Tasks

| Field | Value |
|-------|-------|
| **Reproduction** | Overview → Documents tab; wait 20s; count API calls |
| **Measurement** | RT-2: telemetry Δ **≤1**; live-gps Δ **≥2** (continues ~5s cadence) |
| **Expectation (prompt)** | High-frequency GPS polling **stops**; only necessary queries remain |
| **Expectation (code)** | Polling continues on all `VEHICLE_DETAIL_VIEWS` tabs (V4.6.44 badge fix) |
| **Result** | ⚠️ **DEVIATION** — GPS polling **does not stop** on Documents |
| **Severity** | MEDIUM |
| **Release Blocker** | **Yes** (if prompt gate requires GPS stop on non-map tabs) |
| **Evidence** | `App.tsx` `VEHICLE_DETAIL_VIEWS` includes `documents`, `vehicle-tasks`; RT-2 measurements |
| **Remediation** | Gate `fetchGps` / `scheduleGps` on `currentView === 'overview'` only; keep 30s telemetry for badge on other tabs |

| ID | Severity | Release Blocker | Finding |
|----|----------|-----------------|---------|
| VD-RT-002 | MEDIUM | Conditional | GPS 5s polling continues on Documents/Tasks — extra DIMO load on non-map tabs |

---

### TEST 3 — Browser background

| Field | Value |
|-------|-------|
| **Reproduction** | Vehicle detail foreground + new dashboard tab background; wait 12s |
| **Measurement** | RT-3: telemetry Δ **≤1**; live-gps Δ **≥1** (polling continues) |
| **Expectation** | Live polling pauses or reduces in background |
| **Result** | ❌ **FAIL** — no `document.visibilitychange` handler in vehicle-detail polling |
| **Severity** | MEDIUM |
| **Release Blocker** | No (performance/battery concern, not security) |
| **Evidence** | Grep: no visibility handler in `frontend/src/rental/`; RT-3; E2E test 24 "best effort" only checks UI stability |
| **Remediation** | Pause GPS timer when `document.hidden`; optionally stretch dashboard interval |

| ID | Severity | Release Blocker | Finding |
|----|----------|-----------------|---------|
| VD-RT-003 | MEDIUM | No | Background tab does not reduce Vehicle Detail polling |

**Retry storm:** Not observed. RT-3 + RT-4 show bounded request counts over observation windows.

---

### TEST 4 — Slow / unreachable provider

| Field | Value |
|-------|-------|
| **Reproduction** | Mock `/live-gps` with 4s delay → HTTP 504; observe 18s |
| **Measurement** | RT-4: live-gps Δ **≤5** (no exponential retries) |
| **Expectation** | Timeout → cache fallback; no retry storm; stale position retained |
| **Result** | ✅ **PASS** (client); backend returns `source: 'cache'` on provider failure |
| **Severity** | INFO |
| **Release Blocker** | No |
| **Evidence** | `fetchGps` catch keeps previous position; `getLiveGps` catch → cache + `observeProviderOutcome`; RT-4 |
| **Remediation** | Deploy Prompt 32 metrics to measure timeout rate in prod |

| ID | Severity | Release Blocker | Finding |
|----|----------|-----------------|---------|
| VD-RT-004 | INFO | No | Client uses fixed 5s timer; provider errors do not trigger extra retries |

**VPS CPU/RAM during synthetic health load (60 req):** duration **692 ms**; PM2 restarts unchanged at **2800**; heap **93.4%** → **93.5%** (negligible delta).

---

### TEST 5 — Two organizations (tenant isolation)

| Field | Value |
|-------|-------|
| **Reproduction** | E2E: monitor network for `org-foreign-e2e`; VPS: GET telemetry/live-gps with zero UUIDs, no auth |
| **Measurement** | E2E foreign URL hits = **0**; VPS HTTP status **401** (both endpoints) |
| **Expectation** | No cross-tenant access; auth required; org-scoped cache keys |
| **Result** | ✅ **PASS** (unauth layer); code-level org scoping on `findFirst({ organizationId })` |
| **Severity** | INFO |
| **Release Blocker** | No |
| **Evidence** | VPS curl 401; RT-5; `vehicle-detail-security-negative.spec.ts`; `fleetMapCache.cacheKey(organizationId)` |
| **Remediation** | Run authenticated negative integration test on staging before prod cutover |

| ID | Severity | Release Blocker | Finding |
|----|----------|-----------------|---------|
| VD-RT-005 | INFO | No | Unauthenticated cross-org probes rejected (401) |

**Audit logs:** `getLiveGps` calls `dataAuthEnforcement.assertDataAuthorization` with `trackAccess: true` when `organizationId` present — audit trail path exists (not exercised without auth token).

---

### TEST 6 — Multiple simultaneous vehicles

| Field | Value |
|-------|-------|
| **Reproduction** | Open VD-LIVE → fleet → VD-SEC; count telemetry requests |
| **Measurement** | RT-6: telemetry count increases after switch; `patchIfBound` drops stale vehicle patches |
| **Expectation** | Linear polling per active vehicle; no exponential growth; no wrong-vehicle UI updates |
| **Result** | ✅ **PASS** — single binder, one `vehicleId` at a time; store binding guards |
| **Severity** | INFO |
| **Release Blocker** | No |
| **Evidence** | `useVehicleLiveMapStore.patchIfBound`; RT-6; E2E test 20 (vehicle switch) |
| **Remediation** | None |

| ID | Severity | Release Blocker | Finding |
|----|----------|-----------------|---------|
| VD-RT-006 | INFO | No | Vehicle switch rebinds polling; no multi-vehicle poll multiplication in single session |

**Note:** Opening N browser tabs with N vehicles would multiply load linearly with N — not tested (out of scope for single-session audit).

---

### TEST 7 — Freshness chain

| Layer | Field | Source |
|-------|-------|--------|
| **Provider** | `lastSeenAt` / signal timestamps | DIMO `signalsLatest` in `getLiveGps`; DB snapshot timestamps in telemetry |
| **Backend** | `lastSignal`, `signalAgeMs`, `isFresh` | `VehiclesService` interpreted telemetry |
| **Cache** | `source: 'dimo' \| 'cache'` | live-gps response; latestState fallback |
| **Frontend store** | `lastSignal`, `signalAgeMs`, `isFresh`, `lastLocationAt` | `useLiveVehicleTelemetry` → `useVehicleLiveMapStore` |
| **UI display** | Badge "Last Signal …", map position | `VehicleConnectionBadge`, `LiveMapOverview` |

| Field | Value |
|-------|-------|
| **Reproduction** | Code trace + E2E fixtures (`isoAgo(signalAgeMs)`) |
| **Measurement** | Mock live scenario: `signalAgeMs=120000`, `isFresh=true`, `lastSignal` ISO timestamp |
| **Expectation** | Monotonic display; stale provider does not present as live without `isLiveTracking` |
| **Result** | ✅ **PASS** (contract consistent); live map uses `gpsSource` + `isLiveTracking` gate |
| **Severity** | INFO |
| **Release Blocker** | No |
| **Evidence** | `vehicle-detail-fixtures.ts`; `vehicles.service.ts` interpreted fields; E2E tests 13–15 |
| **Remediation** | Add prod metrics for `live_gps_source_total` after Prompt 32 deploy |

| ID | Severity | Release Blocker | Finding |
|----|----------|-----------------|---------|
| VD-RT-007 | INFO | No | Freshness fields align across backend → store → badge; GPS `lastLocationAt` is client clock |

---

### TEST 8 — System resources

| Metric | Measurement (2026-07-24 12:06 UTC) |
|--------|-------------------------------------|
| RAM | 15 GiB total; **2.4 GiB** used; **13 GiB** available |
| Node heap | **204.7 MiB** size; **93.4%** usage (**191 MiB** used) |
| PM2 restarts | **2800** (unchanged after 60 health requests) |
| PostgreSQL | `synqdrive`: **5 active**, **4 idle** connections |
| Redis | **1258** keys; **303** ops/s instantaneous |
| Error sample | **94** Error/Exception lines in last **300** PM2 error log lines |
| Vehicle-detail metrics | **0** series on `/metrics` |
| Nginx vehicle-detail traffic | **0** telemetry/live-gps lines in last-hour tail |

| ID | Severity | Release Blocker | Finding |
|----|----------|-----------------|---------|
| VD-RT-008 | HIGH | **Yes** | Vehicle Detail Prometheus metrics not deployed — cannot observe runtime SLOs on VPS |
| VD-RT-009 | HIGH | **Yes** | PM2 cumulative **2800** restarts — stability risk under sustained polling |
| VD-RT-010 | MEDIUM | No | Node heap **>90%** — monitor under fleet-wide detail usage |
| VD-RT-011 | MEDIUM | No | High error rate in PM2 error log sample (IAM outbox / background jobs) |
| VD-RT-012 | INFO | No | No live vehicle-detail nginx traffic during audit — prod user load not sampled |

| Field | Value |
|-------|-------|
| **Reproduction** | VPS SSH snapshot + 60× local health burst |
| **Expectation** | Stable resources; observable metrics; no restart loop during load |
| **Result** | ⚠️ **PARTIAL** — health burst stable; metrics gap + historical restart count |
| **Remediation** | Deploy observability branch; investigate PM2 restart root cause; restrict `/metrics` |

---

## 3. Findings Summary

| Severity | Count |
|----------|-------|
| HIGH | 2 |
| MEDIUM | 4 |
| INFO | 6 |

| Release blockers | IDs |
|------------------|-----|
| **Yes** | VD-RT-002 (conditional), VD-RT-008, VD-RT-009 |

---

## 4. Pre-Release Checklist (Runtime)

1. Deploy commit with Prompt **32** observability to VPS; verify `synqdrive_vehicle_detail_*` in `/metrics`.
2. Decide product policy: GPS 5s on non-Overview tabs — **stop** (prompt) vs **continue** (badge UX); implement accordingly.
3. Add `visibilitychange` pause for GPS cycle (recommended).
4. Re-run `e2e/vehicle-detail-runtime-audit.spec.ts` on release branch in CI.
5. Staging authenticated soak: 2 orgs × 2 vehicles × 10 min with metrics dashboard.
6. Confirm PM2 restart count stable for 24h post-deploy.

---

## 5. Artifacts

| Artifact | Path |
|----------|------|
| Runtime Playwright harness | `frontend/e2e/vehicle-detail-runtime-audit.spec.ts` |
| Baseline VPS audit (Prompt 33) | `docs/audits/vehicle-detail-page-vps-baseline-2026-07.md` |
| Release gate audit (Prompt 32) | `docs/audits/vehicle-detail-page-release-gate-2026-07.md` |

---

## 6. Attestation

| Statement | Value |
|-----------|-------|
| VPS production data modified | **No** |
| Destructive actions | **None** |
| Cross-tenant data in report | **No** |
| **Changes** updated | Yes — V4.9.805 |
| **Architektur** updated | **No** (runtime audit only) |

---

*End of audit `vehicle-detail-page-vps-runtime-2026-07`.*
