# Deployment authorization

**Operational runbook (SSH, Cloud Agent):** [PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md](./PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md)

## Routine production (canonical)

1. **Owner:** explicit production-deploy instruction in Cursor → agent sets `CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1` for `cloud-agent-deploy.sh` only.
2. **Target SHA:** `SYNQDRIVE_REQUESTED_DEPLOY_SHA` (git preflight or explicit env) + `vps_vo5c_assert_deploy_target_admitted` inside `vps-deploy-release.sh`.
3. **CI:** `CI gate (all critical jobs)` **success** on that SHA (`deploy-ci-gate.mjs`).
4. **Transport:** SSH `synqdrive-admin` → `bash /opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh` on the single VPS.

Agents **must not** set `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1`.

## Optional VO5C layers (when armed or operator choice)

1. **Human (VO5C):** `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1` at pinned runner entry only.
2. **Pinned executor preflight:** `vps-vo5c-first-security-deploy-preflight.sh` before pinned runner.
3. **Enforcement (inactive on Production today):** `VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=1` blocks non-pinned deploy entrypoints.

See `architecture/vehicle-onboarding/evidence/VO5C_P4B15_DEPLOY_BYPASS_ENFORCEMENT.md` for bypass inventory.

## Preflight vs execution contract (DSRG-01)

`vps-vo5c-first-security-deploy-preflight.sh` validates git integrity and admission; it does **not** replace `vps-deploy-release.sh` execution on VPS. Deploy scripts invoke `bash` on mode-644 `vps-deploy-release.sh`.

## Unauthorized deploy prevention

- `cloud-agent-deploy.sh` aborts without `CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1`
- Invalid or un-admitted SHA rejected by release admission libs
- Security-floor rollback denies sub-floor targets
- When enforcement active: direct deploy blocked until pinned VO5C runner + `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1`
