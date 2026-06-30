# SynqDrive — Agent instructions

## Repository layout

| Path | Role |
|------|------|
| `backend/` | NestJS modular monolith, Prisma, workers, DIMO/HM integrations |
| `frontend/` | Vite + React SPA (rental, master, operator surfaces) |
| `architecture/` | In-repo architecture change records |
| `.cursor/rules/` | Project engineering rules (always apply) |
| `.cursor/scripts/` | Cloud Agent bootstrap + VPS deploy helpers |

## Local development (reference)

```bash
cd backend && npm ci && npx prisma generate
cd ../frontend && npm ci
cd backend && npm run infra:up          # postgres, redis, clickhouse via docker compose
cd backend && npm run start:dev
cd frontend && npm run dev
```

Env template: `backend/.env.example` — **never commit real secrets**.

---

## Cursor Cloud Agent setup

Cloud Agents use `.cursor/environment.json` (Dockerfile + install/start scripts).
**All secrets belong in the [Cursor Cloud Agents dashboard](https://cursor.com/dashboard/cloud-agents) → Secrets tab — not in git.**

### Dashboard checklist (one-time)

1. **Connect SCM** — GitHub/GitLab with read-write on this repo.
2. **Create environment** — select this repo; Cursor builds from `.cursor/environment.json`.
3. **Network policy** — Dashboard → Cloud Agents → **Security**:
   - Mode: **Default + allowlist** (recommended)
   - Add allowlist host: `mein-vps.internal`
   - Add allowlist host: `app.synqdrive.eu` (public health verification)
   - Required artifact host: `cloud-agent-artifacts.s3.us-east-1.amazonaws.com`
4. **Tailscale ACL** — allow the Cloud Agent node (`synqdrive-cursor-cloud`) to reach `mein-vps` on **TCP 22** and **TCP 5432**.
5. **Secrets** — add as **Runtime Secret** unless noted:

| Secret | Purpose |
|--------|---------|
| `TAILSCALE_AUTH_KEY` | Reusable/ephemeral Tailscale auth key (tagged for cloud agents) |
| `CLOUD_AGENT_SSH_PRIVATE_KEY` | PEM for SSH deploy to VPS (`root@mein-vps.internal`) |
| `CLOUD_AGENT_SSH_USER` | SSH user (default `root` if unset) |
| `CLOUD_AGENT_VPS_HOST` | VPS MagicDNS hostname (default `mein-vps.internal`) |
| `DATABASE_URL` | Optional: `postgresql://USER:PASS@mein-vps.internal:5432/synqdrive?schema=public` |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | Auth |
| `DIMO_API_KEY`, `DIMO_PRIVATE_KEY`, `DIMO_CLIENT_ID` | DIMO integration |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing |
| Other keys from `backend/.env.example` | As needed for the task |

6. **Restart** the Cloud Agent after adding or changing secrets.

### VPS connectivity

On boot, the agent:

1. Runs `tailscaled` in **userspace networking** mode (required in Cursor VMs).
2. Joins your tailnet via `TAILSCALE_AUTH_KEY`.
3. Materializes `~/.ssh/id_ed25519` from `CLOUD_AGENT_SSH_PRIVATE_KEY`.
4. Verifies TCP to `mein-vps.internal:22` (SSH) and `:5432` (PostgreSQL).

Manual verification inside a Cloud Agent shell:

```bash
bash .cursor/scripts/cloud-agent-verify-vps.sh
source ~/.cursor-cloud-proxy.env   # HTTP(S) via Tailscale proxy if needed
ssh ${CLOUD_AGENT_SSH_USER:-root}@mein-vps.internal 'hostname'
```

---

## Production deploy (Cloud Agent)

The VPS deploy clones **`main` from GitHub** — not the agent workspace. Always **push before deploy**.

### Standard flow (same as local agent)

When the user asks to **commit and deploy**:

1. `git status` / `git diff` — review changes; never commit secrets (`.env`, keys).
2. Commit with a concise message if there are changes.
3. `git push origin main`
4. Run:

```bash
bash .cursor/scripts/cloud-agent-deploy.sh
```

The deploy script:

- Verifies Tailscale + SSH to the VPS
- Ensures working tree is clean and `main` is pushed to `origin`
- SSHs to the VPS and runs `backend/scripts/ops/vps-deploy-release.sh`
- That remote script: DB backup → clone release → link `backend.env` + `frontend.env` → `npm ci` + build → Prisma migrate → PM2 restart → health check
- Verifies `https://app.synqdrive.eu/api/v1/health`

### Deploy-only (no new commits)

```bash
bash .cursor/scripts/cloud-agent-deploy.sh
```

Skip git preflight (e.g. redeploy current `main` without local checkout):

```bash
CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 bash .cursor/scripts/cloud-agent-deploy.sh
```

### Override targets (optional secrets)

| Secret | Default |
|--------|---------|
| `CLOUD_AGENT_VPS_HOST` | `mein-vps.internal` |
| `CLOUD_AGENT_VPS_DEPLOY_SCRIPT` | `/opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh` |
| `CLOUD_AGENT_HEALTH_URL` | `https://app.synqdrive.eu/api/v1/health` |

---

## Tests

```bash
cd backend && npm test
cd frontend && npm test
```

## Architecture rules

- Preserve multi-tenant org scoping — no hardcoded org/vehicle IDs.
- DIMO Segments are canonical trip boundaries; use DIMO MCP for DIMO work.
- Figma is visual source of truth; codebase is functional source of truth.
- AI Upload: never auto-apply unconfirmed extraction results.
