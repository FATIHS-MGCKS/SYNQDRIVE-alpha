# P9 — Screen / endpoint permission matrix (classification)

Statuses: `SUPPORTED_READ_ONLY` | `REQUIRES_NEW_READ_CAPABILITY` | `BLOCKED_SENSITIVE` | `MUTATION_ONLY` | `NOT_DEPLOYED` | `UNKNOWN`

## Master (`ui-audit-master`)

| Screen | Status | Notes |
|--------|--------|-------|
| Dashboard | BLOCKED_SENSITIVE | Operational DTO includes org attention, billing, support PII — not on audit allowlist |
| Organizations | BLOCKED_SENSITIVE | Cross-tenant directory — removed from audit allowlist |
| Security attention | BLOCKED_SENSITIVE | `topItems` expose emails/user IDs |
| Ops overview / incidents | BLOCKED_SENSITIVE | Tenant-linked incident context |
| Connectivity summary | SUPPORTED_READ_ONLY | Aggregate counts only (`ui-audit-master`) |
| Security users | BLOCKED_SENSITIVE | Identity directory — removed from audit allowlist |
| Billing operational overview | BLOCKED_SENSITIVE | Billing intelligence — removed from audit allowlist |
| Security & Access | BLOCKED_SENSITIVE | User/role surfaces — partial read via admin security GETs only with MASTER path |
| Product Management | REQUIRES_NEW_READ_CAPABILITY | |
| Platform Operations | REQUIRES_NEW_READ_CAPABILITY | |
| Integrations | REQUIRES_NEW_READ_CAPABILITY | |
| Billing (read) | REQUIRES_NEW_READ_CAPABILITY | Separate `master-billing` delegate pattern — audit uses read-only module path not billing delegate write |
| Connected Vehicles | REQUIRES_NEW_READ_CAPABILITY | DIMO privilege UI **NOT_DEPLOYED** on current prod |

Reference readonly API list (smoke runner only — **not** audit identity): `master-admin-smoke-readonly.runner.ts`

## Rental (`ui-audit-rental`)

| Screen | Status | Notes |
|--------|--------|-------|
| Dashboard | SUPPORTED_READ_ONLY | `dashboard` module read |
| Fleet / vehicle detail | SUPPORTED_READ_ONLY | `fleet` + tabs read |
| Bookings | SUPPORTED_READ_ONLY | list/detail GET |
| Customers | SUPPORTED_READ_ONLY | |
| Finance / evaluations | SUPPORTED_READ_ONLY | no refund/dispute write modules |
| Settings (read) | SUPPORTED_READ_ONLY | exclude `users-roles.manage` |
| New booking / mutations | MUTATION_ONLY | denied by guard |

## Operator (`ui-audit-operator`)

| Screen | Status | Notes |
|--------|--------|-------|
| Shell / tabs | SUPPORTED_READ_ONLY | WORKER rental context |
| Today / vehicles / tasks | SUPPORTED_READ_ONLY | |
| Deep links | SUPPORTED_READ_ONLY | GET shell + API reads |
| Handover / damage / QR writes | MUTATION_ONLY | denied |
| Physical device proof | UNKNOWN | out of scope P9B |

## Global denylists (server)

- Export/credential/secret GET patterns — `UI_AUDIT_SENSITIVE_GET_DENYLIST`
- All non-auth business POST/PUT/PATCH/DELETE — `UiAuditWriteDenyGuard`