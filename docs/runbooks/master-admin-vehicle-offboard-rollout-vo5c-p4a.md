# Master Admin vehicle offboard rollout (VO5C-P4A)

**Defaults:** all gates OFF. Backend HTTP admission is authoritative; frontend UI flag is UX-only.

## Independent approval tracks

| Track | Env / action | Default |
|-------|----------------|---------|
| A | Deploy build containing P4A server gate | — |
| B | `IAM_MFA_MASTER_ADMIN_ENABLED=true` after enrollment verification | OFF |
| C | Backend admission (see below) | OFF |
| D | `VITE_MASTER_VEHICLE_OFFBOARD_UI=on` + frontend attestation | OFF |

Never enable C without B **unless** the temporary owner-only MFA exception (below) is explicitly enabled for the verified owner user. Never enable D without C verified on the same release SHA.

## Backend admission (track C)

Set on **backend** shared env only after P3.1-style certification on the target release:

1. `SYNQDRIVE_DEPLOYED_GIT_SHA=<40-char git SHA actually running>`
2. `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ROUTE_VERIFIED=YES` (operator attestation — not automatic)
3. `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ATTESTED_RELEASE_SHA=<same SHA>`
4. `IAM_MFA_MASTER_ADMIN_ENABLED=true` **or** temporary owner MFA exception (track B′, default OFF)
5. `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENABLED=true`

Rejected with `409` / `MASTER_VEHICLE_OFFBOARD_ADMISSION_DISABLED` if any prerequisite fails.

### Temporary owner-only MFA exception (track B′ — default OFF)

Use only until Master Admin MFA enrollment is complete. Does **not** weaken `MasterAdminMfaGuard` on other routes.

1. Complete steps 1–3 and 5 from track C (release attestation + HTTP admission ON).
2. Set **all** of:
   - `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ENABLED=true`
   - `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_USER_ID=<single verified owner UUID>`
   - `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ACTIVATED_AT=<ISO-8601 UTC when exception was enabled>`
   - `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_EXPIRES_AT=<ISO-8601 UTC, after activation, at most 24h later>`
3. Leave `IAM_MFA_MASTER_ADMIN_ENABLED` unset/false until MFA rollout (track B) is ready.
4. Only the configured owner `user.id` is admitted; other `MASTER_ADMIN` users receive `OWNER_MFA_EXCEPTION_USER_MISMATCH` or `MFA_ROLLOUT_NOT_ENABLED`.
5. When `IAM_MFA_MASTER_ADMIN_ENABLED=true`, the exception does **not** skip MFA — owner must step up like any other Master Admin.

**Removal plan (post-MFA):** disable and delete the three `…OWNER_MFA_EXCEPTION…` env vars, enable track B, remove `MasterVehicleOffboardMfaGuard` owner bypass in a follow-up PR after MFA is validated in production.

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
2. Set `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ENABLED=false` (revoke owner bypass immediately).
3. Set `VITE_MASTER_VEHICLE_OFFBOARD_UI=off` or remove flag.
4. MFA can remain on for other admin surfaces; disabling `IAM_MFA_MASTER_ADMIN_ENABLED` reduces MFA enforcement globally for Master Admins — use only with security approval.

## Validation commands

```bash
cd backend && npm run test:vehicle-onboarding:vo5c-p4a:offboard-http:postgres
cd backend && npm run test:vehicle-onboarding:vo5c-p1:postgres
cd frontend && npm test -- vo5c-release-gates
```
