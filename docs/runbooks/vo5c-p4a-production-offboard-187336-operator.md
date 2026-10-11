# VO5C-P4A — Production offboard operator runbook (DIMO tokenId 187336)

**Scope:** Prepare and execute **one** authorized sold-vehicle offboard after **separate** rollout approval.  
**Not in scope:** R9 webhook reactivation, provider unsubscribe (separate step after local offboard succeeds), global DIMO mutations on other vehicles.

**Targets (fixed):**

| Field | Value |
|-------|-------|
| DIMO tokenId | `187336` |
| vehicleId | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| organizationId | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| reason | `OFFBOARD_SOLD` |
| Asset DID | `did:erc721:137:0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF:187336` |

**Companion:** [master-admin-vehicle-offboard-rollout-vo5c-p4a.md](./master-admin-vehicle-offboard-rollout-vo5c-p4a.md)

---

## Phase 0 — Preconditions (read-only)

1. **No deploy / VO5C orchestrator** running (`pgrep vps-deploy-release`, joint orchestrator).
2. **Release identity** — compare **three** sources; all must match before attestation:
   - `/opt/synqdrive/current/REVISION`
   - `git -C /opt/synqdrive/current rev-parse HEAD`
   - Planned `SYNQDRIVE_DEPLOYED_GIT_SHA` / attested SHA values  
   Do **not** trust env SHA alone if REVISION differs.
3. **Operational preflight** for target vehicle only: no `ACTIVE`/`CONFIRMED` future bookings, no ongoing trip, no open handover (see VO5C-P1 policy).
4. **Cohort isolation:** do not run provider unsubscribe for 186946, 187361, 187784, 192922; 190497 stays excluded.

---

## Phase 1 — MFA enrollment (Track B) — **human required before flags**

Production read-only snapshot `2026-10-11`: **2** `MASTER_ADMIN` accounts, **0** with `user_mfa_factors.enabled_at` set.

1. Enable MFA **enrollment** surface if not already (`IAM_MFA_*` enrollment flags per IAM contract — verify in staging first).
2. Each Master Admin enrolls TOTP (or approved factor) via product MFA UI.
3. Confirm **≥ 2** enrolled Master Admins (lockout prevention per P4A runbook).
4. In **staging** (admission ON): complete step-up for `MASTER_INTEGRATIONS` on a non-production vehicle.

**Blocker if skipped:** `IAM_MFA_MASTER_ADMIN_ENABLED=true` without enrollment → operational lockout on all `@MasterAdminMfaGuard` mutating routes.

---

## Phase 2 — Backend admission (Track C) — **separate owner approval + maintenance window**

Edit `/opt/synqdrive/shared/backend.env` (requires ops access; **not** Cloud Agent default):

```bash
SYNQDRIVE_DEPLOYED_GIT_SHA=<40-char SHA from REVISION>
SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ROUTE_VERIFIED=YES
SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ATTESTED_RELEASE_SHA=<same SHA>
IAM_MFA_MASTER_ADMIN_ENABLED=true
SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENABLED=true
```

**Order:** Never enable C without B (MFA enrolled + verified).  
**Reload:** Backend process must reload env (typically PM2 restart of API — **scheduled** in rollout window; out of scope for readiness-only tasks).

**Verify admission (authenticated Master Admin):**

- Expect **409** `MASTER_VEHICLE_OFFBOARD_ADMISSION_DISABLED` when any prerequisite missing.
- When admitted, POST without MFA → step-up required (not 409 admission).

---

## Phase 3 — Canonical offboard (Track C execution)

**Authoritative path:** HTTP API only (no SQL, no legacy deregister).

```http
POST /api/v1/admin/vehicle-onboarding/organizations/faa710c9-6d91-4079-a7d5-91fdccdec14a/vehicles/a60c0749-a7cd-494e-b5b9-dea3c6b97d63/offboard
Authorization: Bearer <Clerk session JWT>
X-SynqDrive-Step-Up-Token: <fresh MASTER_INTEGRATIONS step-up>
Content-Type: application/json

{
  "reason": "OFFBOARD_SOLD",
  "idempotencyKey": "vo5c-offboard-187336-2026-10-11-sold-v1",
  "note": "Owner-confirmed sale; device disconnected; authorized production offboard tokenId 187336 only."
}
```

**Idempotency:** Reuse the **same** key on retry after network loss; generate a **new** key only for a distinct operational attempt.

### UI path (optional Track D — **not** a backend substitute)

Production `frontend.env` (2026-10-11): **no** `VITE_MASTER_VEHICLE_OFFBOARD_*` keys → Master Connected Vehicles **offboard button hidden**.  
Backend gate must be ON first; UI is UX-only. Operators may use **Master UI** only after Track D attestation matches the same SHA — otherwise use **authenticated API** (curl / internal tooling) with Clerk + step-up.

---

## Phase 4 — Local postflight (read-only SQL / APIs)

| Check | Expected |
|-------|----------|
| `vehicles.registry_lifecycle` | `OFFBOARDED` |
| DIMO `vehicle_data_source_links` | `is_active=false`, `deactivated_at` set |
| `vehicle_provider_consents` (DIMO) | `REVOKED` |
| Trips / documents | Retained |
| `vehicle_registry_lifecycle_outbox` | One `VEHICLE_OFFBOARDED` for vehicleId |
| Billing bridge | Processed or explicit pending row (inspect outbox processor / billing projection) |

---

## Phase 5 — DIMO provider unsubscribe (after Phase 4 success only)

Per [WEBHOOK_OPERATIONS.md](../../architecture/dimo-integration/operations/WEBHOOK_OPERATIONS.md):

1. GET inventory for asset DID (baseline link count was **6** for 187336).
2. DELETE (authorized SynqDrive R9 only, first):
   - Speed `7a5e81bc-8f48-4b62-877a-9df104c1f42e`
   - Ignition `3a2fcd34-1a74-45db-bee9-75e340f36b00`
3. GET verify after each DELETE.
4. Remaining **4** non-R9 links → owner scope review before DELETE.
5. Re-GET cohort: 186946, 187361, 187784, 192922 unchanged; 190497 not on R9; global webhook defs still `failed`.

---

## Phase 6 — Roll back **offboard admission only** (keep MFA if desired)

After offboard + unsubscribe evidence captured:

1. `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENABLED=false` (immediate stop of new offboards).
2. Optional: clear attested SHA / route verified if policy requires.
3. **Do not** disable `IAM_MFA_MASTER_ADMIN_ENABLED` without security approval — other Master Admin surfaces remain step-up protected.

---

## Global MFA impact (when Track B enabled)

`MasterAdminMfaGuard` applies to mutating (and sensitive read) Master Admin routes including:

- Vehicle offboard, legacy deregister attempt, DIMO admin, HM admin, source adoption
- Billing, subscriptions, Stripe catalog
- Platform admin, integrations, security governance, organizations
- User management, audit export, voice control plane admin

**Effect:** Master Admins need fresh step-up tokens per action class until assurance expires. Plan maintenance window and enrolled backup admin before enabling.

---

## Validation commands (offline / CI)

```bash
cd backend && npx jest master-vehicle-offboard-admission.config.spec master-vehicle-offboard-admission.guard.spec vehicle-onboarding-offboard.controller.security.spec --runInBand
cd backend && npm run test:vehicle-onboarding:vo5c-p4a:offboard-http:postgres   # requires Postgres
cd backend && npm run test:vehicle-onboarding:vo5c-p1:postgres                 # requires Postgres
cd frontend && npm test -- vo5c-release-gates
```
