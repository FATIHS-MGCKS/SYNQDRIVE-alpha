# Vehicle Detail Page — Technical Baseline (2026-07)

**Audit prompt:** 3/36 — Production Readiness  
**Baseline commit:** `385d89bb19b2dbaecfe7e866061231ea02030644`  
**Branch:** `cursor/vehicle-detail-dependency-map-af44`  
**Date:** 2026-07-24 (UTC)  
**Builds on:** [dependency map](./vehicle-detail-page-dependency-map-2026-07.md), [canonical sources](./vehicle-detail-page-canonical-sources-2026-07.md)

No product remediation was performed in this prompt. This document records the reproducible technical baseline before any fixes.

---

## Environment

| Item | Value |
|------|-------|
| OS | Linux 6.12.94+ (x86_64) |
| Node | v22.14.0 |
| npm | 10.9.8 |
| Package managers | **npm** only (`frontend/package-lock.json`, `backend/package-lock.json`) |
| `node_modules` | Present in `frontend/` and `backend/` |
| Playwright | Chromium installed via `npx playwright install chromium` (required for E2E) |
| External secrets | **Not used** — E2E uses route mocks; no production DB/API credentials |
| Prisma validate | Passes with default local `DATABASE_URL` placeholder |

---

## Workspace structure (relevant paths)

| Path | Role |
|------|------|
| `frontend/src/rental/App.tsx` | Vehicle detail shell — view state (`currentView` + `selectedVehicle`), 8 tabs |
| `frontend/src/rental/components/vehicle-detail/` | Header, overview, health box, tabs |
| `frontend/src/rental/lib/telemetryFreshness.ts` | 5-state telemetry freshness (live/standby/signal_delayed/offline/no_signal) |
| `frontend/src/rental/lib/overview-map-position.ts` | Map position modes (live / last-known / static / empty) |
| `frontend/src/rental/lib/fleetVehicleDisplay.ts` | Operational + telemetry display layer |
| `frontend/e2e/fleet-operational-*.ts` | Existing fleet operational E2E (no full detail shell before this baseline) |
| `frontend/src/rental/lib/vehicle-detail-baseline.fixtures.ts` | **New** — unit baseline scenario catalog |
| `frontend/src/rental/lib/vehicle-detail-baseline.test.ts` | **New** — unit baseline matrix (14 tests) |
| `frontend/e2e/vehicle-detail-baseline-fixtures.ts` | **New** — E2E mocks + navigation helpers |
| `frontend/e2e/vehicle-detail-baseline.spec.ts` | **New** — E2E baseline (6 tests) |

---

## Commands executed and results

### Install / structure

```bash
ls frontend/package-lock.json backend/package-lock.json
node -v && npm -v
```

| Result |
|--------|
| Lockfiles present; Node v22.14.0; npm 10.9.8 |

### Frontend build

```bash
cd frontend && npm run build   # tsc -b && vite build
```

| Result | Exit |
|--------|------|
| **PASS** (chunk size warnings only) | 0 |

### Backend build

```bash
cd backend && npm run build    # nest build
```

| Result | Exit |
|--------|------|
| **PASS** | 0 |

### Typecheck

Typecheck is included in `frontend` build (`tsc -b`). No separate backend `tsc` script; `nest build` compiles TypeScript.

| Surface | Result |
|---------|--------|
| Frontend `tsc -b` | **PASS** (via build) |
| Backend `nest build` | **PASS** |

### Lint (full)

```bash
cd frontend && npm run lint:all
cd backend && npm run lint:all
```

| Surface | Problems | Exit |
|---------|----------|------|
| Frontend | 1362 (1301 errors, 61 warnings) | 0 |
| Backend | 48 (35 errors, 13 warnings) | 0 |

Lint exits 0 but reports many **pre-existing** violations. None were introduced or fixed in this prompt.

### Unit tests (full suite)

```bash
cd frontend && npm test          # vitest run
cd backend && npm test           # jest
```

| Suite | Failed files | Failed tests | Passed | Exit |
|-------|--------------|--------------|--------|------|
| Frontend (full) | 7 | 11 | 1988 | 0 |
| Backend (full) | 41 | 53 | 8333 | 0 |

### Integration / E2E

```bash
cd backend && npm run test:e2e
cd frontend && npx playwright test -c e2e/playwright.config.ts fleet-operational-flow.spec.ts --project=desktop-1280
cd frontend && npx playwright test -c e2e/playwright.config.ts vehicle-detail-baseline.spec.ts
```

