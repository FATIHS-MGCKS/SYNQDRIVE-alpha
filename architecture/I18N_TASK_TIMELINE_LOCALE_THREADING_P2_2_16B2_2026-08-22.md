# Platform i18n — Task Timeline Locale Threading (P2.2.16B.2)

**Version:** V4.9.940
**Date:** 2026-08-22
**Baseline:** `8941158c` (post–P2.2.16B.1 Task Timeline taxonomy)

## Surface

Threads active product locale from canonical `LanguageContext` through Task Detail hosts into the P2.2.16B.1 timeline presentation adapter. Removes `TASK_TIMELINE_BRIDGE_LOCALE` and hardcoded `de-DE` timeline datetime override.

## Locale flow

```
LanguageContext.locale (SupportedLocale)
  → GlobalTaskDetailPanel | VehicleTaskDetailDrawer | OperatorTaskDetail (useLanguage)
  → buildTaskDetailViewModel(detail, { locale, ... })
  → buildTaskTimelineItems(events, { locale })
  → task-timeline-presentation-i18n (translateKey + getFormattingLocale)
  → Timeline items (pre-built presentation strings)
```

## Files

| File | Role |
|------|------|
| `lib/tasks/taskDetailView.utils.ts` | Requires `locale` in options; threads to timeline + comment author labels |
| `lib/tasks/taskTimeline.utils.ts` | Explicit `locale: SupportedLocale` on public API; bridge removed |
| `rental/components/tasks/GlobalTaskDetailPanel.tsx` | Passes `locale` from `useLanguage()` |
| `rental/components/tasks/VehicleTaskDetailDrawer.tsx` | Passes `locale` from `useLanguage()` |
| `operator/tasks/OperatorTaskDetail.tsx` | Adds `useLanguage()`, passes `locale` |

## Datetime

`buildTimeline` no longer passes `formatDateTime: formatTaskDateTime` (hardcoded `de-DE`). Timeline row timestamps use `formatTaskTimelineDateTime` → `getFormattingLocale(locale)`.

## Keys

**0 new keys** — reuses P2.2.16B.1 `tasks.timeline.*` (+40 EN+DE, 7773 total).

## Guardrails

**P2.2.16B.2 enforce-clean exact (6 paths)** — 0 findings:

- `lib/tasks/taskDetailView.utils.ts`
- `lib/tasks/taskTimeline.utils.ts`
- `lib/tasks/task-timeline-presentation-i18n.ts`
- `rental/components/tasks/GlobalTaskDetailPanel.tsx`
- `rental/components/tasks/VehicleTaskDetailDrawer.tsx`
- `operator/tasks/OperatorTaskDetail.tsx`

Blind-spot guard: `TASK_TIMELINE_BRIDGE_LOCALE` must not reappear in `taskTimeline.utils.ts`.

P2.2.16B.1 enforce-clean (2 paths) preserved.

## Semantics

Presentation-only. Event codes, ordering, API payloads, machine values unchanged. Category E = 0.

## Tests

- `task-timeline-locale-threading.test.ts` (8) — DE/EN render, datetime, locale switch, host wiring, P216B2 inventory
- Updated B.1/B utils tests for explicit locale parameter

## Deferred

P2.2.16C — Task Detail chrome (activity section headers, technical rows, non-timeline `formatTaskDateTime` usage).
