# Phase 2.5 — Evaluations Legacy UI Deprecation Plan

No component is deleted in Phase 2.5. Deprecation occurs only after API parity, flagged UI acceptance and current-main refresh.

| Component/path | Decision | Phase | Reason / successor |
|---|---|---|---|
| `frontend/src/rental/components/DataAnalyseView.tsx` | `KEEP` | permanent | Separate privileged telemetry/diagnostics route; not a business-evaluations shell. |
| `frontend/src/rental/components/FinancialInsightsView.tsx` | `REFACTOR` → `DEPRECATE` | E2–E5 | Reuse correct invoice presentation temporarily; `EvaluationsPage` becomes route shell and canonical APIs replace local calculations. |
| `frontend/src/rental/components/insights/InsightsCockpit.tsx` | `REFACTOR` | E3–E5 | Split reusable presentation sections; remove local grouping/risk/recommendation authority. |
| `frontend/src/rental/lib/financial-insights.logic.ts` | `DEPRECATE` | E2–E5 | Compatibility/parity oracle only until backend finance contracts are accepted. |
| `frontend/src/rental/lib/insights-categories.ts` | `DEPRECATE` | E3–E6 | Backend/shared category and recommendation contracts become authority. |
| `frontend/src/rental/components/dashboard/runtime/businessPulseSliceBuilder.ts` | `REFACTOR` | E2–E3 | Consume canonical finance summary instead of independently calculating KPIs. |
| `frontend/src/rental/components/dashboard/businessPulseBuilder.ts` | `REMOVE_AFTER_MIGRATION` | after E5 | Already deprecated and inactive. |
| `frontend/src/rental/components/dashboard/BusinessPulse.tsx` | `REMOVE_AFTER_MIGRATION` | after E5 | Exported but not rendered. |
| `frontend/src/rental/components/BusinessInsightsBox.tsx` | `REMOVE_AFTER_MIGRATION` | after E6 | Dead legacy surface replaced by Action Queue/current recommendations. |
| `frontend/figma-rental/**` analytics prototypes | `REMOVE_AFTER_MIGRATION` | post-E5 review | Prototype is not production authority; preserve only if design provenance is explicitly required. |

## Anti-parallel-truth gates

1. During shadow mode, old and new outputs are compared from the same API inputs.
2. `on` mode selects one route shell and one KPI source; no merge of both result sets.
3. Removal occurs only after KPI parity, E2E, accessibility, visual and rollback evidence.
