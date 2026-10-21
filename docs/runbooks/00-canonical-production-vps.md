# Canonical Production VPS access and deploy

**CURRENT_CANONICAL** — do not use older runbooks in this directory as the primary Production SSH/deploy source.

Authoritative runbook:

**[architecture/dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md](../../architecture/dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md)**

- Direct SSH: `synqdrive-admin@srv1374778.hstgr.cloud:22`
- Verified host key (`StrictHostKeyChecking=yes`) — no blind `ssh-keyscan` on deploy paths
- No routine Tailscale / `mein-vps.internal` for current Production
- No `root` SSH login
- Deploy: owner instructs in Cursor → `CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1` → `cloud-agent-deploy.sh` → SSH → `vps-deploy-release.sh` + CI gate + exact SHA

Optional VO5C bootstrap (not routine): [architecture/dsrg/evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md](../../architecture/dsrg/evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md)

Older documents that mention legacy `cloud-agent-deploy.sh` behavior, `root@srv1374778`, or Tailscale as the default Production path may be **HISTORICAL_EVIDENCE** unless they link the canonical runbook.
