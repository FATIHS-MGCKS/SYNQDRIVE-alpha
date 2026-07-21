# IAM — Org-Bound Refresh Sessions (2026-07-21)

## Changes

- `RefreshToken` extended with org/membership binding metadata: `scope`, `permissionVersion`, `roleVersion`, `assuranceLevel`, `authenticatedAt`, `lastUsedAt`, `revocationReason`.
- `RefreshTokenScope`: `ORG_MEMBERSHIP_BOUND` (default for new sessions) vs `LEGACY_UNSCOPED` (existing rows without binding — not blindly assigned).
- `User.lastAuthOrganizationId` documents last successful org context for multi-org login fallback.
- `refresh-session-binding.policy.ts` — deterministic login org resolution and refresh binding validation.
- `RefreshTokenService.rotate()` loads membership by stored `membershipId` / `organizationId` — refresh cannot switch organizations.
- Login: single active membership auto-selected; multi-org requires `organizationId` or falls back to `lastAuthOrganizationId`.
- Feature flags: `ENABLE_IAM_ORG_BOUND_REFRESH_SESSIONS` (default on), `ENABLE_IAM_LEGACY_UNSCOPED_REFRESH_GRACE` (default off).

## Architektur

### Session binding model

| Field | Purpose |
|-------|---------|
| `organizationId` + `membershipId` | Canonical org context for the session family |
| `scope` | `ORG_MEMBERSHIP_BOUND` vs `LEGACY_UNSCOPED` |
| `sessionVersion` | User-global invalidation (password, MFA reset, …) |
| `membershipVersion` | Org-membership invalidation (suspend, remove, …) |
| `permissionVersion` / `roleVersion` | Snapshot hashes — drift rejects refresh |
| `authenticatedAt` | Preserved across rotation within family |
| `lastUsedAt` | Updated on each successful rotate |
| `revocationReason` | Audit trail when session revoked |

### Login org resolution

```
ACTIVE memberships count:
  0 → no org in token (platform-only user)
  1 → use that membership
  N → require body.organizationId OR User.lastAuthOrganizationId if still active
```

### Refresh flow

1. Load stored refresh token + user (no `take:1` membership pick).
2. Load membership by `stored.membershipId` (org-bound) or apply legacy transition policy.
3. Validate membership ACTIVE, org consistency (no cross-tenant).
4. Validate version snapshots.
5. Rotate within same `family`, preserving `organizationId`, `membershipId`, `authenticatedAt`.

### Legacy transition policy

- Existing rows without org binding: `scope = LEGACY_UNSCOPED`.
- With `ENABLE_IAM_LEGACY_UNSCOPED_REFRESH_GRACE=true`: one upgrade refresh allowed when org is determinable (single active membership or `lastAuthOrganizationId`).
- Otherwise: reject — user must re-login (optionally with explicit `organizationId`).
- No permanent support for unscoped multi-org refresh.

### Cross-tenant invariants

- `membership.userId` must equal `refreshToken.userId`.
- `membership.organizationId` must equal `refreshToken.organizationId`.
- FK: `refresh_tokens.membership_id` → `organization_memberships`, `organization_id` → `organizations`.

### Feature flags

| Env | Default | Effect |
|-----|---------|--------|
| `ENABLE_IAM_ORG_BOUND_REFRESH_SESSIONS` | `true` | Enforce binding policy |
| `ENABLE_IAM_LEGACY_UNSCOPED_REFRESH_GRACE` | `false` | Allow one-time legacy upgrade |

### Suspended / removed membership

Refresh denied → token revoked with `revocationReason` → `IamSessionPolicyService` audit for `MEMBERSHIP_SUSPENDED` / `MEMBERSHIP_REMOVED`.

### Integration with Prompt 5

`IamSessionPolicyService` org-scoped revocation uses `refresh_tokens.organization_id`. Org-bound sessions enable precise multi-org session isolation.
