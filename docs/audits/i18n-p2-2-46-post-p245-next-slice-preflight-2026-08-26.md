# P2.2.46 — Post-P245 Next-Slice Pre-Flight

**Date:** 2026-08-26  
**Mode:** Strict read-only target selection  
**Authoritative baseline:** `664196a6dcdf56f2f2dd0c68867a1222903b1d3b`  
**Baseline origin:** Merged PR #1301 — P2.2.45 Operator Today Tab Chrome Localization  
**Current main:** `75579f1373171807ce9132158a9fcb29cfb40307`  
**Frozen:** P216–P245

---

## 1. Authoritative Baseline Hard Gate

| Check | Result |
|-------|--------|
| Baseline SHA | `664196a6dcdf56f2f2dd0c68867a1222903b1d3b` ✓ |
| PR #1301 merged | YES (`mergedAt: 2026-08-26T13:15:04Z`) |
| PR #1301 closed | YES (`state: MERGED`) |
| Merge commit | `664196a6dcdf56f2f2dd0c68867a1222903b1d3b` ✓ |
| Working tree (pre-audit) | clean |

### Independent i18n health (baseline)

| Metric | Expected | Actual |
|--------|----------|--------|
| EN keys | 8667 | **8667** |
| DE keys | 8667 | **8667** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P245 | 0 | **0** |
| P244–P216 | 0 | **0** |
| Global enforce-clean | 0 | **0** |
| i18n:check suite | ~429 ref | **428** vitest + structural PASS |
| Shim (compat prod) | 29 | **29** |
| New compat consumers | 0 | **0** |

`npm run i18n:check` — **PASS**

**Baseline regression: NONE**

---

## 2. P245 Freeze Verification

### P245 surfaces (enforce-clean = 0)

| Path | Visible | Hidden | Fixed-locale | P245 debt |
|------|---------|--------|--------------|-----------|
| `operator/views/OperatorTodayView.tsx` | 0 | 0 | 0 | **0** |
| `operator/views/operatorTodayView.utils.ts` | 0 | 0 | 0 | **0** |
| `operator/components/OperatorTodayTaskFeed.tsx` | 0 | 0 | 0 | **0** |
| `operator/lib/operator-today-i18n.ts` | 0 | 0 | 0 | **0** |

### Semantic freeze (independent)

| Gate | Result |
|------|--------|
| Bucket IDs / order / membership / counts | **UNCHANGED** |
| Today/date boundary / due/overdue | **UNCHANGED** (P245 did not touch feed utils) |
| Task Feed source/filter/sort/limit | **UNCHANGED** |
| Task Card rows production diff in P245 | **0** (intentionally deferred) |
| Callbacks / routes / sheets | **UNCHANGED** |

**P244–P216 enforce-clean:** verified PASS (guard tests)

---

## 3. Current Main / Topology

| Field | Value |
|-------|-------|
| Authoritative baseline | `664196a6` (P245 merge) |
| Current main | `75579f13` |
| Relationship | **BEHIND MAIN** (~20 commits ahead on main) |
| Notable post-P245 merges | #1304 connectivity closure audit; BullMQ job-ID fixes; Fleet/DIMO/Dashboard work |

**Classification:** **PARALLEL CAMPAIGN BASELINE** — P246 should branch from `664196a6`, not absorb main drift silently.

**Candidate-path drift (selected target):** **LOW** — task card paths have minimal diff vs main (~31 lines, no semantic conflict).

---

## 4. Active Workstream Exclusion Map

| PR | Domain | Changed paths | Collision with P246 candidate | Eligible overlap |
|----|--------|---------------|------------------------------|------------------|
| **#1302** | Backend BullMQ v5 job-ID | `backend/**/queue*.ts`, workers | **NONE** | NO |
| **#1304** | Connectivity closure audit | `docs/audits/*`, SQL script | **NONE** | NO |
| #1277 | Fleet health evaluability | backend fleet | **NONE** | NO |
| #1281/#1290 | DIMO provider links | backend dimo | **NONE** | NO |
| #1282/#1286/#1291 | Dashboard layout/KPI | `rental/dashboard/**` | **NONE** | NO |

**Protected domains:** BullMQ transport, connectivity authority, Fleet health, Vehicle connectivity, DIMO, Dashboard redesign — **no HIGH/DIRECT collision** with Operator Task Card slice.

