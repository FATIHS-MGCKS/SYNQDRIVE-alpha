# Evaluations — Recommendation Domain Model

**Version:** V4.9.806 (Prompt 36/54)  
**Status:** Implemented (persistence + API + domain logic)  
**Module:** `backend/src/modules/business-insights/recommendations/`

## Purpose

Canonical domain model for **Maßnahmen / Empfehlungen** in Auswertungen. Each recommendation is org-scoped, linked to a triggering insight or risk, auditable, deduplicated, and uses structured money values.

## Data model

### `OrgRecommendation`

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `organizationId` | UUID | Tenant scope |
| `sourceType` | enum | `DASHBOARD_INSIGHT`, `EVALUATIONS_INSIGHT`, `EVALUATIONS_RISK`, `MISUSE_CASE`, `MANUAL` |
| `sourceId` | string | ID of triggering insight/risk (no FK for eval sources yet) |
| `category` | enum | Maintenance, safety, compliance, cost, fleet, CX, operational, other |
| `title` | string | Short action label |
| `description` | string | Operator-facing detail |
| `rationale` | string | **Required** — traceable justification (min 10 chars) |
| `expectedBenefit*` | cents + currency | Money model (`amountMinor` in API) |
| `estimatedCost*` | cents + currency | Money model |
| `expectedNetBenefit*` | cents + currency | Explicit or derived (benefit − cost, same currency) |
| `confidence` | enum | `LOW` … `VERY_HIGH` |
| `priority` | int | Higher = more urgent |
| `affectedEntities` | JSON array | `{ entityType, entityId, label? }` |
| `ownerId` | UUID? | Assigned operator |
| `dueAt` | timestamp? | Target date |
| `status` | enum | Lifecycle (see below) |
| `dedupKey` | string | Unique per org — prevents duplicate similar recommendations |
| `calculationVersion` | string | e.g. `recommendation-v1` |
| `createdAt` / `updatedAt` | timestamps | |

\* Stored as `*_cents` + `*_currency` in PostgreSQL.

### `OrgRecommendationEvent`

Append-only audit trail: `CREATED`, `UPDATED`, `STATUS_CHANGED`, `OWNER_ASSIGNED`, `DEDUPLICATED`. Captures `actorUserId`, `previousStatus`, `newStatus`, optional `metadata`.

### Status lifecycle

```
NEW → REVIEWED → ACCEPTED → PLANNED → IN_PROGRESS → IMPLEMENTED → MEASURING_IMPACT → COMPLETED
  ↘ REJECTED (terminal)
  ↘ CANCELLED (from most non-terminal states)
```

Terminal: `REJECTED`, `COMPLETED`, `CANCELLED`.

## Migration

- **File:** `backend/prisma/migrations/20260724120000_org_recommendations/migration.sql`
- **Tables:** `org_recommendations`, `org_recommendation_events`
- **Constraint:** `UNIQUE (organization_id, dedup_key)`

## APIs

Base path: `/api/v1/organizations/:orgId/evaluations/recommendations`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List (filter: `status`, `sourceType`, `sourceId`, `ownerId`, `limit`) |
| `GET` | `/:id` | Get one |
| `GET` | `/:id/events` | Audit history |
| `POST` | `/` | Create (dedup upsert on conflict) |
| `PATCH` | `/:id` | Update fields |
| `POST` | `/:id/status` | Status transition |

**Security:** `OrgScopingGuard` + `RolesGuard` (same pattern as dashboard insights). All queries filter by `organizationId`.

## Domain rules

1. **Source linkage** — `DASHBOARD_INSIGHT` sources validated against `dashboard_insights` for the org. Other source types accepted without FK until eval risk tables land on `main`.
2. **Rationale required** — No AI-generated recommendation without substantive `rationale`.
3. **Money** — API uses `{ amountMinor, currency }`; DB stores integer minor units + ISO currency.
4. **Deduplication** — Key = `orgId::sourceType::sourceId::category::normalizedTitle::sortedEntityKeys`. Duplicate create → update + `DEDUPLICATED` event.
5. **No automated personal discrimination** — Automated sources (`≠ MANUAL`) cannot target `driver` or `customer` entities in `affectedEntities`.

## Shared domain

- `backend/src/shared/recommendations/recommendation-domain.types.ts`
- `backend/src/shared/recommendations/recommendation-domain.logic.ts`
- `backend/src/shared/recommendations/recommendation-domain.mapper.ts`

## Tests

- `recommendation-domain.logic.spec.ts` — rationale, status machine, dedup key, net benefit, discrimination guard
- `org-recommendations.service.spec.ts` — create, dedup, source validation, status transition, not-found

## Known limitations

| Limitation | Notes |
|------------|-------|
| No FK to `EVALUATIONS_*` sources | Evaluations insight/risk tables not on `main` yet; `sourceId` stored as opaque string |
| No task bridge | Recommendations do not auto-create `OrgTask` (Insight→Task bridge remains separate) |
| No frontend UI | API + persistence only in this prompt |
| `MISUSE_CASE` source not validated | FK validation deferred until misuse-case API stabilizes |
| No partial unique on active status | Unlike notifications; dedup is create-time only |
| Currency mismatch | Net benefit not derived when benefit/cost currencies differ |

## Related architecture

- `DashboardInsight` — primary insight producer today
- `InsightTaskBridgeService` — task materialization from insights (parallel path)
- `DrivingDecisionAudit` — driving-specific operator decisions (not merged into this model)
