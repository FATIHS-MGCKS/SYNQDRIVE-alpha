# Changes & Architektur — Cursor Cloud Agents (2026-06-30)

## Changes

- Added `.cursor/environment.json` — SynqDrive Cloud environment (Dockerfile build,
  idempotent install, Tailscale bootstrap on start).
- Added `.cursor/Dockerfile` — Ubuntu 24.04 with Node 22, Docker CLI/Compose,
  PostgreSQL client, OpenSSH client, Tailscale.
- Added `.cursor/scripts/` — `cloud-agent-install.sh`, `cloud-agent-start.sh`,
  `tailscale-daemon.sh`, `cloud-agent-verify-vps.sh`.
- Added root `AGENTS.md` — Cloud Agent dashboard checklist, secret inventory
  (dashboard-only), VPS/Tailscale verification commands, test entry points.

## Architektur (runtime / data-flow deltas)

- **Cloud Agent VM** builds from committed `.cursor/environment.json`; secrets
  resolve from Cursor Dashboard (Runtime Secret), never from git.
- **Private VPS access** uses Tailscale userspace networking inside the Cursor VM:
  `tailscaled` → `tailscale up` (auth key) → MagicDNS `mein-vps.internal` →
  TCP 22 (SSH) / 5432 (PostgreSQL). HTTP(S) tools may use SOCKS/HTTP proxy env
  written to `~/.cursor-cloud-proxy.env`.
- **Network allowlist** (dashboard Security): `mein-vps.internal` plus required
  Cursor artifact S3 host; Tailscale ACLs enforce port-level access on the tailnet.
- **Local infra fallback** remains `backend/docker-compose.yml` inside the agent VM
  when tasks should not touch production VPS data.

## Notes

- External "Synqdrive Code → Changes / Architektur" workspace is outside this repo;
  this file is the in-repo record.