---

## 5. Operator Residual Inventory (post P236–P245)

**Inventory:** 39 scanner findings across 14 operator files outside frozen slices.

| Path | Mount | Visible debt | Est. keys | Business coupling | Eligible |
|------|-------|--------------|-----------|-------------------|----------|
| `operator/tasks/OperatorTaskCard.tsx` | Today feed, Tasks tab, QV tasks | 4 | ~8 | Medium | **YES** |
| `operator/tasks/operatorTaskCard.utils.ts` | All task cards | 0 scanner / ~22 hidden | ~22 | Medium | **YES** |
| `operator/tasks/OperatorTaskCardConnected.tsx` | Wrapper | 0 | 0 | Low | **YES** (pass-through) |
| `operator/views/OperatorTasksView.tsx` | Tab `tasks` | 3+ | ~25 | High | YES (defer P247) |
| `operator/tasks/OperatorTaskCreateForm.tsx` | Sheet `task-create` | 1+ | ~6 | Medium | YES (defer) |
| `operator/tasks/useOperatorTaskActions.ts` | Card mutations | 0 / ~8 hidden | ~8 | Medium | YES (defer or bundle toast) |
| `operator/tasks/operatorTask.utils.ts` | Filters/sort | 0 / 1 fixed-locale | ~1 | **High** | PARTIAL (formatter only) |
| `operator/views/OperatorVehiclesView.tsx` | Tab `vehicles` | 5 | ~8 | Medium | YES (P248 candidate) |
| `operator/lib/operatorVehicleQuickView.utils.ts` | Vehicle filters | ~18 hidden, 2 fixed-locale | ~20 | High | YES (defer) |
| `operator/lib/operatorStatus.ts` | Vehicle badges | ~10 hidden | ~10 | Medium | YES (defer) |
| `operator/components/OperatorVehicleQuickView.tsx` | QV blocker section | 1+ | ~3 | Medium | YES (defer) |
| `operator/ai-upload/*` | Sheet `ai-upload` | 14+ | ~35 | High | YES (defer) |
| `operator/components/OperatorAccess*.tsx` | Entry/guard | 5+ | ~12 | Low | YES (defer) |
| `operator/components/OperatorEntry*.tsx` | Rental TopBar | 6+ | ~7 | Low | YES (defer) |

**Notifications:** No dedicated Operator notification center. Toast copy in `useOperatorTaskActions` only.

---

## 6. Operator Campaign Closure Gate

**Result: OPERATOR HAS STRONG NEXT SLICE**

Operator presentation debt is **not** closed. P245 completed Today tab chrome only; Task Card rows remain the highest-visibility residual explicitly deferred from P245. Additional slices (Tasks tab chrome, Vehicles, AI Upload, access/entry) remain bounded and production-reachable.

---

## 7–10. Task Card Rows Deep Audit

### Presentation inventory (`OperatorTaskCard.tsx`)

| Element | Baseline | Dynamic? | Localize? |
|---------|----------|----------|-----------|
| Title | `task.title` | **YES — raw** | NO |
| Description/object line | vehicle/booking lines | **YES — raw** | NO |
| Priority badge | `PriorityBadge` + `task.priority` | Machine | YES (via existing priority keys) |
| Status chip | `taskStatusLabelDe(status)` / `Überfällig` | Machine + overdue flag | YES |
| Auto-resolved chip | `Automatisch erledigt` | Machine (`completionMode`) | YES |
| Timing label | `Fällig …` / `Aktiv ab …` | Formatted timestamp | YES (formatter only) |
| Assignee | `Verantwortlich: {name}` | Name raw; prefix localized | PARTIAL |
| Checklist chrome | `Checkliste`, `Pflicht`, progress | Counts raw | YES |
| Object unavailable | `Bezugsobjekt nicht verfügbar` | Predicate | YES |
| Primary/secondary CTAs | from `operatorTaskCard.utils` | Machine action kinds | YES |
| aria-label | `Aufgabe öffnen: {title}` | Title dynamic | YES (template) |
| actionError | runtime API message | **YES — raw** | NO |

### Machine values (stable)

