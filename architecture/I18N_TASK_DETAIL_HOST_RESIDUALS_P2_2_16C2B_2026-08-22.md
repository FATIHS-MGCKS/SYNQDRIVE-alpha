# I18N — Task Detail Host Residuals (P2.2.16C.2B)

## Locale flow

```
useLanguage().{t, locale}
  → VehicleTaskDetailDrawer / OperatorTaskDetail (host chrome only)
    → t('tasks.detail.*') for host-specific labels, errors, navigation
    → buildTaskDetailViewModel(detail, { locale }) — shared chrome (C.1/B.2)
    → useTaskDetailActionsHost / TaskDetailActionsHost — workflow core (C.2A, frozen)
```

## Ownership boundary

| Phase | Owns |
|-------|------|
| C.1 | Shared Task Detail chrome (shell, body, checklist, notes/activity) |
| C.2A | Shared workflow core (six actions, completion, resolution, blockers) |
| **C.2B** | **Host-specific residuals** in `VehicleTaskDetailDrawer` and `OperatorTaskDetail` only |

`GlobalTaskDetailPanel` required no C.2B changes — already localized in C.1.

## Enforce-clean boundary

`P216C2B_ENFORCE_CLEAN_EXACT` — 2 production paths:

- `rental/components/tasks/VehicleTaskDetailDrawer.tsx`
- `operator/tasks/OperatorTaskDetail.tsx`

No broad prefixes; no C.2A workflow paths included.

## Guardrails

- `i18n-hardcoded-scan.mjs` — P216C2B phase tagging
- `hardcoded-copy-guard.test.ts` — P216C2B inventory scope + blind-spot guards (no German host literals, no `de-DE`)
- `task-detail-host-residuals-localization.test.tsx` — host matrix, dictionary reuse, semantics freeze

## Key reuse

Prioritize `tasks.detail.*` before new keys. C.2B added only `tasks.detail.notFound` (operator empty-state fallback).

## P2.2.16C closure

With C.2B complete, Task Detail presentation debt across the three hosts and shared workflow components is **Category D = 0**. P2.2.16C is closed for presentation localization.
