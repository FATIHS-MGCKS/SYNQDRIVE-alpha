# P3-PR2 — Core app M2M secure token exchange

**Date:** 2026-11-17  
**Contract:** `core.app.token.v1` — `POST /api/v1/auth/core-app/token`

## Scope

- Client credential exchange (bcrypt verification against `credentialHash` only)
- Short-lived **service JWT** signed with **`CORE_APP_M2M_JWT_SECRET`** (never `JWT_SECRET`)
- Claims: `token_type=core_app_service`, `organizationId`, `productSlug` (from registry row — **not** client-supplied), `scopes`, `credentialVersion`, `grantVersion`, `iss`, `aud`, `exp`
- Gates: `CORE_APP_M2M_ENABLED`, non-empty signing secret **distinct from `JWT_SECRET`**, ACTIVE client, ACTIVE org grant, ACTIVE-only `OrganizationProduct`, scope ⊆ `allowedScopes`, eligible slug `RENTAL|FLEET|VYMOD`, TAXI rejected
- **Production issuance:** `CORE_APP_M2M_ENABLED` **and** `CORE_APP_M2M_PRODUCTION_READY` (non-production: enabled only)
- Public path in `AuthGuard` **only** for this endpoint; user JWT routes **explicitly reject** `token_type=core_app_service` (independent of signing secret separation)
- `CoreAppM2mModule` wired in `AppModule`; **no** vehicle read APIs, Redis limits, or Master Admin client UI (P3-PR3/PR4/PR5)

## Non-effects

- `ProductLicenseGuard` / TRIAL / `expiresAt` policy unchanged
- Rental endpoints do not accept service JWT
- Production: `CORE_APP_M2M_*` defaults remain **off**; **NOT_CLAIMED** deploy/activation

## Independent security remediation (2026-11-17)

| Finding | Remediation |
|--------|-------------|
| F1 JWT domain separation | `AuthGuard` rejects `token_type=core_app_service` before/after verify; `resolveCoreAppM2mJwtSigningSecret` null when secret equals `JWT_SECRET` |
| F2 Production-ready gate | `isCoreAppM2mTokenIssuanceAllowed` requires `PRODUCTION_READY` in `NODE_ENV=production` |
| F3 Regression negatives | Foreign org, missing entitlement, invalid scope defs, empty `allowedScopes`, duplicate signing secret |
| Final closeout | HTTP identical-secret suite bootstraps app with guard-captured secret + proves `jwt.verify` then 401; stored `allowedScopes` validated against `CORE_APP_M2M_KNOWN_SCOPES` (mixed valid/unknown => DENY) |

Evidence: `core-app-m2m-token.http-security.integration.spec.ts`, `auth.guard.ts`, `core-app-m2m-jwt.config.ts`, `core-app-m2m.config.ts`.

## Evidence

- `backend/src/modules/core-app-m2m/core-app-m2m-token*.ts`
- Unit + HTTP security specs under `backend/src/modules/core-app-m2m/`