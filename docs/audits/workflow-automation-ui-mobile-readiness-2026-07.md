# Workflow Automation UI — Mobile Readiness & Accessibility Audit

**Date:** 2026-07-25  
**Scope:** Rental → Workflow Automation (`WorkflowAutomationView`, runtime overview, config drawer, task automations)  
**Phase:** 10 Prompt 47  
**Branch:** `cursor/workflow-ui-mobile-a11y-2a81`

## Viewports reviewed (code + layout contracts)

| Viewport | Width | Result |
|----------|-------|--------|
| Small phone | 320px | Card list, horizontal scroll only on filter chips, no fixed table |
| Phone | 360px / 390px | Single-column drawer, stacked footer actions |
| Tablet | 768px+ | 2-column KPI grid, 2-column metadata in rows |
| Desktop | 1024px+ | Unchanged visual language; wider drawer (`sm:max-w-2xl`) |
| Zoom 200% | — | `break-words`, `min-w-0`, no `truncate` on drawer titles |

## Issues found & fixes applied

### Touch & typography
- Filter chips and tabs raised from 10–11px to **12px (`text-xs`)** with **`min-h-11`** (44px).
- Row action icon buttons enlarged to **`min-h-11 min-w-11`**.
- Search inputs use **`min-h-11`** and **`text-sm`**.
- Task-automation drawer labels/helpers upgraded from **10–11px → `text-xs`**.
- Select/number inputs in task-automation drawer: **`min-h-11`** touch height.
- Status badges keep text labels (not color-only) via `StatusChip`.

### Layout & overflow
- Overview and task-automation lists: **`overflow-x-hidden`**, **`min-w-0`**, **`break-words`** on titles.
- Filter chip row: **horizontal scroll** on narrow screens (`overflow-x-auto`) instead of clipping.
- Starter templates grid: **`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`** (was 3 columns on all sizes).
- Page header stacks on mobile (`flex-col gap-3`).
- `DetailDrawer` titles: **`break-words`** instead of **`truncate`** (long German workflow names).

### Drawer & dialogs
- `DetailDrawer`: optional **`returnFocusRef`**, default focus on title, close button **44px**, footer **`safe-area-inset-bottom`** padding.
- `WorkflowConfigDrawer` + `TaskAutomationRuleDrawer`: wire `returnFocusRef` from list trigger.
- Unsaved changes: **`AlertDialog`** in config drawer and task-automation drawer (no `window.confirm`).
- Reset to SynqDrive default: **`AlertDialog`** in task-automation drawer (replaced native `confirm()`).

### Forms & errors
- Name, trigger, change-reason fields: **`aria-invalid`**, **`aria-describedby`**, errors with **`role="alert"`**.
- Task-automation fields: **`htmlFor`** on labels linked to inputs.
- Loading states: **`aria-busy`**, **`aria-live="polite"`** on overview, task rules, dry-run, history panels.

### Screen reader
- Workflow rows: **`aria-label`** on open actions.
- Filters: **`aria-pressed`**, grouped with **`role="group"`**.
- Main tabs: **`role="tablist"`** / **`role="tab"`** / **`aria-selected`**.

## Tests

| Suite | Tests | Focus |
|-------|------:|-------|
| `workflow-mobile-a11y.test.ts` | 10 | Layout, touch, focus, aria, no native confirm |
| `workflow-runtime.test.ts` | 6 | Runtime filters/i18n |
| `workflow-simulate.test.ts` | 13 | Dry-run `aria-live`, race safety contracts |
| `workflow-production-readiness.test.ts` | 5 | Mobile/a11y contracts |

Run:

```bash
cd frontend && npm test -- workflow-mobile-a11y workflow-runtime workflow-simulate workflow-production-readiness
```

**Result (2026-07-25):** all workflow mobile/a11y suites **PASS**.

## Remaining visual limitations

1. **Legacy `DetailView` / `BuilderView`** inside `WorkflowAutomationView.tsx` still use `window.prompt` / `window.confirm` and dense 10px labels — not on the primary runtime path (`WorkflowOverviewSection`), but reachable if legacy navigation is triggered.
2. **Long German action type strings** in config accordion may wrap heavily at 320px; content remains readable but increases scroll length.
3. **Virtual keyboard**: drawer body scrolls correctly; no `visualViewport` offset adjustment (shared `DetailDrawer` limitation).
4. **Automated visual regression / axe** not in CI for this surface — covered by static source-contract tests only.

## Files changed

- `frontend/src/components/patterns/detail-drawer.tsx`
- `frontend/src/rental/components/WorkflowAutomationView.tsx`
- `frontend/src/rental/components/workflow-automation/WorkflowOverviewSection.tsx`
- `frontend/src/rental/components/workflow-automation/WorkflowConfigDrawer.tsx`
- `frontend/src/rental/components/workflow-automation/WorkflowDetailDrawer.tsx`
- `frontend/src/rental/components/workflow-automation/TaskAutomationRulesSection.tsx`
- `frontend/src/rental/components/workflow-automation/TaskAutomationRuleDrawer.tsx`
- `frontend/src/rental/components/workflow-automation/WorkflowDryRunPanel.tsx`
- `frontend/src/rental/components/workflow-automation/WorkflowRevisionDiffPanel.tsx`
- `frontend/src/rental/components/workflow-automation/WorkflowExecutionHistoryPanel.tsx`
- `frontend/src/rental/components/workflow-automation/TaskAutomationSimulationPanel.tsx`
- `frontend/src/rental/components/workflow-automation/workflow-mobile-a11y.test.ts`
- `docs/audits/workflow-automation-ui-mobile-readiness-2026-07.md`
