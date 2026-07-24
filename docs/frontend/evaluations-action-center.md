# Evaluations Action Center (Maßnahmen-Center)

**Version:** V4.9.834 (Prompt 37/54)  
**Surface:** `EvaluationsPage` → section `auswertungen-massnahmen`  
**API:** `GET/PATCH/POST /organizations/:orgId/evaluations/recommendations`

## Overview

Professional action center for canonical `OrgRecommendation` records. Replaces the legacy insight bullet list in the Maßnahmen section with a full workflow UI: filters, detail drawer, status actions, owner/due assignment, rejection rationale, and audit history.

## Implemented actions

| Action | UI | API | Permission |
|--------|----|-----|------------|
| List & filter | Filter bar (status, category, owner, priority) | `GET /recommendations` | Org member (read) |
| View detail | Detail drawer | `GET /recommendations/:id` (via list cache) | Org member |
| Mark reviewed | Primary action | `POST …/status` `{ status: REVIEWED }` | `tasks.write` or admin |
| Accept | Primary action | `POST …/status` `{ status: ACCEPTED }` | same |
| Reject | Reject button + reason textarea | `POST …/status` `{ status: REJECTED, reason }` | same |
| Plan | Primary action | `POST …/status` `{ status: PLANNED }` | same |
| Start progress | Primary action | `POST …/status` `{ status: IN_PROGRESS }` | same |
| Mark implemented | Primary action | `POST …/status` `{ status: IMPLEMENTED }` | same |
| Measure impact | Primary action | `POST …/status` `{ status: MEASURING_IMPACT }` | same |
| Complete | Primary action | `POST …/status` `{ status: COMPLETED }` | same |
| Assign owner | Select + save | `PATCH …/recommendations/:id` | same |
| Set due date | Date input + save | `PATCH …/recommendations/:id` | same |
| View history | Timeline in drawer | `GET …/recommendations/:id/events` | Org member |

## Roles & permissions

**Frontend gate** (`canManageEvaluationsRecommendations`):

- `ORG_ADMIN`, `MASTER_ADMIN`, `SUB_ADMIN` → manage
- Others → `tasks.manage` or `tasks.write`
- Read-only users see recommendations but no action buttons

**Backend gate** (mutations):

- `PermissionsGuard` + `@RequirePermission('tasks', 'write')` on `POST`, `PATCH`, status transitions
- `OrgScopingGuard` + `RolesGuard` on all routes

## Status transitions

Mirrors domain model (`recommendation-domain.logic.ts`):

```
NEW → REVIEWED → ACCEPTED → PLANNED → IN_PROGRESS → IMPLEMENTED → MEASURING_IMPACT → COMPLETED
  ↘ REJECTED / CANCELLED (from most non-terminal states)
```

UI only shows transitions valid for the current status. Rejection requires ≥ 10 character reason (stored in audit event metadata).

## Recommendation card fields

Each item shows:

- Problem/opportunity (`description`)
- Cause (`rationale`)
- Proposed measure (`title`)
- Expected benefit, estimated cost, net benefit (money formatting)
- Confidence & data basis (`sourceType`, `sourceId`, `calculationVersion`)
- Owner & due date
- Status, category, priority

## UX patterns

- **Optimistic updates** with rollback on API failure (`useEvaluationsRecommendations`)
- **Empty / loading / error** states with `role="status"` / `role="alert"`
- **Mobile:** touch targets ≥ 44px (`EVALUATIONS_TOUCH_TARGET_CLASS`), responsive filter grid, full-screen `DetailDrawer`
- **i18n:** `evaluations.actionCenter.*` keys in DE + EN
- **a11y:** labeled filter `fieldset`, list `aria-label`, drawer sections, rejection textarea label
- **Audit:** `logEvaluationsRecommendationAudit` dispatches `synqdrive:evaluations-recommendation-audit` custom event (integration hook for future telemetry)

## Files

| Path | Role |
|------|------|
| `frontend/src/rental/components/evaluations/EvaluationsActionCenter.tsx` | Main UI |
| `frontend/src/rental/components/evaluations/EvaluationsRecommendationDetailDrawer.tsx` | Detail + actions |
| `frontend/src/rental/hooks/useEvaluationsRecommendations.ts` | Data + optimistic mutations |
| `shared/evaluations-insights/evaluations-recommendations.ts` | Permissions, filters, transitions |
| `frontend/src/lib/api.ts` | `api.evaluationsRecommendations.*` |

## Tests

| Test | Coverage |
|------|----------|
| `shared/evaluations-insights/evaluations-recommendations.shared.spec.ts` | Permissions, filters, transitions |
| `frontend/src/rental/hooks/useEvaluationsRecommendations.test.ts` | Load, optimistic rollback, parallel failure |
| `frontend/src/rental/components/evaluations/evaluations-action-center.ui.test.tsx` | Fieldset, list render, read-only gate |
| `frontend/e2e/evaluations-action-center.spec.ts` | E2E list, filter, status transition |
| `backend/.../org-recommendations.service.spec.ts` | Service dedup, transitions |

## Visual reference

Screenshot captured by Playwright: `docs/frontend/artifacts/evaluations-action-center.png` (mocked API in E2E fixtures).

## Known limits

- No inline recommendation creation UI (API exists; producer bridge deferred)
- Category filter is client-side only (API list filter lacks category param)
- Owner picker uses org user list; no station-scoped assignment
- Concurrent edits: last write wins; no ETag conflict handling yet
