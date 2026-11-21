# Organization atomic onboarding (P4)

## Call graph (Master Admin)

```
OrganizationCreateWizard
  → App.handleAddOrg
    → POST /api/v1/admin/organizations { ...org, initialAdmin? }
      → OrganizationsController.create
        → OrganizationsService.create
          ├─ initialAdmin set → createWithAdmin (tx: org + user + membership)
          └─ else → organization.create
        → finalizeOrganizationOnboarding
          → OrganizationRoleService.ensureDefaultRoles (await)
          → organizationRole count gate
          → AuditService.record (MA actor)
```

Deferred path (org already exists):

```
POST /api/v1/admin/organizations/:id/admin
  → createOrgAdmin (tx + email advisory lock)
```

## Transaction boundary

| Flow | Transaction |
|------|-------------|
| `create` + `initialAdmin` | Single `$transaction`: advisory lock → org → user → membership |
| `create` org-only | Org row + awaited role seed (no cross-entity tx) |
| `createOrgAdmin` | `$transaction`: lock → user → membership |

Default roles are seeded **after** the org(+admin) transaction commits, but **before** the HTTP response completes.

## Frontend compatibility

- Wizard unchanged (two UI steps).
- `App.tsx` sends one POST with optional `initialAdmin` (no second `createAdmin` round-trip).
- Org-only workflow (`skipAdmin`) unchanged.

## Dependency

Intended base: P3 lifecycle enforcement (#2473). This branch targets `main` at P2 merge; rebase when P3 lands if needed.