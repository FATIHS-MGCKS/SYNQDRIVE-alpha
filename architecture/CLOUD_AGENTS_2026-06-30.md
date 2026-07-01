# Changes & Architektur — Cursor Cloud Agents + VPS Deploy (2026-06-30)

## Changes

- Restored `.cursor/environment.json` — SynqDrive Cloud environment (Dockerfile build,
  idempotent install, Tailscale bootstrap on start).
- Restored `.cursor/Dockerfile` — Ubuntu 24.04 with Node 22, Docker CLI/Compose,
  PostgreSQL client, OpenSSH client, Tailscale.
- Restored `.cursor/scripts/` — `cloud-agent-install.sh`, `cloud-agent-start.sh`,
  `tailscale-daemon.sh`, `cloud-agent-verify-vps.sh`.
- **Added** `.cursor/scripts/cloud-agent-deploy.sh` — commit/push preflight + SSH deploy
  via `vps-deploy-release.sh` + public health verification (parity with local agent flow).
- **Added** `.cursor/scripts/cloud-agent-ssh-common.sh` — normalizes Cursor-delivered SSH
  secrets (bare base64 without PEM headers) and trims whitespace from `CLOUD_AGENT_SSH_USER`.
- Restored root `AGENTS.md` — dashboard checklist, secret inventory, deploy runbook.

## Architektur (runtime / data-flow deltas)

- **Cloud Agent VM** builds from committed `.cursor/environment.json`; secrets
  resolve from Cursor Dashboard (Runtime Secret), never from git.
- **VPS access (two paths):**
  - **Path A (public SSH):** `CLOUD_AGENT_VPS_HOST=srv1374778.hstgr.cloud`, no Tailscale.
  - **Path B (Tailscale):** `tailscaled` → `tailscale up` → `mein-vps.internal` →
    TCP 22 / 5432; proxy env in `~/.cursor-cloud-proxy.env`.
- **Cursor secret types:** Runtime Secret for keys/credentials; Environment Variable
  for non-sensitive host/user config (both injected as env vars at runtime).
- **Production deploy path**: Cloud Agent → SSH (`CLOUD_AGENT_SSH_PRIVATE_KEY`) →
  VPS `vps-deploy-release.sh` → fresh git clone from GitHub `main` → build → PM2.
  Requires `main` pushed before deploy; `frontend.env` symlink on VPS ensures
  Mapbox token at build time.
- **SSH secret normalization**: `cloud-agent-ssh-common.sh` wraps bare-base64 keys with
  OpenSSH PEM headers at materialization time; `CLOUD_AGENT_SSH_USER` is trimmed before use.
- **Network allowlist** (dashboard Security): `mein-vps.internal`, `app.synqdrive.eu`,
  plus required Cursor artifact S3 host; Tailscale ACLs enforce port-level access.
- **Local infra fallback** remains `backend/docker-compose.yml` inside the agent VM
  when tasks should not touch production VPS data.

## Notes

- External "Synqdrive Code → Changes / Architektur" workspace is outside this repo;
  this file is the in-repo record.
