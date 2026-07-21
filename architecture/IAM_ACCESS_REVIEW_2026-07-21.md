# IAM Access Review and Privileged Access Attestation (2026-07-21)

## Summary

Prompt 19 adds a minimal **access review** model for periodic attestation of privileged and risky memberships. Reviews capture **effective access snapshots**; changes apply only through **`IamMembershipLifecycleService`** (JML).

## Data model

| Model | Purpose |
|-------|---------|
| `AccessReviewCampaign` | Org-scoped review run (scope, reviewer, due date, status) |
| `AccessReviewItem` | Immutable effective-access snapshot per membership |
| `AccessReviewDecision` | Reviewer attestation with application status |

### Campaign scopes

- `PRIVILEGED_ACCOUNTS` — admin roles, manage permissions, master admin
- `SINGLE_ADMIN` — sole active `ORG_ADMIN`
- `INACTIVE_USERS` — inactive user or no login > 90 days
- `INVALID_ROLE_MEMBERSHIP` — missing/inactive role template
- `OVERDUE_REVIEWS` — pending items from overdue campaigns

### Decision types

`CONFIRM` | `MODIFY` | `SUSPEND` | `REMOVE` | `ESCALATE`

### Application status

`PENDING` → `APPLIED` | `FAILED` | `SKIPPED` | `NOT_APPLICABLE`

## Snapshot contents (per item)

- Membership + `membershipVersion`
- Effective role / role template
- Privileged capabilities (`module:manage`, `role:ORG_ADMIN`, …)
- Station scope + IDs
- Permissions JSON
- Last activity (login / activity log)
- MFA enrolled
- Active session count
- Risk reasons
- Full `accessSnapshot` JSON

## Policies

- **No automatic broad deactivation** — campaigns create review items only; reviewer must decide
- **Last admin** — `SUSPEND`/`REMOVE` blocked when `SINGLE_ORG_ADMIN` risk present
- **Break-glass** — `MASTER_ADMIN` flagged `BREAK_GLASS_CANDIDATE`; suspend/remove blocked
- **Stale snapshot** — decision rejected if `membershipVersion` changed since item creation
- **Cross-tenant** — all queries scoped by `organizationId`

## Lifecycle integration

| Decision | Lifecycle path |
|----------|----------------|
| CONFIRM / ESCALATE | No mutation (`NOT_APPLICABLE`) |
| MODIFY | `IamMembershipLifecycleService.move()` |
| SUSPEND | `IamMembershipLifecycleService.suspend()` |
| REMOVE | `IamMembershipLifecycleService.remove()` |

## API

Base: `/api/v1/organizations/:orgId/access-reviews`

- `GET /campaigns`
- `POST /campaigns` — create (DRAFT)
- `GET /campaigns/:campaignId`
- `POST /campaigns/:campaignId/start` — snapshot items, ACTIVE
- `GET /campaigns/:campaignId/items`
- `POST /items/:itemId/decisions` — record + apply

Requires `users-roles` permission (`read` / `manage`).

## Audit outbox

- `ACCESS_REVIEW_CAMPAIGN_CREATED`
- `ACCESS_REVIEW_CAMPAIGN_STARTED`
- `ACCESS_REVIEW_DECISION_RECORDED`
- `ACCESS_REVIEW_DECISION_APPLIED`

## Tests

`iam-access-review.security.spec.ts` — campaign, snapshot, confirm, modify, suspend, last admin, overdue, re-campaign, cross-tenant, stale version.
