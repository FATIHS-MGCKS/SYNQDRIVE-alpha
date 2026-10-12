# Canonical Production VPS access and deploy

**CURRENT_CANONICAL** — do not use older runbooks in this directory as the primary Production SSH/deploy source.

Authoritative runbook:

**[architecture/dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md](../../architecture/dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md)**

- Direct SSH: `synqdrive-admin@srv1374778.hstgr.cloud:22`
- Verified host key (`StrictHostKeyChecking=yes`) — no blind `ssh-keyscan` on deploy paths
- No routine Tailscale / `mein-vps.internal` for current Production
- No `root` SSH login
- Deploy: fixed VPS bootstrap (when installed) → pinned VO5C runner + explicit owner authorization + exact SHA

Bootstrap install (separate authorization): [architecture/dsrg/evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md](../../architecture/dsrg/evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md)  
Readiness checklist: [architecture/dsrg/evidence/VO5C_CLOUD_AGENT_BOOTSTRAP_INSTALL_READINESS.md](../../architecture/dsrg/evidence/VO5C_CLOUD_AGENT_BOOTSTRAP_INSTALL_READINESS.md)

Older documents that mention legacy `cloud-agent-deploy.sh` behavior, `root@srv1374778`, or Tailscale as the default Production path may be **HISTORICAL_EVIDENCE** unless they link the canonical runbook.
