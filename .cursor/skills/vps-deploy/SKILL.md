---
name: vps-deploy
description: >-
  Commit, push, and deploy SynqDrive to production on the single Hostinger VPS via the
  VO5C pinned runner. Use when the user asks to deploy, commit and deploy, release to
  production, or VPS deploy. No separate staging VPS.
---
# VPS production deploy (single VPS, VO5C pinned)

## When to use

User says: deploy, commit and deploy, release, production, VPS.

## Canonical contract (routine production)

```
Human SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1 (never set by agents)
  → exact SYNQDRIVE_REQUESTED_DEPLOY_SHA
  → source vo5c-pinned-executor.env
  → vps-vo5c-run-pinned-security-deploy.sh (from pinned ops dir only)
  → preflight / admission
  → exec bash pinned vps-deploy-release.sh
  → rolling replicas A/B + verify
  → P4B16 attestation
```

**Agents:** may `git push` and run `cloud-agent-deploy.sh`, which **delegates** to the pinned runner on the VPS. Agents **must not** set `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1`. Operator creates a short-lived VPS session file or runs the pinned runner manually (see below).

## Prerequisites (Cloud Agent)

[Cursor Cloud Agents dashboard](https://cursor.com/dashboard/cloud-agents) → Secrets.

Path A (no Tailscale): `CLOUD_AGENT_SSH_PRIVATE_KEY`, `CLOUD_AGENT_VPS_HOST=srv1374778.hstgr.cloud`, `CLOUD_AGENT_SSH_USER=synqdrive-admin`.

## Workflow

1. `git status` / `git diff` — no secrets in commits.
2. Commit + `git push origin main` when needed.
3. **Operator (VPS):** authorize release (example session file):

```bash
sudo tee /opt/synqdrive/shared/vo5c-operator-deploy-session.env <<EOF
SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1
AUTHORIZED_REQUESTED_SHA=<full-40-char-sha>
AUTHORIZED_UNTIL_EPOCH=$(date -u -d '+30 minutes' +%s)
EOF
sudo chmod 600 /opt/synqdrive/shared/vo5c-operator-deploy-session.env
```

4. **Agent or operator workstation:**

```bash
bash .cursor/scripts/cloud-agent-deploy.sh
```

Exit codes: `0` pinned+public health OK; `2` deploy OK but public health failed; `3` P4B16 partial success; `42` missing human VO5C authorization (see script instructions).

## Manual pinned deploy (preferred when not using cloud-agent)

On VPS:

```bash
source /opt/synqdrive/shared/vo5c-pinned-executor.env
export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1
export SYNQDRIVE_REQUESTED_DEPLOY_SHA=<approved-sha>
cd "${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops"
bash vps-vo5c-run-pinned-security-deploy.sh
```

Optional: `SYNQDRIVE_STAGED_RELEASE_ROOT` — isolated **checkout on the same VPS** for admission/preflight (not a second VM).

## Not supported for routine production

| Path | Status |
|------|--------|
| Shallow-fetch `vps-deploy-release.sh` from `/current` or ephemeral git | **Blocked** in `cloud-agent-deploy.sh` |
| `vps-deploy-connectivity-staging.sh` | **Fail-closed** unless `SYNQDRIVE_VO5C_CONNECTIVITY_STAGING_ALLOW=1` (production-mutating break-glass) |
| Direct `current/.../vps-deploy-release.sh` without pin | Legacy; blocked when VO5C enforcement armed |

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
