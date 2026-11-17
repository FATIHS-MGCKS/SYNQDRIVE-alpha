# P3-PR2 — Core app M2M secure token exchange

**Date:** 2026-11-17  
**Contract:** `core.app.token.v1` — `POST /api/v1/auth/core-app/token`

## Scope

- Client credential exchange (bcrypt verification against `credentialHash` only)
- Short-lived **service JWT** signed with **`CORE_APP_M2M_JWT_SECRET`** (never `JWT_SECRET`)
- Claims: `token_type=core_app_service`, `organizationId`, `productSlug` (from registry row — **not** client-supplied), `scopes`, `credentialVersion`, `grantVersion`, `iss`, `aud`, `exp`
- Gates: `CORE_APP_M2M_ENABLED`, non-empty signing secret, ACTIVE client, ACTIVE org grant, ACTIVE-only `OrganizationProduct`, scope ⊆ `allowedScopes`, eligible slug `RENTAL|FLEET|VYMOD`, TAXI rejected
- Public path in `AuthGuard` **only** for this endpoint; user JWT routes unchanged (service JWT does not verify against user secret)
- `CoreAppM2mModule` wired in `AppModule`; **no** vehicle read APIs, Redis limits, or Master Admin client UI (P3-PR3/PR4/PR5)

## Non-effects

- `ProductLicenseGuard` / TRIAL / `expiresAt` policy unchanged
- Rental endpoints do not accept service JWT
- Production: `CORE_APP_M2M_*` defaults remain **off**; **NOT_CLAIMED** deploy/activation

## Evidence

- `backend/src/modules/core-app-m2m/core-app-m2m-token*.ts`
- Unit + HTTP security specs under `backend/src/modules/core-app-m2m/`