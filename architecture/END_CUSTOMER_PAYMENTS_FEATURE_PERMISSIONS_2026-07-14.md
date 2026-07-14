# End-customer payments — feature flag and permissions (Prompt 7)

**Date:** 2026-07-14  
**Scope:** Server-side org feature gate + granular payment permissions. No UI, no Stripe API.

## Feature flag model

`Organization.paymentsEnabled` (`Boolean`, default `false`)

- All existing organizations remain **disabled** after migration
- No auto-enable on org create
- Activation only via `PATCH /api/v1/admin/organizations/:id/payments-enabled` (`MASTER_ADMIN`)
- Tenant payment routes blocked by `PaymentsFeatureGuard` / `PaymentsAccessService` when disabled
- `MASTER_ADMIN` bypasses feature gate for platform rollout

## Permission modules (separate from `billing`)

| Action | Module | Level |
|--------|--------|-------|
| `payments.read` | `payments` | read |
| `payments.create` | `payments` | write |
| `payments.resend` | `payments` | write |
| `payments.cancel` | `payments` | write |
| `payments.refund` | `payments-refund` | write |
| `payments.disputes.read` | `payments-disputes` | read |
| `payments.connect.read` | `payments-connect` | read |
| `payments.connect.manage` | `payments-connect` | manage |
| `payments.settings.manage` | `payments-settings` | manage |

Decorator: `@RequirePaymentPermission('payments.read')`  
Guards: `PaymentsFeatureGuard` → `PaymentsPermissionGuard` (after `OrgScopingGuard`)

## Role defaults (conservative)

| Role template | Payments |
|---------------|----------|
| `org_admin` | Full (incl. connect + settings) |
| `sub_admin` | None |
| `disposition`, `station_manager` | read/write requests, disputes read |
| `accounting` | + refunds, connect read |
| `employee`, `field_agent`, `service`, `read_only` | read only |
| `driver` | none |

`ORG_ADMIN` membership role bypasses JSON permission checks (existing pattern). Feature flag still applies unless `MASTER_ADMIN`.
