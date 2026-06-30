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
- Restored root `AGENTS.md` — dashboard checklist, secret inventory, deploy runbook.

## Architektur (runtime / data-flow deltas)

- **Cloud Agent VM** builds from committed `.cursor/environment.json`; secrets
  resolve from Cursor Dashboard (Runtime Secret), never from git.
- **Private VPS access** uses Tailscale userspace networking inside the Cursor VM:
  `tailscaled` → `tailscale up` (auth key) → MagicDNS `mein-vps.internal` →
  TCP 22 (SSH) / 5432 (PostgreSQL). HTTP(S) tools may use SOCKS/HTTP proxy env
  written to `~/.cursor-cloud-proxy.env`.
- **Production deploy path**: Cloud Agent → SSH (`CLOUD_AGENT_SSH_PRIVATE_KEY`) →
  VPS `vps-deploy-release.sh` → fresh git clone from GitHub `main` → build → PM2.
  Requires `main` pushed before deploy; `frontend.env` symlink on VPS ensures
  Mapbox token at build time.
- **Network allowlist** (dashboard Security): `mein-vps.internal`, `app.synqdrive.eu`,
  plus required Cursor artifact S3 host; Tailscale ACLs enforce port-level access.
- **Local infra fallback** remains `backend/docker-compose.yml` inside the agent VM
  when tasks should not touch production VPS data.

## Notes

- External "Synqdrive Code → Changes / Architektur" workspace is outside this repo;
  this file is the in-repo record.
