# DSRG-04 — Production VPS access and deploy runbook

**Date:** 2026-10-11 (introduced) · **R6 update:** 2026-10-12 (post–#1991 merge)  
**Type:** Documentation authority (no Production mutation)  
**Epistemic:** CONFIRMED (repository contract on `main` @ `7d44f861…`)

## WHY

Conflicting agent guidance (Tailscale/`mein-vps.internal`, `root@`, legacy shallow-fetch `cloud-agent-deploy.sh`, bare `/current/.../vps-deploy-release.sh`) caused false **VPS_ACCESS=BLOCKED** reports and risked bypassing the VO5C pinned-runner + fixed bootstrap contract.

Merged **[#1991](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1991)** implements the SSH + bootstrap behavior; this evidence record anchors the **canonical runbook** that operators and agents must follow.

## CHANGE (R6)

- Canonical runbook: [PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md](../PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md)
- Redirect stub: [docs/runbooks/00-canonical-production-vps.md](../../../docs/runbooks/00-canonical-production-vps.md)
- Bootstrap install readiness (read-only checklist): [VO5C_CLOUD_AGENT_BOOTSTRAP_INSTALL_READINESS.md](./VO5C_CLOUD_AGENT_BOOTSTRAP_INSTALL_READINESS.md)
- Linked from `AGENTS.md`, DSRG `README.md`, `AGENT_CONTRACT.md`, `DEPLOYMENT_AUTHORIZATION.md`
- `architecture/CLOUD_AGENTS_2026-06-30.md` Path B marked **HISTORICAL** for current Production routine ops

## Repository contract (post–#1991)

| Field | Value |
|-------|--------|
| Host | `srv1374778.hstgr.cloud:22` |
| SSH principal | `synqdrive-admin` |
| Transport | Direct public SSH (Path A) |
| Identity | On-disk `~/.ssh/id_ed25519` when present; else `CLOUD_AGENT_SSH_PRIVATE_KEY` |
| Host key | Pre-verified `known_hosts`; **fail-closed** — no blind `ssh-keyscan` on deploy/bootstrap paths |
| Cloud Agent deploy | `cloud-agent-deploy.sh` → `sudo -n` fixed bootstrap → pinned `vps-vo5c-run-pinned-security-deploy.sh` |
| Pre-source integrity | R4.2 `vo5c_bootstrap_verify_pinned_executor_tree_trusted` before sourcing pin-tree libs |

## Historical evidence (preserved)

- EXP021-S4P8 SSH RCA: [DSRG_SSH_RCA_CLOUD_AGENT_VPS_ACCESS_2026-10-12.md](./DSRG_SSH_RCA_CLOUD_AGENT_VPS_ACCESS_2026-10-12.md)
- Consolidation contract: [DSRG_DEPLOYMENT_CONSOLIDATION_SINGLE_VPS.md](./DSRG_DEPLOYMENT_CONSOLIDATION_SINGLE_VPS.md)

Older deploy reports that reference `root@`, Tailscale routine deploy, or legacy `CLOUD_AGENT_VPS_DEPLOY_SCRIPT` remain **HISTORICAL** unless they link the canonical runbook.

## Non-effects

- No VPS access, deploy, bootstrap install, pin promotion, `backend.env` change, PM2 restart, or production flag change in DSRG-04 / R6 doc work
- VO5C enforcement activation unchanged
- EXP021 Gate-6 / GLOBAL_KILL / APDS / Battery / RFRF workstreams unaffected by documentation-only updates
