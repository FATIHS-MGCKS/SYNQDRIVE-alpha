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
**Configure credentials in the [Cursor Cloud Agents dashboard](https://cursor.com/dashboard/cloud-agents) → Secrets tab — never in git.**

### Runtime Secret vs Environment Variable

Both types are injected as shell environment variables at agent runtime. The difference is visibility to the AI agent:

| Cursor type | Use for | Agent can read value? | Redacted in chat/commits? |
|-------------|---------|----------------------|---------------------------|
| **Runtime Secret** | Passwords, private keys, API secrets, DB URLs | No (`[REDACTED]`) | Yes |
| **Environment Variable** | Hostnames, usernames, public URLs, feature flags | Yes | No |

**Rule of thumb for SynqDrive:**

- **Runtime Secret:** anything that must not appear in commits or agent transcripts.
- **Environment Variable:** non-sensitive config the agent may need to see (e.g. `CLOUD_AGENT_VPS_HOST`).

Build-time-only credentials (private npm registries) → **Build Secret** (not used for VPS deploy).

### Choose a VPS path

| Path | When | `CLOUD_AGENT_VPS_HOST` | `TAILSCALE_AUTH_KEY` |
|------|------|--------------------------|----------------------|
| **A — Public SSH** (simpler) | Deploy only, Hostinger SSH reachable | `srv1374778.hstgr.cloud` | **Do not add** |
| **B — Tailscale** (more secure) | Private VPS + optional prod DB from agent | `mein-vps.internal` | **Runtime Secret** |

**Tailscale without using it:** do **not** create an empty `TAILSCALE_AUTH_KEY` entry. Omit the variable entirely — `cloud-agent-start.sh` only connects when the key is set and non-empty. Add it later when you switch to path B.

### Dashboard checklist (one-time)

1. **Connect SCM** — GitHub/GitLab with read-write on this repo.
2. **Create environment** — select this repo; Cursor builds from `.cursor/environment.json`.
3. **Network policy** — Dashboard → Cloud Agents → **Security**:
   - Mode: **Default + allowlist** (recommended)
   - Path A: `srv1374778.hstgr.cloud`, `app.synqdrive.eu`, `github.com`
   - Path B: also `mein-vps.internal`
   - Required artifact host: `cloud-agent-artifacts.s3.us-east-1.amazonaws.com`
4. **Tailscale ACL** (path B only) — allow node `synqdrive-cursor-cloud` → `mein-vps` on TCP **22** and **5432**.
5. **Secrets** — see table below.
6. **Restart** the Cloud Agent after adding or changing secrets.

#### Secrets inventory

| Name | Cursor type | Path A (public SSH) | Path B (Tailscale) |
|------|-------------|---------------------|---------------------|
| `CLOUD_AGENT_SSH_PRIVATE_KEY` | **Runtime Secret** | Required | Required |
| `CLOUD_AGENT_VPS_HOST` | Environment Variable | `srv1374778.hstgr.cloud` | `mein-vps.internal` |
| `CLOUD_AGENT_SSH_USER` | Environment Variable | `root` (optional) | `root` (optional) |
| `TAILSCALE_AUTH_KEY` | **Runtime Secret** | **omit** | Required |
| `DATABASE_URL` | **Runtime Secret** | omit (unless needed) | Optional (prod DB via tailnet) |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | Runtime Secret | As needed for task | As needed |
| `DIMO_API_KEY`, `DIMO_PRIVATE_KEY`, `DIMO_CLIENT_ID` | Runtime Secret | As needed | As needed |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Runtime Secret | As needed | As needed |
| Other keys from `backend/.env.example` | Runtime Secret | As needed | As needed |

`CLOUD_AGENT_SSH_PRIVATE_KEY` = full PEM from local `id_ed25519` (Windows: `C:\Users\<you>\.ssh\id_ed25519`).

### VPS connectivity

On boot, `cloud-agent-start.sh`:

1. Connects Tailscale **only if** `TAILSCALE_AUTH_KEY` is set (path B).
2. Materializes `~/.ssh/id_ed25519` from `CLOUD_AGENT_SSH_PRIVATE_KEY`.
3. Runs connectivity checks when Tailscale is active (path B).

Manual verification inside a Cloud Agent shell:

```bash
bash .cursor/scripts/cloud-agent-verify-vps.sh
ssh ${CLOUD_AGENT_SSH_USER:-root}@${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud} 'hostname'
```

Path B only — HTTP(S) via Tailscale proxy:

```bash
source ~/.cursor-cloud-proxy.env
```

### Deploy without Tailscale (path A — recommended for deploy-only)

No Tailscale account or auth key required. Same deploy script as path B.

**Minimum secrets (Cursor dashboard):**

| Name | Type | Value |
|------|------|-------|
| `CLOUD_AGENT_SSH_PRIVATE_KEY` | Runtime Secret | Your `id_ed25519` private key (full PEM) |
| `CLOUD_AGENT_VPS_HOST` | Environment Variable | `srv1374778.hstgr.cloud` |
| `CLOUD_AGENT_SSH_USER` | Environment Variable | `root` |

**Do not add** `TAILSCALE_AUTH_KEY`.

**Allowlist:** `srv1374778.hstgr.cloud`, `app.synqdrive.eu`, `github.com`.

**Prerequisite:** VPS SSH (port 22) must be reachable from Cursor Cloud Agent IPs. Hostinger firewall must allow inbound SSH (key-only auth). If SSH is IP-restricted to your home IP only, path A will fail — use path B (Tailscale) instead.

**Test in Cloud Agent terminal:**

```bash
ssh -o BatchMode=yes root@srv1374778.hstgr.cloud hostname
bash .cursor/scripts/cloud-agent-deploy.sh
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

- Verifies SSH to the VPS (Tailscale optional)
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

### Override targets (optional)

| Name | Type | Default |
|------|------|---------|
| `CLOUD_AGENT_VPS_HOST` | Environment Variable | `mein-vps.internal` (use `srv1374778.hstgr.cloud` without Tailscale) |
| `CLOUD_AGENT_VPS_DEPLOY_SCRIPT` | Environment Variable | `/opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh` |
| `CLOUD_AGENT_HEALTH_URL` | Environment Variable | `https://app.synqdrive.eu/api/v1/health` |

---

## Tests

```bash
cd backend && npm test
cd frontend && npm test
```

## DIMO Agents DNS (deployment)

`getaddrinfo ENOTFOUND agents.dimo.zone` is a **runtime DNS** issue. Official URL: `https://agents.dimo.zone` (do not change base URL).

- **Production VPS** runs NestJS via **PM2 on the host** — fix **host DNS**, not Docker.
- **Optional** containerized backend: `backend/docker-compose.yml` → `backend` service with `dns: [1.1.1.1, 8.8.8.8]`.

Full runbook: [`backend/docs/dimo-agents-dns-troubleshooting.md`](backend/docs/dimo-agents-dns-troubleshooting.md)

Quick checks:

```bash
# Host
curl -sS -o /dev/null -w "%{http_code}\n" https://agents.dimo.zone
nslookup agents.dimo.zone

# Container (after: cd backend && docker compose up -d --build backend)
docker compose exec backend sh -lc "node -e \"require('node:dns').lookup('agents.dimo.zone',(e,a,f)=>console.log({e:e?.message,code:e?.code,a,f}))\""

# App probe (3000 local / 3001 production PM2)
curl -sS "http://localhost:3000/api/v1/dimo/agents/health"
```

If host DNS fails: check VPS `systemd-resolved`, `/etc/resolv.conf`, Hostinger firewall (outbound 53/443). If host OK but container fails: `docker compose down && docker compose up -d --build`.

## Architecture rules

- Preserve multi-tenant org scoping — no hardcoded org/vehicle IDs.
- DIMO Segments are canonical trip boundaries; use DIMO MCP for DIMO work.
- Figma is visual source of truth; codebase is functional source of truth.
- AI Upload: never auto-apply unconfirmed extraction results.
