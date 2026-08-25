# P2.2.42 — Post-P241 Next-Slice Pre-Flight

**Date:** 2026-08-25  
**Mode:** Strict read-only target selection  
**Authoritative baseline:** `1418f52e23d74e459272ddcf842fe861f169526e` (merged PR #1285 — P2.2.41)  
**Current main SHA:** `b192aa687b7fb10869d1c2edfea47b9feac81584`

---

## 1. Baseline hard gate

| Check | Result |
|-------|--------|
| Baseline SHA | `1418f52e23d74e459272ddcf842fe861f169526e` ✓ |
| P241 merge ancestry | YES — `feat(i18n): P2.2.41 Operator Today + Scan Booking Cards localization (#1285)` |
| Working tree | Clean (excluding unrelated untracked audit file) |
| `npm run i18n:check` | **PASS** |

### Independent metrics (post-P241)

| Metric | Expected | Actual |
|--------|----------|--------|
| EN | 8610 | **8610** |
| DE | 8610 | **8610** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P241 | 0 | **0** |
| P240–P216 | 0 | **0** |
| Global enforce-clean | 0 | **0** |
| i18n suite count | — | **395** |
| Shim | 29 | **29** |
| New compatibility consumers | 0 | **0** |

**Baseline health: PASS — no regression.**

---

## 2. P241 freeze verification

| Frozen surface | Visible | Hidden | Fixed-locale | Enforce-clean |
|----------------|--------:|-------:|-------------:|--------------:|
| `OperatorBookingCard.tsx` | 0 | 0 | 0 | 0 |
| `OperatorScanBookingCard.tsx` | 0 | 0 | 0 | 0 |
| `operator-booking-card-i18n.ts` | 0 | 0 | 0 | 0 |
| P240 Detail | 0 | — | — | 0 |
| P239 More | 0 | — | — | 0 |
| P238 Documents | 0 | — | — | 0 |
| P237 Cancel/No-Show | 0 | — | — | 0 |
| P236 Form | 0 | — | — | 0 |

**P241 freeze: VERIFIED**

---

## 3. Baseline topology

| Item | Classification |
|------|----------------|
| Baseline `1418f52e` | **PARALLEL CAMPAIGN BASELINE** (P240 merge line + P241) |
| vs `origin/main` `b192aa687` | **BEHIND MAIN** by 136 commits |
| Recent main merges after P241 | #1281 DIMO provider-link, #1279/#1282 dashboard layout, fleet P0.2/P0.3, connectivity |
| Open PRs touching Operator scan/shell | **NONE** on selected paths |

---

## 4. Active workstream exclusion map

| PR | Domain | Changed paths (summary) | P242 eligible? | Collision |
|----|--------|-------------------------|----------------|-----------|
| **#1281** (MERGED) | DIMO provider-link | `backend/modules/dimo/*`, vehicle projection | NO — backend/semantic | **NONE** on Operator scan view |
| **#1277** (OPEN) | Fleet health evaluability | `fleet-health-evaluation/*`, `FleetOperatorRow` | NO — fleet/health | **NONE** on scan view chrome |
| **#1286** (OPEN) | Dashboard utilization month nav | `DashboardUtilizationPanel.tsx`, test | NO — dashboard exclusion | **NONE** |
| **#1285** (MERGED) | P2.2.41 Booking Cards | frozen card paths | Frozen | N/A |

**Exclusion verdict:** Fleet/Vehicle/Dashboard/DIMO paths excluded. No collision with scan search UX chrome target.

---

## 5. Operator residual inventory (top surfaces)

| Path | Component | Mount | Debt* | Machine/dynamic | Coupling | Est. keys | Collision |
|------|-----------|-------|------:|-----------------|----------|----------:|-----------|
| `OperatorScanView.tsx` | Scan search chrome | scan tab | **~12†** | scanQuery, results | search hook frozen | 10–12 | **NONE** |
| `OperatorBottomNav.tsx` | Tab labels | shell | **~6†** | tab IDs | navigation | 6 | **NONE** |
| `OperatorTodayView.tsx` | Today shell/sections | today tab | 13 | tasks, alerts, banners | broad | 18–22 | LOW |
| `OperatorHeader.tsx` | Shell header/sync | shell | 2‡ + ~6† | orgName, sync time | sync state | 8–10 | LOW |
| `OperatorTasksView.tsx` | Tasks list chrome | tasks tab | 4 | dynamic titles | task mutations | 12+ | LOW |
| `OperatorTaskCard.tsx` | Task row | tasks | 4 | dynamic titles | tasks | 12–18 | LOW |
| `OperatorVehiclesView.tsx` | Vehicles list | vehicles tab | 4 | vehicle data | fleet | 8–12 | **MEDIUM** |
| `OperatorScanVehicleCard.tsx` | Scan vehicle hit | ScanView | ~8† | health badges | **fleet/health** | 20+ | **MEDIUM** |
| `OperatorConnectivityBanner.tsx` | Offline banner | shell | 1 | online predicate | connectivity | 2 | LOW |
| `OperatorDesktopOnlyNotice.tsx` | Desktop gate | shell | ~5† | device check | entry | 6 | LOW |
| `OperatorAiUploadFlow.tsx` | AI upload wizard | sheet | 11 | documents | upload | 30+ | LOW |
| `operator/lib/operatorStatus.ts` | Vehicle badges | vehicle cards | ~12† | operational status | **fleet/health** | 15+ | **HIGH** |

\* Scanner inventory count where listed; † manual code audit; ‡ scanner only.

**Quick View / P216–P241:** frozen — excluded.

---

## 6. Operator Shell chrome deep audit

**Shell stack:** `OperatorShell` → `OperatorHeader` + `OperatorConnectivityBanner` + tab content + `OperatorBottomNav`

| Surface | Host-owned debt | Notes |
|---------|----------------|-------|
| `OperatorBottomNav` | 5 tab labels + aria | Machine tab IDs: `today`, `scan`, `vehicles`, `tasks`, `more` |
| `OperatorHeader` | Operator eyebrow, sync labels, App link, refresh title | `orgName` dynamic; sync time uses valid `formattingLocale` |
| `OperatorConnectivityBanner` | 1 offline message | Predicate: `!online` |
| `OperatorDesktopOnlyNotice` | title, body, back link | Entry gate only |

**Shell chrome total:** ~14–18 strings across 4 files — broader than single-slice boundary unless split.

---

## 7. Operator tab label audit

| Machine tab ID | Visible label (DE) | Icon | Localized? | Debt |
|----------------|-------------------|------|------------|------|
| `today` | Heute | CalendarDays | NO | YES |
| `scan` | Scan | ScanLine | NO | partial (loanword) |
| `vehicles` | Fahrzeuge | Car | NO | YES |
| `tasks` | Aufgaben | ListTodo | NO | YES |
| `more` | Mehr | MoreHorizontal | NO | YES |

Tab IDs and `setActiveTab` callbacks **must remain frozen**.

---

## 8. Operator shell navigation freeze

| Mechanism | Source | Frozen |
|-----------|--------|--------|
| `activeTab` | `OperatorShellContext` | YES |
| `setActiveTab` | context | YES |
| Deep link `?tab=` | `resolveOperatorDeepLink` | YES |
| Route params `vehicles/:id`, `bookings/:id` | `OperatorApp` routes | YES |
| `scanQuery` / `setScanQuery` | context | YES (Scan slice must not alter) |
| Tab order in `NAV_ITEMS` | `OperatorBottomNav` | YES |

---

## 9. Scan Search UX deep audit

**Path:** `frontend/src/operator/views/OperatorScanView.tsx`  
**Mount:** `OperatorShell` → `activeTab === 'scan'`

| Element | Baseline text | Localize? | Freeze |
|---------|--------------|-----------|--------|
| Search placeholder | `Kennzeichen, Fahrzeug oder Buchungs-ID` | YES | `scanQuery` value raw |
| Scanner instruction title | `Kennzeichen eingeben` | YES | — |
| Scanner hint body | `QR-Scanner später verfügbar…` | YES | feature flag semantics |
| No-query empty title | `Fahrzeug oder Buchung suchen` | YES | `!hasQuery` predicate |
| No-query empty desc | `Kennzeichen, Modell oder Buchungs-ID eingeben…` | YES | — |
| No-results title | `Kein Treffer` | YES | `hasQuery && empty` predicate |
| No-results desc | `Anderes Kennzeichen, Fahrzeugname…` | YES | — |
| Section header bookings | `Buchungen` | YES | result order frozen |
| Section header vehicles | `Fahrzeuge` | YES | result order frozen |
| Tablet detail placeholder | `Fahrzeug aus der Suche wählen` | YES | `selectedVehicleId` frozen |
| Mobile back CTA | `← Zurück zur Suche` | YES | `setSelectedVehicleId(null)` |
| `bookingsError` | API error string | NO | **dynamic raw** |
| P241 booking cards | localized | frozen | P241 |
| P241 vehicle cards | not in scope | defer | fleet coupling |

---

## 10. Scan query semantics freeze

| Concern | Source | Implementation must not touch |
|---------|--------|------------------------------|
| Query state | `scanQuery` in `OperatorShellContext` | setter, normalization |
| Trim threshold | `useOperatorScanSearch` (`trimmed.length < 2`) | predicate |
| UUID direct lookup | hook `isUuidLike` + `api.bookings.get` | logic |
| List search | `api.bookings.list({ search, limit: 12 })` | API args |
| Vehicle filter | `useOperatorVehiclesData(trimmed)` | matching |
| Result dedup/order | hook merge loop | ordering |
| Focused booking fetch | hook `focusedBookingId` effect | identity |
| Auto-select single vehicle | `OperatorScanView` effect | predicate values |
| Clear on type | `setFocusedBookingId(null)` on input change | callback |

**Locale must never influence search behavior.**

---

## 11. Scan empty / no-result states

| State | Predicate | Copy |
|-------|-----------|------|
| NO QUERY | `!loading && !hasQuery` | empty title + desc |
| SEARCHING | `loading && hasQuery` | `SkeletonRows` only (no new copy) |
| NO RESULTS | `hasQuery && bookings.length===0 && vehicles.length===0` | title + desc |
| RESULTS FOUND | sections render | section headers only |
| ERROR | `bookingsError` truthy | **raw API message** |

---

## 12. Scan result count

No explicit result count label in `OperatorScanView`. **N/A** — section headers only.

---

## 13. Shell vs Scan comparison

| Criterion | Shell Bottom Nav | Scan Search UX |
|-----------|------------------|----------------|
| User visibility | Always on (all tabs) | Scan tab primary |
| Debt density | ~6 strings | **~12 strings** |
| Boundedness | 1 file | **1 file** |
| Machine/query coupling | Tab IDs only | **Query frozen in hook** (out of scope) |
| Campaign continuity | General shell | **Completes Scan tab after P241 cards** |
| Testability | High | **High** (query preservation tests) |
| Collision risk | NONE | **NONE** |
| Est. new keys | 6 | **10–12** |
| Score (0–50) | **40** | **43** |

**Repository evidence favors Scan Search UX** — higher debt density, completes Scan tab presentation unit started in P241, still single-file bounded scope. Bottom Nav remains strongest **P243** candidate.

---

## 14–21. Challenger summary

| Challenger | Score | Notes |
|------------|------:|-------|
| **Scan Search UX** | **43** | **Selected** |
| Operator Bottom Nav | 40 | Small; excellent P243 |
| Operator Today View chrome | 38 | Broader; task/alert coupling |
| Operator Header chrome | 34 | Sync/time already locale-aware |
| Operator Task Card | 32 | Dynamic titles |
| Operator Connectivity Banner | 28 | 1 string |
| Rental/Customer/Dashboard | <25 | No stronger bounded candidate |
| Vehicle/Fleet | — | **DEFERRED** (#1277, #1281, `OperatorScanVehicleCard`) |

---

## 22. Top-12 ranking

| Rank | Candidate | Score | Est. keys | Files | Risk |
|-----:|-----------|------:|----------:|------:|-----:|
| 1 | **Operator Scan Search UX** | 43 | 10–12 | 1–2 | 1 |
| 2 | Operator Bottom Nav | 40 | 6 | 1 | 1 |
| 3 | Operator Today View chrome (partial) | 38 | 18–22 | 1 | 2 |
| 4 | Operator Header chrome | 34 | 8–10 | 1 | 1 |
| 5 | Operator Task Card | 32 | 12–18 | 2 | 2 |
| 6 | Operator Connectivity Banner | 28 | 2 | 1 | 1 |
| 7 | Operator Desktop Only Notice | 26 | 6 | 1 | 1 |
| 8 | Operator Vehicles View | 26 | 8–12 | 2 | 3 |
| 9 | Operator Tasks View chrome | 24 | 12+ | 2 | 2 |
| 10 | Operator AI Upload (subset) | 22 | 25+ | 4+ | 3 |
| 11 | Rental booking list row | 20 | 15+ | 3+ | 3 |
| 12 | Customer detail modal chrome | 18 | 12+ | 2+ | 3 |

---

## 23. Campaign direction

**A — CONTINUE OPERATOR**

Scan Search UX outranks Shell Bottom Nav on debt density and Scan-tab completion while remaining a single-file bounded slice. No external domain exceeds score 43 without fleet/dashboard coupling.

---

## 24. Selected P242 target

### **P2.2.42 — Operator Scan Search UX Localization**

---

## 25. Split decision

**ONE SLICE** — `OperatorScanView` presentation chrome only (excludes P241 cards, vehicle cards, search hook).

---

## 26. Exact production boundary

| Path | Role |
|------|------|
| `frontend/src/operator/views/OperatorScanView.tsx` | Scan search UI chrome |
| `frontend/src/operator/lib/operator-scan-search-i18n.ts` | **NEW** presentation adapter |

### Mount / audience

| Item | Value |
|------|-------|
| Mount | `OperatorShell` → `OperatorTabContent` → `case 'scan'` |
| Audience | Operator — scan tab |
| Route | `/operator` with `activeTab=scan` or deep-link scan |

### Out of scope (frozen)

- `useOperatorScanSearch.ts` — query/API/matching/ranking
- `OperatorShellContext` — `scanQuery`, `setScanQuery`, tab state
- `OperatorScanBookingCard.tsx` — P241 frozen
- `OperatorScanVehicleCard.tsx` — fleet/health coupling (defer)
- `OperatorBookingDetailSheet` — P240 frozen
- P236–P239 frozen surfaces

---

## 27. Machine / domain freeze matrix

| Value | May localize? | Must stay unchanged |
|-------|---------------|---------------------|
| `scanQuery` | NO | raw query string in input |
| `setScanQuery` | NO | callback identity |
| `focusedBookingId` | NO | selection identity |
| `selectedVehicleId` | NO | QV target |
| `hasQuery` | NO | predicate (`trimmed.length >= 2`) |
| `bookings` / `vehicles` order | NO | map order from hook |
| `bookingId` / `vehicleId` in results | NO | keys + callbacks |
| customer/vehicle/plate names | NO | raw dynamic |
| `bookingsError` | NO | raw API message |
| handover/detail callbacks | NO | frozen from baseline |

---

## 28. Key reuse audit (preview)

| Concept | Strategy |
|---------|----------|
| Search placeholder | **NEW** `operator.scan.searchPlaceholder` (operator-specific tri-field hint) |
| No-results title | **SEMANTIC REUSE** candidate `topbar.noResults` — evaluate EN/DE fit |
| Back to search | **NEW** or reuse `common.back` + context string |
| Section bookings | **SEMANTIC REUSE** candidate `nav.bookings` / `bookings.title` |
| Section vehicles | **NEW** `operator.scan.section.vehicles` (Operator uses "Fahrzeuge" not "Flotte") |
| Scanner/empty/helper copy | **NEW** `operator.scan.*` keys |
| Dynamic query echo | **DYNAMIC — DO NOT TRANSLATE** |

**Estimated new keys:** 10–12 EN+DE (≤30 budget)

---

## 29. Adapter strategy

**NEW BOUNDED P242 PRESENTATION ADAPTER** — `operator-scan-search-i18n.ts`

Pattern mirrors P241 `operator-booking-card-i18n.ts`. No business logic.

---

## 30. Extraction strategy

**KEEP EXISTING COMPONENT** — no structural split required.

---

## 31. P242 enforce-clean (future)

```text
P242_ENFORCE_CLEAN_EXACT = [
  'operator/views/OperatorScanView.tsx',
  'operator/lib/operator-scan-search-i18n.ts',
]
```

Exclude P216–P241 frozen paths, `useOperatorScanSearch.ts`, vehicle cards, fleet/health libs, dashboard #1286 paths, dynamic API errors.

---

## 32. Test contract (future)

`operator-scan-search-localization.test.tsx` — minimum:

- EN / DE render scan chrome states (no-query, no-results, with-results mock)
- Same-mount locale switch preserves `scanQuery`, result IDs, order
- Placeholder/helper/empty copy localized
- `bookingsError` raw message preserved
- Details/handover callbacks untouched (mock P241 cards)
- Raw TranslationKey leakage = 0
- Query input value unchanged across locale switch

---

## 33. Category E feasibility

**YES** — presentation-only string substitution in view layer; search hook and context state unchanged.

---

## 34. Active collision

**NONE** on selected production paths.

---

## 35. Current main drift

| Path | baseline → main | Classification |
|------|-----------------|----------------|
| `OperatorScanView.tsx` | Cosmetic class/radius only | **LOW** |
| `OperatorBottomNav.tsx` | No diff | **NONE** |

**Baseline strategy: DIRECT FROM P241 MERGE BASELINE (`1418f52e`)**

---

## 36. Campaign forecast

| Slice | Estimate |
|-------|----------|
| **P242** | Scan Search UX — selected |
| P243 | Operator Bottom Nav OR Operator Header chrome |
| P244 | Operator Today View section chrome (partial) |

---

## 37. Final verdict

### **A — GO — P2.2.42 TARGET SELECTED**

**P2.2.42 — Operator Scan Search UX Localization**

**CAMPAIGN:** OPERATOR

**SPLIT:** ONE SLICE

**IMPLEMENTATION NOT STARTED.**

---

*Audit-only artifact. No production, dictionary, test, scanner, or architecture changes.*
