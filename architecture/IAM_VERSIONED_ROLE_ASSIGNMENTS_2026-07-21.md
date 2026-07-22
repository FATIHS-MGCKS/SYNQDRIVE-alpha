# IAM — Versioned Organization Role Assignments (2026-07-21)

## Changes

- `OrganizationRoleVersion` — immutable approved snapshots with version history
- `OrganizationRoleAssignment` — separates role template from membership assignment
- `MembershipPermissionOverride` — explicit ALLOW/DENY overrides with actor, reason, optional expiry
- Migration backfills version 1 for existing roles and `MIGRATION_LEGACY_SNAPSHOT` assignments
- `OrganizationRoleVersionService` — version creation, assignment, override management
- `OrganizationRoleService` wired to create versions on role create/update and versioned assignments

## Architektur

### Model separation

```
OrganizationRole (template identity)
  └─ OrganizationRoleVersion[] (immutable snapshots: permissions, station defaults, risk)
       └─ referenced by OrganizationRoleAssignment

OrganizationMembership
  ├─ permissions JSON (legacy snapshot — preserved)
  ├─ OrganizationRoleAssignment[] (current + history)
  └─ MembershipPermissionOverride[] (explicit ALLOW/DENY)
```

### Assignment modes

| Mode | Behavior |
|------|----------|
| `FOLLOW_LATEST_APPROVED_VERSION` | Resolves latest APPROVED version at runtime |
| `PINNED_VERSION` | Fixed to `assignedRoleVersionId` |
| `MIGRATION_LEGACY_SNAPSHOT` | Marks pre-migration assignments; uses membership JSON |

### Role version lifecycle

| Status | Meaning |
|--------|---------|
| `DRAFT` | Not yet active |
| `APPROVED` | Active version |
| `SUPERSEDED` | Replaced by newer approved version |
| `RETIRED` | Cannot be assigned |

### Override semantics

- Explicit `ALLOW` / `DENY` per module + level
- Optional `reason`, `expiresAt`, `revokedAt`
- No invisible drift — overrides are separate rows, not hidden JSON diffs

### System roles

- Versioned on seed (initial APPROVED version)
- Cannot be deleted or have permissions/membershipRole mutated directly
- Changes only via controlled new version workflow (non-system roles)

### Compatibility

- Existing `organization_memberships.permissions` JSON preserved
- Legacy assignments marked `MIGRATION_LEGACY_SNAPSHOT`
- EffectiveAccessEngine continues to read membership JSON until Prompt 11+ wiring

## Files

- `backend/prisma/migrations/20260721250000_iam_versioned_role_assignments/`
- `backend/src/modules/users/organization-role-version.service.ts`
- `backend/src/modules/users/policies/organization-role-version.policy.ts`
