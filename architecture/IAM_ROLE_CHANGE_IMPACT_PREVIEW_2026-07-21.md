# IAM — Role Change Impact Preview & Apply (2026-07-21)

## Changes

- `POST /organizations/:orgId/roles/:roleId/preview-change` — server-side impact preview before structural role edits
- `POST /organizations/:orgId/roles/:roleId/apply-change` — versioned apply with preview hash, expected version, idempotency key, reason, optional step-up confirmation
- `PATCH /roles/:roleId` — metadata-only (name/description/isActive); structural changes rejected
- `OrganizationRoleChangeApplication` — idempotent apply log
- Effective last-admin protection via privileged capabilities (not enum-only)

## Architektur

### Flow

```
previewRoleChange(changes)
  → compute impacted memberships (FOLLOW_LATEST vs PINNED)
  → permission/privilege/station/session/last-admin/SoD analysis
  → previewHash + stepUp requirement

applyRoleChange(previewHash, expectedRoleVersion, reason, idempotencyKey)
  → verify hash + version (optimistic concurrency)
  → create OrganizationRoleVersion (new APPROVED, supersede prior)
  → update role template (compatibility)
  → propagate to FOLLOW_LATEST assignments only
  → bump membershipVersion + enqueue session invalidation per member
  → audit ROLE_CHANGE_APPLIED
```

### Impact preview fields

- affected memberships, gained/lost permissions, privileged capability changes
- station scope reductions, affected session count
- last-admin risk (effective admin count)
- segregation-of-duties conflicts (users-roles.manage + billing.manage)
- per-membership: `willReceiveUpdate`, `pinnedVersionNumber`, session triggers

### Assignment propagation

| Mode | On apply |
|------|----------|
| `FOLLOW_LATEST_APPROVED_VERSION` | Membership JSON updated, version bumped, sessions invalidated |
| `MIGRATION_LEGACY_SNAPSHOT` | Same as follow-latest (legacy marker retained) |
| `PINNED_VERSION` | Unchanged — listed in `pinnedMemberships` response |

### Apply requirements

- `previewHash` — SHA-256 of stable preview payload
- `expectedRoleVersion` — rejects concurrent edits
- `idempotencyKey` — deduplicated via `organization_role_change_applications`
- `reason` — stored on role version
- `stepUpConfirmed` — required when preview.stepUp.required

## Files

- `backend/src/modules/users/organization-role-change.service.ts`
- `backend/src/modules/users/policies/role-change-impact.policy.ts`
- `backend/src/modules/users/org-admin-protection.util.ts` (effective admin)
