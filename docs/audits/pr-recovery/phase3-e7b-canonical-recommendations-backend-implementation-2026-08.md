# Phase 3 E7B — Canonical Recommendations Backend Implementation (2026-08)

## Status

- **Machine status:** `CI_E7B_CANONICAL_RECOMMENDATIONS_BACKEND_IMPLEMENTATION_COMPLETED`
- **Branch:** `integration/evaluations-e7-recommendations-actions-2026-08`
- **Draft PR:** #1055 (remains Draft)
- **Entry HEAD (pre-E7B runtime):** `f1a5dd09`
- **E7A authority commit:** `f11cc2be` (ancestor verified)

## Scope delivered (E7B)

1. Shared canonical contract `@synq/evaluations-recommendations` (`shared/evaluations-recommendations/`, mirrored to `backend/src/synq/evaluations-recommendations/`)
2. Pure domain derivation (`backend/src/modules/evaluations-analytics/e7/domain/evaluations-recommendations.derive.ts`)
3. Orchestration service with **one** E4 summary call per request
4. Tenant/station-safe API endpoint
5. E5 refactor: `buildQualityReportFromSummary()` — public `getQualityReport()` unchanged
6. Comprehensive backend unit tests (derive + orchestration + E5 equivalence)
7. **Zero** Prisma/migration/production changes

E7C (frontend presentation) is explicitly out of scope.

---

## E7B contract clarification addendum (does not rewrite E7A history)

These clarifications remove implementation ambiguities discovered during independent source review. They do **not** change E7A product authority.

### 1. Period authority

- Finance recommendation stable identity uses **E3 metric.period** (MTD), not analytics request period.
- Analytics families use the relevant **E4 section.period**.
- Quality families use **E5 report.period**.
- `FINANCE_ID_CHANGES_WHEN_ONLY_ANALYTICS_PERIOD_CHANGES=false` when E3 MTD evidence is unchanged.

### 2. Category vs sort authority

- `RecommendationCategory`: FINANCE | FLEET | OPERATIONS | QUALITY | DRIVER | INSIGHT
- `RecommendationFamily`: concrete E7 families (nine accepted)
- `RecommendationSortBucket`: server-internal deterministic ranking derived from family
- No exposed numeric priority score.

### 3. Duplicate / supersession authority

- UNDERUTILIZATION → `UTILIZATION_ATTENTION` only (no duplicate generic `WEAKNESS_ATTENTION` for same rule/evidence)
- Overdue receivables → `RECEIVABLES_ATTENTION`; suppress `OPEN_RECEIVABLES_REVIEW` when it duplicates overdue population
- Quality: specific limitation families supersede generic `DATA_QUALITY_LIMITED` for the same source limitation

### 4. Structural freshness UNKNOWN

- E5 pipeline freshness remains `UNKNOWN` in provenance/quality limitations
- `FRESHNESS=UNKNOWN` alone must **not** emit standalone `DATA_QUALITY_LIMITED`
- Standalone quality recommendation requires actionable limitation (section PARTIAL/UNAVAILABLE with usable evidence, COMPLETENESS/PROVENANCE/VALIDITY limitations, skipped sections not already represented)

### 5. Localization authority

- Backend emits `titleKey`, `explanationKey`, `copyParams` only — no locale-dependent business logic
- Frontend (E7C) performs translation/formatting only

---

## Shared contract

| Field | Value |
|-------|-------|
| `schemaVersion` | `1.0.0` |
| `calculationVersion` | `recommendations-e7-v1` |
| Path | `shared/evaluations-recommendations/` |

### Implemented families

| Family | Status |
|--------|--------|
| WEAKNESS_ATTENTION | IMPLEMENTED |
| STRENGTH_REINFORCE | IMPLEMENTED |
| UTILIZATION_ATTENTION | IMPLEMENTED |
| RECEIVABLES_ATTENTION | IMPLEMENTED |
| OPEN_RECEIVABLES_REVIEW | IMPLEMENTED |
| COST_EVIDENCE_INCOMPLETE | IMPLEMENTED |
| DATA_QUALITY_LIMITED | IMPLEMENTED |
| DRIVER_INFLUENCE_REVIEW | IMPLEMENTED |
| DETECTION_INPUT_SKIPPED | IMPLEMENTED |

No families deferred.

---

## Backend module layout

```
backend/src/modules/evaluations-analytics/e7/
  evaluations-recommendations.controller.ts
  evaluations-recommendations.service.ts
  evaluations-recommendations.module.ts
  domain/
    evaluations-recommendations.derive.ts
    evaluations-recommendations.fixtures.ts
    evaluations-recommendations.derive.spec.ts
    evaluations-recommendations.derive.extended.spec.ts
```

## API

```
GET /organizations/:orgId/evaluations/analytics/insights/recommendations
```

Guards: OrgScopingGuard, RolesGuard, PermissionsGuard, EvaluationsAnalyticsFeatureGuard  
Permission: `EVALUATIONS_MODULE` read  
Scope: existing `resolveAuthorizedScope` + station normalization

---

## Orchestration invariants (verified by tests)

| Counter | Required | Result |
|---------|----------|--------|
| `E7_E4_SUMMARY_CALL_COUNT` | 1 | ✅ |
| `E7_DIRECT_E3_FINANCE_CALL_COUNT` | 0 | ✅ |
| `E7_E5_SECOND_SUMMARY_CALL_COUNT` | 0 | ✅ |

Flow:

```
summary = insights.getSummary(...)           // once
quality = quality.buildQualityReportFromSummary(summary, ...)
recommendations = deriveEvaluationsRecommendations({ summary, quality, ... })
```

---

## Stable identity

Deterministic FNV-1a hash over:

- organizationId
- canonical station scope key (sorted station IDs)
- authoritative source period
- family
- source rule / metric
- dimension
- derivationReason
- currency (when money-backed)

---

## Action model

- All actions: `mutating=false`, `confirmationRequired=false`
- Target kinds allowlisted: `EVALUATIONS_SECTION`, `APPLICATION_ROUTE`, `ENTITY_REFERENCE`
- No arbitrary URL strings from evidence

---

## Negative scan (E8/E9)

Runtime response contains **zero** fields: `estimatedExposure`, `expectedBenefit`, `expectedNetBenefit`, forecast/prediction/confidence score fields.

---

## Test evidence

```bash
cd backend && npm run test -- --testPathPattern='evaluations-recommendations|evaluations-quality.service.spec'
# 37 passed (derive + extended + orchestration + E5 equivalence)

cd backend && npm run test:evaluations
# E1–E5 + E7 green (598+ passed; unrelated business-insights tire-critical pre-existing failures outside E1–E5 scope)

cd backend && npm run build
# PASS
```

---

## Next phase

**E7C** — frontend Recommendations / Actions integration on `EvaluationsPage` (presentation only; no client business derivation).
