# Phase 3 — E6.0.2.1 Final Salvage Matrix Contradiction Closure (2026-08)

Docs-only. Closes the two (plus one adjacent) residual broad PR #798 authority
statements in the salvage matrix. No runtime/test/config/Prisma change; no E6
implementation; no reinterpretation of settled E6/E6.0.1 decisions.

- CURRENT_MAIN_SHA: `a704fdcca76f03703a0816f71a4d11ffdbaf4292`
- PRE_TASK_SHA: `5f3ba37062ec8992b50722d70551398b76f4376a`
- Branch: `audit/evaluations-e6-discovery-2026-08`

## Corrections (salvage matrix rows)

| Row | Before | After |
|-----|--------|-------|
| `EvaluationsRiskCostCharts` | "cost/pareto/downtime charts = E6" (too broad) | ADAPT chart SHELL/pattern ONLY; canonical E4 OPERATING_EXPENSES money + utilization/downtime facts + status/unsupported only; forbidden maintenance/damage/fixed reconstruction, unsupported sums, mixed Pareto/waterfall/aging, estimatedExposure, risk, forecast |
| `evaluations-risk-cost-visualizations.ts` | "cost/downtime resolvers within are E6-safe" | module BELONGS_TO_E8; no E6-safety by inheritance; helpers E6-usable only if they format/transform already-canonical E4 facts, classified individually |
| `EvaluationsRiskCostVizPanel` (adjacent) | "viz orchestration is E6-safe" | tightened to shell/pattern-only with the same allowed/forbidden constraints |

## Settled #798 authority (unambiguous)

- OPERATING_EXPENSES canonical Money → E6_CANONICAL_RENDERABLE
- Maintenance/Damage/Fixed cost without canonical Money → E6_STATUS_ONLY
- estimatedExposure → E8 (excluded from E6)
- probability/confidence/risk synthesis → E8; forecast → E9
- legacy mixed cost resolver → UNSAFE_LEGACY_CALCULATION
- chart/layout shell → GENERIC_VISUAL_PATTERN_ONLY / ADAPT_COMPONENT (shell only)

Verified against current-main E4 cost contract: only OPERATING_EXPENSES (OrgInvoice)
is authoritative currency-bearing money; maintenance/damage served UNAVAILABLE; fixed
costs UNSUPPORTED (no fabricated accrual / reporting-currency reinterpretation).

## Counters

- PR798_SYMBOL_ROWS = 14 (grouped); symbol-level (blueprint §10): CANONICAL_RENDERABLE
  18 / STATUS_ONLY 10 / GENERIC_VISUAL_PATTERN 14 / UNSAFE_LEGACY 6 / E8 8 / E9 5
- STALE_PR798_COMPONENT_AUTHORITY_ROW_COUNT = 0
- STALE_PR798_RESOLVER_AUTHORITY_ROW_COUNT = 0
- CROSS_ARTIFACT_CONTRADICTION_COUNT = 0
- IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT = 0
- RUNTIME_CHANGE_COUNT = 0 / TEST_CHANGE_COUNT = 0 / CONFIG_CHANGE_COUNT = 0 / MIGRATION_CHANGE_COUNT = 0

Status: E6_READY_FOR_IMPLEMENTATION
