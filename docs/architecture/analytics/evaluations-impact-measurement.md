# Evaluations Impact Measurement (Prompt 39/54)

**Version:** V4.9.836  
**Domain:** `OrgRecommendation` → versioned `OrgRecommendationImpact`  
**API:** `GET/POST /organizations/:orgId/evaluations/recommendations/:id/impact/*`

## Overview

Traceable impact measurement for implemented recommendations. Stores baseline KPI, target, expected/actual benefit and cost, measurement periods, data coverage, outcome status, trend, confidence, and explicit correlation disclaimers. Correlation is never presented as causation.

## Stored / computed fields

| Field | Source |
|-------|--------|
| Ausgangs-KPI (`baselineKpiKey`, `baselineKpiLabel`) | Input or category default via `resolveDefaultImpactKpi` |
| Ausgangswert (`baselineValue`) | Input |
| Zielwert (`targetValue`) | Input |
| Erwarteter Nutzen (`expectedBenefit`) | Input or recommendation `expectedBenefit` |
| Erwartete Kosten (`expectedCost`) | Input or recommendation `estimatedCost` |
| Tatsächliche Kosten (`actualCost`) | Input |
| Messzeitraum (`measurementPeriod`) | Input (validated) |
| Tatsächlicher KPI (`actualKpiValue`) | Input |
| Tatsächlicher Nutzen (`actualBenefit`) | Input |
| Abweichung (`varianceFromExpected`) | `actualBenefit - expectedBenefit` |
| Datenabdeckung (`dataCoveragePercent`) | Input |
| Ergebnisstatus (`outcomeStatus`) | Computed |
| Trend (`trend`) | Computed from baseline → actual + KPI direction |
| Confidence (`confidence`) | Computed from coverage, period comparability, implementation |
| Version (`version`, `isLatest`) | Incremented per `measure` call |

## Calculation logic (`impact-measurement-v1`)

Shared module: `shared/evaluations-insights/evaluations-impact-measurement.ts`

1. **Period comparability** — baseline and measurement windows must not overlap, each ≥ 7 days, length delta ≤ 2 days.
2. **Variance** — monetary delta between actual and expected benefit (same currency only).
3. **Trend** — `IMPROVING` / `STABLE` / `DECLINING` / `UNKNOWN` based on KPI direction (`HIGHER_IS_BETTER`, `LOWER_IS_BETTER`, `TARGET_IS_BETTER`).
4. **Confidence** — `LOW` if cancelled or coverage &lt; 50%; `MEDIUM` if partial implementation, incomparable periods, or coverage &lt; 80%; `HIGH` / `VERY_HIGH` when KPI + benefit values exist with strong coverage.
5. **Outcome status** — never `SUCCESS` when coverage &lt; 50%; `CANCELLED` / `PARTIALLY_IMPLEMENTED` for aborted/partial rollout; `INCONCLUSIVE` when periods incomparable or KPI missing.

## Rules & limitations

- **No causal claims** — `correlationDisclaimer` (DE/EN) shown in UI and persisted.
- **Comparable periods** — unequal or overlapping windows add limitation codes and reduce confidence.
- **Seasonal/external factors** — optional user-provided strings stored as `SEASONAL_OR_EXTERNAL` limitations.
- **Insufficient data** — outcome `INSUFFICIENT_DATA`, confidence `LOW`; UI must not imply success.
- **Versioning** — each `POST .../impact/measure` creates a new version; previous `isLatest` demoted.
- **Aborted/partial** — `implementationStatus` `CANCELLED` or `PARTIAL` drives dedicated outcome labels.

## API

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/:id/impact` | read | Latest measurement or `null` |
| `GET` | `/:id/impact/versions` | read | All versions (newest first) |
| `POST` | `/:id/impact/preview` | read | Compute without persist |
| `POST` | `/:id/impact/measure` | `tasks.write` | Persist version + `IMPACT_MEASURED` audit event |

Measurement requires recommendation status ∈ `{IMPLEMENTED, MEASURING_IMPACT, COMPLETED, CANCELLED}`.

## UI

`EvaluationsRecommendationImpactPanel` in recommendation detail drawer:

- Expectation vs actual (benefit, cost, variance)
- KPI baseline → target → actual
- Trend + confidence badges
- Measurement periods
- Limitations + deviation explanation
- Correlation disclaimer
- Form to record new version (managers only)

## Example flow

1. Recommendation transitions to `IMPLEMENTED` after operational rollout.
2. Fleet manager opens Maßnahmen detail drawer → **Wirkungsmessung** section appears.
3. Manager enters baseline utilization 45%, target 55%, actual 57%, benefit €220 vs expected €200, coverage 92%, comparable Jun/Jul windows.
4. `POST .../impact/measure` → version 1, outcome `SUCCESS`, trend `IMPROVING`, audit `IMPACT_MEASURED`.
5. After a methodology change, manager records version 2 with updated seasonal factor note — both versions listed; v2 marked `isLatest`.

## Files

| Path | Role |
|------|------|
| `shared/evaluations-insights/evaluations-impact-measurement.ts` | Domain logic + calculation version |
| `backend/prisma/schema.prisma` | `OrgRecommendationImpact` model |
| `backend/.../recommendation-impact.service.ts` | Measure, preview, list |
| `backend/.../recommendation-impact.repository.ts` | Versioned persistence |
| `frontend/.../EvaluationsRecommendationImpactPanel.tsx` | UI panel |
| `frontend/.../useEvaluationsRecommendationImpact.ts` | API hook |

## Tests

| Test | Coverage |
|------|----------|
| `evaluations-impact-measurement.shared.spec.ts` | Period validation, insufficient data, cancelled/partial, success |
| `recommendation-impact.service.spec.ts` | API service: readiness, versioning, audit, preview |
| `evaluations-action-center.spec.ts` (E2E) | Impact panel visible for implemented recommendation, save flow |

## Remaining gaps

- KPI values are manually entered — no automatic pull from analytics snapshots yet
- No controlled A/B or counterfactual baseline
- Category default KPIs are heuristic labels until analytics binding is added
