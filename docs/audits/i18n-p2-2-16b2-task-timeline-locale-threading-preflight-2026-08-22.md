# P2.2.16B.2 — Task Timeline Locale Threading — Read-Only Pre-Flight / Implementation Contract

**Date:** 2026-08-22  
**Mode:** read-only analysis only — **no implementation**  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Program integration branch:** `cursor/p227b-voice-telephony-test-center-preflight-3c10`  
**Authoritative post-P216B1 content head:** `8941158c7d05ebad929ccbc35dbd2e4d6fccd7ce`  
**PR #1119:** MERGED 2026-08-21T22:19:16Z (merge commit `8941158c`)  
**Audit branch:** `cursor/p2216b2-task-timeline-preflight-3c10` @ `8941158c`  
**Prior slice:** P2.2.16B.1 — Task Timeline Event Taxonomy & Presentation Adapter (#1119)

---

## 0. Baseline verification

| Check | Result |
|-------|--------|
| PR #1119 merged | **YES** — `state: MERGED`, `mergeCommit.oid: 8941158c7d05ebad929ccbc35dbd2e4d6fccd7ce` |
| Exact merge SHA | `8941158c7d05ebad929ccbc35dbd2e4d6fccd7ce` |
| Integration branch tip | `8941158c` — **equals merge commit** |
| `POST_P216B1_CONTENT_HEAD` | **`8941158c7d05ebad929ccbc35dbd2e4d6fccd7ce`** |
| P216A present (`1370a384`) | **YES** — direct ancestor |
| P216B1 present | **YES** — tip commit |
| P216A enforce-clean | **0** (inventory filter on `P216A_ENFORCE_CLEAN_EXACT` — 17 paths) |
| P216B1 enforce-clean | **0** (inventory filter on `P216B1_ENFORCE_CLEAN_EXACT` — 2 paths) |
| Audit-only branch used as baseline | **NO** |
| Stale implementation branch as baseline | **NO** — verified against integration tip, not `6ff4352f` branch HEAD |
| Working tree at audit | **clean** |
| Local topology | Audit on `cursor/p2216b2-task-timeline-preflight-3c10` tracking `origin/cursor/p227b-voice-telephony-test-center-preflight-3c10` @ `8941158c` |

### Ancestry from prior frozen i18n slices

All verified as ancestors of `8941158c`:

| Slice | Representative merge | Ancestor |
|-------|---------------------|----------|
| P27B | `48423155` (P2.2.8 preflight) | YES |
| P28 | `a9e2a879` (P2.2.8 WhatsApp) | YES |
| P29 | `d78a6bab` (P2.2.9 Support) | YES |
| P210 | `d32987e8` (P2.2.10 Master Support Ops) | YES |
| P211 | `26d5e442` (P2.2.11 Handover) | YES |
| P212 | `c46be6ca` (P2.2.12 Fines) | YES |
| P213 | `2538942a` (P2.2.13 Operator Handover) | YES |
| P214 | `6973ec5b` (P2.2.14 Invoice List) | YES |
| P215 | `467f47a5` (P2.2.15 Vendor Directory) | YES |
| P216A | `1370a384` (#1113) | YES |
| P216B1 | `8941158c` (#1119) | YES (tip) |

**Note:** `main` (`origin/main` @ `2c4c1472` at fetch time) does **not** yet contain P216B1. The i18n hardening integration branch is the authoritative baseline for this slice, consistent with prior P2.2.x pre-flights.

---

## 1. P216B1 freeze verification

| Requirement | Status |
|-------------|--------|
| Hardcoded timeline presentation removed from `taskTimeline.utils.ts` | **CONFIRMED** — orchestration + bridge wrappers only |
| 13 explicit event types + generic fallback | **CONFIRMED** — `resolveTaskTimelineEventPresentation` switch arms `CREATED`…`UPDATED` + `default` |
| Machine event codes unchanged | **CONFIRMED** — `eventCode: event.type` preserved |
| +40 `tasks.timeline.*` keys | **CONFIRMED** — 40 keys in both `en.ts` and `de.ts` |
| Canonical EN/DE parity | **100%** — 7773 keys each (per B.1 implementation record) |
| P216B1 enforce-clean = 0 | **CONFIRMED** — `task-timeline-presentation-localization.test.ts` inventory assertion passes |
| `TASK_TIMELINE_BRIDGE_LOCALE = 'de'` exists | **CONFIRMED** — presentation-only bridge |
| No new shim/compat consumers | **CONFIRMED** — shim remains 29 |

### Bridge declaration (exact)

```typescript
// frontend/src/lib/tasks/taskTimeline.utils.ts:14-18
/**
 * B.1 bridge locale for hosts that do not pass active locale yet (P2.2.16B.2).
 * Preserves baseline German timeline copy until task detail hosts thread locale.
 */
const TASK_TIMELINE_BRIDGE_LOCALE = 'de' as const;
```

### Bridge consumers (production)

| Location | Function | Usage |
|----------|----------|-------|
| `taskTimeline.utils.ts:40` | `formatTaskTimelineSentence` | `locale ?? TASK_TIMELINE_BRIDGE_LOCALE` |
| `taskTimeline.utils.ts:50` | `formatTaskTimelineActor` | hardcoded `TASK_TIMELINE_BRIDGE_LOCALE` (no locale param) |
| `taskTimeline.utils.ts:77` | `buildTaskTimelineItems` | `options.locale ?? TASK_TIMELINE_BRIDGE_LOCALE` |
| `taskTimeline.utils.ts:100` | `buildTaskCommentAuthorLabel` | `locale ?? TASK_TIMELINE_BRIDGE_LOCALE` |
| `task-timeline-presentation-i18n.ts:397-398` | `humanizeResolutionReason` (deprecated) | hardcoded `'de'` — **adjacent bridge, not the constant** |

### Indirect consumers (via bridge defaults)

| Consumer | Path | Locale passed? |
|----------|------|----------------|
| `taskDetailView.utils.ts` | `buildTimeline` → `buildTaskTimelineItems` | **NO** |
| `taskDetailView.utils.ts` | comments map → `buildTaskCommentAuthorLabel` | **NO** |
| `taskDetailActions.utils.ts` | `humanizeResolutionReason` | **NO** (hardcoded `de` in deprecated wrapper) |

---

## 2. Primary objective (P2.2.16B.2)

Thread active product locale from canonical `LanguageContext` through Task Detail hosts into timeline presentation, removing `TASK_TIMELINE_BRIDGE_LOCALE`.

**Target architecture:**

```
LanguageContext.locale (SupportedLocale)
  → Task Detail host (React, useLanguage)
  → buildTaskDetailViewModel(detail, { locale, ... })
  → buildTaskTimelineItems(events, { locale })
  → task-timeline-presentation-i18n (translateKey + getFormattingLocale)
  → canonical EN/DE strings + locale-aware datetime
```

**Must remove:** `TASK_TIMELINE_BRIDGE_LOCALE = 'de'` and all hidden `'de'` defaults in the timeline presentation path.

**Must preserve:** machine event codes, ordering, API payloads, task semantics.

---

## 3. Active locale source

| Item | Value |
|------|-------|
| **Canonical provider** | `frontend/src/i18n/LanguageContext.tsx` |
| **Hook** | `useLanguage()` → `{ locale, setLocale, formattingLocale, t, translate, ... }` |
| **Locale type** | `SupportedLocale` (alias `Locale`) — `'de' \| 'en' \| 'pl' \| 'fr' \| 'cs' \| 'nl' \| 'es' \| 'tr' \| 'it'` |
| **Product shape** | Short codes (`'de'`, `'en'`) — **not** full BCP-47 in context state |
| **Formatting** | `getFormattingLocale(locale)` → BCP-47 (`de-DE`, `en-GB`, …) via `locales.ts` |
| **Default** | `DEFAULT_PRODUCT_LOCALE = 'en'` |
| **Rental shim** | `frontend/src/rental/i18n/LanguageContext.tsx` — re-export only, **not** a second source |
| **Runtime switching** | **YES** — `LanguageProvider` + `setLocale` tested in `LanguageContext.test.tsx` |
| **Existing timeline adapter** | `resolveTaskTimelinePresentationLocale()` + `getFormattingLocale()` already used in `formatTaskTimelineDateTime` |

**Convention:** Pass `SupportedLocale` (not BCP-47) into presentation layer; map to formatting locale inside adapter via existing helpers.

---

## 4. Complete timeline call chain

### Render flow (production)

```
Host (GlobalTaskDetailPanel | VehicleTaskDetailDrawer | OperatorTaskDetail)
  useMemo → buildTaskDetailViewModel(detail, options)     [plain TS — NO locale today]
    buildTimeline(detail, options)
      buildTaskTimelineItems(detail.timeline, { formatDateTime })   [bridge locale = 'de']
        formatTaskTimelineSentenceLocalized(locale, event)          [adapter]
        formatTaskTimelineDateTime(locale, createdAt, options)      [overridden by formatDateTime callback]
    comments.map → buildTaskCommentAuthorLabel(userId, members)     [bridge locale = 'de']
  → TaskDetailShell(model)
    → TaskDetailBody(model)
      → TaskDetailNotesActivitySection(model)
        → TaskDetailActivityPanel
          → Timeline(items={model.timeline})                        [presentation-only, pre-built strings]
```

### Layer-by-layer audit

| Layer | File | Locale available? | Locale passed? | B.2 change? |
|-------|------|-------------------|----------------|-------------|
| Host — Global | `GlobalTaskDetailPanel.tsx` | **YES** (`useLanguage`) | **NO** to view model | **YES** — pass `locale`, add to `useMemo` deps |
| Host — Vehicle | `VehicleTaskDetailDrawer.tsx` | **YES** | **NO** | **YES** |
| Host — Operator | `OperatorTaskDetail.tsx` | **NO** (`useLanguage` absent) | **NO** | **YES** — add `useLanguage`, pass `locale` |
| View model | `taskDetailView.utils.ts` | via options | **NO** | **YES** — add `locale` to `TaskDetailViewModelOptions`, thread to timeline + comment author |
| Timeline utils | `taskTimeline.utils.ts` | via options | bridge `'de'` | **YES** — remove bridge, require explicit locale |
| Adapter | `task-timeline-presentation-i18n.ts` | param | **YES** when called with locale | **MINOR** — remove deprecated `humanizeResolutionReason` hardcoded `'de'` or relocate |
| Shell/Body | `TaskDetailShell.tsx`, `TaskDetailBody.tsx` | via context possible | N/A (consumes model) | **NO** if model rebuilt on locale change |
| Activity section | `TaskDetailNotesActivitySection.tsx` | via context possible | N/A | **NO** for timeline strings; chrome deferred P216C |
| Pattern | `Timeline` component | N/A | N/A | **NO** |

### Machine/business coupling

Timeline path is **presentation-only**. No task fetch, mutation, or state-machine logic in the presentation chain.

---

## 5. Production hosts (exact enumeration)

### Unique host components (3)

| # | File | Domain | Surface | `useLanguage` | Server/client | Locale passable? |
|---|------|--------|---------|---------------|---------------|------------------|
| 1 | `rental/components/tasks/GlobalTaskDetailPanel.tsx` | Rental | Global tasks modal | **YES** (line 61) | Client (React hooks) | **YES** — mechanical |
| 2 | `rental/components/tasks/VehicleTaskDetailDrawer.tsx` | Rental | Vehicle/service tasks drawer | **YES** (line 58) | Client | **YES** — mechanical |
| 3 | `operator/tasks/OperatorTaskDetail.tsx` | Operator | Mobile task detail | **NO** | Client | **YES** — add hook |

### Parent mount points (7 touchpoints — recomputed)

| Parent | Host rendered |
|--------|---------------|
| `rental/components/TasksView.tsx` | `GlobalTaskDetailPanel` |
| `rental/components/VehicleTasksView.tsx` | `VehicleTaskDetailDrawer` |
| `rental/components/service-center/ServiceTasksPanel.tsx` | `VehicleTaskDetailDrawer` |
| `rental/components/service-center/ServiceSchedulePanel.tsx` | `VehicleTaskDetailDrawer` |
| `rental/components/service-center/ServiceHistoryPanel.tsx` | `VehicleTaskDetailDrawer` |
| `rental/components/service-center/ServiceOverviewPanel.tsx` | `VehicleTaskDetailDrawer` |
| `operator/views/OperatorTasksView.tsx` + `operator/components/OperatorTaskSheet.tsx` | `OperatorTaskDetail` |

**B.2 host file changes:** exactly **3** host components. Parent pages require **no** changes (locale acquired inside host).

---

## 6. Bridge removal analysis

### Removal sequence

1. Add `locale: SupportedLocale` to `TaskDetailViewModelOptions`.
2. Thread `locale` in `buildTaskDetailViewModel` → `buildTimeline` → `buildTaskTimelineItems` and `buildTaskCommentAuthorLabel`.
3. Update 3 hosts to pass `locale` from `useLanguage()`; add `locale` to `useMemo` dependency arrays.
4. Remove `TASK_TIMELINE_BRIDGE_LOCALE` constant and `?? TASK_TIMELINE_BRIDGE_LOCALE` fallbacks in `taskTimeline.utils.ts`.
5. Make `formatTaskTimelineActor` accept `locale` parameter (currently ignores caller locale).
6. Remove or relocate deprecated `humanizeResolutionReason` hardcoded `'de'` (see §15).
7. Fix `buildTimeline` `formatDateTime` override (see §10) so locale-aware adapter formatting is not bypassed.
8. Add grep guard: `TASK_TIMELINE_BRIDGE_LOCALE` must not reappear.
9. Update tests for EN/DE real render + locale switch.

### Files requiring modification (B.2)

| File | Change type |
|------|-------------|
| `lib/tasks/taskDetailView.utils.ts` | Add locale to options; thread to timeline + comment author |
| `lib/tasks/taskTimeline.utils.ts` | Remove bridge; locale explicit on public API |
| `lib/tasks/task-timeline-presentation-i18n.ts` | Minor — deprecated wrapper cleanup |
| `rental/components/tasks/GlobalTaskDetailPanel.tsx` | Pass locale + fix useMemo deps |
| `rental/components/tasks/VehicleTaskDetailDrawer.tsx` | Pass locale + fix useMemo deps |
| `operator/tasks/OperatorTaskDetail.tsx` | Add `useLanguage`, pass locale |
| `lib/tasks/task-timeline-presentation-localization.test.ts` | Real render + locale switch tests |
| `lib/tasks/taskDetailView.utils.test.ts` | Locale threading unit tests |
| New: host render test (at least one production consumer) | Real EN/DE timeline render |
| `scripts/i18n-hardcoded-scan.mjs` | Add `P216B2_ENFORCE_CLEAN_EXACT` |
| `i18n/hardcoded-copy-guard.test.ts` | Add P216B2 guards |
| `architecture/` + `ChangesView` / `ArchitekturView` | Governance docs (implementation phase) |

### Tests requiring change

- `task-timeline-presentation-localization.test.ts` — update bridge-dependent assertions; add locale-switch render tests
- `taskDetailView.utils.test.ts` — locale param coverage
- `taskTimeline.utils.test.ts` — may need locale explicit
- **New** production render test wrapping `GlobalTaskDetailPanel` or `TaskDetailBody` with `LanguageProvider`

### Bridge deletable in B.2?

**YES** — entire constant and all 4 production usages can be removed when hosts thread locale. Target: **`TASK_TIMELINE_BRIDGE_LOCALE` occurrences = 0** after B.2.

---

## 7. `taskDetailView` locale ownership

| Question | Answer |
|----------|--------|
| Builds final timeline strings? | **YES** — via `buildTaskTimelineItems` in `buildTimeline` |
| Owns timeline mapping? | **YES** — orchestrates adapter call |
| Owns formatting? | **PARTIALLY** — passes `formatDateTime: formatTaskDateTime` (hardcoded `de-DE`) overriding adapter |
| Receives locale today? | **NO** |
| Reads LanguageContext? | **NO** — plain TS utility (correct) |
| Plain TS or React? | **Plain TS** |
| Shared across hosts? | **YES** — all 3 hosts use `buildTaskDetailViewModel` |

**Preferred pattern (confirmed):** React host reads `useLanguage().locale` → passes `locale` into plain `buildTaskDetailViewModel`. Do **not** import React hooks into `taskDetailView.utils.ts`.

---

## 8. Signature change design

### Recommended (repository-conventional)

```typescript
// taskDetailView.utils.ts
export interface TaskDetailViewModelOptions {
  locale?: SupportedLocale;  // B.2: required at host call sites; optional with DEFAULT_PRODUCT_LOCALE fallback in builder only during migration — final state: required from hosts
  // ...existing fields
}

export function buildTaskDetailViewModel(
  detail: ApiTaskDetail,
  options: TaskDetailViewModelOptions = {},
): TaskDetailViewModel;
```

```typescript
// taskTimeline.utils.ts — after bridge removal
export function buildTaskTimelineItems(
  events: NormalizedTaskTimelineEvent[],
  options: TaskTimelineFormatOptions & { locale: SupportedLocale },
): TimelineItem[];

export function formatTaskTimelineSentence(
  event: NormalizedTaskTimelineEvent,
  locale: SupportedLocale,
): { title: string; description?: string };

export function formatTaskTimelineActor(
  event: NormalizedTaskTimelineEvent,
  locale: SupportedLocale,
): string;
```

**Fallback policy:** `resolveTaskTimelinePresentationLocale(locale)` already maps invalid/absent → `DEFAULT_PRODUCT_LOCALE` (`'en'`). **Never** hardcode `'de'` inside timeline path. Builder may use `options.locale ?? DEFAULT_PRODUCT_LOCALE` as last resort for non-React test callers — hosts must always pass explicit locale.

**No:** mutable global, business object mutation, API payload change.

---

## 9. Locale type normalization

| Type | Location | Use in B.2 |
|------|----------|------------|
| `SupportedLocale` | `i18n/locales.ts` | **Primary** — pass through call chain |
| `Locale` | `LanguageContext.tsx` (alias) | Equivalent |
| BCP-47 (`de-DE`, `en-GB`) | `getFormattingLocale()` | **Formatting only** — inside adapter |

Do **not** create competing types. Import `SupportedLocale` from `i18n/locales.ts` in `taskDetailView.utils.ts`.

---

## 10. Date / time formatting audit

| Location | Mechanism | B.2 impact |
|----------|-----------|------------|
| `task-timeline-presentation-i18n.ts` `formatTaskTimelineDateTime` | `toLocaleString(getFormattingLocale(locale), …)` | **Correct** when not overridden |
| `taskDetailView.utils.ts` `buildTimeline` | passes `formatDateTime: (iso) => formatTaskDateTime(iso)` | **MUST FIX** — bypasses locale-aware adapter |
| `rental/lib/task-detail.utils.ts` `formatTaskDateTime` | hardcoded `'de-DE'` | Used by override above — **timeline timestamps stay German under EN** |
| `taskDetailView.utils.ts` comments `createdAtLabel` | `formatTaskDateTime` | **P216C** (notes panel, not timeline row) |
| `taskDetailView.utils.ts` technical rows | `formatTaskDateTime` / `formatTaskDate` | **P216C** |
| Relative time in timeline | **None found** | N/A |

### B.2 date/time categories

| Category | In B.2 scope? |
|----------|---------------|
| A — event inline timestamp (timeline `time` field) | **YES** — remove `formatDateTime` override or pass locale-aware formatter |
| B — group/date header | **NO** — Timeline component has no date grouping |
| C — due date rendering | **NO** — header/technical (P216C) |
| D — relative labels | **N/A** |
| E — actor/action timestamps in notes | **NO** — P216C |

**Raw timestamp semantics:** ISO strings in event payloads unchanged; only display formatting changes.

---

## 11. Relative time

**Not applicable.** Task Timeline uses absolute `toLocaleString` formatting only. No `just now`, `minutes ago`, `yesterday` prose in `lib/tasks/` timeline path.

---

## 12. Current EN / DE behavior (post-B.1 baseline bug)

### Under DE locale (active)

Timeline renders **correct German** via bridge + dictionary:

- CREATED: `Von {actor} hat die Aufgabe erstellt` (via bridge default = `de`)
- STATUS_DONE: `Von Fatih Sero als erledigt markiert` (test-proven)
- AUTO_RESOLVED: `Automatisch aufgelöst: Rechnung wurde bezahlt`

### Under EN locale (active) — **BUG**

Despite `LanguageContext.locale === 'en'`:

| Output | Actual (bridge) | Expected (EN) |
|--------|-----------------|---------------|
| STATUS_DONE title | `Von Fatih Sero als erledigt markiert` | `Fatih Sero marked as complete` |
| AUTO_RESOLVED | `Automatisch aufgelöst: Rechnung wurde bezahlt` | `Automatically resolved: Invoice was paid` |
| System actor | `SynqDrive` (same both locales) | `SynqDrive` |
| Automatic actor | `Automatisch` | `Automatically` |
| Timeline timestamp | `de-DE` format via `formatTaskDateTime` override | `en-GB` format |

**Proof:** `task-timeline-presentation-localization.test.ts` lines 180-191 explicitly assert German output from `formatTaskTimelineSentence(event)` without locale arg ("via B.1 bridge"). Adapter-level EN tests pass when locale `'en'` is explicit (lines 161-177).

**Mixed-language leak count under EN:** **100% of canonical timeline template strings** (all events using bridge) + timestamp formatting.

---

## 13. Event coverage matrix (B.2 render targets)

| Machine event | DE presentation (key) | EN presentation (key) | Date dep? | Dynamic params | Host dep? |
|---------------|----------------------|----------------------|-----------|----------------|-----------|
| `CREATED` (user) | `tasks.timeline.event.created.user` | same | yes | `{actor}` | all 3 |
| `CREATED` (system) | `tasks.timeline.event.created.system` | same | yes | `{actor}` | all 3 |
| `ASSIGNED` | `tasks.timeline.event.assigned.user` | same | yes | `{actor}` | all 3 |
| `STATUS_CHANGED` → DONE | `tasks.timeline.event.statusDone.user` | same | yes | `{actor}` | all 3 |
| `STATUS_CHANGED` → CANCELLED | `tasks.timeline.event.statusCancelled.user` | same | yes | `{actor}` | all 3 |
| `STATUS_CHANGED` → IN_PROGRESS | `tasks.timeline.event.statusInProgress.user` | same | yes | `{actor}` | all 3 |
| `STATUS_CHANGED` → WAITING | `tasks.timeline.event.statusWaiting.user` | same | yes | `{actor}` | all 3 |
| `STATUS_CHANGED` → OPEN (from WAITING) | `tasks.timeline.event.statusResumed.user` | same | yes | `{actor}` | all 3 |
| `STATUS_CHANGED` (generic) | `tasks.timeline.event.statusChanged.user` + `tasks.timeline.description.newStatus` | same | yes | `{actor}`, `{status}` | all 3 |
| `CHECKLIST_ITEM_ADDED` | `tasks.timeline.event.checklistAdded.user` | same | yes | `{actor}`, `{title}` | all 3 |
| `CHECKLIST_ITEM_UPDATED` (done) | `tasks.timeline.event.checklistDone.user` | same | yes | `{actor}`, `{title}` | all 3 |
| `CHECKLIST_ITEM_UPDATED` (reopen) | `tasks.timeline.event.checklistReopened.user` | same | yes | `{actor}`, `{title}` | all 3 |
| `CHECKLIST_ITEM_UPDATED` (other) | `tasks.timeline.event.checklistUpdated.user` | same | yes | `{actor}`, `{title}` | all 3 |
| `COMMENT_ADDED` | `tasks.timeline.event.commentAdded.user` | same | yes | `{actor}` + `descriptionText` | all 3 |
| `ATTACHMENT_ADDED` | `tasks.timeline.event.attachmentAdded.user` | same | yes | `{actor}` | all 3 |
| `AUTO_RESOLVED` | `tasks.timeline.event.autoResolved` (+ reason variant) | same | yes | `{reason}` optional | all 3 |
| `SUPERSEDED` | `tasks.timeline.event.superseded` (+ reason variant) | same | yes | `{reason}` optional | all 3 |
| `CHECKLIST_COMPLETION_OVERRIDDEN` | `tasks.timeline.event.checklistOverride.user` | same | yes | `{actor}`, `{reason}` | all 3 |
| `TIMING_CHANGED` | `tasks.timeline.event.timingChanged` | same | yes | timing description keys | all 3 |
| `LINKS_UPDATED` | `tasks.timeline.event.linksUpdated.user` | same | yes | `{actor}` | all 3 |
| `UPDATED` | `tasks.timeline.event.updated.user` | same | yes | `{actor}` | all 3 |
| Unknown (e.g. `ESCALATED`) | `tasks.timeline.fallback.unknown` | same | yes | `{label}` | all 3 |

**User data never translated:** actor display names, `descriptionText` (comment preview), checklist `title`, custom `reason` strings, resolution raw text.

---

## 14. Dynamic user data (reconfirmed)

Locale threading must **not** translate:

- Actor names (`event.actor.displayName`)
- Comment bodies / `bodyPreview`
- Filenames (`attachment.fileName`)
- Task title (`detail.summary.title`)
- Vehicle display names, booking refs, vendor/customer names
- Custom resolution reason free text (only mapped `resolutionCode` keys are localized)

---

## 15. `humanizeResolutionReason` disposition

| Aspect | Assessment |
|--------|------------|
| Location | `task-timeline-presentation-i18n.ts` deprecated wrapper; consumer `taskDetailActions.utils.ts` completion summary |
| Timeline scope? | **NO** — used for completion summary (`autoResolvedReason`, `supersededReason`), not timeline rows |
| B.1 drift | Unmapped raw English reasons no longer get `Booking`→`Buchung` prefix; mapped `resolutionCode` paths unaffected |
| Classification | **B — safe to defer to P216C** (Task Detail completion chrome) |
| Risk if forced in B.2 | Scope creep into completion summary UI |

**Smallest B.2 action:** leave `humanizeResolutionReason` deprecated wrapper in place OR add `locale` param only if completion summary is pulled into B.2 — **not recommended**. Remove hardcoded `'de'` only when P216C threads locale through `buildTaskDetailCompletionSummary`.

---

## 16. Residual timeline-related presentation (outside B.1)

| Item | Location | Classification |
|------|----------|----------------|
| `taskSourceLabel` | `service-task-semantics.ts` → `taskSourceBadgeLabel` | **P216C** / service-task (P216A adapter exists; list cards not task detail timeline) |
| Activity section header | `TaskDetailNotesActivitySection` — "Notizen und Aktivität" | **P216C** |
| Tab labels "Notizen" / "Aktivität" | same | **P216C** |
| Empty state "Noch keine Aktivität protokolliert." | same | **P216C** |
| "Abschluss-Notiz" resolution note header | same | **P216C** |
| "Anhänge" attachment header | same | **P216C** |
| Actor fallback in timeline | adapter `tasks.timeline.actor.*` | **B.2** (already keyed) |
| Assignment fallback in technical rows | `taskDetailView.utils.ts` "Nicht zugewiesen" | **P216C** |
| Linked object type labels | `LINKED_OBJECT_TYPE_LABELS` German map | **P216C** |
| Header status label | `taskStatusLabelDe` | **P216C** |
| Timing label "Fällig …" | `resolveTimingLabel` | **P216C** |

**Do not absorb full Task Detail UI into B.2.**

---

## 17. P216B2 enforce-clean boundary (exact)

```javascript
P216B2_ENFORCE_CLEAN_EXACT = [
  'lib/tasks/taskDetailView.utils.ts',
  'lib/tasks/taskTimeline.utils.ts',
  'lib/tasks/task-timeline-presentation-i18n.ts',
  'rental/components/tasks/GlobalTaskDetailPanel.tsx',
  'rental/components/tasks/VehicleTaskDetailDrawer.tsx',
  'operator/tasks/OperatorTaskDetail.tsx',
]
```

**6 paths.** Do **not** use broad `tasks/**`, `rental/**`, `master/**` prefixes.

---

## 18. Host boundary safety

All B.2 host changes are **additive locale passing** only:

| Must NOT change | Status |
|-----------------|--------|
| Task fetch / `api.tasks.get` | unchanged |
| Mutations (assign, comment, checklist) | unchanged |
| Routing / navigation | unchanged |
| Filters / permissions | unchanged |
| Tab/modal logic | unchanged |
| Selected task state | unchanged |

---

## 19. Server / client boundary

SynqDrive frontend is **Vite + React SPA** (not Next.js App Router). All Task Detail hosts are client components using hooks. `LanguageContext` is client-only — **no SSR risk** for these surfaces.

**Rule:** Keep locale read in React hosts; pass primitive `SupportedLocale` into plain TS builders. No hook imports in `taskDetailView.utils.ts`.

---

## 20. No global locale singleton

Searched for `setCurrentLocale`, `globalLocale`, module-level mutable locale in `lib/tasks/` — **none found**.

B.2 must not introduce hidden defaults. Explicit `locale` param threading only.

---

## 21. Fallback policy

| Condition | Behavior |
|-----------|----------|
| Valid `SupportedLocale` passed | Use directly |
| Invalid / absent in adapter | `resolveTaskTimelinePresentationLocale` → `DEFAULT_PRODUCT_LOCALE` (`'en'`) |
| Missing dictionary key | Existing `translateKey` fallback chain (EN fallback, missing-key warn in dev) |
| **Forbidden** | Hardcoded `'de'`, silent German default, raw key display |

---

## 22. Dictionary impact

| Estimate | Value |
|----------|-------|
| New keys required | **0** (B.1 added all 40 `tasks.timeline.*` keys) |
| Residual timeline chrome keys | **0 in B.2** — activity section chrome deferred P216C |
| Wiring-only slice | **YES** |

If implementation discovers new keys needed, **stop and re-evaluate boundary** vs P216C.

---

## 23. P216B2 blind-spot guards

| Guard | Mechanism |
|-------|-----------|
| `TASK_TIMELINE_BRIDGE_LOCALE` reintroduction | grep guard in `hardcoded-copy-guard.test.ts` |
| Hardcoded `'de'` / `'de-DE'` in timeline path | extend `LEGACY_GERMAN_TIMELINE_LITERALS` + P216B2 scope scan |
| Locale omitted from presenter calls | TypeScript required `locale` param after bridge removal |
| Direct German timeline fallback strings | P216B2 enforce-clean = 0 |
| Raw `TranslationKey` leakage | existing adapter tests |
| Weaken B.1 guards | **must not** — keep `P216B1_ENFORCE_CLEAN_EXACT` intact |

---

## 24. P216B1 regression requirements

B.2 must preserve:

- 13 explicit event types + generic fallback
- +40 `tasks.timeline.*` keys
- Machine event codes unchanged
- Descriptor architecture in `task-timeline-presentation-i18n.ts`
- B.1 tests (updated for bridge removal, not taxonomy redesign)
- P216B1 enforce-clean = 0

---

## 25. Test plan (mandatory for implementation)

1. Real production timeline render in DE (`GlobalTaskDetailPanel` or `TaskDetailBody` + `LanguageProvider`)
2. Real production timeline render in EN
3. Locale switch DE → EN updates timeline without task data change
4. Locale switch EN → DE updates timeline
5. Switch without remount (supported — `setLocale` in provider)
6.–12. Event category EN/DE: CREATED, status-change, priority-adjacent (ASSIGNED), assignee, due-date-adjacent (TIMING_CHANGED), comment/attachment, unknown fallback
13. Actor name unchanged across locale switch
14. Comment preview unchanged
15. Machine event code unchanged
16. Raw ISO timestamp unchanged in data
17. Date format changes with locale (`de-DE` vs `en-GB`)
18. No raw `TranslationKey` in rendered output
19. No German leak under EN
20. No English leak under DE for canonical UI strings
21. `TASK_TIMELINE_BRIDGE_LOCALE` absent (grep)
22. P216B2 enforce-clean = 0
23. B.1 regression suite green

---

## 26. Locale switch test strategy

`LanguageContext.test.tsx` confirms runtime `setLocale` works without remount.

**Recommended pattern:**

```tsx
render(
  <LanguageProvider>
    <ProbeHost task={fixture} />
  </LanguageProvider>
);
// assert DE timeline strings
act(() => latest.setLocale('en'));
// assert EN timeline strings — same task fixture, no refetch
```

**Limitation:** None for locale switching. Task data refetch is independent of locale.

---

## 27. Test data requirements

Use representative `NormalizedTaskTimelineEvent[]` including:

- Person name (actor)
- Status transition (OPEN → IN_PROGRESS → DONE)
- TIMING_CHANGED with JSON old/new values
- COMMENT_ADDED with `bodyPreview`
- CHECKLIST_ITEM_UPDATED with custom `title`
- Unknown event type fallback
- AUTO_RESOLVED with `resolutionCode`

---

## 28. Build / typecheck risk

| Signature | Consumers | Blast radius |
|-----------|-----------|--------------|
| `buildTaskDetailViewModel` options | 3 hosts + tests | **LOW** — optional `locale` additive |
| `buildTaskTimelineItems` | view model + tests | **LOW** |
| `formatTaskTimelineSentence/Actor` | tests + possible direct callers | **LOW** |
| `formatTaskTimelineActor` gains required locale | 1 test file | **LOW** |

**Overall: LOW** — mostly mechanical, bounded files.

---

## 29. Business / runtime risk

| Area | Risk |
|------|------|
| Task fetch / mutations | **NONE** |
| Timeline ordering | **NONE** — sort unchanged |
| Event generation / persistence | **NONE** |
| API contracts | **NONE** |
| Routing / permissions | **NONE** |

**Category E = 0.** No backend/API prerequisite.

---

## 30. Shim / compat analysis

| Metric | Value |
|--------|-------|
| Baseline shim total | **29** (18 prod, 11 test — per B.1 record) |
| B.1 bridge in shim inventory? | **NO** — internal presentation bridge, not re-export shim |
| B.2 reduces shim count? | **NO** — bridge removal is internal debt, not compat shim |
| New compat consumers | **0** target |
| Post-B.2 shim | **≤ 29** |

---

## 31. Previous freeze regression

| Slice | Enforce-clean | Status |
|-------|---------------|--------|
| P27B | 0 | intact |
| P28 | 0 | intact |
| P29 | 0 | intact |
| P210 | 0 | intact |
| P211 | 0 | intact |
| P212 | 0 | intact |
| P213 | 0 | intact |
| P214 | 0 | intact |
| P215 | 0 | intact |
| P216A | 0 | intact |
| P216B1 | 0 | intact |

---

## 32. VehiclePickerStep baseline debt

| Item | Status |
|------|--------|
| `rental/components/new-booking/VehiclePickerStep.tsx` | **2 enforce-clean findings** (unchanged) |
| Fix in B.2? | **NO** |
| B.2-caused `i18n:check` failures | **must be 0** |

---

## 33. CI baseline

| Check | Status |
|-------|--------|
| Timeline unit tests (26) | **PASS** |
| P216B1 enforce-clean | **0** |
| P216A enforce-clean | **0** |
| `i18n:check` VehiclePickerStep | **2 failures** (baseline debt) |
| `i18n:check` other slices | some pre-existing failures in unrelated rental-vehicles-health test expecting `enforceCleanRemaining === 0` globally |
| Frontend build | **PASS** (per B.1 post-correction) |
| Backend typecheck | pre-existing spec failures (billing/vehicles — unrelated) |

B.2 must not worsen CI beyond known unrelated debt.

---

## 34. Implementation contract

### P2.2.16B.2 — Task Timeline Locale Threading

**IN SCOPE:**

- Active locale acquisition from `LanguageContext` in 3 hosts
- `locale` prop/signature threading through `buildTaskDetailViewModel` → timeline adapter
- `TASK_TIMELINE_BRIDGE_LOCALE` removal (target 0 occurrences)
- Locale-aware timeline datetime (remove `formatTaskDateTime` de-DE override in `buildTimeline`)
- Real EN/DE Task Timeline rendering tests
- Host `useMemo` dependency fixes for locale reactivity
- P216B2 governance (enforce-clean exact, guards, architecture docs)

**OUT OF SCOPE:**

- Full Task Detail UI localization (headers, tabs, empty states, technical rows) → **P216C**
- Task create/edit dialogs
- Unrelated task list UI
- Backend task semantics
- Service task taxonomy redesign
- Vendor directory
- `humanizeResolutionReason` completion summary → **P216C**
- `taskSourceLabel` / service center cards

---

## 35. Acceptance criteria (implementation)

1. `TASK_TIMELINE_BRIDGE_LOCALE` occurrences = 0  
2. Active locale threaded from `LanguageContext`  
3. Real DE timeline correct  
4. Real EN timeline correct  
5. Runtime locale switch updates timeline  
6. No German leak under EN  
7. No raw translation keys  
8. Raw timestamps unchanged in data  
9. Event ordering unchanged  
10. Machine semantics unchanged  
11. Category E = 0  
12. P216B1 = 0  
13. P216B2 = 0  
14. Prior freezes clean  
15. EN/DE parity 100%  
16. New compat consumers = 0  
17. shim ≤ 29  
18. No ignores / allowlists / scanner weakening  
19. Real production render tests PASS  
20. Build PASS  
21. B.2-caused CI failures = 0  
22. Only VehiclePickerStep baseline debt may remain  

---

## 36. One slice or split?

| Factor | Assessment |
|--------|------------|
| Host count | 3 — bounded |
| File count | ~6 production + tests + governance |
| Dictionary | 0 new keys |
| Date/time fix | 1 override removal — mechanical |
| Risk | LOW |

**Verdict: A — GO as one B.2 slice**

No architectural prerequisite. No need to split B.2.1/B.2.2 unless implementation discovers unexpected host beyond the 3 identified (none found).

---

## 37. Audit artifact

| Item | Value |
|------|-------|
| Path | `docs/audits/i18n-p2-2-16b2-task-timeline-locale-threading-preflight-2026-08-22.md` |
| Branch | `cursor/p2216b2-task-timeline-preflight-3c10` |
| Commit | audit-only |

---

## 38. Final report summary

| # | Item | Value |
|---|------|-------|
| 1 | Authoritative post-P216B1 SHA | `8941158c7d05ebad929ccbc35dbd2e4d6fccd7ce` |
| 2 | P216B1 freeze | **PASS** |
| 3 | Canonical key counts | EN **7773**, DE **7773**, +40 `tasks.timeline.*` |
| 4 | Parity | **100%** |
| 5 | Shim baseline | **29** |
| 6 | Bridge declaration | `taskTimeline.utils.ts:18` `const TASK_TIMELINE_BRIDGE_LOCALE = 'de' as const` |
| 7 | Bridge occurrence count | **5** in production code (1 decl + 4 usages) + **1** adjacent `'de'` in deprecated `humanizeResolutionReason` |
| 8 | Bridge production consumers | `formatTaskTimelineSentence`, `formatTaskTimelineActor`, `buildTaskTimelineItems`, `buildTaskCommentAuthorLabel` (+ indirect via `taskDetailView.utils.ts`) |
| 9 | Active locale source | `frontend/src/i18n/LanguageContext.tsx` / `useLanguage()` |
| 10 | Locale type | `SupportedLocale` (`'de' \| 'en' \| …`) |
| 11 | Timeline call chain | Host → `buildTaskDetailViewModel` → `buildTaskTimelineItems` → adapter → `Timeline` |
| 12 | Production hosts | **3** components, **7** mount points |
| 13 | Files needing B.2 changes | 6 production paths (see §17) + tests + governance |
| 14 | Files deferred P216C | `TaskDetailNotesActivitySection.tsx`, `taskDetailView.utils.ts` (non-timeline chrome), `taskDetailActions.utils.ts`, `task-detail.utils.ts` formatters for non-timeline |
| 15 | Signature design | `locale: SupportedLocale` in `TaskDetailViewModelOptions` + required on timeline utils |
| 16 | Fixed-locale occurrences in timeline path | `TASK_TIMELINE_BRIDGE_LOCALE` (5) + `formatTaskDateTime` de-DE override (1) |
| 17 | Relative-time applicability | **N/A** |
| 18 | Current DE render | Correct German via bridge |
| 19 | Current EN render | **German leak** — bridge forces `de` |
| 20 | Mixed-language leak count (EN) | **100%** of canonical timeline templates |
| 21 | `humanizeResolutionReason` | **B — defer P216C** |
| 22 | Dictionary impact | **0 new keys** |
| 23 | P216B2 boundary | 6 exact paths (§17) |
| 24 | Guard plan | §23 |
| 25 | Real-render test plan | §25 |
| 26 | Locale-switch test plan | §26 — provider `setLocale`, no remount |
| 27 | Server/client risk | **NONE** (SPA client components) |
| 28 | Compile blast radius | **LOW** |
| 29 | Business/runtime risk | **NONE** |
| 30 | Category E expectation | **0** |
| 31 | Shim expectation | **≤ 29**, 0 new compat |
| 32 | Previous freezes | **all clean** |
| 33 | VehiclePickerStep | **2 findings** (baseline, do not fix) |
| 34 | CI baseline | Timeline tests PASS; VehiclePickerStep debt only for B.2 scope |
| 35 | One slice or split? | **A — one slice** |
| 36 | Audit artifact | this document |
| 37 | Audit branch/PR | `cursor/p2216b2-task-timeline-preflight-3c10` |

### Explicit confirmations

| Item | Value |
|------|-------|
| production code modified | **NO** |
| dictionaries modified | **NO** |
| scanner modified | **NO** |
| tests modified | **NO** |
| P216B2 implementation started | **NO** |
| P216C implementation started | **NO** |
| merged | **NO** |

---

## 39. Final verdict

# **A — GO**

P2.2.16B.2 can proceed as a single mechanical slice: thread `SupportedLocale` from three Task Detail hosts through `buildTaskDetailViewModel` into the existing B.1 presentation adapter, remove `TASK_TIMELINE_BRIDGE_LOCALE`, fix the `formatTaskDateTime` de-DE override in timeline building, and add real EN/DE render + locale-switch tests. No backend prerequisite. No baseline/topology issue.

**Changes and Architektur:** not updated (read-only pre-flight audit only).
