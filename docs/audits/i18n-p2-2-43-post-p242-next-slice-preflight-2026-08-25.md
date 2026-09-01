# P2.2.43 — Post-P242 Next-Slice Pre-Flight

**Date:** 2026-08-25  
**Mode:** Strict read-only target selection  
**Authoritative baseline:** `509d0ce129402dc2e578e2866b83e4ef09ab52d3` (merged PR #1292 — P2.2.42)  
**Current main SHA:** `476992dba7fb10869d1c2edfea47b9feac81584`

---

## 1. Baseline hard gate

| Check | Result |
|-------|--------|
| Baseline SHA | `509d0ce129402dc2e578e2866b83e4ef09ab52d3` ✓ |
| P242 merge ancestry | YES — `P2.2.42 — Operator Scan Search UX Localization (#1292)` |
| Working tree | Clean (excluding unrelated untracked audit file) |
| `npm run i18n:check` | **PASS** |

### Independent metrics (post-P242)

| Metric | Expected | Actual |
|--------|----------|--------|
| EN | 8620 | **8620** |
| DE | 8620 | **8620** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P242 | 0 | **0** |
| P241–P216 | 0 | **0** |
| Global enforce-clean | 0 | **0** |
| i18n suite count | — | **396** |
| Shim | 29 | **29** |
| New compatibility consumers | 0 | **0** |

**Baseline health: PASS — no regression.**

---

## 2. P242 freeze verification

| Frozen surface | Visible | Hidden | Fixed-locale | Enforce-clean |
|----------------|--------:|-------:|-------------:|--------------:|
| `OperatorScanView.tsx` | 0 | 0 | 0 | 0 |
| `operator-scan-search-i18n.ts` | 0 | 0 | 0 | 0 |
| P241 Booking Cards | 0 | — | — | 0 |
| P240 Detail | 0 | — | — | 0 |
| P239 More | 0 | — | — | 0 |
| P238 Documents | 0 | — | — | 0 |
| P237 Cancel/No-Show | 0 | — | — | 0 |
| P236 Form | 0 | — | — | 0 |

**P242 freeze: VERIFIED**

---

## 3. Baseline topology

| Item | Classification |
|------|----------------|
| Baseline `509d0ce` | **PARALLEL CAMPAIGN BASELINE** (P241 merge line + P242) |
| vs `origin/main` `476992dba` | **BEHIND MAIN** by 140 commits |
| Recent main merges after P242 | #1290 DIMO FK, dashboard KPI typography (#1291), production audits |
| Open PRs touching Operator shell/nav | **NONE** on selected paths |

---

## 4. Active workstream exclusion map

| PR | Domain | P243 eligible? | Collision |
|----|--------|------------------|-----------|
| **#1290** (MERGED) | DIMO provider FK | NO — backend/schema | **NONE** on BottomNav |
| **#1281** (MERGED) | DIMO provider-link | NO — backend/fleet | **NONE** |
| **#1277** (OPEN) | Fleet health evaluability | NO — fleet/health | **NONE** on shell nav |
| **#1286** (MERGED) | Dashboard utilization | NO — dashboard | **NONE** |
| Operator shell/nav open PRs | — | — | **NONE** |

**Exclusion verdict:** Fleet/Vehicle/Dashboard/DIMO paths excluded. No collision with shell navigation target.

---

## 5. Operator residual inventory (top surfaces)

| Path | Component | Mount | Debt† | Coupling | Est. keys | Collision |
|------|-----------|-------|------:|----------|----------:|-----------|
| **`OperatorBottomNav.tsx`** | Tab labels + aria | shell fixed bottom | **6** | tab IDs only | **6–8** | **NONE** |
| `OperatorHeader.tsx` | Org/sync/App chrome | shell header | **7–8** | orgName dynamic | 8–10 | LOW |
| `OperatorConnectivityBanner.tsx` | Offline hint | shell banner | **1** | online predicate | 1–2 | LOW |
| `OperatorTodayView.tsx` | Today sections/banners | today tab | **13+** | tasks/alerts | 18–22 | LOW |
| `OperatorTasksView.tsx` | Task list chrome | tasks tab | **12+** | dynamic titles | 15–20 | LOW |
| `OperatorVehiclesView.tsx` | Vehicle list/filters | vehicles tab | **8+** | fleet/health | 10–14 | **MEDIUM** |
| `OperatorDesktopOnlyNotice.tsx` | Desktop gate | entry | **5** | device check | 5–6 | LOW |
| `OperatorScanVehicleCard.tsx` | Scan vehicle hit | scan results | **8+** | **fleet/health** | 20+ | **MEDIUM** |
| `operator/lib/operatorStatus.ts` | Vehicle badges | cards | **12+** | operational status | 15+ | **HIGH** |

\* Scanner inventory where listed; † manual code audit of host-owned strings.  
**Quick View / P216–P242:** frozen — excluded.

---

## 6. Operator shell root deep audit

**Shell stack:** `OperatorShell` → `OperatorHeader` + `OperatorConnectivityBanner` + `OperatorTabContent` + `OperatorBottomNav` + `OperatorActionSheets`

| Surface | Host-owned debt | Notes |
|---------|----------------|-------|
| `OperatorBottomNav` | 5 tab labels + nav aria | **Only navigation chrome** — single `NAV_ITEMS` source |
| `OperatorHeader` | Operator eyebrow, sync labels, refresh title, App link, aria | `orgName` dynamic; sync time uses valid `formattingLocale` |
| `OperatorConnectivityBanner` | 1 offline message | Predicate: `!online` |
| `OperatorDesktopOnlyNotice` | title, body, back link | Entry gate only (not always mounted) |

**No separate desktop sidebar or top-tab navigation exists.** Mobile bottom nav is the sole tab navigation surface across breakpoints.

---

## 7. Operator tab inventory

| Machine tab ID | Visible label (DE) | Icon | Localized? | Debt |
|----------------|-------------------|------|------------|------|
| `today` | Heute | CalendarDays | NO | YES |
| `scan` | Scan | ScanLine | partial (loanword) | partial |
| `vehicles` | Fahrzeuge | Car | NO | YES |
| `tasks` | Aufgaben | ListTodo | NO | YES |
| `more` | Mehr | MoreHorizontal | NO | YES |

Tab IDs, `OPERATOR_TABS` order, and `setActiveTab` callbacks **must remain frozen**.

---

## 8–11. Navigation architecture

| Concern | Implementation | Frozen |
|---------|----------------|--------|
| Tab machine IDs | `operatorTypes.ts` `OperatorTab` | YES |
| Tab order | `NAV_ITEMS` in `OperatorBottomNav.tsx` | YES — `today, scan, vehicles, tasks, more` |
| Desktop nav | **None** — shared bottom nav only | N/A |
| Mobile nav | `OperatorBottomNav` fixed bottom | YES |
| Active state | `activeTab === item.id` | YES |
| Callback | `setActiveTab(item.id)` | YES |
| React keys | `key={item.id}` | YES |
| Badges/counts on tabs | **None** | N/A |

**Desktop + mobile combination decision: ONE SHARED SHELL CHROME SLICE** — single `NAV_ITEMS` data source, no split required.

---

## 12–25. Shell sub-audits (selected target scope)

### In scope (P243)

| Element | Baseline text | Localize? |
|---------|--------------|-----------|
| Tab label `today` | Heute | YES (reuse `common.today`) |
| Tab label `scan` | Scan | YES |
| Tab label `vehicles` | Fahrzeuge | YES |
| Tab label `tasks` | Aufgaben | YES (reuse `nav.tasks`) |
| Tab label `more` | Mehr | YES |
| Nav `aria-label` | Operator navigation | YES |

### Out of scope (defer P244+)

| Surface | Reason |
|---------|--------|
| `OperatorHeader` | Separate bounded slice; sync/org presentation |
| `OperatorConnectivityBanner` | 1 string — too small alone; bundle with header in P244 |
| `OperatorDesktopOnlyNotice` | Entry gate, not persistent shell |
| Sheet launches | Frozen P236–P239 |
| Permissions / feature flags | **NONE** in BottomNav |

---

## 13. Shell vs alternatives comparison

| Criterion | Bottom Nav | Header chrome | Today View chrome |
|-----------|------------|---------------|-------------------|
| User visibility | Always on (all tabs) | Always on | Today tab only |
| Debt density | **6 strings** | 7–8 strings | 13+ strings |
| Boundedness | **1 file** | 1 file | 1 file, broader coupling |
| Machine coupling | Tab IDs only | orgName, sync state | tasks, alerts, bookings |
| Testability | **High** | High | Medium |
| Collision risk | **NONE** | LOW | LOW |
| Est. new keys | **4–6** (+2 reuse) | 8–10 | 18–22 |
| Score (0–50) | **42** | 36 | 35 |

**Repository evidence confirms prior forecast:** Shell navigation chrome (implemented as `OperatorBottomNav`) is the strongest bounded Operator target after P242.

---

## 14–33. Challenger summary

| Challenger | Score | Notes |
|------------|------:|-------|
| **Operator Shell Navigation Chrome** | **42** | **Selected** |
| Operator Header chrome | 36 | P244 candidate |
| Operator Today View chrome | 35 | Broader task/alert coupling |
| Operator Connectivity Banner | 28 | Too small alone |
| Operator Task list chrome | 30 | Dynamic titles |
| Operator Vehicles View | 26 | Fleet filter coupling |
| Rental/Customer/Dashboard | <22 | No stronger bounded slice |
| Vehicle/Fleet | — | **DEFERRED** (#1277, `OperatorScanVehicleCard`, `operatorStatus.ts`) |

---

## 15. Top-12 ranking

| Rank | Candidate | Score | Est. keys | Files | Risk |
|-----:|-----------|------:|----------:|------:|-----:|
| 1 | **Operator Shell Navigation Chrome** | 42 | 6–8 | 1–2 | 1 |
| 2 | Operator Header chrome | 36 | 8–10 | 1–2 | 1 |
| 3 | Operator Today View chrome (partial) | 35 | 18–22 | 1 | 2 |
| 4 | Operator Connectivity Banner | 28 | 1–2 | 1 | 1 |
| 5 | Operator Desktop Only Notice | 27 | 5–6 | 1 | 1 |
| 6 | Operator Tasks View chrome | 30 | 15–20 | 2 | 2 |
| 7 | Operator Vehicles View | 26 | 10–14 | 2 | 3 |
| 8 | Operator AI Upload (subset) | 22 | 25+ | 4+ | 3 |
| 9 | Rental booking list row | 20 | 15+ | 3+ | 3 |
| 10 | Customer detail modal chrome | 18 | 12+ | 2+ | 3 |
| 11 | App Shell shared topbar | 16 | 10+ | 2+ | 3 |
| 12 | Dashboard KPI chrome | 14 | 12+ | 2+ | 3 |

---

## 16. Campaign direction

**A — CONTINUE OPERATOR**

Shell navigation chrome outranks Header and Today View on boundedness, collision safety, and forecast alignment. No external domain exceeds score 42 without fleet/dashboard coupling.

---

## 17. Selected P243 target

### **P2.2.43 — Operator Shell Navigation Chrome Localization**

**Scope:** `OperatorBottomNav.tsx` only — the sole production tab navigation surface (mobile bottom nav used across all breakpoints).

---

## 18. Split decision

**ONE SLICE** — bottom navigation chrome only. Header and connectivity banner deferred to P244.

---

## 19. Exact production boundary

| Path | Role |
|------|------|
| `frontend/src/operator/components/OperatorBottomNav.tsx` | Tab navigation chrome |
| `frontend/src/operator/lib/operator-shell-navigation-i18n.ts` | **NEW** presentation adapter |

### Mount / audience

| Item | Value |
|------|-------|
| Mount | `OperatorShell` → fixed bottom `<nav>` |
| Audience | Operator — all tabs |
| Route | `/operator` (all tab states) |

### Out of scope (frozen)

- `OperatorShellContext` — `activeTab`, `setActiveTab`, tab state
- `operator/lib/operatorTypes.ts` — `OperatorTab`, `OPERATOR_TABS`
- `OperatorHeader.tsx`, `OperatorConnectivityBanner.tsx` — P244
- P242 Scan Search, P241 cards, P240–P236 frozen surfaces
- `OperatorActionSheets` — sheet IDs/callbacks frozen

---

## 20. Machine / domain freeze matrix

| Value | May localize? | Must stay unchanged |
|-------|---------------|---------------------|
| Tab IDs `today/scan/vehicles/tasks/more` | NO | machine values |
| `NAV_ITEMS` order | NO | locale-independent order |
| `setActiveTab(item.id)` | NO | callback + args |
| `activeTab === item.id` | NO | selection predicate |
| `key={item.id}` | NO | React identity |
| `aria-current` | NO | predicate only |
| Tab badge counts | N/A | none present |
| Icons | NO | Lucide components unchanged |

---

## 21. Key reuse audit (preview)

| Concept | Strategy |
|---------|----------|
| Tab `today` | **EXACT REUSE** `common.today` |
| Tab `tasks` | **EXACT REUSE** `nav.tasks` |
| Tab `scan` | **NEW** `operator.navigation.tab.scan` (loanword; distinct from `operator.more.nav.scan` phrasing) |
| Tab `vehicles` | **NEW** `operator.navigation.tab.vehicles` (Operator uses "Fahrzeuge", not `nav.fleet`) |
| Tab `more` | **NEW** `operator.navigation.tab.more` |
| Nav aria-label | **NEW** `operator.navigation.ariaLabel` |

**Estimated new keys:** 4–6 EN+DE (≤30 budget)

---

## 22. Adapter strategy

**NEW OPERATOR SHELL PRESENTATION ADAPTER** — `operator-shell-navigation-i18n.ts`

Pattern mirrors P242 `operator-scan-search-i18n.ts`. Tab ID → label map only. No navigation logic.

---

## 23. Extraction strategy

**KEEP EXISTING SHELL CONFIG** — localize `NAV_ITEMS` labels via adapter lookup by tab ID at render time. No structural split.

---

## 24. P243 enforce-clean (future)

```text
P243_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorBottomNav.tsx',
  'operator/lib/operator-shell-navigation-i18n.ts',
]
```

Exclude P216–P242 frozen paths, `OperatorShellContext`, `operatorTypes.ts`, header/connectivity, dynamic data.

---

## 25. Test contract (future)

`operator-shell-navigation-localization.test.tsx` — minimum:

- EN / DE render all 5 tab labels
- Same-mount locale switch preserves `activeTab`, tab order, selected state
- `setActiveTab` called with machine tab ID (not localized label)
- Tab order identical EN/DE
- Nav aria localized
- Raw TranslationKey leakage = 0
- No locale-driven remount (`key={locale}` absent)

---

## 26. Category E feasibility

**YES** — presentation-only label substitution; tab machine IDs and callbacks unchanged.

---

## 27. Active collision

**NONE** on selected production paths.

---

## 28. Main drift

| Path | baseline → main | Classification |
|------|-----------------|----------------|
| `OperatorBottomNav.tsx` | No diff | **NONE** |
| `OperatorHeader.tsx` | Sync locale regression on main (`de-DE` hardcoded) | **LOW** (out of P243 scope) |

**Baseline strategy: DIRECT FROM P242 MERGE BASELINE (`509d0ce`)**

---

## 29. Campaign forecast

| Slice | Estimate |
|-------|----------|
| **P243** | Shell Navigation Chrome — selected |
| P244 | Operator Header + Connectivity Banner |
| P245 | Operator Today View section chrome (partial) |

---

## 30. Final verdict

### **A — GO — P2.2.43 TARGET SELECTED**

**P2.2.43 — Operator Shell Navigation Chrome Localization**

**CAMPAIGN:** OPERATOR

**SPLIT:** ONE SLICE

**IMPLEMENTATION NOT STARTED.**

---

*Audit-only artifact. No production, dictionary, test, scanner, or architecture changes.*
