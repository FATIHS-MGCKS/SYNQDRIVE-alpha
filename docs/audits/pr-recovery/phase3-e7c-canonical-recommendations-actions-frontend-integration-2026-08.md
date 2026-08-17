# Phase 3 E7C — Canonical Recommendations / Actions Frontend Integration (2026-08)

## Scope

E7C integrates the canonical E7 backend Recommendations response into the existing
`EvaluationsPage` (`financial-insights`) as **presentation + transport only**. The
frontend does not derive, rank, filter, or reorder recommendations.

**Branch:** `integration/evaluations-e7-recommendations-actions-2026-08`  
**Draft PR:** #1055  
**Backend business logic changed:** `false` (E7C_BACKEND_BUSINESS_LOGIC_CHANGED=false)

## Shared contract wiring

- Added `@synq/evaluations-recommendations` alias to:
  - `frontend/vite.config.ts`
  - `frontend/vitest.config.ts`
  - `frontend/tsconfig.app.json`
- Types imported from `@synq/evaluations-recommendations/evaluations-recommendations.contract`
- **FRONTEND_E7_DUPLICATE_CONTRACT_COUNT=0**

## API / client / hook

| Layer | Location | Notes |
|-------|----------|-------|
| API | `frontend/src/lib/api.ts` → `api.evaluations.analyticsRecommendations` | `GET /organizations/:orgId/evaluations/analytics/insights/recommendations` |
| Transport | `fetchEvaluationsRecommendations` in `evaluations-analytics-client.ts` | Reuses `mapEvaluationsResult` (2xx→AVAILABLE, 403→UNAUTHORIZED, 404→NOT_FOUND, else ERROR) |
| Query key | `evaluations-query-keys.ts` capability `'recommendations'` | Period-aware (unlike finance MTD lock); stable sorted stationIds |
| Hook | `useEvaluationsRecommendations` in `useEvaluationsCanonicalAnalytics.ts` | `useCanonicalResource` lifecycle (IDLE/LOADING/race-safe) |

**CLIENT_RECOMMENDATION_STATUS_REDERIVATION=0** — payload `status` preserved separately from transport.

## Page composition

Final section order on `EvaluationsPage`:

1. Executive Summary  
2. **Recommendations / Actions** (new)  
3. Strengths & Weaknesses  
4. Finance & Receivables  
5. Fleet Utilization  
6. Costs & Downtime  
7. Driver Influence  
8. Data Quality  

One canonical E7 request: `useEvaluationsRecommendations(organizationId, req)`.

## Components

- `RecommendationsActionsSection.tsx` — section shell + collection status badge from payload
- `RecommendationCard.tsx` — localized copy, severity/category labels, actions, evidence disclosure
- `recommendation-presentation.ts` — fail-closed translation key resolver, copy param formatting, section anchor navigation

## Presentation invariants

| Invariant | Implementation |
|-----------|----------------|
| Server order | `data.recommendations.map` — no `.sort()` |
| Copy keys | `isTranslationKey()` guard; fallback `evaluations.recommendations.copyUnavailable` |
| Money | Reuses `formatEvaluationsMoney` / canonical minor-unit exponent (EUR/USD/JPY/KWD tested) |
| PERCENT | 0–100 scale (matches utilization KPI); no Intl percent double-scaling |
| Empty state | Uses `data.emptyState` verbatim (`NO_ACTION_NEEDED` vs `INSUFFICIENT_EVIDENCE`) |
| Source periods | Provenance shows authoritative MTD for finance even when page period differs |
| Quality limitations | E5 dimension/state labels preserved (FRESHNESS UNKNOWN stays Unknown) |
| Actions | Non-mutating allowlisted `EVALUATIONS_SECTION` scroll only; mutating/unknown targets disabled |
| Driver privacy | `viewDriverInfluence` scrolls to `#evaluations-section-driver` only — no auto-reveal/fetch |

## Section anchors (presentation-only)

| Target | Anchor ID |
|--------|-----------|
| executive | `evaluations-section-executive` |
| recommendations | `evaluations-section-recommendations` |
| strengths | `evaluations-section-strengths` |
| weaknesses | `evaluations-section-weaknesses` |
| finance | `evaluations-section-finance` |
| utilization | `evaluations-section-utilization` |
| cost | `evaluations-section-cost` |
| driver | `evaluations-section-driver` |
| quality | `evaluations-section-quality` |

## i18n

All E7 keys added to `en` and `de`; other locales inherit via `...en` spread.
Includes section title, empty states, severity/category labels, all backend copy keys
(title/explanation) and action label keys.

## Tests (frontend)

- `recommendation-presentation.test.ts` — copy keys, money, percent, actions
- `useEvaluationsRecommendations.test.tsx` — API path, transport, hook lifecycle
- `evaluations-canonical.test.ts` — recommendations query key (period + station order)
- `RecommendationsActionsSection.render.test.tsx` — order, empty states, provenance, actions
- `EvaluationsPage.recommendations.test.tsx` — page placement + driver lazy-reveal regression

## Backend smoke (unchanged business logic)

```bash
cd backend && npm test -- --testPathPattern="evaluations-recommendations|e7"
# 64 passed
```

## E8/E9 exclusions

Frontend E7 code scan: **E7_FRONTEND_ESTIMATED_EXPOSURE_FIELDS=0**, predictive/forecast fields=0.

## Database / production

- **PRISMA_SCHEMA_CHANGED=false**
- **MIGRATION_FILES_ADDED=0**
- **PRODUCTION_MUTATIONS=0**

## Machine status

```
CI_E7C_CANONICAL_RECOMMENDATIONS_ACTIONS_FRONTEND_INTEGRATION_COMPLETED
E7_PHASE=E7C_COMPLETE
E7_FRONTEND_RECOMMENDATION_AUTHORITY=SERVER_DRIVEN_PRESENTATION_ONLY
E7D_READINESS=READY_FOR_INTEGRATED_ACCEPTANCE
PR_STATE=DRAFT
```
