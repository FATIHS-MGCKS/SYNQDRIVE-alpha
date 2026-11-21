# Organization atomic onboarding (P4)

## Call graph (Master Admin)

```
OrganizationCreateWizard
  → App.handleAddOrg
    → POST /api/v1/admin/organizations { ...org, initialAdmin? }
      → OrganizationsController.create
        → OrganizationsService.create
          ├─ initialAdmin set → createWithAdmin (tx: org + user + membership + default roles + approved v1)
          └─ else → $transaction (org + default roles + approved v1)
        → recordMasterAdminOnboardingSuccessAudit (post-commit only)
```

Deferred path (org already exists):

```
POST /api/v1/admin/organizations/:id/admin
  → createOrgAdmin (tx + email advisory lock)
```

## Transaction boundary

| Flow | Transaction |
|------|-------------|
| `create` + `initialAdmin` | Single `$transaction`: advisory lock → org → user → membership → default roles → approved v1 gate |
| `create` org-only | Single `$transaction`: org → default roles → approved v1 gate |
| `createOrgAdmin` | `$transaction`: lock → user → membership (legacy deferred; roles may already exist) |

Default roles and approved v1 role versions are provisioned **inside** the same transaction as organization (and optional admin) creation. MA success audit runs only after commit.

## Frontend compatibility

- Wizard unchanged (two UI steps).
- `App.tsx` sends one POST with optional `initialAdmin` (no second `createAdmin` round-trip).
- Org-only workflow (`skipAdmin`) unchanged.

## Dependency

Intended base: P3 lifecycle enforcement (#2473). This branch targets `main` at P2 merge; rebase when P3 lands if needed.