# P2.2.63 — Mounted Roles Access & Security Audit Localization

**Date:** 2026-08-30  
**Baseline:** `4b89ad8015fdb4183b8d130eea02cb4fb8f07a58`  
**Branch:** `cursor/p2263-mounted-roles-security-i18n-3c10`  
**Preflight:** PR #1426 — verdict B (GO, BUT SPLIT)

## Scope

### Included

- `RolesAccessTab` — empty/select/meta/scope host copy
- `SecurityAuditTab` — empty state + audit feed via `resolveAuditEventTitle`
- Adapter gap: `legal-documents-audit` module key
- P263 enforce-clean (2 paths)

### Excluded

- Dead `RolesTab` custom-role CRUD (product wiring required)
- P262 frozen surfaces (Member Management, wizard, drawer, PermissionEditor)

## Key accounting

| Metric | Before | After |
|--------|--------|-------|
| P263 new keys | — | **7** |
| EN | 9654 | **9661** |
| DE | 9654 | **9661** |
| Parity | 100% | 100% |

### New keys (+7)

- `iam.roles.empty.title`
- `iam.roles.selectPrompt`
- `iam.roles.meta.pinned`
- `iam.roles.meta.followsLatest`
- `iam.roles.impact.scope`
- `iam.security.empty.title`
- `iam.permission.module.legal-documents-audit`

## Scanner delta

| Scanner | Baseline | After |
|---------|----------|-------|
| Global | 1263 | **1260** (−3 mounted) |
| Rental | 166 | **163** (−3) |
| Finance/Billing | 25 | 25 |

Dead users-roles debt (45 findings) unchanged — deferred product wiring.

## Semantics preserved

- Permission/role machine IDs unchanged
- Custom role name/description RAW
- Unknown audit actions → raw description fallback
- Locale switch: zero business refetch (instrumented)

## Tests

- `rental-mounted-roles-security-localization.test.tsx`
- P262 regression: `rental-member-management-localization.test.tsx`
