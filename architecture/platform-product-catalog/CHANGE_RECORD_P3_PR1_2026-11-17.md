# P3-PR1 — Core app service client registry (foundation)

**Date:** 2026-11-17
**Reference:** SYNQDRIVE-CORE `core-app-m2m` / migration `20261112120000_*` (architecture only; not cherry-picked)

## Scope

- Prisma: `CoreAppServiceClient`, `CoreAppServiceOrgGrant`, status enums
- Migration: `20261117133000_p3_pr1_core_app_service_client_registry`
- Internal domain: `CoreAppServiceRegistryService` + policy (validation only)
- **No** HTTP registration, token exchange, guards, Master Admin UI, or `AppModule` wiring

## Fail-closed defaults (Alpha deviation from Core reference)

| Field | Alpha default | Core reference |
|-------|---------------|----------------|
| `CoreAppServiceClient.status` | `DISABLED` | `ACTIVE` |
| `CoreAppServiceOrgGrant.status` | `REVOKED` | `ACTIVE` |

## Runtime gates

- `CORE_APP_M2M_ENABLED` default **false**
- `CORE_APP_M2M_PRODUCTION_READY` default **false**
- Validation returns `RUNTIME_DISABLED` when env gate is off

## Credential policy

- Persist `credential_hash` + `credential_version` only
- No plaintext secrets in repository, API, or frontend
- Token issuance deferred to P3-PR2+

## Product slug policy

- Eligible external apps: `RENTAL`, `FLEET`, `VYMOD`
- `TAXI` retired — not eligible for new service clients

## Future (blockers for production M2M)

- Master Admin CRUD + MFA audit for clients/grants
- Token exchange + dedicated signing secret isolation
- Redis-backed rate limits (see Core `P3_PR11C`)
- `CORE_APP_M2M_PRODUCTION_READY` operator attestation + security review

## REGISTRY_REVIEWED

- **platform-product-catalog:** `AUDIT_IN_PROGRESS` → **UNCHANGED** (adjacent module; M2M registry documented here until dedicated authority)