| Suite | Result | Notes |
|-------|--------|-------|
| Backend `test:e2e` | **FAIL** 1 suite | `document-extraction.e2e-spec.ts` — Nest app init failure, `app.close()` on undefined |
| Fleet operational E2E (existing) | **PASS** 11/11 desktop, 4/4 mobile-375 | After `npx playwright install chromium` |
| **Vehicle detail baseline E2E (new)** | **PASS** 5/5 desktop-1280, 6/6 mobile-375 | Includes responsive screenshot on mobile-375 |

### Prisma

```bash
cd backend && npm run prisma:validate
```

| Result |
|--------|
| Schema valid (1 referential-action warning on `SetNull`) |

---

## Vehicle Detail unit test subset (baseline)

```bash
cd frontend && npx vitest run \
  src/rental/lib/vehicle-detail-baseline.test.ts \
  src/rental/lib/telemetryFreshness.test.ts \
  src/rental/lib/overview-map-position.test.ts \
  src/rental/lib/fleetVehicleDisplay.test.ts \
  src/rental/lib/vehicle-overview-regression.test.ts \
  src/rental/lib/vehicle-overview-summary.utils.test.ts \
  src/rental/lib/fleet-map-vehicle-mapper.test.ts \
  src/rental/components/dashboard/runtime/vehicleRuntimeStateBuilder.test.ts \
  src/rental/components/vehicle-detail/vehicle-health-box.mapper.test.ts \
  src/rental/components/vehicle-detail/vehicle-health-display.mapper.test.ts \
  src/rental/lib/connectivity-cross-surface-regression.test.ts \
  src/rental/lib/fleet-map-vehicle-store.utils.test.ts
```

| Result |
|--------|
| **133 tests, all PASS** (includes 14 new baseline tests) |

### Backend vehicle-detail-related subset

```bash
cd backend && npx jest --testPathPattern='vehicle-operational-state-v2|vehicles.controller.status-patch|telemetry-freshness|vehicle-state-interpreter|fleet-connectivity'
```

| Result |
|--------|
| **4 failed suites, 10 failed tests, 91 passed** (pre-existing) |

Failed suites (pre-existing, not introduced here):

- `vehicle-operational-state-v2.fleet-map-cache.spec.ts` — `fleetMapCache` undefined in test harness
- `vehicle-operational-state-v2.api-consistency.spec.ts`
- `vehicle-operational-state-v2.data-quality.spec.ts`
- `vehicles.controller.status-patch.spec.ts`

---

## Pre-existing failures (not vehicle-detail regression)

### Frontend full-suite failures (7 files / 11 tests)

| File | Area |
|------|------|
| `fleet-health-control-center.test.ts` | Fleet health display (3 tests) |
| `rental-health-availability.test.ts` | Module pipeline unavailability |
| `taskQueryCache.contract.test.ts` | Task query cache contract |
| `notificationEngine.characterization.test.ts` | Notification dedupe (2 tests) |
| `notificationEngine.wob-l7503.test.ts` | WOB L 7503 regression (2 tests) |
| `fleet-health-service-vehicle-overview.test.ts` | Health task dedupe |
| `fleet-health-service.domain.integration.test.ts` | Case-linked tasks |

### Backend full-suite failures (41 suites / 53 tests)

Includes document-extraction cluster, IAM security regression (TS errors on invite API), driving-impact, pricing-context, financial-insights worker SIGTERM, and the four vehicle-operational-state-v2 suites listed above. **None are caused by this baseline work.**

### Known E2E flakes / environment notes

| Issue | Mitigation |
|-------|------------|
| Playwright browsers missing on fresh VM | Run `npx playwright install chromium` |
| Vite proxy `ECONNREFUSED` for unmocked `/api/v1/*` | Benign when routes are mocked; baseline fixtures add vehicle-detail mocks |
| Opening vehicle detail without mocks crashed | Pre-existing: missing `device-connection`, incomplete `file-summary` shape — **documented and fixed in baseline fixtures only** (not product code) |

---

## Baseline scenario coverage matrix

