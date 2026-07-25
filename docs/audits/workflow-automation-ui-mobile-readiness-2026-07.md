# Workflow Automation UI — Mobile Readiness & Accessibility Audit

**Date:** 2026-07-25  
**Scope:** Rental → Workflow Automation (`WorkflowAutomationView`, runtime overview, config drawer, task automations)  
**Phase:** 10 Prompt 47

## Viewports reviewed (code + layout contracts)

| Viewport | Width | Result |
|----------|-------|--------|
| Small phone | 320px | Card list, horizontal scroll only on filter chips, no fixed table |
| Phone | 360px / 390px | Single-column drawer, stacked footer actions |
| Tablet | 768px+ | 2-column KPI grid, 2-column metadata in rows |
| Desktop | 1024px+ | Unchanged visual language; wider drawer (`sm:max-w-2xl`) |
| Zoom 200% | — | `break-words`, `min-w-0`, no `truncate` on workflow titles |

## Issues found & fixes applied

### Touch & typography
- Filter chips and tabs raised from 10–11px to **12px (`text-xs`)** with **`min-h-11`** (44px).
- Row action icon buttons enlarged to **`min-h-11 min-w-11`**.
- Search inputs use **`min-h-11`** and **`text-sm`**.
- Status badges keep text labels (not color-only) via `StatusChip`.

### Layout & overflow
- Overview and task-automation lists: **`overflow-x-hidden`**, **`min-w-0`**, **`break-words`** on titles.
- Filter chip row: **horizontal scroll** on narrow screens (`overflow-x-auto`) instead of clipping.
- Starter templates grid: **`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`** (was 3 columns on all sizes).
- Page header stacks on mobile (`flex-col gap-3`).

### Drawer & dialogs
- `DetailDrawer`: optional **`returnFocusRef`**, default focus on title, close button **44px**, footer **`safe-area-inset-bottom`** padding.
- `WorkflowConfigDrawer` + `TaskAutomationRuleDrawer`: wire `returnFocusRef` from list trigger.
- Unsaved changes: existing **`AlertDialog`** (no `window.confirm` in config path).

### Forms & errors
- Name, trigger, change-reason fields: **`aria-invalid`**, **`aria-describedby`**, errors with **`role="alert"`**.
- Loading states: **`aria-busy`**, **`aria-live="polite"`** where applicable.

### Screen reader
- Workflow rows: **`aria-label`** on open actions.
- Filters: **`aria-pressed`**, grouped with **`role="group"`**.
- Main tabs: **`role="tablist"`** / **`role="tab"`** / **`aria-selected`**.

## Tests

- `workflow-mobile-a11y.test.ts` — layout contracts, touch targets, focus return, aria wiring
- `workflow-runtime.test.ts` — existing runtime filters/i18n
- `workflow-simulate.test.ts` — dry-run panel `aria-live`

Run:

```bash
cd frontend && npm test -- workflow-mobile-a11y workflow-runtime workflow-simulate
```

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
- `frontend/src/rental/components/workflow-automation/TaskAutomationRulesSection.tsx`
- `frontend/src/rental/components/workflow-automation/TaskAutomationRuleDrawer.tsx`
- `frontend/src/rental/components/workflow-automation/WorkflowDryRunPanel.tsx`
- `frontend/src/rental/components/workflow-automation/WorkflowRevisionDiffPanel.tsx`
- `frontend/src/rental/components/workflow-automation/WorkflowExecutionHistoryPanel.tsx`
- `frontend/src/rental/components/workflow-automation/TaskAutomationSimulationPanel.tsx`
- `frontend/src/rental/components/workflow-automation/workflow-mobile-a11y.test.ts`
