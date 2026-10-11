# VO5C / DIMO — Authorized production offboard attempt (tokenId 187336)

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-VO5C-187336-OFFBOARD-001` |
| **Owner authorization** | **YES** — target **187336 only** (sold vehicle; SynqDrive offboard + SynqDrive-owned DIMO webhook unsubscribes). **NOT** authorized: R9 webhook reactivation, deploy, feature flags, global webhook defs, other vehicles. |
| **Execution window (UTC)** | `2026-10-11T20:00:00Z` – `20:05:00Z` (read-only preflight + gate evaluation) |
| **AUDIT_MODE** | Preflight **READ_ONLY**; **no** canonical offboard or provider DELETE executed |
| **FINAL_STATUS** | **`BLOCKED_PRECONDITION`** (canonical HTTP offboard) — **Provider-only unsubscribe completed separately:** [R23_187336_PROVIDER_ONLY_UNSUBSCRIBE_2026-10-11.md](R23_187336_PROVIDER_ONLY_UNSUBSCRIBE_2026-10-11.md) |

## 1. Production baseline

| Item | Value |
|------|-------|
| Production SHA (REVISION) | `2b89f7466836b81a4ba344138d0ad9817c5d14ee` |
| Documented SHA (R2.2) | Same — **no drift** at preflight |
| Deploy conflict @ start | **`vps-deploy-release.sh` running** (PID observed) — **cleared** before gate evaluation completed (~5s later) |
| VO5C joint orchestrator | **Not** running at completion check |

## 2. Target identity (VERIFIED)

| Field | Value |
|-------|-------|
| **DIMO tokenId** | `187336` |
| **SynqDrive vehicleId** | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| **organizationId** | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| **licensePlate** | KS MX 2024 |
| **registry_lifecycle** | `ACTIVE` (pre-attempt) |
| **vehicle.status** | `AVAILABLE` |
| **Active vehicles for tokenId 187336** | **1** (unique — no STOP identity ambiguity) |
| **dimo_vehicles.external_id** | `187336` |
| **Asset DID (canonical)** | `did:erc721:137:0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF:187336` (contract default per ops scripts) |

## 3. Operational preflight (read-only)

| Check | Result |
|-------|--------|
| Active bookings (`CONFIRMED`/`ACTIVE`) | **0** |
| Recent booking | `COMPLETED` only (latest id prefix `f82515ad…`) |
| Device connection | **OPEN** episode `OBD_DEVICE_UNPLUGGED_WEBHOOK` @ `2026-09-29T17:25:26Z` |
| DIMO consent (latest) | `ACTIVE`, `DIMO_DIRECT` |
| VehicleDataSourceLink (DIMO) | `is_active=true`, provider `DIMO`, consent linked |
| HM link row | Present (`HIGH_MOBILITY` / `HM_HEALTH`) — **not** mutated |

## 4. HTTP admission & MFA gates — **BLOCKED**

Per [`docs/runbooks/master-admin-vehicle-offboard-rollout-vo5c-p4a.md`](../../../docs/runbooks/master-admin-vehicle-offboard-rollout-vo5c-p4a.md) track **C** requires:

- `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENABLED=true`
- `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ROUTE_VERIFIED=YES`
- `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ATTESTED_RELEASE_SHA=<deployed SHA>`
- `IAM_MFA_MASTER_ADMIN_ENABLED=true`

**Observation:** `sudo grep` on `/opt/synqdrive/shared/backend.env` found **`SYNQDRIVE_DEPLOYED_GIT_SHA` only** — **no** `MASTER_VEHICLE_OFFBOARD_*` or `IAM_MFA_MASTER_*` keys present. Runtime default → **HTTP admission OFF** (`evaluateMasterVehicleOffboardHttpAdmission` default false).

| Gate | Status |
|------|--------|
| `OFFBOARD_HTTP_ADMISSION` | **NOT_ACTIVE** — **STOP** (owner forbade flag activation) |
| `MFA_AUTHORIZED` (Cloud Agent) | **NO** — no Clerk / Master Admin step-up credentials in agent environment |
| Unauthenticated POST probe | **401** `Missing authentication token` (route exists; admission not evaluated without auth) |

**No** legacy deregister, **no** SQL offboard, **no** flag toggles (per owner scope).

## 5. Provider inventory (GET-only baseline)

`r9-post-get-audit.mjs` @ Production:

| tokenId | Provider link count | R9 speed | R9 ignition |
|---------|---------------------|----------|-------------|
| **187336** | **6** | subscribed | subscribed |
| 186946, 187361, 187784, 192922 | 5 each | yes | yes |
| 190497 | 3 | no | no |

R9 definition UUIDs (global, **unchanged** `failed`):

- Speed `7a5e81bc-8f48-4b62-877a-9df104c1f42e`
- Ignition `3a2fcd34-1a74-45db-bee9-75e340f36b00`

**Planned DELETE (not executed — blocked on step 3):**

- `DELETE …/7a5e81bc-…/unsubscribe/{assetDID}`
- `DELETE …/3a2fcd34-…/unsubscribe/{assetDID}`
- Inventory **4 additional** webhook links (linkCount 6 vs 2 R9) → **NEEDS_OWNER_SCOPE_REVIEW** before any non-R9 DELETE

## 6. Mutations performed

| Operation | Executed |
|-----------|----------|
| Canonical HTTP offboard | **NO** |
| Provider unsubscribe | **NO** (sequencing: after local offboard) |
| Webhook definition PUT/CREATE/DELETE | **NO** |
| Other vehicles | **NO** |

## 7. Recovery path (owner / operator)

**P4A readiness (2026-10-11):** [VO5C_P4A_OPERATOR_READINESS_2026-10-11.md](VO5C_P4A_OPERATOR_READINESS_2026-10-11.md) + [operator runbook](../../../docs/runbooks/vo5c-p4a-production-offboard-187336-operator.md). Blockers: **0/2 MFA enrolled**, HTTP admission env **not set**.

1. **Enable VO5C-P4A track B+C** per runbook (maintenance window, MFA enrollment verified) — **separate** change authorization from this offboard scope if not already done.
2. **Master Admin** with **MFA step-up** (`MASTER_INTEGRATIONS`):  
   `POST /api/v1/admin/vehicle-onboarding/organizations/faa710c9-6d91-4079-a7d5-91fdccdec14a/vehicles/a60c0749-a7cd-494e-b5b9-dea3c6b97d63/offboard`  
   Body: `reason: OFFBOARD_SOLD`, stable `idempotencyKey`, audit note (sold + device disconnected).
3. Postflight: registry `OFFBOARDED`, DIMO link inactive, consent `REVOKED`, outbox `VEHICLE_OFFBOARDED`, billing bridge.
4. **Then** authorized provider DELETE unsubscribes for **187336 only** (R9 speed + ignition UUIDs, then scoped review for remaining 4 links).
5. Re-GET cohort: **4** R9 vehicles still subscribed; **190497** still excluded; global R9 defs still `failed`.

## 8. Open follow-ups

| ID | Item |
|----|------|
| FU-001 | P4A admission + MFA enablement on Production |
| FU-002 | Operator-executed offboard + evidence append |
| FU-003 | Non-R9 webhook link inventory for 187336 (6 links) |
