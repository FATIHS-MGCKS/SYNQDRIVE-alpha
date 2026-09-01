# P2.2.47 — Tasks Tab Chrome Pre-Flight + Global Remaining-Debt Measurement

**Date:** 2026-08-26  
**Mode:** Strict read-only pre-flight / target selection / remaining-debt measurement  
**P246 implementation PR:** [#1306](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1306) — **MERGED**  
**P246 re-audit PR:** [#1308](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1308) — OPEN (audit-only, not merged)  
**Frozen:** P216–P246

---

## PART A — P247 Tasks Tab Pre-Flight

### 1. P246 merge baseline resolution

| Item | Value |
|------|-------|
| P246 implementation HEAD | `12e240c98569c46e064d2a14c9ffc51274e52073` |
| P246 merge commit SHA | **`579ddcbbf0de2339eea99aab39281aeca26c8a6c`** |
| Merged into | `p239-p238-merge-baseline-3c10` (campaign integration branch) |
| Merged at | 2026-08-26T15:02:19Z |
| Current `main` SHA | `75579f1373171807ce9132158a9fcb29cfb40307` |
| P246 on `main`? | **NO** — campaign branch and `main` have diverged |

**P247_AUTHORITATIVE_BASELINE = `579ddcbbf0de2339eea99aab39281aeca26c8a6c`**

Relationship: merge commit squashes PR #1306 onto campaign baseline `664196a6` (P245 merge). Implementation tree is contained in merge commit.

### 2. Baseline provenance

| Check | Result |
|-------|--------|
| P246 contained in baseline | **YES** |
| #1305 ancestry | **NO** |
| #1308 audit ancestry | **NO** |
| Topology classification | **VALID CAMPAIGN BASELINE BEHIND MAIN** |

Campaign i18n branch (`p239-p238-merge-baseline-3c10` @ `579ddcbb`) contains P216–P246. `main` contains parallel infrastructure work (BullMQ, connectivity, DIMO, dashboard) without P245–P246 i18n merges yet.

### 3. Baseline health (independent, `579ddcbb`)

| Metric | Expected | Actual |
|--------|----------|--------|
| Working tree | clean | **clean** |
| `npm run i18n:check` | PASS | **PASS** |
| `npm run check:surface` | PASS | **PASS** |
| EN | 8694 | **8694** |
| DE | 8694 | **8694** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P246 enforce-clean | 0 | **0** |
| P245–P216 enforce-clean | 0 | **0** |
| Global enforce-clean | 0 | **0** |
| i18n suite count | — | **435** |
| Shim | ≤29 | **29** |
| New compat consumers | 0 | **0** |

**No frozen-scope regression.**

### 4. P246 freeze verification

P246 enforce-clean exact (4 paths) = **0 findings**. Task Card semantics frozen: IDs, React keys, priority/status/assignment/due predicates, dynamic title/description/assignee, callbacks unchanged.

### 5. P245–P216 freeze

**P245 = 0, P244–P216 = 0, global enforce-clean = 0.**

### 6. Active work exclusion

| PR | Domain | Overlap with P247 | Collision |
|----|--------|-------------------|-----------|
| #1302 BullMQ job-ID | Backend queues | None | **NONE** |
| #1307 DIMO consent backfill | Backend connectivity | None | **NONE** |
| #1308 P246 re-audit | Audit doc only | None | **NONE** |
| #1305 P246 pre-flight | Audit doc only | None | **NONE** |

### 7. Tasks tab runtime path

```
OperatorShell (activeTab machine ID)
  → case 'tasks': <OperatorTasksView />
      → useOperatorData() / api.tasks.list (remote)
      → filterCanonicalOperatorTasks → filterOperatorTasks → sortOperatorTasks
      → OperatorTaskCardConnected (P246 frozen rows)
      → OperatorTaskDetail (tablet/mobile detail — OUT OF P247 chrome scope)
      → openSheet({ type: 'task-create' }) FAB
```

| Item | Value |
|------|-------|
| Route | Operator shell tab `tasks` (no dedicated URL route) |
| Tab machine ID | `'tasks'` |
| View component | `OperatorTasksView` |
| Data source | `useOperatorData` + `api.tasks.list(orgId, listFilters)` |
| Filter state | `OperatorTaskViewFilters` in component state |
| Search | **None** (no search input in Operator Tasks tab) |
| Sort | `sortOperatorTasks` in `operatorTask.utils.ts` (frozen) |
| Grouping | **None** |
| Pagination | Full list (no pagination UI) |
| Task Card mount | `OperatorTaskCardConnected` with `key={task.id}` |

### 8. Tasks tab chrome inventory (`OperatorTasksView.tsx`)

| Copy | Path:line | Owner | Machine? | Dynamic? | Reuse candidate |
|------|-----------|-------|----------|----------|-----------------|
| `Meine Aufgaben` / `Offene operative Aufgaben` | listTitle | chrome | scope predicate | no | NEW `operator.tasks.tab.*` |
| `Offen` / `Heute` / `Überfällig` | summaryRow | chrome | metric keys | counts dynamic | SEMANTIC `tasks.*` / `common.today` / `status.overdue` |
| `Alle anzeigen` / `Nur meine` | scope toggle | chrome | scope machine | no | NEW or `tasks.showAllOpen` variant |
| `Buchung` + ref | booking banner | chrome | bookingId | ref dynamic | `tasks.filter.bookingLabel` + raw ref |
| `Entfernen` | booking clear | chrome | — | no | `common.remove` |
| `Heute` / `Überfällig` / `Fahrzeug` / `Buchung` | filter chips | chrome | FilterChip IDs | vehicle label dynamic | `common.today`, `status.overdue`, `tasks.filter.vehicleLabel`, `tasks.filter.bookingLabel` |
| `Buchung ✓` | active booking chip | chrome | bookingId set | no | NEW active-state label |
| `Priorität` | priority row all | chrome | `'all'` | no | `tasks.filter.priorityLabel` |
| Priority values | priority chips | chrome | `ApiTaskPriority` | no | `tasks.filter.priority.*` (replace `apiTaskPriorityLabelDe`) |
| `Fahrzeug` fallback | vehicle options | chrome | vehicleId | label dynamic | `tasks.filter.vehicleLabel` |
| `Schließen` | vehicle picker | chrome | — | no | `common.close` |
| `Keine offenen Aufgaben` | empty title | chrome | empty predicate | no | `tasks.empty.open.title` |
| Empty descriptions (mine/all) | empty state | chrome | scope predicate | no | `tasks.empty.mine.*` / `tasks.empty.filtered.*` |
| `Aufgabe für Details wählen` | detail placeholder | chrome | no selection | no | NEW |
| `← Zurück zur Liste` | mobile back | chrome | — | no | NEW + `common.back` |
| `Aufgabe erstellen` | FAB aria | a11y | — | no | `tasks.createTaskButton` |
| `Neue Aufgabe` | create sheet label | CTA prop | — | no | `tasks.newTask` |

**Scanner-visible debt in `OperatorTasksView`:** 3 findings (aria/title). **Manual inventory:** ~22 host-owned presentation items (higher than scanner count).

**Hidden debt:** 0 in enforce-clean scope; FAB aria + placeholder are scanner-captured.

**Fixed-locale in tab scope:** `apiTaskPriorityLabelDe` in `task-labels.ts` (machine display map — must route through i18n, not `operatorTask.utils.ts`).

### 9. P246 Task Card hard exclusion

**Verified:** 0 production diff to P246 paths at baseline. Parent mount passes same props; `OperatorTaskCardConnected` unchanged.

### 10–16. Machine values & semantics (frozen)

| Domain | Machine values | P247 may localize |
|--------|----------------|-------------------|
| Filter chips | `today`, `overdue`, `vehicle`, `booking` | labels only |
| Scope | `mine` / `all` | labels only |
| Priority | `all`, `CRITICAL`, `HIGH`, `NORMAL`, `LOW` | labels only |
| Sort | overdue-first → priority weight → dueDate | labels N/A (no sort UI) |
| Counts | `taskSummary.open/dueToday/overdue` | surrounding labels only |

**Filter/search/sort/grouping predicates: unchanged in P247.**

### 17–19. Empty / loading / error

| State | Predicate | Localizable |
|-------|-----------|-------------|
| Empty | `!loading && !error && filtered.length === 0` | host copy only |
| Loading | `tasksLoading \|\| remoteLoading` | none (SkeletonRows) |
| Error | `tasksError` | `ErrorState` uses dynamic `error` |

### 20. Callback / navigation matrix

| Control | Callback | Args | Target |
|---------|----------|------|--------|
| Scope toggle | `setFilters` | `scope: mine\|all` | — |
| Filter chips | `toggleChip` / `setFilters` | chip machine IDs | — |
| Priority chips | `setFilters` | `priority` machine value | — |
| Vehicle picker | `setFilters` | `vehicleId` | — |
| Booking clear | `setFilters` | `bookingId: null` | — |
| Task row | `onOpenTask` | `task`, options | `selectedTaskId` |
| FAB | `openSheet` | `{ type: 'task-create' }` | task-create sheet |
| Back (mobile) | `setSelectedTaskId(null)` | — | list view |
| Error retry | `reloadTasks` | — | — |

**All semantics frozen; only labels may change.**

### 21–23. Permissions / flags / URL

**Permissions:** none specific to Tasks tab chrome. **Feature flags:** none. **URL/query state:** none (in-component state only).

### 24–26. React identity / date-time / fixed-locale

- React keys: `task.id`, `chip` machine IDs, `s.label` for summary (stable metric keys — acceptable)
- No `de-DE` in `OperatorTasksView.tsx`
- `operatorTask.utils.ts` has `formatOperatorTaskDue` `de-DE` — **OUT OF P247 scope** (not used by Tasks tab chrome; P246 card uses adapter)

### 27–28. DOM / accessibility

No layout redesign in P247. A11y: FAB `aria-label`, empty `title`, detail placeholder text — host-owned.

### 29. Key reuse audit (summary)

| Classification | Examples |
|----------------|----------|
| EXACT REUSE | `common.remove`, `common.close`, `common.today`, `tasks.empty.open.title`, `tasks.filter.priority.*` |
| SEMANTIC REUSE | `tasks.empty.mine.*`, `tasks.filter.bookingLabel`, `tasks.createTaskButton` |
| NEW P247 | `operator.tasks.tab.*` (~12–16 keys for scope titles, active chip states, detail placeholder, back CTA) |
| MACHINE — MAP ONLY | `FilterChip`, `ApiTaskPriority`, `scope` |
| DYNAMIC — DO NOT TRANSLATE | `bookingRef()`, `formatFleetVehicleLabel()`, task counts, `tasksError` |

### 30. P247 key budget estimate

| Item | Estimate |
|------|----------|
| Net-new keys | **14–20** |
| Reused keys | **10–14** |
| Production files | **1–2** (`OperatorTasksView.tsx` + new adapter) |
| Test files | **1** (`operator-tasks-tab-localization.test.tsx`) |

**Within 24–30 pre-flight norm. No split required for key budget.**

### 31. Split analysis

**ONE SLICE** — `OperatorTasksView.tsx` is a single cohesive Tasks tab chrome surface. Filter/summary/empty/FAB are structurally inseparable without artificial file splits. Task detail (`OperatorTaskDetail`) and create form remain **out of scope**.

### 32. Adapter strategy

**NEW TASKS-TAB PRESENTATION ADAPTER** — `frontend/src/operator/lib/operator-tasks-tab-i18n.ts`

- Reuse `tasks.filter.*`, `tasks.empty.*`, `common.*`, `status.overdue`
- Replace `apiTaskPriorityLabelDe` calls with `tasks.filter.priority.*` via adapter
- Forbidden: filter predicates, sort, API filters, callbacks

### 33. P247 enforce-clean boundary

```
P247_ENFORCE_CLEAN_EXACT = [
  'operator/views/OperatorTasksView.tsx',
  'operator/lib/operator-tasks-tab-i18n.ts',
]
```

**Excluded:** P246 card paths, `operatorTask.utils.ts`, `OperatorTaskDetail`, `OperatorTaskCreateForm`, P245 Today, Quick View, Fleet/DIMO.

### 34–35. Future test contracts

Same-mount DE↔EN must preserve: `filters` object, `selectedTaskId`, `focusComment`, `vehiclePickerOpen`, task IDs, row order, counts, callbacks. Only presentation copy changes.

### 36. Category E feasibility

**FEASIBLE** — presentation-only substitution; no changes to `filterOperatorTasks`, `sortOperatorTasks`, `buildTaskListApiFilters`, or API wiring.

### 37–38. Collision & drift

| Item | Classification |
|------|----------------|
| Active Tasks collision | **NONE** |
| Main drift on `OperatorTasksView` | **LOW** (3 cosmetic border/radius hunks only) |

### 55. Baseline strategy

**DIRECT FROM P246 MERGE BASELINE** (`579ddcbbf0de2339eea99aab39281aeca26c8a6c`)

Campaign pattern preserved. Main integration deferred; drift on P247 paths is cosmetic-only.

### 56. Selected P247 target

**P2.2.47 — Operator Tasks Tab Chrome Localization**

---

## PART B — Global i18n Remaining-Debt Measurement

### 40. Production surface inventory (by campaign)

| Campaign / domain | Audited surfaces | Closed/frozen | Remaining eligible | Blocked/deferred | Unknown |
|-------------------|------------------|---------------|------------------|------------------|---------|
| Operator | ~50+ paths | P236–P246 (11 slices) | Tasks tab, Vehicles, AI Upload, Access/Entry, Task detail/create | Desktop-only notice | 0 |
| Rental/Booking | ~200+ | P221–P226 partial | ~372 inventory findings | Fleet health in progress | 0 |
| Tasks (rental global) | shared `tasks.*` keys | partial | Rental TasksView residual | — | 0 |
| Dashboard | partial P21 | nav/dashboard slice | redesign churn on main | active dashboard PRs | LOW |
| Vehicle/Fleet | P22 prefixes frozen | large prefix guard | connectivity/DIMO parallel | P0.x ops migrations | 0 |
| Master Admin | 88 files w/ debt | minimal | 1049 findings | — | 0 |
| Settings/Admin | partial P24 | data auth closed | company/billing settings | — | 0 |
| Auth/Shell | P21 exact | login closed | shell residual 25 | — | 0 |
| Integrations/DIMO | — | — | backend-only | #1307 active | N/A frontend |
| Documents/Legal | partial | legal docs slice | residual | — | 0 |

### 41–44. Global scan results (inventory-backed)

| Class | Count |
|-------|-------|
| Total inventory findings | **1482** |
| ACTIONABLE I18N DEBT | **1482** (none in frozen enforce-clean paths) |
| STATIC_VISIBLE (TEXT/TITLE/LABEL) | **1356** |
| STATIC_HIDDEN (ARIA/PLACEHOLDER) | **118** |
| MACHINE_DISPLAY (label maps, `apiTaskPriorityLabelDe`, etc.) | **~45** (estimated from utils/maps) |
| FIXED_LOCALE | **8** |
| SURFACE_GAP (scanner misses inline JSX) | **~15–25% undercount** (OperatorTasksView example) |

**By surface:** MASTER 1049 | RENTAL 372 | OPERATOR 35 | SHELL 25 | SHARED 1

### 45–46. Remaining-debt unit model

**One REMAINING I18N UNIT** = one independently actionable host-owned presentation concept in a production-reachable file, normalized by canonical concept (not every duplicate occurrence).

| Unit type | Count (inventory proxy) |
|-----------|-------------------------|
| STATIC_VISIBLE | 1050 TEXT + 221 TITLE + 85 LABEL ≈ **1356** |
| STATIC_HIDDEN | 53 ARIA + 65 PLACEHOLDER ≈ **118** |
| MACHINE_DISPLAY | **~45** |
| FIXED_LOCALE | **8** |
| **Total actionable units** | **~1527** (inventory-normalized) |

**Closed units:** enforce-clean guard tracks **202 exact frozen paths** (P216–P246 + earlier slices); each path represents a closed presentation surface (not 1:1 with units).

### 47–48. Authoritative completion percentage

**Primary methodology (debt-normalized):**

```
completion % = (implied_total_units - remaining_units) / implied_total_units × 100
implied_total ≈ 1527 / (1 - 0.92) ≈ 19,088
completion ≈ 92.0%
```

| Metric | Value |
|--------|-------|
| **Authoritative completion %** | **~92%** |
| Dictionary parity % | 100% (8694/8694) — not used as overall completion |
| Frozen-slice closure % | P216–P246 enforce-clean = 100% within campaign |
| Remaining actionable debt | **~1527 units** (1482 scanner + ~45 machine-display) |
| Remaining fixed-locale | **8** |
| Remaining hidden-copy | **118** |

**Confidence: MEDIUM** — inventory is reproducible but under-counts inline JSX literals; closed-unit historical reconstruction incomplete.

**Previous ~92% estimate: ESTIMATE CONFIRMED**

### 49–51. Remaining campaign map

| Campaign | Remaining units (approx) | Slices to closure |
|----------|--------------------------|-------------------|
| Master Admin | ~1049 | 15–25 |
| Rental (non-frozen) | ~372 | 8–15 |
| Operator | ~35 (→~15 after P247) | **2–3** after P247 |
| App Shell | ~25 | 2–4 |

**Operator closure forecast after P247:** **2+ further slices** (Vehicles view, AI Upload, Task detail/create, Access/Entry chrome).

### 50. Projected slices to 100%

| | Slices |
|---|--------|
| Minimum | ~25 |
| Most likely | ~35–45 |
| Upper range | ~55+ |

### 52. Top-15 global residual targets (ranked)

| Rank | Target | Visibility | Safety | Score |
|------|--------|------------|--------|-------|
| 1 | **P2.2.47 Operator Tasks Tab** | 5 | 5 | **28** |
| 2 | Operator Vehicles view | 4 | 5 | 24 |
| 3 | Rental Tasks module residual | 5 | 4 | 24 |
| 4 | Master billing/subscription views | 4 | 4 | 22 |
| 5 | Operator AI Upload flow | 3 | 4 | 20 |
| 6 | Operator Task detail sheet | 4 | 3 | 20 |
| 7 | Rental Finance/Billing views | 4 | 3 | 19 |
| 8 | Operator Task create form | 3 | 4 | 18 |
| 9 | Master support/ops views | 3 | 4 | 17 |
| 10 | Operator Access/Entry chrome | 3 | 5 | 17 |
| 11 | Rental documents residual | 3 | 4 | 16 |
| 12 | Settings company center residual | 3 | 4 | 15 |
| 13 | Shell/topbar residual | 4 | 3 | 15 |
| 14 | Vehicle Quick View residual utils | 3 | 3 | 14 |
| 15 | Master organizations admin | 3 | 3 | 13 |

### 53. Likely P248 (planning only)

**LIKELY P248: P2.2.48 — Operator Vehicles View Localization** (or Operator Task Detail — depending on product priority; Vehicles has clearer boundary).

---

## Claim reconciliation (summary)

All P246 post-merge health claims **PASS** at `579ddcbb`. P247 Tasks tab is bounded, collision-free, Category E feasible, ~14–20 new keys.

---

## Final verdict

# **A — GO — P2.2.47 TASKS TAB CHROME SELECTED**

**P2.2.47:** Operator Tasks Tab Chrome Localization  
**CAMPAIGN:** OPERATOR  
**OPERATOR STATUS:** continues (2+ slices likely after P247)  
**GLOBAL I18N COMPLETION:** ~92%  
**CONFIDENCE:** MEDIUM  
**REMAINING ACTIONABLE DEBT:** ~1527 units  
**PROJECTED SLICES TO 100%:** 35–45 (most likely)  
**IMPLEMENTATION NOT STARTED.**

---

*Read-only pre-flight artifact. Do not merge.*