| Scenario | Unit baseline | E2E baseline | Notes |
|----------|---------------|--------------|-------|
| Vehicle Detail öffnen | — | ✅ `open-detail` | Fleet → Open → 8 tabs |
| Fahrzeugwechsel | — | ✅ `vehicle-switch` | AVL-1 → back → ACT-1 |
| Tabwechsel (8 tabs) | ✅ tab keys | ✅ `tab-switch` | Overview … Requirements |
| Statusanzeige | ✅ `status-display` | ✅ `status-display` | Unknown → neutral copy |
| Telemetrie null-Werte | ✅ `telemetry-null-values` | — | Mapper coerces odometer/speed → 0 (C-03) |
| Telemetrie fehlend | ✅ `telemetry-missing-values` | — | `no_signal` |
| Live-Position | ✅ `live-position` | — | `deriveOverviewMapPosition` |
| Letzte bekannte Position | ✅ `last-known-position` | — | `telemetryUnavailable` + fallback |
| Standby | ✅ `standby` | — | No user warning |
| Soft-Offline | ✅ `soft-offline` | — | `signal_delayed` |
| Offline | ✅ `offline` | — | `shouldWarnUser` |
| Read-only-Rolle | ✅ permissions seed | ✅ `read-only-role` | ORG_VIEWER mock |
| Mobile Viewports | — | ✅ `mobile-viewport` | 375px; screenshot artifact |

---

## Test artifacts

| Artifact | Path |
|----------|------|
| Playwright HTML report | `frontend/e2e/playwright-report/` |
| Mobile baseline screenshot | `frontend/e2e/playwright-report/vehicle-detail-baseline-mobile-375.png` (on mobile-375 run) |
| Failure screenshots/videos | `frontend/test-results/` (when tests fail) |
| Fleet operational screenshots | `frontend/e2e/playwright-report/fleet-op-list-{viewport}.png` |

---

## Missing / partial coverage (baseline gaps)

| Gap | Priority |
|-----|----------|
| Dedicated E2E per telemetry state row (standby/soft-offline/offline) in detail header | P2 — unit covered; E2E only via fleet list today |
| Live map / Mapbox interaction | P2 — Mapbox token not configured in E2E (`Map unavailable`) |
| Header status dropdown persistence (C-01/C-02) | P0 — known conflict; no automated assertion yet |
| Full tab content assertions (Health, Trips, Damages data) | P2 — tab navigation only |
| Backend vehicle-operational-state-v2 failing specs | P1 — fix harness before using as regression gate |
| Read-only write-action assertions (disabled PATCH buttons) | P2 — shell render only |
| Integration test with real Postgres/ClickHouse | Out of scope — no prod credentials |

---

## Baseline test commands (quick reference)

```bash
# Unit baseline (new + core vehicle-detail libs)
cd frontend && npx vitest run src/rental/lib/vehicle-detail-baseline.test.ts

# E2E baseline (mocked APIs, no backend)
cd frontend && npx playwright install chromium
cd frontend && npx playwright test -c e2e/playwright.config.ts vehicle-detail-baseline.spec.ts --project=desktop-1280
cd frontend && npx playwright test -c e2e/playwright.config.ts vehicle-detail-baseline.spec.ts --project=mobile-375
```

---

## Known limitations

1. **E2E uses mocked APIs** — does not validate real DIMO telemetry, rental-health, or Postgres data.
2. **Lint debt** — 1300+ frontend ESLint errors pre-exist; not a vehicle-detail-only problem.
3. **Backend test:e2e** — document-extraction suite fails without full Nest test module wiring.
4. **Null telemetry display (C-03)** — `mapFleetMapVehicleResponse` maps `null` odometer/speed to `0`; baseline unit test documents this as pre-existing behavior.
5. **No snapshot updates** were performed in this prompt.

---

## Changes introduced in this prompt (test/audit only)

| File | Purpose |
|------|---------|
| `frontend/src/rental/lib/vehicle-detail-baseline.fixtures.ts` | Scenario catalog + pure-function seeds |
| `frontend/src/rental/lib/vehicle-detail-baseline.test.ts` | Unit baseline matrix |
| `frontend/e2e/vehicle-detail-baseline-fixtures.ts` | E2E mocks (vehicle detail APIs) + navigation |
| `frontend/e2e/vehicle-detail-baseline.spec.ts` | E2E baseline flows |
| `docs/audits/vehicle-detail-page-baseline-2026-07.md` | This document |

**SynqDrive Code → Changes / Architektur:** Not updated — audit and test harness only; no product architecture or runtime behavior changed.
