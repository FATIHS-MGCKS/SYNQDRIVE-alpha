# VO5C-P4A — Operator readiness (offboard unblock for tokenId 187336)

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-VO5C-P4A-READINESS-001` |
| **Related** | [VO5C_DIMO_187336_AUTHORIZED_PRODUCTION_OFFBOARD_2026-10-11.md](VO5C_DIMO_187336_AUTHORIZED_PRODUCTION_OFFBOARD_2026-10-11.md) |
| **Operator runbook** | [docs/runbooks/vo5c-p4a-production-offboard-187336-operator.md](../../../docs/runbooks/vo5c-p4a-production-offboard-187336-operator.md) |
| **PRODUCTION_MUTATIONS** | **NO** |
| **PROVIDER_MUTATIONS** | **NO** |

## Production gate snapshot (read-only @ 2026-10-11T20:12Z)

| Variable / check | Production state |
|------------------|------------------|
| `SYNQDRIVE_DEPLOYED_GIT_SHA` | **Present** in `backend.env` (value not logged) |
| `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENABLED` | **Absent** → default **OFF** |
| `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ROUTE_VERIFIED` | **Absent** |
| `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ATTESTED_RELEASE_SHA` | **Absent** |
| `IAM_MFA_MASTER_ADMIN_ENABLED` | **Absent** → default **OFF** |
| All `IAM_MFA_*` keys in `backend.env` | **None listed** |
| `VITE_MASTER_VEHICLE_OFFBOARD_*` | **Absent** from `frontend.env` |

## Release attestation integrity

| Source | SHA |
|--------|-----|
| `/opt/synqdrive/current/REVISION` | `2b89f7466836b81a4ba344138d0ad9817c5d14ee` |
| `git rev-parse` @ current | **Same** |
| Health API | Does **not** expose git SHA (uptime only) |

**RELEASE_ATTESTATION_VALID (deploy identity):** **YES** — REVISION matches checkout.  
**RELEASE_ATTESTATION_VALID (offboard P4A):** **NO** — attested offboard SHA / route verified **not configured**; enabling admission requires operator-set values **equal** to live REVISION after any future deploy.

## Master Admin MFA enrollment

| Metric | Count |
|--------|------:|
| `MASTER_ADMIN` users | 2 |
| Enrolled (`user_mfa_factors.enabled_at` NOT NULL) | **0** |

**MASTER_ADMIN_MFA_ROLLOUT_READY:** **NO** — runbook requires ≥2 enrolled before `IAM_MFA_MASTER_ADMIN_ENABLED=true`.

## HTTP admission readiness

**HTTP_ADMISSION_READY:** **NO** — all Track C variables missing; guard evaluates `ADMISSION_DISABLED`.

**CANONICAL_OFFBOARD_ROUTE_VERIFIED:** **CODE_ON_SHA** — P4A controller + guard ship in `2b89f746…`; **operator attestation** `ROUTE_VERIFIED=YES` not set.

## Authenticated operator method

| Method | Ready on Production |
|--------|---------------------|
| **Backend HTTP POST** (Clerk JWT + `MASTER_INTEGRATIONS` step-up) | **Route exists**; blocked until Tracks B+C |
| **Master UI offboard** | **NO** — Track D flags absent; UI is not a substitute for backend gate |

## Staging / offline tests (this workstream)

| Suite | Result |
|-------|--------|
| `frontend` `vo5c-release-gates` | **PASS** (5/5) |
| Backend admission config + guard + controller security unit | **PASS** (9/9) |
| `test:vehicle-onboarding:vo5c-p4a:offboard-http:postgres` | **NOT_RUN** — no Postgres in Cloud Agent VM |
| `test:vehicle-onboarding:vo5c-p1:postgres` | **NOT_RUN** — same |

Run Postgres suites on CI or ops host with `DATABASE_URL` before production flag day.

## Global MFA impact review

When `IAM_MFA_MASTER_ADMIN_ENABLED=true`, **all** `MasterAdminMfaGuard`-protected Master Admin mutating endpoints require fresh step-up (billing, platform settings, DIMO/HM admin, integrations, offboard, org admin, user management, audit export, etc.). **Enrollment must precede flag enable** to avoid lockout.

## Remaining human actions (ordered)

1. **MFA enrollment** for all Master Admins (target ≥2 enrolled); verify step-up in staging.
2. **Separate owner approval** for production env changes (Track B+C).
3. Set backend env quintet per P4A runbook; **reload API** in approved maintenance window.
4. Re-verify REVISION SHA still matches attested SHA after any concurrent deploy.
5. Execute canonical POST offboard for **187336 only** with stable idempotency key.
6. Local postflight (registry, links, consent, outbox, billing).
7. **Separate authorized task:** DIMO provider unsubscribes + cohort GET verification.
8. Set `SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENABLED=false` after completion (MFA may stay on).

## Result block

```
VO5C_P4A_OPERATOR_READINESS=DOCUMENTED_BLOCKERS_REMAIN
PRODUCTION_SHA=2b89f7466836b81a4ba344138d0ad9817c5d14ee
RELEASE_ATTESTATION_VALID=DEPLOY_YES_OFFBOARD_P4A_NO
MASTER_ADMIN_MFA_ROLLOUT_READY=NO
MFA_ENROLLED_ADMIN_COUNT=0_OF_2_REQUIRED_MIN_2
HTTP_ADMISSION_READY=NO
STAGING_TESTS=FRONTEND_PASS_BACKEND_UNIT_PASS_POSTGRES_NOT_RUN_IN_AGENT
GLOBAL_MFA_IMPACT_REVIEW=DOCUMENTED_HIGH_TOUCH_MASTER_ADMIN_MUTATIONS
CANONICAL_OFFBOARD_ROUTE_VERIFIED=CODE_YES_OPERATOR_ATTESTATION_NO
AUTHENTICATED_OPERATOR_METHOD=HTTP_API_REQUIRED_UI_NOT_ENABLED
OPERATOR_RUNBOOK_READY=YES
REMAINING_HUMAN_ACTIONS=MFA_ENROLLMENT_THEN_P4A_ENV_THEN_API_OFFBOARD_THEN_DIMO_UNSUBSCRIBE
PRODUCTION_MUTATIONS=NO
PROVIDER_MUTATIONS=NO
READY_FOR_SEPARATE_ROLLOUT_APPROVAL=YES_WITH_BLOCKERS_MFA_AND_P4A_ENV
```