| Machine value | Source | Filter/sort use | Existing keys |
|---------------|--------|-----------------|---------------|
| `OPEN/IN_PROGRESS/WAITING/DONE/CANCELLED` | `task.status` | YES (backend) | `tasks.filter.status.*` |
| `CRITICAL/HIGH/NORMAL/LOW` | `task.priority` | YES (sort in Tasks view) | `tasks.filter.priority.*` |
| `isOverdue` | `task.isOverdue` | YES (sort) | NEW `operator.task.card.overdue` or reuse detail timing |
| `completionMode=AUTO_RESOLVED` | task field | workflow | NEW chip label |
| Action kinds | `OperatorTaskCardActionKind` | mutation routing | Reuse `tasks.detail.actions.*` where aligned |
| Type-specific CTAs | `task.type` | navigation only | NEW `operator.task.card.action.*` (~8 keys) |

**Machine → TranslationKey → display:** feasible. Presentation not entangled with filter/sort (sort uses raw enums in `operatorTask.utils`).

### Due / overdue gate

- `formatOperatorTaskDue` in `operatorTask.utils.ts` uses hardcoded `de-DE` — **fixed-locale debt** (formatter only; predicate `isOverdue` unchanged).
- `resolveOperatorTaskTimingLabel` builds German prefix strings — presentation only.
- **Eligible:** YES — localize formatter + labels; freeze `isOverdue`, `dueDate`, `activatesAt`, sort comparator.

### Callback / navigation gate

| Control | Callback | Args | Preservable |
|---------|----------|------|-------------|
| Card click | `onOpen()` | task via closure | YES |
| Primary CTA | `onAction(kind)` | action kind | YES |
| Secondary CTA | `onAction(kind)` | action kind | YES |
| Routes/sheets | via controller (`open-booking`, `open-handover-pickup`, etc.) | IDs unchanged | YES |

---

## 11–12. Operator Notifications

**No bounded notification panel candidate.** Residual notification UX is Sonner toasts in task mutation hook — defer to Task Card follow-up or separate micro-slice.

---

## 13. Remaining Operator Dialogs/Sheets (ranked)

1. **Task Card rows** (highest visibility, P245 deferral) — score 47
2. **Tasks tab chrome** (`OperatorTasksView`) — score 42
3. **Vehicles tab + utils** — score 40
4. **AI Upload flow** — score 38
5. **Access/entry chrome** — score 32

---

## 14–18. Challenger Campaigns

