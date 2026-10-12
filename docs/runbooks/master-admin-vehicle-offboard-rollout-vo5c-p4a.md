# Master Admin vehicle offboard rollout (VO5C-P4A)

**Defaults:** all gates OFF. Backend HTTP admission is authoritative; frontend UI flag is UX-only.

## Independent approval tracks

| Track | Env / action | Default |
|-------|----------------|---------|
| A | Deploy build containing P4A server gate | — |
| B | `IAM_MFA_MASTER_ADMIN_ENABLED=true` after enrollment verification | OFF |
| C | Backend admission (see below) | OFF |
| D | `VITE_MASTER_VEHICLE_OFFBOARD_UI=on` + frontend attestation | OFF |

Never enable C without B. Never enable D without C verified on the same release SHA.

## Backend admission (track C)

Set on **backend** shared env only after P3.1-style certification on the target release:

1. `SYNQDRIVE_DEPLOYED_GIT_SHA=<40-char git SHA actually running>`
2. `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ROUTE_VERIFIED=YES` (operator attestation — not automatic)
3. `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ATTESTED_RELEASE_SHA=<same SHA>`
4. `IAM_MFA_MASTER_ADMIN_ENABLED=true`
5. `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENABLED=true`

Rejected with `409` / `MASTER_VEHICLE_OFFBOARD_ADMISSION_DISABLED` if any prerequisite fails.

## Frontend cutover (track D)

Build-time / `frontend.env`:

1. `VITE_SYNQDRIVE_DEPLOYED_GIT_SHA=<same SHA>`
2. `VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ROUTE_VERIFIED=YES`
3. `VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ATTESTED_SHA=<same SHA>`
4. `VITE_MASTER_VEHICLE_OFFBOARD_UI=on`

## Master Admin MFA (track B)

1. Confirm each Master Admin has enrolled MFA (`user_mfa_factors.enabled_at` set).
2. Verify step-up flow for `MASTER_INTEGRATIONS` in staging with admission ON.
3. Enable `IAM_MFA_MASTER_ADMIN_ENABLED=true` during a maintenance window.
4. **Other routes:** All `@MasterAdminMfaGuard` mutating endpoints require step-up when flag is on (billing, platform settings, integrations, offboard, legacy deregister attempts, etc.).
5. **Lockout prevention:** Keep at least two enrolled Master Admins; document break-glass only per security policy; do not enable admission until enrollment verified.

## Emergency recovery

1. Set `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENABLED=false` (immediate stop of offboard writes).
2. Set `VITE_MASTER_VEHICLE_OFFBOARD_UI=off` or remove flag.
3. MFA can remain on for other admin surfaces; disabling `IAM_MFA_MASTER_ADMIN_ENABLED` reduces MFA enforcement globally for Master Admins — use only with security approval.

## Validation commands

```bash
cd backend && npm run test:vehicle-onboarding:vo5c-p4a:offboard-http:postgres
cd backend && npm run test:vehicle-onboarding:vo5c-p1:postgres
cd frontend && npm test -- vo5c-release-gates
```
