# IAM — Organization Membership vs Global Identity (2026-07-21)

## Changes

- Org-scoped user administration (`PATCH /organizations/:orgId/users/:id`) updates **membership fields only** (role, permissions, station scope, department/position, membership status).
- Suspend/remove in Users & Roles affects `OrganizationMembership.status` (`SUSPENDED` / `REMOVED`), not `User.status` and not other organizations.
- Global identity fields (email, name, phone, address, locale) rejected on org-admin PATCH with `400` + explicit message.
- `POST .../change-password` deprecated (`410 Gone`, code `ORG_ADMIN_DIRECT_PASSWORD_WRITE_DEPRECATED`).
- New `POST .../request-password-reset` records audit `USER_PASSWORD_RESET_REQUESTED` (no `passwordHash` write; email/token flow is a later remediation step).
- `createOrgUser` / reactivate: existing global users get membership only — no password or profile mutation.
- Policy module: `backend/src/modules/users/policies/org-membership-admin.policy.ts`.

## Architektur

### Boundary

| Global identity (User) | Organization membership |
|------------------------|-------------------------|
| email, credentials, MFA | membership status |
| global security status | role, permissions |
| global sessions | station scope, field agent access |
| profile (name, phone, locale) | department, position, role label |

**Org admin:** membership column only. **Self-service:** `POST /account/me/change-password` unchanged. **Master admin:** `/admin/users/*` unchanged.

### API transition (clients)

| Legacy | Behavior now |
|--------|----------------|
| `PATCH .../users/:id` with `email`, `firstName`, … | `400` — use self-service or master admin |
| `PATCH .../users/:id` `{ status: 'SUSPENDED' }` | Sets `OrganizationMembership.status = SUSPENDED` in current org only |
| `POST .../change-password` `{ password }` | `410 Gone` — use `POST .../request-password-reset` |
| `POST .../users` with `password` for existing email | `400` — reset request flow |

No silent redirect to global user update.

### Data flow

```
Org Admin PATCH /organizations/:orgId/users/:id
  → assertOrgAdminUpdateDoesNotTouchGlobalIdentity(dto)
  → organizationMembership.update (status/role/permissions/…)
  → User row untouched

Org Admin suspend
  → membership.status = SUSPENDED (org-scoped)
  → other org memberships unchanged
  → User.status unchanged
```
