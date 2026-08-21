# P2.2.16B.2 — Task Timeline Locale Threading — Implementation Report

**Date:** 2026-08-22  
**Baseline SHA:** `8941158c7d05ebad929ccbc35dbd2e4d6fccd7ce` (PR #1119)  
**Pre-flight:** PR #1124 / `docs/audits/i18n-p2-2-16b2-task-timeline-locale-threading-preflight-2026-08-22.md`  
**Branch:** `cursor/p2216b2-task-timeline-locale-threading-3c10`  
**Verdict:** **IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT RE-AUDIT**

---

## Scope delivered

Removed `TASK_TIMELINE_BRIDGE_LOCALE` and threaded canonical `LanguageContext.locale` from three Task Detail production hosts through `buildTaskDetailViewModel` into the P2.2.16B.1 presentation adapter. Timeline datetime formatting now uses `getFormattingLocale(locale)` instead of a hardcoded `de-DE` override.

---

## Files changed

| File | Change |
|------|--------|
| `frontend/src/lib/tasks/taskTimeline.utils.ts` | Removed bridge; `locale: SupportedLocale` required on public API |
| `frontend/src/lib/tasks/taskDetailView.utils.ts` | Added required `locale` to options; threaded to timeline + comment author; removed `formatTaskDateTime` override |
| `frontend/src/rental/components/tasks/GlobalTaskDetailPanel.tsx` | Pass `locale`; fix `useMemo` deps |
| `frontend/src/rental/components/tasks/VehicleTaskDetailDrawer.tsx` | Pass `locale`; fix `useMemo` deps |
| `frontend/src/operator/tasks/OperatorTaskDetail.tsx` | Add `useLanguage()`; pass `locale` |
| `frontend/src/lib/tasks/task-timeline-locale-threading.test.ts` | **NEW** — 8 B.2 tests |
| `frontend/src/lib/tasks/task-timeline-presentation-localization.test.ts` | Updated for explicit locale (no bridge) |
| `frontend/src/lib/tasks/taskTimeline.utils.test.ts` | Pass explicit `locale: 'de'` |
| `frontend/src/lib/tasks/taskDetailView.utils.test.ts` | Pass `locale`; add timeline localization test |
| `frontend/src/lib/tasks/components/TaskDetailBody.test.tsx` | Pass `locale: 'de'` |
| `frontend/scripts/i18n-hardcoded-scan.mjs` | `P216B2_ENFORCE_CLEAN_EXACT` |
| `frontend/src/i18n/hardcoded-copy-guard.test.ts` | P216B2 guards + anti-bridge grep |
| `architecture/I18N_TASK_TIMELINE_LOCALE_THREADING_P2_2_16B2_2026-08-22.md` | **NEW** |
| `architecture/I18N_TASK_TIMELINE_TAXONOMY_P2_2_16B1_2026-08-21.md` | B.2 completion note |
| `frontend/src/master/components/ChangesView.tsx` | P216B2 entry |
| `frontend/src/master/components/ArchitekturView.tsx` | P216B2 flow entry |

**Production hosts (3):** `GlobalTaskDetailPanel`, `VehicleTaskDetailDrawer`, `OperatorTaskDetail`

---

## Locale propagation

### Before

```
Host (locale available but not passed)
  → buildTaskDetailViewModel(detail, { ... })   // no locale
    → buildTaskTimelineItems(events, { formatDateTime: de-DE })
      → TASK_TIMELINE_BRIDGE_LOCALE = 'de'
```

### After

```
Host useLanguage().locale
  → buildTaskDetailViewModel(detail, { locale, ... })
    → buildTaskTimelineItems(events, { locale })
      → resolveTaskTimelinePresentationLocale(locale)
      → formatTaskTimelineDateTime(locale, ...) via getFormattingLocale
```

---

## Hardcoded locale removals

| Item | Before | After |
|------|--------|-------|
| `TASK_TIMELINE_BRIDGE_LOCALE` | 5 occurrences in `taskTimeline.utils.ts` | **0** |
| `buildTimeline` `formatDateTime` de-DE override | present | **removed** |
| Host locale threading | 0/3 hosts | **3/3 hosts** |

---

## Datetime formatting

| Locale | Representative timestamp (`2026-07-15T10:30:00.000Z`) |
|--------|------------------------------------------------------|
| `de` | `15.07.2026, 10:30` (de-DE pattern) |
| `en` | `15/07/2026, 10:30` (en-GB pattern) |

Verified in `task-timeline-locale-threading.test.ts`.

---

## Dictionary accounting

| Metric | Before | After |
|--------|--------|-------|
| EN keys | 7773 | **7773** |
| DE keys | 7773 | **7773** |
| New keys | — | **0** |
| Parity | 100% | **100%** |

---

## Scanner / enforce-clean accounting

| Metric | Before (B.1 baseline) | After (B.2) |
|--------|-------------------------|-------------|
| P216B1 enforce-clean | 0 | **0** |
| P216B2 enforce-clean | n/a | **0** |
| Global scanner findings | 1755 | **1755** (unchanged) |
| VehiclePickerStep enforce-clean debt | 2 | **2** (unchanged) |

---

## Shim accounting

| Metric | Value |
|--------|-------|
| Before | 29 |
| After | **29** |
| New compat consumers | **0** |

---

## Category classification

| Class | Count | Notes |
|-------|-------|-------|
| A — presentation wiring | 6 production files | locale threading only |
| B — tests/guards | 6 files | B.2 regression coverage |
| C — documentation | 4 files | architecture + Changes/Architektur |
| D — dictionary | 0 | no key changes |
| E — business/runtime | **0** | no API/semantics change |
| F — unrelated | 0 | VehiclePickerStep untouched |

---

## Test results

| Suite | Result |
|-------|--------|
| `task-timeline-locale-threading.test.ts` | **8/8 PASS** |
| `task-timeline-presentation-localization.test.ts` | **20/20 PASS** |
| `taskTimeline.utils.test.ts` | **6/6 PASS** |
| `taskDetailView.utils.test.ts` | **6/6 PASS** |
| `service-task-presentation-localization.test.tsx` (P216A) | **18/18 PASS** |
| P216B1/B2 guard tests (filtered) | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` | **PASS** |

### `npm run i18n:check`

**FAIL** — pre-existing baseline debt only:

- `VehiclePickerStep.tsx` — 2 enforce-clean findings (unchanged from B.1 baseline)
- Related rental-vehicles-health test expecting global `enforceCleanRemaining === 0`

**B.2 introduced findings:** **0**

---

## Manual DE/EN verification

Representative event: `STATUS_CHANGED` → `DONE` with actor `Fatih Sero`, `resolutionKind: MANUAL`.

| Locale | Timeline title | Datetime format |
|--------|----------------|-----------------|
| `de` | `Von Fatih Sero als erledigt markiert` | German (`dd.mm.yyyy`) |
| `en` | `Fatih Sero marked as complete` | English (`dd/mm/yyyy`) |

Locale switch test (`LanguageProvider` + click): DE title updates to EN without task data change.

Machine values preserved: `event.type === 'STATUS_CHANGED'`, `newValue === 'DONE'`, actor name unchanged.

---

## Residual observations

1. `humanizeResolutionReason` deprecated wrapper still hardcodes `'de'` — **deferred P216C** (completion summary, not timeline rows).
2. `TaskDetailNotesActivitySection` German chrome — **deferred P216C**.
3. Comment `createdAtLabel` still uses `formatTaskDateTime` (de-DE) — **deferred P216C** (notes panel, not timeline).

---

## Explicit confirmations

| Item | Value |
|------|-------|
| Category E | **0** |
| Machine semantics unchanged | **YES** |
| New compat consumers | **0** |
| P216B1 freeze preserved | **YES** |
| P2.2.16C started | **NO** |

---

## Changes and Architektur

- **Changes:** updated (`ChangesView.tsx` P216B2 entry)
- **Architektur:** updated (`ArchitekturView.tsx` P216B2 flow + B.1 note)
