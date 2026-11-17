# P3-PR1 — Core app service client registry (foundation)

**Date:** 2026-11-17
**Reference:** SYNQDRIVE-CORE `core-app-m2m` / migration `20261112120000_*` (architecture only; not cherry-picked)

## Owner architecture — platform products (2026-11-17)

| Product | Role in Alpha |
|---------|----------------|
| **RENTAL** | First-class operational product; domain and APIs remain in this repository/deployment |
| **FLEET** | Future separate application backend (API consumer) |
| **VYMOD** | Future separate application backend (API consumer) |

Shared governance for all slugs: Master Admin, product catalog, organization entitlements, vehicle access, central security policies.

**Rental vs M2M:** Rental may call Core platform services **in-process** (Nest modules, shared Prisma, user JWT, `ProductLicenseGuard`, etc.). **Do not** require Rental business routes to authenticate via Core App M2M while Core and Rental share one backend. M2M service clients target **separate** deployables (Fleet, VYMOD, and optional future split runtimes).

**Foundation neutrality:** Registry schema and validation are product-slug generic (`RENTAL` \| `FLEET` \| `VYMOD`); no Fleet- or VYMOD-only fields in P3-PR1.

`RENTAL_COMPATIBILITY=MANDATORY` — no Rental route, entitlement, or data-model regression in this workstream.

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

- Eligible service-client product slugs: `RENTAL`, `FLEET`, `VYMOD` (first-class catalog products)
- `TAXI` retired — not eligible for new service clients
- Including `RENTAL` in the registry model does **not** obligate the co-located Rental SPA to use M2M

## Future (blockers for production M2M)

- Master Admin CRUD + MFA audit for clients/grants
- Token exchange + dedicated signing secret isolation
- Redis-backed rate limits (see Core `P3_PR11C`)
- `CORE_APP_M2M_PRODUCTION_READY` operator attestation + security review

## REGISTRY_REVIEWED

- **platform-product-catalog:** `AUDIT_IN_PROGRESS` → **UNCHANGED** (adjacent module; M2M registry documented here until dedicated authority)