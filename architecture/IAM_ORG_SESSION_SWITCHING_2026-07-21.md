# IAM — Explicit Organization Session Switching (2026-07-21)

## Changes

- `POST /auth/switch-organization` — explicit org switch with new org-bound token family
- `GET /auth/memberships` — list active organizations for authenticated user
- Login multi-org: credentials verified first, then `requiresOrganizationSelection` payload (no tokens until explicit `organizationId`)
- `User.lastSelectedOrganizationId` — set only on explicit login org choice or switch (not auto-selected at login)
- `/auth/me` and `/auth/refresh` resolve membership from JWT `organizationId` + `membershipId` (no `take:1`)
- Frontend: login org picker + `OrganizationSwitcher` in rental TopBar

## Architektur

### Explicit switch flow

```
POST /auth/switch-organization
  → validate target membership (active, belongs to user, not cross-tenant)
  → revoke current refresh token (ORGANIZATION_SWITCHED)
  → issue NEW token family bound to target org/membership
  → persist lastSelectedOrganizationId
  → audit (ActivityLog + UserAccessAudit ORGANIZATION_SESSION_SWITCHED)
```

### Login multi-org

| Step | Behavior |
|------|----------|
| 1 | Verify email/password |
| 2a | Single active membership → issue tokens immediately |
| 2b | Multiple active memberships, no `organizationId` → return `requiresOrganizationSelection` + org list + optional `suggestedOrganizationId` hint (no tokens) |
| 2c | Multiple + explicit `organizationId` → issue org-bound tokens, update `lastSelectedOrganizationId` |

### Session consistency

- Login, `/auth/me`, refresh rotation, and switch all use the same JWT membership binding.
- Refresh never changes organization silently.
- `suggestedOrganizationId` / `lastSelectedOrganizationId` are UI hints only — never auto-mint tokens.

### Old session policy on switch

- Current device refresh token revoked (`ORGANIZATION_SWITCHED`).
- Other org sessions on other devices remain active (parallel org sessions supported).

### Frontend

- `LoginPage` — org selection step after credential verification
- `OrganizationSwitcher` — visible active org + explicit switch dropdown
- `RentalContext.switchOrganization()` — calls API, updates stored tokens/user, reloads app state
