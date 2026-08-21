# P2.2.16B.1 — Task Timeline Event Taxonomy & Presentation Adapter

**Date:** 2026-08-21
**Baseline SHA:** `1370a3841e15a506be57cd45a5cf7f2fdf2841a9`
**Branch:** `cursor/p2216b1-task-timeline-taxonomy-i18n-3c10`
**Verdict:** A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT P2.2.16B.1 RE-AUDIT (superseded by audit #1120 verdict C; see correction section below)

## Scope delivered

P2.2.16B.1 extracts hardcoded German timeline presentation from `taskTimeline.utils.ts` into canonical `tasks.timeline.*` TranslationKey metadata and a locale-aware presentation adapter. Machine event codes, ordering, and task semantics are unchanged.

**Event taxonomy:** 13 explicit machine `event.type` switch arms (`CREATED` through `UPDATED`) plus generic fallback for unknown types (e.g. `ESCALATED`).

## Baseline hidden debt (pre-edit)

| Metric | Before |
|---|---|
| Direct TEXT scanner findings in `taskTimeline.utils.ts` | 0 |
| Scanner-blind German presentation literals | ~38 |
| Fixed `de-DE` formatting groups | 1 (`formatDateTimeDefault`) |
| Existing `tasks.timeline.*` keys | 0 |
| Production touchpoints | 7 (2 lib + 3 hosts + render path) |

## Implementation summary

### Files changed

| File | Role |
|---|---|
| `lib/tasks/task-timeline-presentation-i18n.ts` | **NEW** — canonical presentation adapter |
| `lib/tasks/taskTimeline.utils.ts` | Machine/orchestration + B.1 bridge wrappers |
| `lib/tasks/task-timeline-presentation-localization.test.ts` | **NEW** — 20 regression tests |
| `i18n/translations/en.ts`, `de.ts` | +40 `tasks.timeline.*` keys each |
| `scripts/i18n-hardcoded-scan.mjs` | P216B1_ENFORCE_CLEAN_EXACT |
| `i18n/hardcoded-copy-guard.test.ts` | P216B1 guards |
| `architecture/I18N_TASK_TIMELINE_TAXONOMY_P2_2_16B1_2026-08-21.md` | Architecture record |

### Consumer compatibility

| Consumer | B.1 change | Deferred B.2 |
|---|---|---|
| `taskDetailView.utils.ts` | None — uses `buildTaskTimelineItems` via bridge | Thread locale |
| `taskDetailActions.utils.ts` | None — `humanizeResolutionReason` re-export preserved | Locale-aware resolution |
| `GlobalTaskDetailPanel.tsx` | None | Locale threading |
| `VehicleTaskDetailDrawer.tsx` | None | Locale threading |
| `OperatorTaskDetail.tsx` | None | Locale threading |

### Dictionary

| Metric | Value |
|---|---|
| EN keys | 7773 |
| DE keys | 7773 |
| Parity | 100% |
| New keys | 40 |
| Reused keys | 5 (`tasks.filter.status.*`) |
| Duplicates/orphans | 0 |

### Scanner accounting

| Metric | Before | After |
|---|---|---|
| taskTimeline.utils.ts scanner findings | 0 | 0 |
| Hidden German literals in utility | ~38 | 0 |
| Fixed `de-DE` in utility | 1 | 0 |
| P216B1 enforce-clean | n/a | 0 |
| Global scanner | 1755 | 1755 |
| SHARED surface | 35 | 35 |
| Global enforce-clean (VehiclePickerStep baseline) | 2 | 2 (unchanged) |

### Shim inventory

| Metric | Value |
|---|---|
| Before | 29 (18 prod, 11 test) |
| After | 29 |
| New compat consumers | 0 |

### Business/runtime modifications

0 — event generation, ordering, status transitions, API payloads, persistence unchanged.

Category E: 0

### Tests

| Suite | Result |
|---|---|
| `task-timeline-presentation-localization.test.ts` | 20/20 pass |
| `taskTimeline.utils.test.ts` | 6/6 pass |
| `service-task-presentation-localization.test.tsx` (P216A regression) | 18/18 pass |
| `npm run build` | pass |
| `git diff --check` | pass |

`npm run i18n:check` — fails only on unchanged VehiclePickerStep baseline (2 enforce-clean findings identical to `1370a384`).

### B.2 deferred contract

- Thread `locale` from `LanguageContext` through `taskDetailView` and hosts
- Remove `TASK_TIMELINE_BRIDGE_LOCALE` from utils wrappers
- Wire `formatTaskTimelineDateTime` to active locale in production render path

### Unrelated baseline debt (not fixed)

`VehiclePickerStep.tsx` — 2 enforce-clean findings (`Alle Stationen`, `Filter zurücksetzen`) — unchanged from baseline.

## Independent re-audit correction (PR #1120)

**Audit verdict:** C — CORRECTIONS REQUIRED  
**Blocking cause:** `ArchitekturView.tsx` P2.2.16B.1 `FRONTEND_FLOWS` entry missing required `endpoint` field → `npm run build` / frontend CI failure.

### Correction applied

| Item | Change |
|---|---|
| `ArchitekturView.tsx` | Added `endpoint: 'task-timeline-presentation-i18n.ts, taskTimeline.utils.ts, taskDetailView.utils.ts, TaskDetailNotesActivitySection.'` |
| Event taxonomy docs | Corrected to **13 explicit event types + generic fallback** (was incorrectly documented as 15) |
| `humanizeResolutionReason` | **No code change** — see classification below |

### humanizeResolutionReason classification

**P216B.1-introduced minor presentation drift (non-blocking):** baseline `humanizeResolutionReason` applied `Booking → Buchung` / `Invoice → Rechnung` prefix substitution for unmapped raw reason strings. PR #1119 adapter strips bracket prefixes only. Mapped `resolutionCode` paths (7 canonical keys) are unaffected. Acceptable fallback until B.2 locale-aware resolution wiring.

### Post-correction validation

| Check | Result |
|---|---|
| `npm run build` | PASS |
| Timeline presentation tests | 20/20 |
| `taskTimeline.utils` tests | 6/6 |
| P216A regression | 18/18 |
| P216B1 enforce-clean | 0 |
| P216A enforce-clean | 0 |
| Shim inventory | 29 (unchanged) |
| `git diff --check` | PASS |
| `i18n:check` | Fails only on unchanged VehiclePickerStep baseline (2 findings) |
| Business/runtime modifications | 0 |
| Category E | 0 |

**Post-correction verdict:** Ready for P2.2.16B.1 re-verification.