| Campaign | Strongest candidate | Eligibility |
|----------|---------------------|-------------|
| Rental/Booking | `rental/components/billing/*` drawers | Medium debt; higher business coupling — **defer** |
| Customer | No isolated customer-only operator surface | **INELIGIBLE** |
| App Shell / Shared UI | `rental/components/OrganizationSwitcher.tsx` | Low operator leverage — **defer** |
| Dashboard | Active layout/utilization work (#1282, #1286, #1291) | **DASHBOARD DEFERRED** |
| Vehicle/Fleet | Active semantic work (#1277, connectivity) | **VEHICLE/FLEET DEFERRED** |

---

## 19–20. Global Scans (Operator-eligible)

**Raw string findings:** 39 operator inventory entries; dominated by Task Card cluster + Tasks/Vehicles/AI Upload.

**Fixed-locale:** `operatorTask.utils.ts` `toLocaleString('de-DE')` in `formatOperatorTaskDue`; `operatorVehicleQuickView.utils.ts` (2) — Vehicles slice, not P246.

---

## 22. Top-15 Exact Candidate Ranking

| Rank | Candidate | Score /50 | Keys | Prod files | Reachable |
|------|-----------|-----------|------|------------|-----------|
| 1 | **Operator Task Card rows** | **47** | ~28 net new (heavy reuse) | 3–4 | YES |
| 2 | Operator Tasks tab chrome | 42 | ~25 | 1–2 | YES |
| 3 | Operator Vehicles tab + fleet utils | 40 | ~30 | 3 | YES |
| 4 | Operator AI Upload | 38 | ~35 | 3 | YES |
| 5 | Access/entry chrome | 32 | ~12 | 7 | YES |
| 6 | QV blocker section residual | 24 | ~3 | 1 | YES |
| 7 | Task create form chrome | 22 | ~6 | 1 | YES |
| 8 | Task action toasts | 18 | ~8 | 1 | YES |
| 9 | OperatorDataContext errors | 14 | ~2 | 1 | YES |
| 10 | OperatorLinkCard | 12 | ~6 | 1 | YES |
| 11 | Rental billing drawers | 10 | ~40+ | many | YES (wrong campaign) |
| 12 | OrganizationSwitcher | 8 | ~5 | 1 | YES (low leverage) |
| 13 | Damage work queue | 6 | ~50+ | many | YES (active damage work) |
| 14 | Dashboard KPI boxes | 4 | ~10 | 2 | **DEFERRED** |
| 15 | Fleet health surfaces | 2 | N/A | — | **DEFERRED** |

---

## 23. Top-5 Deep Comparison (summary)

### #1 Operator Task Card rows (SELECTED)

- **Paths:** `OperatorTaskCard.tsx`, `operatorTaskCard.utils.ts`, `OperatorTaskCardConnected.tsx`, new `operator-task-card-i18n.ts`
- **Mount:** `/operator` Today feed + Tasks tab + QV tasks sheet
- **Audience:** Operator mobile/tablet
- **Visible debt:** ~26 strings (card + utils labels)
- **Fixed-locale:** `formatOperatorTaskDue` de-DE (include formatter fix in adapter boundary)
- **Machine inputs:** status, priority, overdue, completionMode, action kinds, task.type
- **Dynamic:** title, description, assignee name, vehicle/booking lines, API errors
- **Business risk:** 2/5 (presentation-only; reuse existing `tasks.*` adapters)
- **Collision:** LOW
- **Main drift:** LOW

### #2 Operator Tasks tab chrome

- Filters, summary chips, empty states, FAB — independent slice; natural **P247**.

### #3–5

- Vehicles, AI Upload, Access — defer; no collision with P246.

---

## 24–26. Campaign Decision

| Comparison | Score |
|------------|-------|
| Best Operator (Task Card) | **47** |
| Best external (Rental billing) | 10 |
| Best Dashboard | **DEFERRED** |
| Best Vehicle/Fleet | **DEFERRED** |

**Campaign direction: A — CONTINUE OPERATOR**

**Operator completion declaration:** *(not applicable — campaign continues)*

---

## 27. Selected P246 Target

# **P2.2.46 — Operator Task Card Row Localization**

Explicit completion of the surface deferred by P245. Localizes card chrome and action labels visible in Today feed and Tasks tab without touching Today chrome (frozen) or Tasks tab shell (P247).

---

## 28. Split Decision

# **SPLIT REQUIRED — FIRST SUB-SLICE SELECTED**

P245 established the pattern: chrome first (Today), rows second (Task Card). Tasks tab chrome (`OperatorTasksView`) is a separate bounded slice (~25 keys) → **P247**.

---

## 29. Exact Production Boundary

### In scope

| Path | Role |
|------|------|
| `frontend/src/operator/tasks/OperatorTaskCard.tsx` | Card row UI |
| `frontend/src/operator/tasks/operatorTaskCard.utils.ts` | Presentation labels only (action labels, timing prefixes, assignee fallbacks, checklist chrome, disabled reasons) |
| `frontend/src/operator/tasks/OperatorTaskCardConnected.tsx` | Wiring only (no literals expected) |
| `frontend/src/operator/lib/operator-task-card-i18n.ts` | **NEW** bounded adapter |

### Out of scope (frozen / deferred)

- P216–P245 all frozen paths
- `OperatorTodayView`, `OperatorTodayTaskFeed`, `operator-today-i18n.ts`
- `OperatorTasksView.tsx` (P247)
- `OperatorTaskDetail.tsx` (already i18n-clean)
- `useOperatorTaskActions.ts` toast copy (P247b or bundled only if zero semantic risk)
- `operatorTask.utils.ts` filter/sort/`isDueToday` (touch **only** `formatOperatorTaskDue` via adapter delegation)

### Mount / audience

- **Route:** `/operator` (tabs `today`, `tasks`; QV tasks section)
- **Audience:** Rental org operators with tasks permission
- **Production reachable:** YES

---

## 30. Machine / Domain Freeze Matrix

| Value | Source | Business use | May localize display? | Must remain unchanged |
|-------|--------|--------------|----------------------|---------------------|
| `task.status` | API | workflow, filters | YES | enum values |
| `task.priority` | API | sort, badge | YES | enum values |
| `task.isOverdue` | API | sort, tone | YES (label only) | boolean |
| `task.dueDate` | API | sort, timing | format only | ISO timestamp |
| `task.activatesAt` | API | activation gate | format only | ISO timestamp |
| `task.completionMode` | API | terminal actions | YES (auto-resolved chip) | enum |
| `OperatorTaskCardActionKind` | utils | mutation routing | YES (labels) | kind strings |
| `task.type` | API | CTA selection | YES (type CTAs) | enum |
| `task.title/description` | API | display | **NO** | raw text |
| `assignedUserName` | API | display | **NO** | raw text |
| Vehicle/booking lines | derived | display | **NO** | raw text |
| `actionError` / API errors | runtime | alert | **NO** | raw message |

---

## 31. Dynamic Data Freeze

Remain raw: `task.title`, `task.description`, `assignedUserName`, vehicle label/plate lines, booking refs, checklist counts, `actionError`, backend toast errors.

---

## 32. Callback / Navigation Freeze

All callbacks identical to baseline: `onOpen`, `onAction(kind)`, controller handover/booking/invoice routes, `task.id` args, permissions via existing controller — **no change**.

---

## 33. Filter / Sort / Order Freeze

Card slice does not modify `filterOperatorTasks`, `sortOperatorTasks`, bucket membership, or React keys (`task.id`). Locale must not influence ordering.

---

## 34. Date / Time Freeze

- Raw: `dueDate`, `activatesAt`, `isOverdue`
- Replace `formatOperatorTaskDue` fixed `de-DE` with locale-aware formatter in adapter
- Prefix strings (`Fällig`, `Aktiv ab`) → TranslationKey templates

---

## 35. Tone / Icon Freeze

`taskStatusTone`, `PriorityBadge`, status chip tones — unchanged mapping; only label text localizes.

---

## 36. Key Reuse Audit

| Concept | Strategy |
|---------|------------|
| Status labels | **SEMANTIC REUSE** `tasks.filter.status.*` |
| Priority | **SEMANTIC REUSE** `tasks.filter.priority.*` |
| Start/resume/waiting/comment | **EXACT REUSE** `tasks.detail.actions.*` |
| Timing due/active | **SEMANTIC REUSE** `tasks.detail.timing.*` patterns |
| Checklist progress/blocker | **SEMANTIC REUSE** `tasks.detail.checklist.*` |
| Type-specific CTAs | **NEW** `operator.task.card.action.*` (~8) |
| Card chrome (aria, unavailable, assignee prefix) | **NEW** `operator.task.card.*` (~10) |
| Overdue chip | **NEW** `operator.task.card.overdue` |
| Auto-resolved chip | **NEW** `operator.task.card.autoResolved` |
| Disabled reasons in utils | **NEW** `operator.task.card.disabled.*` (~6) |

**Estimated net new keys: ~24–28** (within bounded slice; >30 avoided via reuse)

---

## 37. Adapter Strategy

# **NEW BOUNDED PRESENTATION ADAPTER**

`operator-task-card-i18n.ts` — delegates to existing `tasks.*` presentation adapters where possible; no filter/sort/mutation logic.

---

## 38. Extraction Strategy

# **KEEP EXISTING COMPONENTS**

No structural extraction required.

---

## 39. P246 Enforce-Clean Boundary

```text
P246_ENFORCE_CLEAN_EXACT =
  operator/tasks/OperatorTaskCard.tsx
  operator/tasks/operatorTaskCard.utils.ts
  operator/tasks/OperatorTaskCardConnected.tsx
  operator/lib/operator-task-card-i18n.ts
```

Excludes: P216–P245, Tasks view, Task detail, Today surfaces, QV, Fleet/Vehicle/DIMO, Dashboard, dynamic fields.

---

## 40. Test Contract (future)

`operator-task-card-localization.test.tsx`:

- EN + DE render
- Same-mount DE↔EN preserves task IDs, order, React keys
- Dynamic title `Ölwechsel prüfen`, assignee `Max Mustermann`, vehicle `Audi A7 55 TFSI` raw
- Status/priority machine values preserved; labels switch locale
- Overdue/due formatting locale-aware; predicates unchanged
- Callback args/kinds unchanged
- No raw `operator.task.card.` key leakage
- P246 enforce-clean = 0

---

## 41. Category E Feasibility

**FEASIBLE** — presentation-only label/formatter changes; business predicates and mutation routing unchanged.

---

## 42. Active Collision

**NONE** for selected target.

---

## 43. Current Main Drift

**LOW** on P246 paths — no semantic conflict; implement from `664196a6` baseline.

---

## 44. Baseline Strategy

# **DIRECT FROM P245 MERGE BASELINE**

`664196a6dcdf56f2f2dd0c68867a1222903b1d3b`

---

## 45. Global Success Contract

Future P246 must achieve standard closure: selected debt 0, P246=0, P245–P216=0, global enforce-clean=0, EN=DE parity, shim≤29, Category E=0, tests/build PASS.

---

## 46. Campaign Forecast

| Slice | Target |
|-------|--------|
| **P246** | Operator Task Card rows |
| **P247** (forecast) | Operator Tasks tab chrome (`OperatorTasksView`) |
| **P248** (forecast) | Operator Vehicles tab + fleet presentation utils |

Operator campaign likely closes after P248–P250 (Vehicles + AI Upload + access chrome).

---

## 48. Final Report Summary

See sections above for items 1–60.

| # | Item | Value |
|---|------|-------|
| 1 | Authoritative baseline | `664196a6dcdf56f2f2dd0c68867a1222903b1d3b` |
| 2 | Baseline provenance | Merged PR #1301 |
| 3 | Current main SHA | `75579f1373171807ce9132158a9fcb29cfb40307` |
| 4 | Baseline topology | PARALLEL CAMPAIGN BASELINE (behind main) |
| 5 | Baseline health | PASS |
| 6–10 | EN/DE/parity/orphans/shim | 8667/8667/100%/0/29 |
| 11 | P245 freeze | PASS |
| 12 | P244–P216 freeze | PASS |
| 13 | Global enforce-clean | 0 |
| 14 | Active exclusion map | #1302/#1304 NONE collision |
| 15 | Operator residual inventory | 14 files, 39 scanner findings |
| 16 | Operator closure gate | **OPERATOR HAS STRONG NEXT SLICE** |
| 17–19 | Task Card audit | Eligible; machine/display separation OK |
| 20 | Notifications | No panel candidate |
| 21 | Best dialog/sheet | Task Card rows |
| 22–26 | Challengers | Operator wins; Dashboard/Fleet deferred |
| 27–28 | Global scans | Documented |
| 29 | Top-15 ranking | Task Card #1 (47/50) |
| 30 | Top-5 comparison | Task Card selected |
| 31 | Best Operator score | **47** |
| 32 | Best external score | **10** |
| 33 | Campaign direction | **A — CONTINUE OPERATOR** |
| 34 | Operator completion | N/A (continues) |
| 35 | Selected target | **P2.2.46 — Operator Task Card Row Localization** |
| 36 | Split decision | **SPLIT REQUIRED — FIRST SUB-SLICE (Task Card)** |
| 37–38 | Production paths / mount | Documented §29 |
| 39 | Audience | Operator users |
| 40–46 | Freeze matrices | Documented §30–35 |
| 47 | Key reuse | Heavy `tasks.*` reuse + ~24–28 new |
| 48 | Estimated new keys | **~24–28** |
| 49 | Adapter strategy | NEW bounded adapter |
| 50 | Extraction strategy | KEEP EXISTING COMPONENTS |
| 51 | P246 enforce-clean | 4 paths |
| 52 | Test contract | Defined §40 |
| 53 | Category E | Feasible |
| 54 | Active collision | NONE |
| 55 | Main drift | LOW |
| 56 | Baseline strategy | DIRECT FROM P245 MERGE |
| 57 | Campaign forecast | P246 Task Card → P247 Tasks tab → P248 Vehicles |
| 58 | Audit artifact | This file |
| 59 | Audit PR | Draft (see branch) |
| 60 | Final verdict | **B** |

---

## 49. Final Verdict

# **B — GO, BUT SPLIT — P2.2.46 SUB-SLICE SELECTED**

**P2.2.46 — Operator Task Card Row Localization**

**CAMPAIGN:** OPERATOR  
**OPERATOR STATUS:** continues (Task Card rows = deferred P245 follow-up; Tasks tab chrome → P247)

**IMPLEMENTATION NOT STARTED.**

---

*Audit-only artifact. No production, dictionary, test, scanner, or architecture changes.*
