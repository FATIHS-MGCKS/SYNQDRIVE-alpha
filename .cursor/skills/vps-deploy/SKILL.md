---
name: vps-deploy
description: >-
  Commit, push, and deploy SynqDrive to production on the single Hostinger VPS via direct SSH
  to vps-deploy-release.sh. Use when the user asks to deploy, commit and deploy, release to
  production, or VPS deploy. No separate staging VPS.
---
# VPS production deploy (single VPS, direct SSH)

**Canonical runbook:** [architecture/dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md](../../../architecture/dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md)

## When to use

User says: deploy, commit and deploy, release, production, VPS — **only after an explicit owner production-deploy instruction**.

## Canonical contract (routine production)

```
Owner production-deploy instruction in Cursor
  → CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1
  → exact SYNQDRIVE_REQUESTED_DEPLOY_SHA (git preflight or explicit env)
  → CI gate (all critical jobs) success on that SHA
  → SSH synqdrive-admin@srv1374778.hstgr.cloud (trusted host key)
  → bash /opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh
  → DB backup, prisma migrate, rolling replicas A/B + verify
  → P4B16 attestation
  → public health check
```

**Agents:** run `cloud-agent-deploy.sh` with `CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1`. Do **not** set `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1`.

**Optional (not routine):** VO5C pinned runner + VPS operator session + fixed Cloud Agent bootstrap — only when production enforcement is armed; see runbook § optional VO5C.

## Prerequisites (Cloud Agent)

[Cursor Cloud Agents dashboard](https://cursor.com/dashboard/cloud-agents) → Secrets.

Path A (no Tailscale): `CLOUD_AGENT_VPS_HOST=srv1374778.hstgr.cloud`, `CLOUD_AGENT_SSH_USER=synqdrive-admin`. `CLOUD_AGENT_SSH_PRIVATE_KEY` when no baked `~/.ssh/id_ed25519`. Verified host key in `known_hosts` before first production SSH.

`gh` CLI auth (or equivalent) for CI gate checks on the deploy SHA.

## Workflow

0. `bash .cursor/scripts/cloud-agent-ssh-preflight.sh`
1. `git status` / `git diff` — no secrets in commits.
2. Commit + `git push origin main` when deploying `main` tip.
3. Deploy:

```bash
CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1 bash .cursor/scripts/cloud-agent-deploy.sh
```

Explicit SHA (e.g. approved release behind `main`):

```bash
CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1 \
CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 \
CLOUD_AGENT_REQUESTED_DEPLOY_SHA=<40-char-sha> \
bash .cursor/scripts/cloud-agent-deploy.sh
```

Exit codes: `0` release + public health OK; `2` release OK but public health failed; `3` P4B16 partial success; `41` missing owner ack; `46` VPS deploy script missing.

## Not supported for routine production

| Path | Status |
|------|--------|
| Shallow-fetch `vps-deploy-release.sh` from agent workspace to VPS | **Not used** — release runs on VPS |
| `vps-deploy-connectivity-staging.sh` | **Fail-closed** unless `SYNQDRIVE_VO5C_CONNECTIVITY_STAGING_ALLOW=1` |
| Mandatory VO5C operator session / Cloud Agent bootstrap | **Retired** for routine deploy (optional when enforcement armed) |

## Rollback

```bash
sudo bash /opt/synqdrive/current/backend/scripts/ops/vps-rollback-production-release.sh
```

Exit `3` = replicas restored; P4B16 attestation incomplete (not unsafe physical rollback).

## Multi-replica

| Replica | PM2 | Port |
|---------|-----|------|
| A | `synqdrive` | 3001 |
| B | `synqdrive-b` | 3002 |

## Status vocabulary

| Term | Meaning |
|------|---------|
| IMPLEMENTED | Script/libs in repository |
| DEPLOYED | Change promoted on VPS `/current` |
| ACTIVATED | P4B16 / enforcement / gates actually exercised in production |
| VALIDATED | Fresh production evidence (not claimed by docs-only PRs) |
