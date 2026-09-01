---
name: vps-deploy
description: >-
  Commit, push, and deploy SynqDrive to production VPS from Cursor (local or Cloud Agent).
  Use when the user asks to deploy, commit and deploy, release to production, or VPS deploy.
---
# VPS production deploy

## When to use

User says: deploy, commit and deploy, release, production, VPS.

## Prerequisites (Cloud Agent only)

[Cursor Cloud Agents dashboard](https://cursor.com/dashboard/cloud-agents) → Secrets.

**Deploy without Tailscale (path A):**

| Name | Type |
|------|------|
| `CLOUD_AGENT_SSH_PRIVATE_KEY` | Runtime Secret |
| `CLOUD_AGENT_VPS_HOST` | Environment Variable → `srv1374778.hstgr.cloud` |
| `CLOUD_AGENT_SSH_USER` | Environment Variable → `root` |

Do **not** add `TAILSCALE_AUTH_KEY`.

**With Tailscale (path B):** add `TAILSCALE_AUTH_KEY` (Runtime Secret) and set host to `mein-vps.internal`.

See `AGENTS.md` for full checklist and Runtime Secret vs Environment Variable guidance.

## Canonical deployment path (required)

**Always use** the Cloud Agent deploy script — do **not** invoke `/opt/synqdrive/current/.../vps-deploy-release.sh` directly.

```bash
bash .cursor/scripts/cloud-agent-deploy.sh
```

### Why not `current`?

Pre-success `current` may lack the latest deploy lifecycle (OQ-18). The canonical path:

1. Resolves **one immutable `REQUESTED_DEPLOY_SHA`** from local `origin/main` after git preflight
2. Bootstraps the deploy entry script at **that exact SHA** on the VPS (not stale `current`)
3. `vps-deploy-release.sh` clones/builds **that same SHA** (`SYNQDRIVE_REQUESTED_DEPLOY_SHA`)
4. Sources multi-replica libs from **`RELEASE_DIR`** (RELEASE_OPS_DIR / DEC-015)
5. Rolling restart + scheduler convergence gate (P1.8.3.1) + invariants
6. Auto-rollback on failure

**Invariant (DEC-016):**

```
REQUESTED_DEPLOY_SHA == BOOTSTRAP_SCRIPT_SHA == RELEASE_SOURCE_SHA == TARGET_SHA == REPLICA_A_SHA == REPLICA_B_SHA
```

Any mismatch → fail closed; rollback if promotion began.

## Workflow

1. `git status` and `git diff` — do not commit `.env` or secrets.
2. If changes exist: stage, commit (concise message), `git push origin main`.
3. Deploy:

```bash
bash .cursor/scripts/cloud-agent-deploy.sh
```

## What the deploy does

Remote lifecycle (`backend/scripts/ops/vps-deploy-release.sh`):

- Pre-deploy PostgreSQL backup
- Clone **exact requested SHA** into `/opt/synqdrive/releases/<id>` (not mutable branch tip)
- Symlink `backend.env`, `frontend.env`, uploads
- `npm ci`, Prisma migrate, backend + frontend build
- Boot check before promoting release
- Switch `/opt/synqdrive/current`, rolling multi-replica PM2 restart (3001 + 3002)
- Scheduler leader convergence gate (bounded poll; 0=transient, >1=split-brain)
- nginx dual-upstream + external health verification
- Auto-rollback via `vps-rollback-production-release.sh` on failure

## Multi-replica topology

| Replica | PM2 name | Port |
|---------|----------|------|
| A | `synqdrive` | 3001 |
| B | `synqdrive-b` | 3002 |

nginx upstream `synqdrive_backend` → 3001 + 3002.

## Rollback

Deploy captures state in `/opt/synqdrive/shared/deploy-state/last-deploy-state.env`. On invariant failure, automatic rollback restores previous release + rolling restart. Manual:

```bash
sudo bash /opt/synqdrive/current/backend/scripts/ops/vps-rollback-production-release.sh
```

## Local agent alternative

Prefer `cloud-agent-deploy.sh`. If SSH-only:

```bash
REQUESTED_SHA="$(git rev-parse origin/main)"
ssh -i ~/.ssh/id_ed25519 -o BatchMode=yes synqdrive-admin@srv1374778.hstgr.cloud \
  "sudo -n -H bash -c 'TMP=\$(mktemp -d); git init -q \$TMP; git -C \$TMP remote add origin https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git; git -C \$TMP fetch --depth 1 origin ${REQUESTED_SHA}; git -C \$TMP checkout -q FETCH_HEAD; SYNQDRIVE_REQUESTED_DEPLOY_SHA=${REQUESTED_SHA} bash \$TMP/backend/scripts/ops/vps-deploy-release.sh'"
```

## Failure modes

| Symptom | Fix |
|---------|-----|
| Git preflight: unpushed commits | `git push origin main` |
| `SYNQDRIVE_REQUESTED_DEPLOY_SHA is required` | Use canonical deploy path above |
| SSH auth failed | Check `CLOUD_AGENT_SSH_PRIVATE_KEY`; without Tailscale check Hostinger firewall (port 22) |
| Scheduler leaders=0 abort (no convergence wait) | Stale bootstrap — use canonical path; verify RELEASE_OPS_DIR sourcing |
| Health check exit 7 | Often timing; verify `app.synqdrive.eu/api/v1/health` manually |
| Mapbox broken after deploy | Ensure VPS symlinks `frontend.env` (in deploy script) |
