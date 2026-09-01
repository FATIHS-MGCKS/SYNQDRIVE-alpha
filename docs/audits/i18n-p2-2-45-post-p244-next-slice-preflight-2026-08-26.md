# P2.2.45 — Post-P244 Next-Slice Pre-Flight

**Date:** 2026-08-26
**Mode:** STRICT READ-ONLY TARGET SELECTION
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha
**Authoritative baseline:** `31a3c395705d79e303bfc810a276dfb71f508015` (merged PR #1298)
**Pre-flight branch:** `cursor/p2245-post-p244-next-slice-preflight-3c10`

---

## 1. Authoritative baseline hard gate

| Check | Result |
|-------|--------|
| Baseline SHA | `31a3c395705d79e303bfc810a276dfb71f508015` |
| PR #1298 merged | ✅ `mergedAt: 2026-08-26T00:17:40Z` |
| PR #1298 closed | ✅ |
| Ancestry from #1298 merge commit | ✅ |
| `npm run i18n:check` | ✅ PASS |
| Working tree (audit start) | ✅ clean |

### Independent metrics (reference P244)

| Metric | Expected | Actual |
|--------|----------|--------|
| EN | 8632 | **8632** |
| DE | 8632 | **8632** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P244–P216 enforce-clean | 0 | **0** |
| Global enforce-clean | 0 | **0** |
| i18n suite | 418 | **418** |
| Shim | 29 | **29** (prod 18, test 11) |
| New compat consumers | 0 | **0** |

**Baseline health:** ✅ PASS — no post-P244 regression detected.

---

## 2. P244 freeze verification

Frozen P244 production scope (0 diff required on re-open):

- `frontend/src/operator/components/OperatorHeader.tsx`
- `frontend/src/operator/components/OperatorConnectivityBanner.tsx`
- `frontend/src/operator/lib/operator-shell-top-chrome-i18n.ts`

| Gate | Result |
|------|--------|
| P244 visible/hidden/fixed-locale debt | **0** |
| P244 enforce-clean | **0** |
| activeTab / Header callbacks / `/rental` | frozen ✅ |
| `navigator.onLine` + listeners | frozen ✅ |
| Banner visibility / tone / icon | frozen ✅ |
| Fleet/DIMO/Vehicle connectivity coupling | none ✅ |
| P243–P216 | **0** |

---

## 3. Current main / topology

| Item | Value |
|------|-------|
| Authoritative baseline | `31a3c395705d79e303bfc810a276dfb71f508015` |
| Current main | `57f345f547e39a633914a202d4ff1e2f4f45a485` |
| Relationship | Baseline is **ancestor of main**; main is **ahead** |
| Recent merges after P244 | Fleet health P0.4, DIMO provider-link FK, Dashboard typography/utilization, BullMQ job ID fix |
| Open PRs on Operator i18n | Audit-only (#1297, #1299) — no active implementation collision |

**Topology classification:** **BEHIND MAIN** (campaign baseline on `p239-p238-merge-baseline-3c10` lineage; main has unrelated Fleet/DIMO/Dashboard commits).

**Main drift on P244 paths:** HIGH on `OperatorHeader` (main removed `useLanguage`, hardcoded `de-DE` sync time). P245 must branch from P244 merge baseline, not absorb main drift.

---

## 4. Active workstream exclusion map

| Workstream | Representative PRs/branches | Collision radius | P245 eligibility impact |
|------------|------------------------------|------------------|-------------------------|
| Fleet operational availability / health | #1277, `cursor/fleet-*` | Vehicle status labels, health evaluability | Excludes Vehicles tab + shared `operatorStatus` utils |
| DIMO / Vehicle connectivity | #1290, #1281, `cursor/connectivity-*`, `cursor/dimo-*` | Provider-link, processing gate | **VEHICLE/FLEET DEFERRED** |
| Dashboard redesign | #1291, #1286, #1282 | Layout, KPI boxes, typography | **DASHBOARD DEFERRED** |
| Communication Center | `feature/communication-center-c13-*` | Voice/WhatsApp consolidation | No direct Operator path overlap |
| Operator i18n audits | #1297, #1299 | Read-only docs | **NONE** |
| Rental task i18n (`tasks.*`) | Prior P2216 slices | Task priority/status labels | Excludes Task Card stack + Tasks tab list |

---

## 5. Operator campaign completion audit (residual inventory)

Surfaces outside frozen P236–P244 with production-reachable presentation debt:

| Path | Component | Mount | Visible | Hidden | Fixed-locale | Est. keys | Collision | Eligible |
|------|-----------|-------|---------|--------|--------------|-----------|-----------|----------|
| `views/OperatorTodayView.tsx` + utils + feed | Today tab chrome | Tab `today` (default) | **High** | Low | `useOperatorToday('de')` | 38–45 | **LOW** | **YES** |
| `views/OperatorTasksView.tsx` | Tasks list tab | Tab `tasks` | High | Low | `apiTaskPriorityLabelDe` | 25–30 | **HIGH** | YES (defer) |
| `tasks/OperatorTaskCard.tsx` + utils | Task row chrome | Today + Tasks feeds | High | Medium | `de-DE` due format | 55–70 | **HIGH** | YES (defer) |
| `views/OperatorVehiclesView.tsx` | Vehicles list | Tab `vehicles` | High | Low | `locale: 'de'` in utils | 35–45 | **HIGH** | YES (defer) |
| `components/OperatorScanVehicleCard.tsx` | Scan result card | Scan tab results | Med–High | Low | `mapPickupRow(...,'de')` | 12–15 | MEDIUM | YES |
| `ai-upload/OperatorAiUploadFlow.tsx` + review | AI upload sheet | Action sheet | High | Low | `FLOW_STATUS_LABEL_DE` | 45–60 | **VERY HIGH** | defer |
| `components/OperatorAccess*.tsx` + entry | Access gate | `/operator` gate | Med | Low | none | 25–30 | LOW | YES (low priority) |
| `tasks/OperatorTaskCreateForm.tsx` | Task create wrapper | Task sheet | Low–Med | Low | none | 6–8 | MEDIUM | YES (small) |

**Operator Notifications:** No production Operator notification surfaces found (`grep` 0 matches in `frontend/src/operator/`).

---

## 6. Operator campaign stopping-point test

**Result:** **OPERATOR HAS STRONG NEXT SLICE**

Operator campaign is not closed. Substantial host-owned debt remains on default-tab Today chrome, Tasks tab, Vehicles tab, and task cards — but Today tab is the strongest bounded next target.

---

## 7–9. Deep challengers (summary)

### Tasks (#7)
- `OperatorTasksView.tsx`: filter chips, summary, empty state, FAB — stable machine filters (`scope`, `today`, `overdue`, `priority`)
- **Blocked by collision** with rental `tasks.*` / `apiTaskPriorityLabelDe` active namespace
- Task Card stack shared by Today + Tasks — larger, higher risk

### Notifications (#8)
- **N/A** — no Operator notification module in production tree

### Residual sheets (#9)
- AI Upload: large, high coupling to rental document extraction — defer
- Task create wrapper: small but low leverage vs Today tab

---

## 10–14. External challengers

| Challenger | Best candidate | Score vs Today | Verdict |
|------------|----------------|----------------|---------|
| Rental/Booking | `rental/components/damages/DamageWorkQueue.tsx` (example) | Lower visibility than Operator default tab | Does not outrank |
| Customer | No isolated bounded surface identified | — | Defer |
| App Shell / Shared UI | Residual billing/damages drawers | Medium debt, lower operator leverage | Does not outrank |
| Dashboard | Active redesign PRs (#1282, #1286, #1291) | — | **DASHBOARD DEFERRED** |
| Vehicle/Fleet | `OperatorVehiclesView` + status utils | HIGH collision with Fleet P0.3/P0.4 | **VEHICLE/FLEET DEFERRED** |

**Conclusion:** Operator Today tab materially outranks all external challengers on visibility, operational leverage, and campaign continuity.

---

## 15–16. Global scans (selected scope)

**Raw-string hits (Operator residual):** 13 scanner findings on `OperatorTodayView.tsx`; 20+ across Today/Tasks/Vehicles/AI-upload cluster.

**Fixed-locale hits (Operator):**

| File | Issue |
|------|-------|
| `OperatorTodayView.tsx:78` | `useOperatorToday('de')` — threads to `formatApiTime` in snapshot (presentation) |
| `operatorTask.utils.ts:126` | `de-DE` due formatting (Task Card — out of P245 scope) |
| `operatorVehicleQuickView.utils.ts` | `locale: 'de'` (Vehicles — out of scope) |
| `OperatorScanVehicleCard.tsx` | `'de'` in row mappers (out of scope) |

---

## 22. Top-15 candidate ranking

| Rank | Exact surface | Score /50 | Biz risk | Est. keys | Reachable |
|------|---------------|-----------|----------|-----------|-----------|
| **1** | **Operator Today tab chrome** | **43** | 2 | 38–45 | YES |
| 2 | Operator Tasks list tab | 36 | 3 | 25–30 | YES |
| 3 | Operator Task Card stack | 34 | 4 | 55–70 | YES |
| 4 | Operator Vehicles list tab | 33 | 4 | 35–45 | YES |
| 5 | Operator Scan vehicle card | 30 | 2 | 12–15 | YES |
| 6 | Operator AI Upload flow | 28 | 5 | 45–60 | YES |
| 7 | Operator access/entry chrome | 24 | 1 | 25–30 | YES |
| 8 | Operator task create wrapper | 22 | 2 | 6–8 | YES |
| 9 | Operator status utils (shared) | 20 | 4 | 30–35 | YES (coupled) |
| 10 | Rental DamageWorkQueue | 19 | 3 | 20–30 | YES |
| 11 | Rental BillingTab residual | 18 | 3 | 25+ | YES |
| 12 | Rental DataAnalyseView | 17 | 2 | 15–20 | YES |
| 13 | Operator booking mutation toasts | 15 | 2 | ~15 | YES |
| 14 | Operator data context fallbacks | 12 | 1 | 3 | YES |
| 15 | Operator DesktopOnlyNotice | 11 | 1 | 5–8 | YES |

Scoring weights: visibility, leverage, debt density, boundedness, collision safety, campaign continuity.

---

## 23. Top-5 deep comparison

### #1 — Operator Today tab chrome (SELECTED)

| Field | Detail |
|-------|--------|
| Paths | `OperatorTodayView.tsx`, `operatorTodayView.utils.ts`, `OperatorTodayTaskFeed.tsx`, new `operator-today-i18n.ts` |
| Mount | `OperatorShell` tab `today` (default landing) |
| Audience | Field operators |
| Visible debt | Stale banner, page header, empty/error states, bucket section titles/subtitles, handover sublabels, alerts section, blocked vehicles, CTAs (~35 host-owned strings) |
| Hidden debt | `role="status"` on stale banner; ErrorState titles in feed |
| Fixed-locale | `useOperatorToday('de')` at call site — fix by passing `useLanguage().locale` (presentation time labels only) |
| Machine values | Feed buckets `NOW`/`TODAY`/`UPCOMING`/`PLANNED`/`UNASSIGNED`; alert `severity` `CRITICAL`/`WARN`; `offline`/`isStale`/`fullyEmpty` |
| Dynamic (raw) | `orgName`, `alert.title`/`alert.message`, vehicle `label`/`plate`/`station`, API errors, `snapshot.totalOpenTasksCount` (numeric) |
| Callbacks | `reload`, `openSheet`, `setActiveTab`, `openHandover`, `setDetailItem` — all frozen |
| Routes/sheets | `booking-create` sheet, `task-detail` sheet, tab switches to `tasks`/`vehicles` |
| Collision | **LOW** — no open implementation PRs on these paths |
| Main drift | **LOW** (~13 lines diff baseline→main on Today paths) |
| Why #1 | Default tab, highest daily visibility, cohesive 3-file boundary, presentation-only, natural follow-on to P241 booking cards already embedded |

**Known residual after P245:** Task rows via `OperatorTaskCardConnected` remain DE until a future Task Card slice.

### #2 — Operator Tasks list tab
- High debt but **HIGH collision** with rental `tasks.*` and `apiTaskPriorityLabelDe`
- Outranked on collision safety and boundedness

### #3 — Operator Task Card stack
- Shared by Today + Tasks; 55–70 keys; action predicates + toasts — higher Category E risk

### #4 — Operator Vehicles list
- **HIGH collision** with Fleet P0.3/P0.4 operational status work

### #5 — Operator Scan vehicle card
- Good bounded slice but lower visibility than default Today tab

---

## 24. Campaign direction

**A — CONTINUE OPERATOR**

Operator campaign has not reached natural stopping point. Today tab is the strongest remaining bounded slice and outranks external domains.

---

## 25. Selected P245 target

**P2.2.45 — Operator Today Tab Chrome Localization**

---

## 26. Split decision

**ONE SLICE**

Today view chrome (page shell, stale banner, section metadata, feed section errors) forms one cohesive bounded presentation slice. Task card row chrome is explicitly excluded.

---

## 27. Exact production boundary

### In scope (4 paths)

| Path | Role |
|------|------|
| `frontend/src/operator/views/OperatorTodayView.tsx` | Page chrome, stale banner, empty/error states, section headers, CTAs |
| `frontend/src/operator/views/operatorTodayView.utils.ts` | Bucket section title/subtitle metadata |
| `frontend/src/operator/components/OperatorTodayTaskFeed.tsx` | Per-bucket ErrorState presentation chrome |
| `frontend/src/operator/lib/operator-today-i18n.ts` | **NEW** presentation adapter |

### Out of scope (frozen / deferred)

- P236–P244 surfaces
- `OperatorTaskCard*` (deferred P246+ candidate)
- `OperatorBookingCard` (P241 frozen)
- `OperatorTodaySection` (structural wrapper — receives localized props)
- `useOperatorToday` hook body / `operatorData.ts` snapshot builders (except call-site locale arg)
- Fleet/DIMO/Dashboard domains

### Presentation inventory (host-owned)

| Concept | Baseline (DE-heavy) | Future key area |
|---------|---------------------|-----------------|
| Stale banner title/body (offline/stale) | hardcoded DE | `operator.today.stale.*` |
| Page title/subtitle | `Operativer Tagesüberblick` | `operator.today.header.*` |
| Create booking CTA | `Buchung aufnehmen` | `operator.today.createBooking` |
| No org empty | `Keine Organisation` | `operator.today.noOrg.*` |
| Fatal/booking errors | `Heute-Daten nicht verfügbar` | `operator.today.error.*` |
| Fully empty | `Heute ist alles ruhig` | `operator.today.empty.*` |
| All open tasks nav | `Alle offenen (n)` | `operator.today.allOpenTasks` |
| Handover sublabels | `Übergaben jetzt/heute` | `operator.today.handover.*` |
| Alerts section | `Operative Hinweise`, severity badges | `operator.today.alerts.*` |
| Blocked vehicles | `Blockierte Fahrzeuge`, `Blockiert` | `operator.today.blocked.*` |
| Tablet placeholder | sheet hint copy | `operator.today.tablet.*` |
| Bucket titles/subtitles | 5×2 in utils | `operator.today.bucket.*` |
| Feed error chrome | `{title} nicht verfügbar`, `Erneut laden` | reuse `common.retry` + bucket title |

---

## 28. Machine / domain freeze matrix

| Value | Source | Business use | Presentation | Localize? | Frozen? |
|-------|--------|--------------|--------------|-----------|---------|
| `NOW`/`TODAY`/…/`UNASSIGNED` | feed bucket ID | Task segmentation | Section title via adapter | Map only | ID frozen |
| `CRITICAL`/`WARN` | alert severity | Alert ranking | Badge label | Map only | enum frozen |
| `offline` | `useOperatorToday` | Stale banner branch | Copy variant | Map only | predicate frozen |
| `isStale` | task feed | Stale banner branch | Copy variant | Map only | predicate frozen |
| `fullyEmpty` | snapshot utils | Empty state visibility | Copy | Map only | predicate frozen |
| `plannedOpen` | local state | PLANNED collapse | — | N/A | state frozen |
| `totalOpenTasksCount` | API count | Nav visibility | Interpolation `{count}` | number raw | count frozen |

---

## 29. Dynamic data freeze

Must remain raw: `alert.title`, `alert.message`, vehicle `label`/`plate`/`station`, API `error`/`bookingsError` messages, `orgName`, booking card dynamic fields (P241), task card content (out of scope).

---

## 30. Callback / navigation freeze

| Control | Callback | Target | Frozen |
|---------|----------|--------|--------|
| Create booking | `openSheet({ type: 'booking-create' })` | booking form sheet | ✅ |
| Stale retry | `reload()` | data refresh | ✅ |
| All open tasks | `setActiveTab('tasks')` | tasks tab | ✅ |
| Alert card | `setActiveTab('tasks')` / `setPendingTasksBookingId` | tasks tab | ✅ |
| Blocked vehicle | `setSelectedVehicleId` + `setActiveTab('vehicles')` | vehicles tab | ✅ |
| Task open | `openSheet({ type: 'task-detail', ... })` | task sheet | ✅ |
| Handover | `openHandover(...)` | handover flow | ✅ |

---

## 31–33. Visibility / tone / date-time freeze

- All render predicates (`showStaleBanner`, `fullyEmpty`, `initialLoading`, `fatalError`) unchanged
- Alert badge tones (`critical`/`warning`) unchanged
- `useOperatorToday(locale)` locale param affects only `formatApiTime` labels in snapshot — presentation formatting; business date boundaries unchanged

---

## 34. Key reuse audit

| Concept | Strategy |
|---------|----------|
| Retry label | **EXACT REUSE** `common.retry` |
| "Heute" bucket title | **SEMANTIC REUSE** candidate `common.today` (verify context) |
| Loading states | **SEMANTIC REUSE** `common.loading` where applicable |
| Bucket titles/subtitles | **NEW** `operator.today.bucket.*` |
| Stale/empty/error chrome | **NEW** `operator.today.*` |
| Alert severity badges | **NEW** machine map `operator.today.alert.severity.*` |
| Task/booking dynamic content | **DYNAMIC — DO NOT TRANSLATE** |

**Estimated new keys:** **38–45** EN+DE (within pre-flight budget)

---

## 35–36. Adapter / extraction strategy

**Adapter:** **NEW BOUNDED PRESENTATION ADAPTER** — `operator-today-i18n.ts`

Exports (presentation only):
- `otd(locale, key)` / bucket ID → section title/subtitle keys
- severity → badge label keys
- stale/offline/empty/error static chrome helpers

Forbidden in adapter: bucket derivation, task segmentation, reload logic, tab/sheet selection, alert filtering.

**Extraction:** **NO STRUCTURAL CHANGE REQUIRED** — wire existing components to adapter.

---

## 37. P245 enforce-clean boundary

```text
P245_ENFORCE_CLEAN_EXACT =
  operator/views/OperatorTodayView.tsx
  operator/views/operatorTodayView.utils.ts
  operator/components/OperatorTodayTaskFeed.tsx
  operator/lib/operator-today-i18n.ts
```

Excludes P216–P244, Task Card stack, Vehicles, Scan vehicle card, AI Upload, Fleet/DIMO/Dashboard.

---

## 38. Test contract (future)

`operator-today-localization.test.tsx` minimum:

- EN + DE render of page chrome
- Same-mount DE→EN / EN→DE locale switch
- Stale banner offline vs stale copy variants
- Bucket section titles EN/DE
- `orgName` / alert titles preserved raw
- Callback preservation (`reload`, `setActiveTab`, `openSheet`)
- `useOperatorToday` receives locale from `useLanguage` (formatting only)
- Raw key / machine-state leakage guards
- P245 enforce-clean = 0 assertion

---

## 39. Category E feasibility

**FEASIBLE** — presentation-only. Bucket IDs, alert severities, tab targets, and callback identities remain frozen. Locale threading to `useOperatorToday(locale)` affects only `formatApiTime` presentation labels in snapshot.

---

## 40. Active collision

**LOW** — no HIGH/DIRECT open implementation PRs on Today paths.

---

## 41. Current main drift (selected paths)

**LOW** — ~13 lines diff on Today paths between baseline and main. No structural redesign.

---

## 42. Baseline strategy

**DIRECT FROM P244 MERGE BASELINE** (`31a3c395705d79e303bfc810a276dfb71f508015`)

Do not branch from current main (Fleet/DIMO/Dashboard drift).

---

## 43. Global success contract

Future P245 must achieve: selected debt = 0, P245 = 0, P244–P216 = 0, global enforce-clean = 0, EN = DE, parity 100%, orphans 0, shim ≤ 29, Category E = 0, tests PASS, build PASS.

---

## 44. Operator campaign closure forecast

**LIKELY PENULTIMATE OPERATOR SLICE** — after P245, strong residuals remain (Task Card, Tasks tab, Vehicles tab, Scan vehicle card, AI Upload). Operator campaign continues beyond P245 but Today is the highest-leverage next slice.

---

## 45. Campaign forecast (estimate only)

| Slice | Estimate |
|-------|----------|
| P245 | Operator Today tab chrome |
| P246 | Operator Task Card stack (or Tasks list — pending collision review) |
| P247 | Operator Vehicles list or Scan vehicle card |

---

## 73. Claim reconciliation (baseline health)

All P244 post-merge metrics independently verified ✅

---

## 48. Final verdict

**A — GO — P2.2.45 TARGET SELECTED**

**P2.2.45 — Operator Today Tab Chrome Localization**

**CAMPAIGN:** OPERATOR

**OPERATOR STATUS:** continues

**IMPLEMENTATION NOT STARTED.**

---

*Read-only pre-flight audit. Do not merge audit PR into production paths.*
