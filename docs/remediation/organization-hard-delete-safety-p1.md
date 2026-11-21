# Organization hard delete — temporary P1 safety restriction

**Status:** ACTIVE (fail-closed)  
**Introduced:** 2026-11-21  
**Repository:** SYNQDRIVE-alpha  
**Scope:** `DELETE /api/v1/admin/organizations/:id` via `OrganizationsService.delete`

## Why this restriction exists

The P0 Master Admin Organizations lifecycle audit (`NO_GO`) confirmed that
`OrganizationsService.delete` performed `prisma.organization.delete`, which can
cascade across a large share of tenant data (memberships, vehicles, roles, billing
rows, and more). ZB1 registration-document cleanup ran best-effort and errors were
swallowed before the hard delete.

Until a deliberate offboarding workflow exists, exposing this path in production is
unsafe for GDPR/GoBD retention, billing integrity, and external integration revocation.

## Current behavior

- Master Admin callers receive **HTTP 409 Conflict** with structured body:
  - `code`: `ORGANIZATION_HARD_DELETE_DISABLED`
  - `action`: `USE_RETENTION_AWARE_OFFBOARDING`
- No `Organization` row is removed.
- No ZB1 soft-delete hook runs.
- No Prisma cascade deletes occur.
- **Not** replaced by silent `Organization.status = ARCHIVED`.

Implementation: `assertOrganizationHardDeleteAllowed()` in
`backend/src/modules/organizations/organization-delete-safety.policy.ts`.

## Unaffected flows

- Test harnesses that call `prisma.organization.delete` directly (disposable DBs).
- Tenant profile, suspension (`PATCH` status), billing, and vehicle offboard APIs.
- Vehicle delete lockdown (`LEGACY_VEHICLE_DESTRUCTION_DISABLED`) unchanged.

## Requirements for future safe offboarding

A replacement workflow must be explicitly approved and must address at minimum:

1. **Legal hold** — block erasure when hold flags or open disputes exist.
2. **Retention** — GoBD invoice/financial record retention vs tenant teardown.
3. **Export** — GDPR Art. 15/20 style export before erasure where applicable.
4. **Revocation** — DIMO/HM/Stripe/email/integration disconnect in defined order.
5. **External cleanup** — fail-closed when provider teardown fails (no swallowed errors).
6. **Verified erasure** — durable audit with before/after counts and actor attribution.
7. **Idempotency** — safe retry for long-running offboard jobs.

Only after those gates are implemented and tested should
`assertOrganizationHardDeleteAllowed` be relaxed or routed to the new service.

## Bypass analysis

| Path | Blocked |
|------|---------|
| `OrganizationsController.delete` → `OrganizationsService.delete` | Yes (409) |
| Direct `prisma.organization.delete` in application runtime | Out of scope (ops/tests only) |
| Alternate HTTP route for same semantics | None found on `main` |