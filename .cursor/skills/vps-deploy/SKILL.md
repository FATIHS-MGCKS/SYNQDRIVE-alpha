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

## Workflow

1. `git status` and `git diff` — do not commit `.env` or secrets.
2. If changes exist: stage, commit (concise message), `git push origin main`.
3. Deploy:

```bash
bash .cursor/scripts/cloud-agent-deploy.sh
```

## What the deploy does

Remote script: `backend/scripts/ops/vps-deploy-release.sh` on the VPS.

- Pre-deploy PostgreSQL backup
- Clone `main` from GitHub into `/opt/synqdrive/releases/<id>`
- Symlink `backend.env`, `frontend.env`, uploads
- `npm ci`, Prisma migrate, backend + frontend build
- Switch `/opt/synqdrive/current`, PM2 restart
- Health check on port 3001; script also checks `https://app.synqdrive.eu/api/v1/health`

## Local agent alternative

If running on the developer machine with SSH key at `~/.ssh/id_ed25519`:

```bash
ssh -i ~/.ssh/id_ed25519 -o BatchMode=yes root@srv1374778.hstgr.cloud \
  "bash /opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh"
```

Cloud Agents must use `cloud-agent-deploy.sh` (dashboard SSH key; Tailscale optional).

## Failure modes

| Symptom | Fix |
|---------|-----|
| Git preflight: unpushed commits | `git push origin main` |
| SSH auth failed | Check `CLOUD_AGENT_SSH_PRIVATE_KEY`; without Tailscale check Hostinger firewall (port 22) |
| Health check exit 7 | Often timing; verify `app.synqdrive.eu/api/v1/health` manually |
| Mapbox broken after deploy | Ensure VPS symlinks `frontend.env` (in deploy script) |
