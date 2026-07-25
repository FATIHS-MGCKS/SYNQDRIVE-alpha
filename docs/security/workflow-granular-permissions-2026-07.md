# Workflow Granular Permissions (V4.9.851)

**Date:** 2026-07-25  
**Scope:** Org-scoped workflow automation RBAC — replaces coarse `@Roles(ORG_ADMIN|SUB_ADMIN|MASTER_ADMIN)` gates.

## Source of truth

- Backend `OrganizationMembership.permissions` JSON modules
- Enforced by `OrgScopingGuard` + `PermissionsGuard` + `@RequireWorkflowPermission`
- Service-layer `WorkflowPermissionService.assert()` for mixed mutations (publish on status change, enable/disable toggle)

Frontend (`hasPermission`) only hides controls — never authoritative.

## Permission actions (21)

| Action | Module | Level |
|--------|--------|-------|
| `workflow.read` | `workflow-automation` | read |
| `workflow.create` | `workflow-automation` | write |
| `workflow.edit_draft` | `workflow-automation` | write |
| `workflow.publish` | `workflow-automation-publish` | manage |
| `workflow.enable` | `workflow-automation-publish` | write |
| `workflow.disable` | `workflow-automation-publish` | write |
| `workflow.archive` | `workflow-automation-publish` | manage |
| `workflow.test_dry_run` | `workflow-automation-test` | read |
| `workflow.test_external` | `workflow-automation-test-external` | manage |
| `workflow.approval.read` | `workflow-automation-approval` | read |
| `workflow.approve` | `workflow-automation-approval` | write |
| `workflow.reject` | `workflow-automation-approval` | write |
| `workflow.run.read` | `workflow-automation-runs` | read |
| `workflow.audit.read` | `workflow-automation-audit` | read |
| `workflow.retry` | `workflow-automation-runs` | manage |
| `workflow.cancel` | `workflow-automation-runs` | write |
| `workflow.dead_letter.read` | `workflow-automation-dead-letter` | read |
| `workflow.dead_letter.replay` | `workflow-automation-dead-letter` | manage |
| `workflow.secrets.manage` | `workflow-automation-secrets` | manage |
| `workflow.policy.manage` | `workflow-automation-policy` | manage |
| `workflow.template.manage` | `workflow-automation-templates` | manage |

## Role mapping (system templates)

| Role | Workflow access |
|------|-----------------|
| **Org Admin** | Full (ORG_ADMIN guard bypass + template defaults) |
| **Sub Admin** | Draft read/write; dry-run read; approval/runs/audit/dead-letter **read only**; **no** publish, external test, secrets, policy, templates, replay, approval write |
| **Worker / Employee / Driver** | No workflow modules by default |
| **Master Admin** | Platform bypass; **must** use `:orgId` route param (documented tenant context); cross-tenant actions logged |

## Endpoint mapping

### `WorkflowsController`

- List/detail/stats/risk → `workflow.read`
- `POST risk/preview` → `workflow.test_dry_run`
- Runs → `workflow.run.read`
- Create/duplicate → `workflow.create`
- Update → `workflow.edit_draft` (+ service `workflow.publish` when status → ACTIVE)
- Toggle → `workflow.enable` decorator (+ service enable/disable assert)
- `POST :id/test` → `workflow.test_external`
- Approve/reject → `workflow.approve` / `workflow.reject`
- Delete → `workflow.archive`

### `TaskAutomationAdminController`

- Rules list/get → `workflow.read`
- Simulate → `workflow.test_dry_run`
- Revisions → `workflow.audit.read`
- Override upsert/reset → `workflow.template.manage`
- Outbox replay → `workflow.dead_letter.replay`

## Migration

1. New modules added to `PERMISSION_MODULE_KEYS` and role templates in `organization-role.defaults.ts`
2. Existing org system roles: run `backend/scripts/ops/backfill-workflow-permissions.ts` (merge defaults conservatively)
3. Custom org roles: admins assign new workflow sub-modules explicitly

## Security notes

- All queries filter by `organizationId` — UUID alone grants no access
- External test requires dedicated `workflow-automation-test-external.manage` (stricter than dry-run)
- Replay and secrets require `manage` on dedicated modules
- Audit read is separate from draft edit (`workflow-automation-audit` vs `workflow-automation`)

## Code map

- `backend/src/modules/workflows/permissions/*`
- `backend/src/shared/auth/permission.constants.ts`
- `backend/src/modules/users/defaults/organization-role.defaults.ts`
- `frontend/src/rental/components/users-roles/constants.ts`
