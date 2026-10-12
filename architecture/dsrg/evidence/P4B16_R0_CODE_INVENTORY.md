# P4B16 R0 — Attestation code inventory

## `SYNQDRIVE_DEPLOYED_GIT_SHA`

| Site | R/W | Classification |
|------|-----|----------------|
| `/opt/synqdrive/shared/backend.env` (production) | R/W manual | **EXISTING** — no deploy automation writer |
| `backend/.env.example` | doc | **EXISTING** |
| `backend/scripts/ops/apd-shadow-activation-epoch-cli.ts` | R | **EXISTING** |
| `backend/.../apd-shadow-activation-operator.authority.ts` | R | **EXISTING** |
| `backend/.../master-vehicle-offboard-admission.config.ts` | R (`process.env`) | **EXISTING** |
| `frontend/.../vo5c-release-gates.ts` | R build-time `VITE_*` | **EXISTING** |
| `vps-deploy-release.sh` | — | **NOT_IMPLEMENTED** writer (P4B16 target) |

## `SYNQDRIVE_REQUESTED_DEPLOY_SHA`

| Site | R/W | Classification |
|------|-----|----------------|
| `vps-deploy-release.sh` | R | **EXISTING** |
| `vps-vo5c-first-security-deploy-preflight.sh` | R | **EXISTING** |
| `.cursor/scripts/cloud-agent-deploy.sh` | W (remote) | **EXISTING** |
| `vps-vo5c-run-pinned-security-deploy.sh` | indirect | **EXISTING** (delegates deploy) |
| VO5C / P4B15 selftests | W | **EXISTING** |

## `SYNQDRIVE_DEPLOY_IN_PROGRESS_SHA`

| Site | Classification |
|------|----------------|
| `architecture/vehicle-onboarding/evidence/VO5C_P4B15_DEPLOY_BYPASS_ENFORCEMENT.md` | **PLANNED** |
| Runtime / ops scripts | **NOT_IMPLEMENTED** |

## `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA`

| Site | R/W | Classification |
|------|-----|----------------|
| `backend.env` (production) | R/W manual / APDS ops | **EXISTING** — **out of P4B16 write scope** |
| `apd-shadow-activation-operator.authority.ts` | R | **EXISTING** |
| Deploy scripts | — | **No automated writer** in deploy path |

## Deploy state / provenance (related)

| Artifact | Writer | Reader |
|----------|--------|--------|
| `deploy-state/last-deploy-state.env` | `vps_replica_capture_deploy_state` | `vps_replica_rollback`, `vps-rollback-production-release.sh` |
| `git -C $RELEASE_DIR rev-parse` | `vps_clone_release_at_sha` | `vps_replica_release_sha`, verify hooks |
| `readlink /opt/synqdrive/current` | `ln -sfn` in deploy/rollback | `vps_replica_current_sha` |
| `SYNQDRIVE_DEPLOY_CONTROLLER_ROOT` | optional guarded deploy | `vps-deploy-controller.lib.sh`, S4F-7Q gate |
| Health `/api/v1/health/readiness` | app runtime | `vps_replica_*` — **no SHA field** today |

## Deployment controller

- `lib/vps-deploy-controller.lib.sh` — exact-RC guarded deploy (**EXISTING**, opt-in `SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE`)
- `lib/di-v0-s4f7q-exact-rc-attestation-deploy.lib.sh` — EXP021 prestate attestation (**EXISTING**, separate from P4B16 product attestation)
