# Users & Invites — authority boundaries

## Owns (this module)

- Master Admin **Security & Access** hub UI and wiring to `/admin/security/*`
- Platform-wide user list/detail governance (not tenant self-service)
- Documentation of org-scoped user/invite/role HTTP under `backend/src/modules/users/*`
- Cross-reference to membership identity isolation guarantees

## Does not own

| Area | Owner |
|------|--------|
| Organization offboarding / archival | `architecture/organizations/` |
| Product entitlements / catalog | `architecture/platform-product-catalog/` |
| Clerk/external IdP (if introduced) | not present in monolith — **UNKNOWN** future |
| Rental tenant **Users & Roles** tab | Rental UI + same backend org routes |
| MFA crypto implementation detail | `backend/src/modules/iam-mfa/*` (documented here; separate registry row **IAM MFA**) |
| GDPR deletion orchestration | `backend/src/modules/iam-data-retention/*` (**IAM Data Retention**) |
| Master shell chrome / nav | `architecture/frontend-ui-ux/products/master-admin/` |

## Core vs Rental

- **Core:** Master Admin, platform roles, MFA step-up, activity log, org admin bootstrap
- **Rental:** consumes org-scoped IAM APIs; must not duplicate permission stores

## Competing authorities

Flat `architecture/IAM_*.md` files are **supporting design evidence** — they do not replace this authority once `AUDIT_IN_PROGRESS` or `AUTHORITY_ACTIVE`.