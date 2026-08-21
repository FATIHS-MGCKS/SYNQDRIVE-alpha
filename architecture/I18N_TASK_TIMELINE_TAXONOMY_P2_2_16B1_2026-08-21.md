# Platform i18n — Task Timeline Event Taxonomy (P2.2.16B.1)

**Version:** V4.9.939
**Date:** 2026-08-21
**Baseline:** `1370a384` (post–P2.2.16A Shared Service Task presentation)

## Surface

Shared task timeline presentation taxonomy and adapter for Task Detail timeline/activity rendering. Does **not** include host locale threading (`taskDetailView`, `GlobalTaskDetailPanel`, etc.) — deferred to P2.2.16B.2.

## Helpers

`lib/tasks/task-timeline-presentation-i18n.ts`

- `resolveTaskTimelineEventPresentation(locale, event)` — semantic descriptor (`eventCode`, `titleKey`, `descriptionKey`, params, `descriptionText`)
- `renderTaskTimelineEventPresentation`, `formatTaskTimelineSentence(locale, event)`
- `formatTaskTimelineActorLocalized`, `resolveTaskTimelineActorKind`
- `formatTaskTimelineDateTime` — uses `getFormattingLocale()` (no hardcoded `de-DE`)
- `buildTaskCommentAuthorLabel`, `humanizeTaskTimelineResolutionReason`
- `isTechnicalUserLabel` — machine UUID detection

`lib/tasks/taskTimeline.utils.ts` — machine/orchestration only:

- `buildTaskTimelineItems`, `resolveTimelineTone`
- B.1 bridge wrappers defaulting to `de` until B.2 host locale threading (`TASK_TIMELINE_BRIDGE_LOCALE`)

## Event taxonomy (13 explicit event types + generic fallback)

| Machine code | titleKey family |
|---|---|
| `CREATED` | `tasks.timeline.event.created.{user\|system}` |
| `ASSIGNED` | `tasks.timeline.event.assigned.user` |
| `STATUS_CHANGED` | status-specific keys + `statusChanged.user` + `description.newStatus` |
| `CHECKLIST_ITEM_ADDED` | `checklistAdded.user` |
| `CHECKLIST_ITEM_UPDATED` | `checklistDone/Reopened/Updated.user` |
| `COMMENT_ADDED` | `commentAdded.user` + `descriptionText` |
| `ATTACHMENT_ADDED` | `attachmentAdded.user` |
| `AUTO_RESOLVED` | `autoResolved` / `autoResolvedWithReason` |
| `SUPERSEDED` | `superseded` / `supersededWithReason` |
| `CHECKLIST_COMPLETION_OVERRIDDEN` | `checklistOverride.user` + `description.reason` |
| `TIMING_CHANGED` | `timingChanged` + `description.timingChanges` |
| `LINKS_UPDATED` | `linksUpdated.user` |
| `UPDATED` | `updated.user` |
| unknown | `tasks.timeline.fallback.unknown` |

## Keys

+40 EN+DE canonical keys (7733→7773) under `tasks.timeline.*`:

- `tasks.timeline.actor.*` (3)
- `tasks.timeline.resolution.*` (7)
- `tasks.timeline.event.*` (23)
- `tasks.timeline.description.*` (3)
- `tasks.timeline.timing.*` (2)
- `tasks.timeline.fallback.*` (2)

Reused: `tasks.filter.status.*` for status label interpolation (5 machine statuses).

## Guardrails

**P2.2.16B.1 enforce-clean exact (2 paths)** — 0 findings:

- `lib/tasks/taskTimeline.utils.ts`
- `lib/tasks/task-timeline-presentation-i18n.ts`

Blind-spot guards: no `RESOLUTION_CODE_LABELS`, no `taskStatusLabelDe`, no German sentence maps in utility layer.

## B.1 merge safety

Hosts without locale continue to receive German timeline copy via explicit `TASK_TIMELINE_BRIDGE_LOCALE = 'de'` in utils wrappers. Removed in B.2 when `taskDetailView` threads active locale.

## B.2 deferred

- Locale threading through `taskDetailView.utils.ts` and production hosts
- Replace B.1 bridge default with host `LanguageContext` locale
- Final EN/DE timeline render under active product locale

## Tests

`lib/tasks/task-timeline-presentation-localization.test.ts` (20) — descriptors, EN/DE resolution, actor/source, fallback, P216B1 inventory guard.

## Semantics

Timeline event codes, status/priority machine values, metadata, ordering, timestamps unchanged. Presentation only.
