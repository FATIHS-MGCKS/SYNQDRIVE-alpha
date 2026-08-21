# P2.2.16C — Task Detail UI Localization — Read-Only Pre-Flight

**Date:** 2026-08-22  
**Mode:** STRICT READ-ONLY AUDIT / IMPLEMENTATION CONTRACT  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Post-P216B.2 baseline:** `3d0dc9067efcbcb2f56e17317ddebc4c39dcb0f1`  
**Merged PR:** [#1125](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1125) — P2.2.16B.2 Task Timeline Locale Threading  
**Independent re-audit:** [#1126](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1126)

---

## Final verdict

**B — GO, BUT SPLIT**

Recommend **P2.2.16C.1 — Task Detail Chrome & View-Model Presentation** as the first implementation slice. Defer **P2.2.16C.2 — Actions, Dialogs & Completion Flows** until C.1 is frozen.

PR #1125 merge and P216B2 freeze verified. No baseline/topology issue. No architectural prerequisite blocking localization. Split recommended because action/dialog surfaces materially increase runtime risk relative to chrome-only presentation.

---

## 0. Provenance — post-P216B2 baseline

| Check | Independent result |
|-------|-------------------|
| PR #1125 merged | ✅ `state: MERGED`, `mergedAt: 2026-08-21T22:55:02Z` |
| Merge commit SHA | **`3d0dc9067efcbcb2f56e17317ddebc4c39dcb0f1`** ✅ matches known value |
| Merge commit message | `P2.2.16B.2 — Task Timeline Locale Threading (#1125)` |
| Implementation head merged | `76397e4b7d63ebc235cad9c7e635ac1736712ecc` (whitespace correction included) |
| Base branch content tip | `origin/cursor/p227b-voice-telephony-test-center-preflight-3c10` @ **`3d0dc906`** |
| P216A ancestry (`1370a384`) | ✅ ancestor |
| P216B1 ancestry (`8941158c`) | ✅ ancestor |
| P216B2 ancestry (`76397e4b`) | ✅ ancestor |
| Stale impl branch | Not used — audited detached @ merge commit |
| Audit-only branch | Not used as baseline |
| Local == remote @ baseline | ✅ verified at audit time |

```
POST_P216B2_CONTENT_HEAD=3d0dc9067efcbcb2f56e17317ddebc4c39dcb0f1
```

---

## 1. Current i18n baseline (recomputed @ `3d0dc906`)

**Scanner methodology:** `node scripts/i18n-hardcoded-scan.mjs` → `src/i18n/hardcoded-copy-inventory.json` (single canonical inventory pass).

| Metric | Value |
|--------|-------|
| Global unique findings | **1755** |
| MASTER | 1049 |
| RENTAL | 488 |
| OPERATOR | 158 |
| SHARED | 35 |
| SHELL | 25 |
| Enforce-clean (global) | **2** (VehiclePickerStep only) |
| Canonical EN keys | **7773** |
| Canonical DE keys | **7773** |
| EN/DE parity | **100%** |
| Shim total | **29** (prod 18, test 11) |
| Canon `../../i18n/` imports | 491 |

### Existing enforce-clean boundaries (all present @ baseline)

P21, P22, P23, P24, P25, P26, P27A, P27B, P28, P29, P210, P211, P212, P213, P214, P215, **P216A**, **P216B1**, **P216B2**

P216A/B1/B2 scoped tests: **0 findings each** (verified via `hardcoded-copy-guard.test.ts -t "scopes P2.2.16"`).

---

## 2. P216B2 freeze verification

| Gate | Result |
|------|--------|
| `TASK_TIMELINE_BRIDGE_LOCALE` in production `taskTimeline.utils.ts` | **0** ✅ |
| Hardcoded timeline `de`/`de-DE` ownership in B.2 path | **0** ✅ |
| Three hosts thread `useLanguage().locale` | ✅ GlobalTaskDetailPanel, VehicleTaskDetailDrawer, OperatorTaskDetail |
| EN timeline German canonical leakage | **0** (B.2 tests) |
| P216B1 enforce-clean | **0** ✅ |
| P216B2 enforce-clean | **0** ✅ |
| New compat consumers | **0** ✅ |

B.1/B.2 scope must remain untouched in P216C.

---

## 3. Primary target — Task Detail UI chrome (not Timeline)

Timeline presentation is owned by **P216B1** (taxonomy) + **P216B2** (locale threading). P216C owns **surrounding Task Detail chrome**.

### Chrome inventory (user-facing, non-timeline)

| Area | Current state | Primary location |
|------|---------------|------------------|
| Panel/drawer title fallback | Hardcoded `'Aufgabe'` | `TaskDetailShell.tsx` |
| Section headings | Hardcoded DE | `TaskDetailBody.tsx`, `TaskDetailNotesActivitySection.tsx`, `TaskDetailChecklistSection.tsx` |
| Status/priority chips | From view model (`taskStatusLabelDe`, `vehicleTaskPriorityLabel` w/o locale) | `taskDetailView.utils.ts` |
| Meta labels (assignee, due, created…) | Mixed: rental hosts use `t('tasks.detail.*')`; shared body uses view model | Hosts + view model |
| Technical details rows | Hardcoded DE labels | `taskDetailView.utils.ts` |
| Linked object type labels | Hardcoded DE map | `taskDetailView.utils.ts` |
| Reason section | Hardcoded DE prefixes + fallback | `TaskDetailBody.tsx`, view model |
| Next-step section | Hardcoded DE heading | `TaskDetailBody.tsx` |
| Action buttons | Hardcoded DE labels | `taskDetailActions.utils.ts` |
| Cancel confirm dialog | Hardcoded DE | `TaskDetailActionsHost.tsx` |
| Complete dialog | Hardcoded DE (~18 strings) | `TaskDetailCompleteDialog.tsx` |
| Completion summary | Hardcoded DE | `TaskDetailCompletionSummary.tsx` |
| Checklist chrome | Hardcoded DE + utils templates | `TaskDetailChecklistSection.tsx`, `taskDetailChecklist.utils.ts` |
| Notes/activity chrome | Hardcoded DE | `TaskDetailNotesActivitySection.tsx` |
| Comment form | Hardcoded DE placeholder/labels | `TaskDetailNotesActivitySection.tsx` |
| Date/time display (non-timeline) | Hardcoded `de-DE` | `task-detail.utils.ts`, view model, `VehicleTaskDetailDrawer` meta rows |
| Operator sheet title | Hardcoded `'Aufgabe'` | `OperatorTaskSheet.tsx` |
| Empty/error/loading | Partially localized in rental hosts; shared shell/body not | Mixed |

---

## 4. Task Detail production surfaces

### Canonical full-detail renderers (3)

| File | Domain | Shared stack | Locale | Scanner findings | Test coverage |
|------|--------|--------------|--------|------------------|---------------|
| `rental/components/tasks/GlobalTaskDetailPanel.tsx` | Rental | Shell+Body+VM | ✅ `t`, `locale` | 0 (uses `t()`) | Indirect via shared component tests |
| `rental/components/tasks/VehicleTaskDetailDrawer.tsx` | Rental | Shell+Body+VM | ✅ `t`, `locale` | 0 (uses `t()`) | Indirect; host-specific meta uses `formatTaskDateTime` (de-DE) |
| `operator/tasks/OperatorTaskDetail.tsx` | Operator | Shell+Body+VM | ✅ `locale` | 0 | Indirect |

### Delegating parents (open canonical hosts)

| File | Domain | Opens |
|------|--------|-------|
| `rental/components/TasksView.tsx` | Rental | GlobalTaskDetailPanel |
| `rental/components/VehicleTasksView.tsx` | Rental | VehicleTaskDetailDrawer |
| `rental/components/service-center/ServiceTasksPanel.tsx` | Rental | VehicleTaskDetailDrawer |
| `rental/components/service-center/ServiceSchedulePanel.tsx` | Rental | VehicleTaskDetailDrawer |
| `rental/components/service-center/ServiceHistoryPanel.tsx` | Rental | VehicleTaskDetailDrawer |
| `rental/components/service-center/ServiceOverviewPanel.tsx` | Rental | VehicleTaskDetailDrawer + standalone `TaskDetailCompleteDialog` |
| `operator/views/OperatorTasksView.tsx` | Operator | OperatorTaskDetail (inline/sheet) |
| `operator/components/OperatorTaskSheet.tsx` | Operator | OperatorTaskDetail (hardcoded sheet title) |
| `operator/components/OperatorActionSheets.tsx` | Operator | Routes to OperatorTaskSheet |

**Master:** no Task Detail host.

### Shared presentation layer (P216C core)

| File | Role |
|------|------|
| `lib/tasks/taskDetailView.utils.ts` | View-model builder — largest hidden-debt concentration |
| `lib/tasks/components/TaskDetailShell.tsx` | Drawer/inline shell |
| `lib/tasks/components/TaskDetailBody.tsx` | Main detail body |
| `lib/tasks/components/TaskDetailNotesActivitySection.tsx` | Notes + activity tabs |
| `lib/tasks/components/TaskDetailChecklistSection.tsx` | Checklist UI |
| `lib/tasks/components/TaskDetailActionBar.tsx` | Action button renderer |
| `lib/tasks/components/TaskDetailActionsHost.tsx` | Actions + dialogs wiring |
| `lib/tasks/components/TaskDetailCompleteDialog.tsx` | Completion form dialog |
| `lib/tasks/components/TaskDetailCompletionSummary.tsx` | Post-completion summary |
| `lib/tasks/taskDetailActions.utils.ts` | Action plan labels |
| `lib/tasks/taskDetailChecklist.utils.ts` | Checklist progress/blocker labels |
| `lib/tasks/taskCompleteForm.utils.ts` | Validation error messages |
| `rental/lib/task-detail.utils.ts` | `formatTaskDateTime` / `formatTaskDate` / `taskStatusLabelDe` |

---

## 5. Shared view-model / utility audit

| File | Class | Presentation debt |
|------|-------|-------------------|
| `taskDetailView.utils.ts` | D | ~25+ DE strings: linked-type map, timing templates, technical rows, reason fallback, status/priority without locale |
| `taskDetailActions.utils.ts` | D | 6 action labels + completion summary fallbacks |
| `taskDetailChecklist.utils.ts` | D | Progress template, blocker labels, legacy hint |
| `taskDetailCompletion.utils.ts` | E | Machine only — delegates labels |
| `taskCompleteForm.utils.ts` | D | 5 validation error strings |
| `task-detail.utils.ts` | C/D | Hardcoded `de-DE` formatters; `taskStatusLabelDe` |
| `task-display.utils.ts` | D | Locale-aware helpers exist but **not wired** into detail view model for priority |

---

## 6. `taskSourceLabel` debt

| Item | Finding |
|------|---------|
| Definition | `service-task-semantics.ts:70` → `taskSourceBadgeLabel(deriveTaskSourceBadge(task))` |
| Underlying map | `task-operator.utils.ts` `SOURCE_LABEL_DE` (hardcoded German) |
| Production consumers | **`ServiceTaskCard.tsx` only** (service center list badge) |
| Task Detail usage | **None** — detail uses API `humanReadableSource` |
| Canonical keys exist | `tasks.filter.source.*`, `tasks.display.*` partially cover sources |
| P216C disposition | **Out of scope for C.1/C.2 core** — belongs to service-center card follow-up or small adjunct if badge shown in detail later |
| Note | Not the same as B.2 `humanizeResolutionReason` bridge |

---

## 7. Status / priority / type / category / source presentation

| Machine value | Current display path | Existing canonical key | New key? |
|---------------|---------------------|------------------------|----------|
| Status enum | `taskStatusLabelDe` → API helper | `tasks.filter.status.*` | **Reuse (B)** |
| Priority enum | `vehicleTaskPriorityLabel(priority)` no locale | `tasks.filter.priority.*` | **Reuse (B)** — wire locale |
| Task type | API `summary.type` raw in technical row | `tasks.type.*` | **Reuse (B)** for display |
| Category | Passthrough string | — | User/API data — do not translate |
| Source (detail) | `humanReadableSource` API field | `tasks.filter.source.*` if normalized | **Ambiguous (D)** — API string may already be localized server-side |
| Service area | Not in shared detail body | — | N/A in current chrome |

**Do not create second taxonomy** — reuse P216A `service-task-presentation-i18n.ts` and `tasks.filter.*` keys.

---

## 8. Actions — high risk inventory

| Action kind (machine) | Label (current DE) | Callback/API | Risk |
|----------------------|-------------------|--------------|------|
| `start` | Starten | `useTaskDetailActions` mutation | HIGH |
| `resume` | Fortsetzen | mutation | HIGH |
| `moveToWaiting` | Warten | mutation | HIGH |
| `complete` | Erledigen | opens complete dialog → mutation | HIGH |
| `comment` | Kommentar | focus comment form | MODERATE |
| `cancel` | Abbrechen | confirm dialog → mutation | HIGH |

**Architecture required:** `kind` (machine) → localized `label`. Labels in `buildTaskDetailActionPlan`; kinds unchanged in `TaskDetailActionBar` / `useTaskDetailActions`.

**Action count:** 6 machine kinds + terminal overflow comment variant.

---

## 9. Dialogs / confirmations

| Dialog | Location | Scanner-visible | Workflow risk |
|--------|----------|-----------------|---------------|
| Cancel confirm | `TaskDetailActionsHost.tsx` | 1 finding | HIGH (cancel mutation) |
| Complete form | `TaskDetailCompleteDialog.tsx` | 9 findings | HIGH (complete mutation + validation) |
| Assign/forward | `GlobalTaskDetailPanel.tsx` | 0 (already `t()`) | MODERATE |
| ServiceOverview quick-complete | `ServiceOverviewPanel` + `TaskDetailCompleteDialog` | Separate entry path | HIGH |

**Dialog count in shared layer:** 2 primary (cancel confirm, complete dialog).

---

## 10. Assignment / people labels

| Concept | Current | P216C approach |
|---------|---------|----------------|
| Assigned / unassigned | `tasks.display.unassigned` in hosts; `'Nicht zugewiesen'` in view model technical row | Reuse + extend `tasks.detail.*` |
| Created by / updated by | Technical row labels hardcoded DE | New `tasks.detail.technical.*` keys |
| Unknown user | Timeline uses `tasks.timeline.actor.*` (B.1) | Reuse for detail if needed |
| Actor names | Preserved from API | No translation |

---

## 11. Linked entity chrome

`LINKED_OBJECT_TYPE_LABELS` in `taskDetailView.utils.ts`:

| Type token | Current DE | Reuse candidate |
|------------|-----------|-----------------|
| VEHICLE | Fahrzeug | `vehicles.*` or `tasks.detail.linked.vehicle` |
| BOOKING | Buchung | `bookings.*` / `tasks.display.booking` |
| CUSTOMER | Kunde | `customers.*` |
| INVOICE | Rechnung | `invoices.*` |
| DOCUMENT | Dokument | `documents.*` |
| ALERT | Hinweis | new or `common.*` |
| SERVICE_CASE | Servicefall | new |
| FINE | Bußgeld | `fines.*` |
| VENDOR | Partner | `vendors.*` |

**Linked entity presentation count:** 9 type labels + empty state `"Keine verknüpften Objekte."` + navigation affordances in body.

---

## 12. Date / time presentation (non-timeline)

| Location | Formatter | Locale |
|----------|-----------|--------|
| `task-detail.utils.ts` | `formatTaskDateTime`, `formatTaskDate` | Hardcoded **`de-DE`** |
| `taskDetailView.utils.ts` | Uses above for comments, technical rows, reason | de-DE |
| `VehicleTaskDetailDrawer.tsx` | Meta rows `formatTaskDateTime` | de-DE |
| `TaskDetailActionsHost.tsx` | Completion summary datetime | de-DE via inject |
| Timeline (B.2) | `formatTaskTimelineDateTime` + `getFormattingLocale` | ✅ locale-aware |

**P216C should:** introduce locale-threaded detail datetime helpers (or extend `task-detail.utils.ts` with `SupportedLocale` param) mirroring B.2 pattern. Preserve raw ISO values and timezone semantics.

**Date/time debt sites:** 5 production paths (above).

---

## 13. Comments / attachments chrome

| String | File | Scanner |
|--------|------|---------|
| Notizen und Aktivität / Notizen / Aktivität | NotesActivitySection | 9 findings |
| Comment placeholder, save, empty states | NotesActivitySection | included |
| Anhänge / Abschluss-Notiz | NotesActivitySection | included |
| User comment body | From API | **Do not translate** |
| Filenames | From API | **Do not translate** |

---

## 14. Empty / error / loading states

| State | Location | Localized? |
|-------|----------|------------|
| Loading skeleton | TaskDetailShell | N/A (no text) |
| Load error | VehicleTaskDetailDrawer | ✅ `tasks.detail.loadError*` |
| No linked objects | TaskDetailBody | ❌ hardcoded DE |
| No notes / no activity | NotesActivitySection | ❌ hardcoded DE |
| No task selected | N/A at host level | — |
| Shell title fallback | TaskDetailShell | ❌ `'Aufgabe'` |

---

## 15. Blind-spot search

### Scanner-visible (task-detail-adjacent @ baseline)

**39 findings** in task paths:

| Count | File |
|------:|------|
| 9 | `TaskDetailCompleteDialog.tsx` |
| 9 | `TaskDetailNotesActivitySection.tsx` |
| 7 | `TaskDetailBody.tsx` |
| 5 | `TaskDetailChecklistSection.tsx` |
| 1 | `TaskDetailActionsHost.tsx` |
| 1 | `TaskDetailCompletionSummary.tsx` |
| 1 | `TaskDetailShell.tsx` |
| 1 | `TaskDetailActionBar.tsx` |
| 4 | `operator/tasks/OperatorTaskCard.tsx` (out of C core) |
| 1 | `operator/tasks/OperatorTaskCreateForm.tsx` (out of C core) |

### Hidden presentation literals (scanner blind — object maps / utils)

| File | ~Hidden DE strings |
|------|-------------------|
| `taskDetailView.utils.ts` | 25+ |
| `taskDetailActions.utils.ts` | 8 |
| `taskDetailChecklist.utils.ts` | 5 |
| `taskCompleteForm.utils.ts` | 5 |
| `task-detail.utils.ts` | format locale (not prose) |

**Total P216C candidate debt:** ~33 scanner + ~43 hidden ≈ **76 presentation sites** (excluding timeline B.1/B.2).

---

## 16. Machine / workflow semantics — Category E freeze

Machine values that must **not** change:

- Task IDs, status/priority/type/source enums
- Action kinds: `start|resume|moveToWaiting|complete|comment|cancel`
- API endpoints, payload keys, mutation names
- Permission checks (`canManageTasks`, `canWriteTasks`, role gates)
- Route IDs, linked entity IDs
- Timestamp ISO values, sort order, event codes
- Checklist item IDs, completion modes, resolution codes (machine)

**Category E expectation: 0** — localization is presentation-only.

---

## 17. Permissions

Permission-gated actions flow through `availableActions` from API + host props. Localization can change visible labels only; `enabled`/`disabledReason` semantics and role checks in hosts remain unchanged.

**No permission-ID changes required.**

---

## 18. Routing / navigation

Linked-object navigation uses `useTaskLinkedObjectNavigator` / `taskLinkedObjectNavigation.ts` — routes and entity IDs are machine values. Localize display labels only (`typeLabel`, button text).

---

## 19. Canonical key reuse

| Classification | Estimate |
|----------------|----------|
| A — exact reuse | ~20 (`tasks.filter.status.*`, `tasks.filter.priority.*`, `common.save/cancel/close`, existing `tasks.detail.*` host keys) |
| B — semantic reuse | ~15 (`tasks.type.*`, `tasks.display.*`, `tasks.timeline.actor.*`) |
| C — genuinely new | ~35–45 (`tasks.detail.section.*`, `tasks.detail.technical.*`, `tasks.detail.linked.*`, `tasks.detail.checklist.*`, `tasks.detail.complete.*`, `tasks.detail.action.*`) |
| D — ambiguous | ~5 (API `humanReadableSource`, category free text) |
| E — machine | enums/IDs — no keys |

**Duplicate risk:** LOW if new keys follow `tasks.detail.*` namespace already started.  
**Orphan risk:** LOW — inventory shows no existing `tasks.detail.section.*` orphans.

---

## 20. Expected key growth

| Slice | New keys estimate |
|-------|-------------------|
| P216C.1 (chrome + view model + dates) | **~25–35** |
| P216C.2 (actions + dialogs + validation) | **~15–20** |
| **Total P216C** | **~40–55** |

Post-implementation EN/DE: ~7815–7830 (still 100% parity target).

Not a mega-slice if split; borderline as single slice.

---

## 21. One slice or split?

| Option | Assessment |
|--------|------------|
| A — one bounded P216C | Feasible but ~76 sites + 6 mutation actions + 2 dialogs in one PR |
| **B — split (recommended)** | C.1 chrome/view-model/dates (MODERATE risk); C.2 actions/dialogs (HIGH risk) |
| C — prerequisite | Not needed — `useLanguage` already available in hosts |

**Decision: SPLIT (B)**

---

## 22. Proposed `P216C_ENFORCE_CLEAN_EXACT` boundaries

### P216C.1 (first slice)

```
lib/tasks/taskDetailView.utils.ts
lib/tasks/taskDetailChecklist.utils.ts
lib/tasks/components/TaskDetailBody.tsx
lib/tasks/components/TaskDetailShell.tsx
lib/tasks/components/TaskDetailNotesActivitySection.tsx
lib/tasks/components/TaskDetailChecklistSection.tsx
rental/lib/task-detail.utils.ts
operator/components/OperatorTaskSheet.tsx
```

Optional host touch (date wiring only, no new literals):
```
rental/components/tasks/VehicleTaskDetailDrawer.tsx
```

**Exclude:** B.1/B.2 timeline files, `taskDetailActions.utils.ts`, dialog/action files.

### P216C.2 (deferred)

```
lib/tasks/taskDetailActions.utils.ts
lib/tasks/taskCompleteForm.utils.ts
lib/tasks/components/TaskDetailActionBar.tsx
lib/tasks/components/TaskDetailActionsHost.tsx
lib/tasks/components/TaskDetailCompleteDialog.tsx
lib/tasks/components/TaskDetailCompletionSummary.tsx
```

---

## 23. Blind-spot guard design

Proposed guards (no weakening of P216A/B1/B2):

1. Grep ban: hardcoded German action labels in `taskDetailActions.utils.ts` (`Starten`, `Erledigen`, etc.)
2. Grep ban: `LINKED_OBJECT_TYPE_LABELS` German map in view model
3. Grep ban: `toLocaleString('de-DE'` / `toLocaleDateString('de-DE'` in P216C paths
4. Require `TranslationKey` or `t()` usage in enforce-clean surfaces
5. Require `buildTaskDetailViewModel` to thread locale to status/priority/datetime formatters (extend B.2 pattern)

---

## 24. Test quality audit

| Area | Grade | Notes |
|------|-------|-------|
| `taskDetailView.utils` | ACCEPTABLE | 6 tests; timeline locale covered (B.2); chrome not EN/DE tested |
| Shared components | WEAK | 28 tests pass but assert German strings / no locale switch |
| Host components | NONE | No direct render tests for GlobalTaskDetailPanel / VehicleTaskDetailDrawer / OperatorTaskDetail |
| Actions/dialogs | ACCEPTABLE | Action bar tests use German labels; verify `kind` not label |
| Permissions | NONE | No localization+permission integration tests |

**Overall: WEAK** for locale presentation; **ACCEPTABLE** for machine/action-kind preservation.

---

## 25. Required future test plan

### P216C.1 minimum

1. `buildTaskDetailViewModel` EN/DE chrome (status, priority, technical labels, linked types)
2. Locale-threaded `formatTaskDateTime` / `formatTaskDate`
3. `TaskDetailBody` render EN + DE (section headings)
4. `TaskDetailNotesActivitySection` tab labels EN/DE
5. Locale switch updates chrome (same mount)
6. Timeline still switches (B.2 regression)
7. User content unchanged (titles, comments)
8. P216C.1 enforce-clean = 0
9. Real host smoke: VehicleTaskDetailDrawer meta dates follow locale

### P216C.2 minimum

10. Action plan labels EN/DE; **kinds unchanged**
11. Complete dialog EN/DE; submit payload unchanged
12. Cancel confirm EN/DE; mutation unchanged
13. Validation errors EN/DE
14. Permission-gated visibility unchanged
15. P216C.2 enforce-clean = 0

---

## 26. Action semantic test plan

For each of `complete`, `cancel`, `start`, `assign` (where present):

- Assert `onAction(kind)` receives same `TaskDetailActionKind`
- Assert API mutation function names / payloads unchanged
- Only `label` string differs by locale

---

## 27. Server / client boundary

| Check | Result |
|-------|--------|
| Hosts are client components | ✅ use hooks |
| Utils remain hook-free | ✅ pass `locale`/`t` as params |
| New `"use client"` needed? | Unlikely — extend existing pattern |
| Hydration risk | Low if locale from existing `LanguageProvider` |

---

## 28. Shim / compatibility

| Metric | Value |
|--------|-------|
| Baseline shim | **29** |
| New compat consumers required | **0** |
| Task Detail compat shim | **None planned** |

---

## 29. VehiclePickerStep baseline debt

| File | Lines | Count |
|------|-------|------:|
| `rental/components/new-booking/VehiclePickerStep.tsx` | 348, 383 | **2** |

Unrelated to P216C. Do not fix in P216C.

---

## 30. Global / domain accounting (P216C candidates)

| Bucket | Count |
|--------|------:|
| P216C scanner-visible (shared components) | **33** |
| P216C hidden literals (utils) | **~43** |
| Rental Tasks module (scanner) | 13 total (includes non-detail) |
| Operator task-detail-adjacent | 5 (mostly OperatorTaskCard — out of C.1 core) |
| MASTER | 0 task-detail |
| SHARED lib/tasks | 33 |
| Global enforce-clean | 2 (VehiclePickerStep only) |

---

## 31. Runtime risk matrix

| Sub-area | Risk | Slice |
|----------|------|-------|
| Chrome / metadata / sections | MODERATE | C.1 |
| Status / type labels | LOW | C.1 |
| Source / service area | LOW | C.1 (API passthrough) |
| Linked entities | LOW | C.1 |
| Date formatting | MODERATE | C.1 |
| Comments / attachments chrome | MODERATE | C.1 |
| Actions | **HIGH** | C.2 |
| Dialogs / confirmations | **HIGH** | C.2 |
| Assignment host dialogs | MODERATE | Already localized in GlobalTaskDetailPanel |

---

## 32. Implementation contract — P216C.1 (recommended first slice)

### Title

**P2.2.16C.1 — Task Detail Chrome & View-Model Presentation**

### IN SCOPE

**Production files:**
- `frontend/src/lib/tasks/taskDetailView.utils.ts`
- `frontend/src/lib/tasks/taskDetailChecklist.utils.ts`
- `frontend/src/lib/tasks/components/TaskDetailBody.tsx`
- `frontend/src/lib/tasks/components/TaskDetailShell.tsx`
- `frontend/src/lib/tasks/components/TaskDetailNotesActivitySection.tsx`
- `frontend/src/lib/tasks/components/TaskDetailChecklistSection.tsx`
- `frontend/src/rental/lib/task-detail.utils.ts`
- `frontend/src/operator/components/OperatorTaskSheet.tsx` (title only)
- `frontend/src/rental/components/tasks/VehicleTaskDetailDrawer.tsx` (locale-aware date display only)

**Dictionary strategy:** Add ~25–35 `tasks.detail.*` keys; reuse `tasks.filter.status.*`, `tasks.filter.priority.*`, `tasks.type.*`, `common.*`.

**Tests:** New `task-detail-ui-localization.test.ts` + extend view-model tests.

**Governance:** `P216C1_ENFORCE_CLEAN_EXACT` (8 paths above).

**Docs:** architecture record + ChangesView entry.

### OUT OF SCOPE

- Timeline taxonomy (B.1) and locale threading (B.2)
- Action labels / dialogs / completion flows (C.2)
- `taskSourceLabel` / ServiceTaskCard badges
- `humanizeResolutionReason` deprecated wrapper
- Task list views, OperatorTaskCard, task create forms
- Backend / workflow / API semantics
- VehiclePickerStep debt

### Acceptance

1. P216C.1 enforce-clean = 0  
2. Hidden chrome literals in scoped files = 0  
3. EN/DE chrome correct; runtime locale switch  
4. Timeline B.2 regression clean  
5. Category E = 0  
6. EN/DE parity 100%  
7. Shim ≤ 29; new compat consumers = 0  
8. No scanner weakening; P216A/B1/B2 remain 0  
9. Meaningful tests PASS; build PASS; `git diff --check` PASS  

---

## 33. Split ranking

| Rank | Slice | Findings | New keys | Risk | First? |
|------|-------|----------|----------|------|--------|
| 1 | **C.1 Chrome + view model + dates** | ~50 | ~25–35 | MODERATE | **YES** |
| 2 | C.2 Actions + dialogs + completion | ~26 | ~15–20 | HIGH | Deferred |
| 3 | C.3 taskSourceLabel / service card badges | ~4 | ~8 | LOW | Optional follow-up |
| 4 | OperatorTaskCard / list surfaces | ~4 | reuse | LOW | Separate from detail |

---

## 34. Audit artifact

`docs/audits/i18n-p2-2-16c-task-detail-ui-preflight-2026-08-22.md`  
Branch: `cursor/p2216c-task-detail-ui-preflight-3c10`

---

## 35. Explicit confirmations

| Item | Status |
|------|--------|
| Production code modified | **NO** |
| Dictionaries modified | **NO** |
| Scanner modified | **NO** |
| Tests modified | **NO** |
| P216C implementation started | **NO** |
| P2.2.17 started | **NO** |
| Merged | **NO** |

---

## Changes / Architektur

Not updated (read-only preflight).

**Changes updated:** No  
**Architektur updated:** No

---

*End of P2.2.16C pre-flight. Proceed with P216C.1 implementation when approved.*
