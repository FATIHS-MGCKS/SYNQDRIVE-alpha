# POST-P6-P10 — Core external application interface readiness

**Date:** 2026-11-20 (Europe/Berlin)
**Operation:** `SYNQDRIVE_ALPHA_POST_P6_P10_CORE_EXTERNAL_APP_INTERFACE_READINESS`
**Mode:** read-only discovery + documentation/evidence only
**Repository baseline:** `origin/main` @ `e2fd6eb9b6bcdb0bef2d131d0a8acd426c506d0b` (includes merged PR #2461)
**Binding shape preserved:** one Alpha repo; Core/Rental logical domains; no physical extraction; co-located Rental not M2M-mandatory; **no** production M2M activation; **no** live VYMOD/Fleet connections.

**Epistemic rule:** merged code + repository tests ≠ production validation. Status columns below are **repository evidence** unless explicitly marked otherwise.

---

## A. Product entitlements

| Capability | IMPLEMENTED | TESTED | DB_VERIFIED | PRODUCTION_VERIFIED | Notes |
|------------|-------------|--------|-------------|---------------------|-------|
| `ProductSlug` catalog (RENTAL, FLEET, VYMOD) | YES | YES | YES (schema) | NOT_VERIFIED | `backend/prisma/schema.prisma`; P2-PR1 |
| `OrganizationProduct` | YES | YES | YES | NOT_VERIFIED | Prisma + admin flows |
| `ProductLicenseGuard` (ACTIVE-only ops) | YES | YES | PARTIAL (specs) | NOT_VERIFIED | `shared/guards/product-license.guard.ts` |
| `core.entitlements.v1` read API | YES | YES | PARTIAL (HTTP spec) | NOT_VERIFIED | `products/entitlements/core-entitlements-read.controller.ts` — **user JWT only** |
| TRIAL vs ACTIVE semantics | YES | YES | N/A | NOT_VERIFIED | `entitlements-policy.ts`; TRIAL UI-only vehicle activation |
| License expiration clock | YES | YES | N/A | NOT_VERIFIED | `isOrganizationProductLicenseTermExpired` — factual only; guards use ACTIVE status |

**Representative paths:** `backend/src/modules/products/entitlements/*`, P2 change records under `architecture/platform-product-catalog/`.

---

## B. Service client registry

| Capability | IMPLEMENTED | TESTED | DB_VERIFIED | PRODUCTION_VERIFIED | Notes |
|------------|-------------|--------|-------------|---------------------|-------|
| `CoreAppServiceClient` model | YES | YES | YES (migration) | NOT_VERIFIED | P3-PR1 migration chain |
| Org grants (default REVOKED) | YES | YES | YES (opt-in PG) | NOT_VERIFIED | `CoreAppServiceOrgGrant`; postgres integration spec |
| Product binding per client | YES | YES | YES | NOT_VERIFIED | `core-app-service-registry.policy.ts` |
| Client enable/disable | YES | YES | PARTIAL | NOT_VERIFIED | `CoreAppServiceClientStatus` |
| Credential hash + rotation | YES | YES | PARTIAL | NOT_VERIFIED | `core-app-service-client.admin.service.ts` `rotateCredential`, `credentialVersion` |
| Grant revoke/activate | YES | YES | PARTIAL | NOT_VERIFIED | grant status + `grantVersion` |

**Representative paths:** `backend/src/modules/core-app-m2m/core-app-service-registry.service.ts`, `admin/core-app-service-client.admin.*`.

---

## C. External M2M authentication

| Capability | IMPLEMENTED | TESTED | DB_VERIFIED | PRODUCTION_VERIFIED | Notes |
|------------|-------------|--------|-------------|---------------------|-------|
| Token exchange | YES | YES | PARTIAL | NOT_VERIFIED | `POST /api/v1/auth/core-app/token` |
| Service JWT validation | YES | YES | N/A | NOT_VERIFIED | `core-app-m2m-jwt-verify.service.ts` |
| Org route isolation | YES | YES | PARTIAL | NOT_VERIFIED | `core-app-m2m-resource-authorization.service.ts` |
| Product + ACTIVE org product gate | YES | YES | PARTIAL | NOT_VERIFIED | uses `isOrganizationProductOperationallyEntitled` |
| Scope allowlist | YES | YES | N/A | NOT_VERIFIED | `CORE_APP_M2M_KNOWN_SCOPES` (entitlements + vehicle read) |
| Redis rate limiting | YES | YES | PARTIAL (opt-in Redis) | NOT_VERIFIED | fail-closed on Redis outage in tests |
| Fail-closed runtime defaults | YES | YES | N/A | NOT_VERIFIED | `CORE_APP_M2M_ENABLED=false`; prod needs `CORE_APP_M2M_PRODUCTION_READY` |

**Module wired in AppModule:** `CoreAppM2mModule` @ `backend/src/app.module.ts` — routes exist; **issuance gated off by default**.

---

## D. Vehicle access (versioned read)

| Capability | IMPLEMENTED | TESTED | DB_VERIFIED | PRODUCTION_VERIFIED | Notes |
|------------|-------------|--------|-------------|---------------------|-------|
| `core.read.vehicles.v1` list/get | YES | YES | PARTIAL | NOT_VERIFIED | `core-read/core-read-vehicles.controller.ts` |
| Org scoping + M2M JWT | YES | YES | PARTIAL | NOT_VERIFIED | `@CoreAppM2mSkipUserJwt()` + `CoreAppM2mJwtAuthGuard` |
| Vehicle access modes | YES | YES | YES (unit) | NOT_VERIFIED | `ProductVehicleAccessService` ORGANIZATION_WIDE / SELECTED_VEHICLES |
| Product vehicle grants (MA) | YES | YES | PARTIAL | NOT_VERIFIED | P2-PR3 / P2-PR4A |
| Pagination / not-found | YES | YES | N/A | NOT_VERIFIED | `core-read-pagination.util.ts`; HTTP security spec |

---

## E. Master Admin control

| Capability | IMPLEMENTED | TESTED | DB_VERIFIED | PRODUCTION_VERIFIED | Notes |
|------------|-------------|--------|-------------|---------------------|-------|
| Service-client admin API | YES | YES | PARTIAL | NOT_VERIFIED | `admin/core-app-service-client.admin.controller.ts` |
| MFA step-up (MA keys) | YES | YES | N/A | NOT_VERIFIED | `core-app-service-client.mfa.http-security.spec.ts` |
| Product assignment UI | YES | YES | N/A | NOT_VERIFIED | P2-PR4B MA org products |
| Vehicle grant / access mode UI | YES | YES | N/A | NOT_VERIFIED | P2-PR4A/B |
| Hub UI (service clients) | YES | YES | N/A | NOT_VERIFIED | `frontend/src/master/core-app-service-clients/` |

**Certification reference:** [`architecture/platform-product-catalog/evidence/P3_FINAL_INTEGRATION_CERTIFICATION_2026-11-17.md`](../../platform-product-catalog/evidence/P3_FINAL_INTEGRATION_CERTIFICATION_2026-11-17.md) — **PASS_WITH_BLOCKERS** (fresh-DB migration chain blocker pre-dates P3).

---

## Future consumer minimum matrix

### VYMOD (separate repo — not connected)

| Need | Core contract | Readiness |
|------|---------------|-----------|
| Vehicle identity reads | `GET /api/v1/core/read/v1/organizations/:orgId/vehicles[...]` | **INTERFACE_READY** (repo); **PRODUCTION_NOT_ARMED** |
| MA vehicle authorization | `ProductVehicleAccessService` + grants via MA | **IMPLEMENTED** |
| Product entitlement | Org grant + ACTIVE `OrganizationProduct` for `VYMOD` | **IMPLEMENTED** (enforced at token exchange + resource auth) |
| Backend-to-Core auth | Service client + token exchange + scoped JWT | **IMPLEMENTED**; default **OFF** |
| Product entitlement enforcement | token exchange + resource auth (`isOrganizationProductOperationallyEntitled`) | **SATISFIED** for minimum matrix |
| Entitlement status **payload** over M2M | `core.entitlements.v1` (user JWT) | **NOT_IN_MINIMUM_CONTRACT** — see G1 |

### Fleet (separate repo — not connected)

Same minimum contracts as VYMOD with `ProductSlug.FLEET` binding on the service client.

**No product-specific VYMOD/Fleet business logic required inside Core** for this readiness scope.

---

## Gap classification

| ID | Class | Summary | Path / behavior | Smallest remediation |
|----|-------|---------|-----------------|----------------------|
| G1 | **CONDITIONAL_INTERFACE_EXTENSION** | Scope `core:entitlements:read` is issuable for registry/scope tests, but `core.entitlements.v1` is **user-JWT-only** (P2). Minimum VYMOD/Fleet contract is **enforcement at token exchange** (`CoreAppM2mTokenExchangeService` lines 107–117) + vehicle-read auth — **not** a live entitlement JSON payload. No approved consumer spec in-repo requires M2M entitlement reads. | `core-entitlements-read.controller.ts`; `core-app-m2m-token.http-security.integration.spec.ts` (service JWT → 401 on entitlements route) | Optional small PR **only after owner-approved consumer contract** needs trial/status fields over M2M |
| G2 | **NEEDS_FURTHER_EVIDENCE** | Production M2M never attested | env flags default off | Owner-operated arming record (DSRG); no code in P10 |
| G3 | **NEEDS_FURTHER_EVIDENCE** | Fresh-DB full migration chain | P3 certification § blocker | Ops/DB hygiene — unrelated to interface design |
| G4 | **P2_OPTIONAL_HARDENING** | Additional versioned read APIs (trips, intelligence aggregates) | not in `CORE_APP_M2M_KNOWN_SCOPES` | Defer until consumer product scope demands — **not** minimal matrix |
| G5 | **ALREADY_IMPLEMENTED** | P2/P3 security negative matrix | P3 certification | Maintain; do not reopen PR #2460 Rental boundary tracks |

**CONFIRMED_SECURITY_BLOCKER (code):** **none** for keeping M2M disabled. **Operational P0** if enabling M2M in production without `CORE_APP_M2M_PRODUCTION_READY` + owner attestation — prevented by existing config gates (`core-app-m2m.config.ts`).

---

## Minimal implementation roadmap (ordered)

1. **Owner decision:** confirm VYMOD/Fleet need live entitlement **payload** over M2M (G1) vs token-exchange-only gate — **if not needed, skip G1 implementation**.
2. **Optional P10-PR1:** implement G1 only when confirmed (single scoped PR, reuse `EntitlementsQueryService`).
3. **External app repos:** consume existing token + vehicle read contracts; no Core runtime change required for hello-world connectivity in non-prod with flags enabled.
4. **Production readiness:** separate owner gate — secrets, Redis, MFA-reviewed MA workflows, explicit `CORE_APP_M2M_*` arming — **no agent deploy**.

**If G1 deferred:** **no new Core runtime implementation is required** for defined **interface readiness** scope (repository certification chain suffices for engineering readiness; production remains **NOT_VERIFIED**).

**Database certification (P11):** full HTTP chain on disposable Postgres — [`POST_P6_P11_CORE_EXTERNAL_INTERFACE_DATABASE_CERTIFICATION_2026-11-20.md`](POST_P6_P11_CORE_EXTERNAL_INTERFACE_DATABASE_CERTIFICATION_2026-11-20.md).

---

## Governance / boundary preservation

- PR #2460 eight-violation closure and PR #2461 Tasks/Documents/Invoices ownership — **unchanged**.
- No `AUTHORITY_ACTIVE` promotion.
- No `AGENTS.md` edit (i18n authority path).

---

## Validation (P10 branch)

- `bash architecture/scripts/validate-module-registry.sh`
- Documentation-only diff vs `e2fd6eb9b…`

---

## Independent review (POST_P6_P10_INDEPENDENT_REVIEW)

**Reviewed HEAD:** `2244b8d21ddfe732becb4d0050b6d44e89adb009` (matches expected PR tip)
**G1 reclassification:** `CONDITIONAL_INTERFACE_EXTENSION` — not mandatory for defined minimum interface; token exchange already fail-closes without ACTIVE `OrganizationProduct`.
**Mandatory Core code gaps for minimum readiness:** **none**
**F7:** registry/graph validators PASS; docs-only diff; CI **7/7** @ `2244b8d21ddfe732becb4d0050b6d44e89adb009` (pre-remediation commit).