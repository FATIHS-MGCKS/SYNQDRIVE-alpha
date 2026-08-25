# P2.2.44 — Post-P243 Next-Slice Pre-Flight

**Date:** 2026-08-26  
**Mode:** STRICT READ-ONLY TARGET SELECTION  
**Authoritative baseline:** `e5bd8ee996940d8577d1b7e0f04bff31c06805f0` (merged PR #1295 — P2.2.43)  
**Current main:** `a450e130acf275164216adb69c8ae116ee47051b`

---

## 1. Baseline hard gate

| Check | Result |
|-------|--------|
| Baseline SHA | `e5bd8ee996940d8577d1b7e0f04bff31c06805f0` |
| P243 ancestry | YES (`509d0ce` → `e5bd8ee`) |
| Working tree | clean (except unrelated untracked doc) |
| `npm run i18n:check` | **PASS** |

| Metric | Expected | Independent |
|--------|----------|-------------|
| EN | 8624 | **8624** |
| DE | 8624 | **8624** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P243–P216 | 0 | **0** |
| Global enforce-clean | 0 | **0** |
| i18n suite | 406 | **406** |
| Shim | 29 | **29** |
| Compat consumers | — | **29** (prod 18, test 11) |

**Baseline health: PASS — no regression**

---

## 2. P243 freeze verification

| Path | Visible | Hidden | Fixed-locale | P243 |
|------|---------|--------|--------------|------|
| `OperatorBottomNav.tsx` | 0 | 0 | 0 | **0** |
| `operator-shell-navigation-i18n.ts` | 0 | 0 | 0 | **0** |

P242–P216 enforce-clean: **0** (unchanged)

---

## 3. Baseline topology

| Item | Value |
|------|-------|
| Baseline origin | Merged PR #1295 on campaign baseline line |
| Relationship to main | **PARALLEL CAMPAIGN BASELINE** — 18 commits behind `origin/main` |
| Recent main merges after P243 | Fleet health (#1277), DIMO FK (#1290), Dashboard (#1286, #1291), Fleet availability (#1275), operational projection (#1271–#1273) |
| Open Operator shell PRs | #1294 (P243 pre-flight audit), #1296 (P243 re-audit) — docs only |

---

## 4. Active workstream exclusion map

| PR | Domain | Paths / impact | P244 eligible? |
|----|--------|----------------|----------------|
| #1290 | DIMO provider FK | `vehicle_data_source_links`, backend schema | **NO** |
| #1281 | DIMO normalization | DIMO pipeline, backfill | **NO** |
| #1277 | Fleet health evaluability | Fleet health consumers | **NO** |
| #1275 / #1271–#1273 | Vehicle operational projection | Fleet operational state | **NO** |
| #1286 / #1291 / #1279 / #1282 | Dashboard | Dashboard layout/KPI | **NO** |
| #1260 / #1269 | Vehicle connectivity audit | Connectivity semantics docs/tests | **NO** (semantic) |
| #1294 / #1296 | i18n audit | docs only | N/A |
| Operator header/banner | — | **no open implementation PR** | **YES** |

---

## 5. Operator residual inventory (post-P243)

| Path | Component | Mount | Visible debt | Hidden | Fixed-locale | Machine states | Dynamic data | Coupling | Est. keys | Collision |
|------|-----------|-------|--------------|--------|--------------|----------------|--------------|----------|-----------|-----------|
| `OperatorHeader.tsx` | `OperatorHeader` | shell top | **6–8** | 1 aria | 0 (baseline) | syncState | orgName | LOW | 8–10 | **NONE** |
| `OperatorConnectivityBanner.tsx` | `OperatorConnectivityBanner` | shell top | **1** | 0 | 0 | `online` | none | LOW | 1–2 | **NONE** |
| `OperatorTodayView.tsx` | today tab | tab content | 13 | mixed | possible | offline/stale | bookings/tasks | MEDIUM | 25+ | LOW |
| `OperatorVehiclesView.tsx` | vehicles tab | tab content | 4 | — | — | filters | vehicle data | MEDIUM | 15+ | LOW |
| `OperatorTasksView.tsx` | tasks tab | tab content | 3 | — | — | filters | task titles | MEDIUM | 20+ | LOW |
| `OperatorAiUploadFlow.tsx` | AI upload | sheet | 11 | — | — | flow steps | OCR/extraction | HIGH | 30+ | MEDIUM |
| `OperatorDesktopOnlyNotice.tsx` | gate screen | non-device | 2 | — | — | — | — | LOW | 4–6 | NONE |
| `OperatorAccessDeniedScreen.tsx` | gate screen | access | 2 | — | — | denial reason | — | LOW | via `operatorAccess` | NONE |
| `OperatorEntryModal.tsx` | entry | modal | 3 | — | — | — | — | LOW | 6–8 | NONE |

Excluded frozen: P236–P243, Quick View campaign, QV blockers.

---

## 6–13. OperatorHeader deep audit

**Symbol:** `OperatorHeader`  
**Mount:** `OperatorShell` → sticky top header (all operator tabs)

### Presentation inventory

| Element | Baseline copy | Type |
|---------|---------------|------|
| Eyebrow | `Operator` | STATIC HOST |
| H1 | `orgName \|\| 'SynqDrive'` | DYNAMIC DATA |
| Loading | `Laden…` | STATIC HOST |
| Sync loading | `Sync…` | STATIC HOST (machine: `syncState.loading`) |
| Sync error | `Sync-Fehler` | STATIC HOST (machine: `syncState.error`) |
| Sync time | `formatSyncTime(lastSyncAt, formattingLocale)` | PRESENTATION FORMAT (valid locale-aware) |
| Sync empty | `—` | STATIC HOST |
| Refresh `title` | `Daten aktualisieren` | STATIC HOST |
| App link | `App` | STATIC HOST |
| `aria-label` | `Operator — ${localeMetadata.nativeName}` | STATIC HOST + locale metadata |
| `lang` | `formattingLocale` | VALID locale attribute |

### Title ownership

**MIXED** — not tab-derived. Eyebrow is static host copy; H1 is dynamic `orgName`. No tab→title mapping required.

### Actions

| Control | Callback | Args | Target | Permission | Flag |
|---------|----------|------|--------|------------|------|
| Refresh button | `triggerRefresh` | none | `refreshToken++` | NONE | NONE |
| App link | React Router `Link` | — | `/rental` | NONE | NONE |

### Sync state machine (frozen)

| Machine state | Predicate | StatusDot tone |
|---------------|-----------|----------------|
| loading | `syncState.loading` | `watch` + pulse |
| error | `syncState.error` | `critical` |
| success | `lastSyncAt` present | `success` |
| idle | else | `success` |

### Date/time

`formatSyncTime(iso, formattingLocale)` uses `toLocaleTimeString(locale, { hour, minute })` — **VALID LOCALE-AWARE** on baseline.  
**Main drift warning:** `origin/main` regressed to hardcoded `'de-DE'` and removed `useLanguage` — must NOT be absorbed; P244 branches from P243 baseline.

---

## 14–20. OperatorConnectivityBanner deep audit

**Symbol:** `OperatorConnectivityBanner`  
**Mount:** `OperatorShell` → above header, below bridges

### Presentation

| Element | Copy | Type |
|---------|------|------|
| Offline message | `Verbindung instabil oder offline — Aktionen werden erst nach erneutem Senden übernommen.` | STATIC HOST |
| Icon | `WifiOff` | frozen |
| `role` | `status` | frozen |

### Machine state

| Value | Source | Business use |
|-------|--------|--------------|
| `online` | `navigator.onLine` via `useOperatorNetworkStatus` | APP NETWORK CONNECTIVITY only |

**Not** vehicle telemetry, provider state, or fleet connectivity.

### Derivation ownership

**APP NETWORK CONNECTIVITY** — `window online/offline` events only (`useOperatorNetworkStatus.ts`).

### Callbacks

NONE — display-only banner. No retry/dismiss/details.

### Timestamps

NONE.

### Collision gate (§22)

Fleet/DIMO/vehicle connectivity PRs affect **different semantics**. Banner is isolated. **Collision: NONE**

---

## 21. Header + banner combination decision

**ONE SHARED SHELL-CHROME SLICE**

Rationale:
- Both are pure top shell presentation chrome
- No vehicle/provider semantic coupling in banner
- Combined scope: 2 components + 1–2 adapters, ~9–12 keys total
- Coherent test strategy (shell mount, locale switch, sync/offline predicates)
- P243 pre-flight forecast explicitly bundled banner with header (banner too small alone)
- No active implementation collision

---

## 22–31. Challengers (summary)

| Challenger | Score / verdict | Why not P244 |
|------------|-----------------|--------------|
| Operator Tasks | Debt 3+task cards | Business task data, `apiTaskPriorityLabelDe` |
| Operator Notifications | N/A dedicated surface | No isolated notifications chrome |
| Header-only | Strong (36/50) | Viable but leaves 1-string banner orphaned |
| Connectivity-only | Weak alone (28/50) | Too small; bundled with header |
| Rental | Deferred | No stable isolated candidate vs shell chrome |
| Customer | Deferred | No production-reachable bounded slice |
| App Shell | Partial | Operator shell continuation stronger |
| Dashboard | **EXCLUDED** | Active #1286/#1291 work |
| Vehicle/Fleet | **DEFERRED** | Active semantic work (#1275–#1290) |

---

## 35. Top-12 global ranking (score /50)

| Rank | Candidate | Score | Est. keys | Files | Risk |
|------|-----------|-------|-----------|-------|------|
| 1 | **Operator Header + Connectivity Banner** | **44** | 9–12 | 2–3 | 1 |
| 2 | Operator Header only | 36 | 8–10 | 2 | 1 |
| 3 | Operator Desktop Only Notice | 32 | 4–6 | 1–2 | 1 |
| 4 | Operator Today stale/offline banners | 30 | 12–15 | 2+ | 2 |
| 5 | Operator Connectivity Banner only | 28 | 1–2 | 1–2 | 1 |
| 6 | Operator Entry Modal | 26 | 6–8 | 2 | 1 |
| 7 | Operator Vehicles view chrome | 24 | 15+ | 3+ | 2 |
| 8 | Operator Tasks view chrome | 22 | 20+ | 3+ | 2 |
| 9 | Operator Access Denied screen | 20 | 4–6 | 2 | 1 |
| 10 | Operator Today view (full) | 18 | 25+ | 4+ | 3 |
| 11 | Operator AI Upload flow | 16 | 30+ | 5+ | 3 |
| 12 | Rental isolated surface | 14 | varies | — | 3 |

---

## 36. Top-5 comparison (abbreviated)

| Criterion | Header+Banner | Header only | Today banners | Desktop notice | Entry modal |
|-----------|---------------|-------------|---------------|----------------|-------------|
| Visibility | 5 | 5 | 4 | 3 | 2 |
| Boundedness | 5 | 5 | 3 | 5 | 4 |
| Collision safety | 5 | 5 | 4 | 5 | 5 |
| Category E | 5 | 5 | 3 | 5 | 4 |
| Campaign leverage | 5 | 4 | 4 | 2 | 2 |

---

## 37–39. Campaign direction & target

**CAMPAIGN: A — CONTINUE OPERATOR**

**P2.2.44 — Operator Header + Connectivity Banner Localization**

**SPLIT DECISION: ONE SLICE** (shared top shell chrome)

---

## 40. Exact production boundary

```
P244_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorHeader.tsx',
  'operator/components/OperatorConnectivityBanner.tsx',
  'operator/lib/operator-shell-top-chrome-i18n.ts',
]
```

| Path | Responsibility |
|------|----------------|
| `OperatorHeader.tsx` | Top shell header chrome wiring |
| `OperatorConnectivityBanner.tsx` | Offline network banner wiring |
| `operator-shell-top-chrome-i18n.ts` | Presentation adapter (sync state + offline → keys) |

**Mount:** `OperatorShell` → all operator-device routes  
**Audience:** Operator staff on mobile/tablet

### Machine/domain freeze

| Value | Localize label? | Frozen |
|-------|-----------------|--------|
| `syncState.loading/error/lastSyncAt` | label only | predicates unchanged |
| `orgName` | NO | raw dynamic |
| `formattingLocale` | NO | locale plumbing |
| `localeMetadata.nativeName` | NO in aria var | metadata value |
| `online` | label only | `navigator.onLine` predicate |
| `triggerRefresh` | NO | callback |
| `/rental` link | NO | route |
| StatusDot tone | NO | machine mapping |

### Key reuse audit

| Concept | Strategy |
|---------|----------|
| Loading (`Laden…`) | **SEMANTIC REUSE** `common.loading` |
| Refresh title | **NEW** `operator.header.refreshTitle` |
| Sync loading/error/empty | **NEW** `operator.header.sync.*` |
| Eyebrow `Operator` | **NEW** `operator.header.eyebrow` |
| App link | **NEW** `operator.header.appLink` (or semantic reuse if added) |
| aria label | **NEW** `operator.header.ariaLabel` with `{localeName}` |
| Offline banner | **NEW** `operator.connectivity.offlineMessage` |

**Estimated new keys: 9–12** (within budget)

### Adapter strategy

**NEW SHARED OPERATOR SHELL PRESENTATION ADAPTER** — `operator-shell-top-chrome-i18n.ts`

Exports (presentation only):
- `operatorShellHeaderSyncLabel(locale, syncState)` — machine sync state → label
- `operatorShellHeaderEyebrow(locale)`
- `operatorShellHeaderRefreshTitle(locale)`
- `operatorShellHeaderAppLink(locale)`
- `operatorShellHeaderAriaLabel(locale, localeNativeName)`
- `operatorShellConnectivityOfflineMessage(locale)`

### Extraction strategy

**NO STRUCTURAL CHANGE REQUIRED** — localize strings in place via adapter at render.

---

## 51–55. Feasibility

| Gate | Result |
|------|--------|
| Category E feasibility | **YES** — presentation-only |
| Active collision | **NONE** |
| Main drift (selected paths) | **LOW** — main regressed header locale wiring; implementation must use P243 baseline |
| Baseline strategy | **DIRECT FROM P243 MERGE BASELINE** (`e5bd8ee`) |

---

## 57. Campaign forecast (not authorized)

| Slice | Likely target |
|-------|---------------|
| P244 | Header + Connectivity Banner |
| P245 | Operator Desktop Only Notice OR Today stale/offline banners |
| P246 | Operator Entry Modal OR Vehicles view chrome |

---

## 60. Final verdict

**A — GO — P2.2.44 TARGET SELECTED**

**P2.2.44 — Operator Header + Connectivity Banner Localization**

**CAMPAIGN:** OPERATOR

**IMPLEMENTATION NOT STARTED.**

---

*Audit-only artifact. No production, dictionary, test, or scanner changes.*
