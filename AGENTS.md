# SynqDrive — Agent instructions

## Repository layout

| Path | Role |
|------|------|
| `backend/` | NestJS modular monolith, Prisma, workers, DIMO/HM integrations |
| `frontend/` | Vite + React SPA (rental, master, operator surfaces) |
| `architecture/` | In-repo architecture change records |
| `.cursor/rules/` | Project engineering rules (always apply) |

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
   - Required artifact host: `cloud-agent-artifacts.s3.us-east-1.amazonaws.com`
4. **Tailscale ACL** — allow the Cloud Agent node (`synqdrive-cursor-cloud`) to reach `mein-vps` on **TCP 22** and **TCP 5432**.
5. **Secrets** — add as **Runtime Secret** unless noted:

| Secret | Purpose |
|--------|---------|
| `TAILSCALE_AUTH_KEY` | Reusable/ephemeral Tailscale auth key (tagged for cloud agents) |
| `DATABASE_URL` | e.g. `postgresql://USER:PASS@mein-vps.internal:5432/synqdrive?schema=public` |
| `CLOUD_AGENT_SSH_PRIVATE_KEY` | PEM for SSH to VPS (optional, for deploy/ops tasks) |
| `CLOUD_AGENT_SSH_USER` | SSH user (default `root` if unset) |
| `CLOUD_AGENT_VPS_HOST` | Override VPS hostname (default `mein-vps.internal`) |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | Auth |
| `DIMO_API_KEY`, `DIMO_PRIVATE_KEY`, `DIMO_CLIENT_ID` | DIMO integration |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing |
| Other keys from `backend/.env.example` | As needed for the task |

6. **Restart** the Cloud Agent after adding or changing secrets.

### VPS connectivity

On boot, the agent:

1. Runs `tailscaled` in **userspace networking** mode (required in Cursor VMs).
2. Joins your tailnet via `TAILSCALE_AUTH_KEY`.
3. Verifies TCP to `mein-vps.internal:22` (SSH) and `:5432` (PostgreSQL).

Manual verification inside a Cloud Agent shell:

```bash
bash .cursor/scripts/cloud-agent-verify-vps.sh
source ~/.cursor-cloud-proxy.env   # HTTP(S) via Tailscale proxy if needed
psql "$DATABASE_URL" -c 'SELECT 1'
ssh ${CLOUD_AGENT_SSH_USER:-root}@mein-vps.internal 'hostname'
```

### Tests

```bash
cd backend && npm test
cd frontend && npm test
```

### Architecture rules

- Preserve multi-tenant org scoping — no hardcoded org/vehicle IDs.
- DIMO Segments are canonical trip boundaries; use DIMO MCP for DIMO work.
- Figma is visual source of truth; codebase is functional source of truth.
- AI Upload: never auto-apply unconfirmed extraction results.
