---
name: vps-deploy
description: >-
  Guide production release on the single Hostinger VPS via the VO5C pinned operator
  runner. Use when the user asks to deploy, commit and deploy, release to production,
  or VPS deploy. No separate staging VPS. Cloud Agent cloud-agent-deploy is inactive
  until the fixed VPS bootstrap is installed.
---
# VPS production deploy (single VPS, VO5C operator standard)

**Canonical runbook:** [architecture/dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md](../../../architecture/dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md)

## Operational standard (current)

| Item | Value |
|------|--------|
| VPS | `srv1374778.hstgr.cloud` only |
| SSH user | `synqdrive-admin` (never `root`) |
| Release mechanism | **VO5C pinned operator deployment** on the VPS |
| SHA + CI | Exact owner-approved 40-char SHA on `main` + CI **success** |
| Bootstrap status | `CLOUD_AGENT_DEPLOY_BOOTSTRAP_STATUS=NOT_INSTALLED_INACTIVE` |

**Agents:** develop, test, and open PRs in the normal Cursor Cloud Agent environment. **Do not** run `cloud-agent-deploy.sh` or install the fixed VPS bootstrap unless the owner explicitly authorizes a bootstrap install workstream.

## When to use this skill

User says: deploy, commit and deploy, release, production, VPS deploy.

If the user only wants **git push** or **CI**, do that — production deploy still requires a **human operator** on the VPS unless bootstrap status changes.

## VO5C operator workflow (authoritative)

```
Owner-approved SYNQDRIVE_REQUESTED_DEPLOY_SHA + CI success on main
  → SSH synqdrive-admin@srv1374778.hstgr.cloud
  → source /opt/synqdrive/shared/vo5c-pinned-executor.env
  → optional: vps-vo5c-first-security-deploy-preflight.sh
  → SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1 (human only — never set by agents)
  → vps-vo5c-run-pinned-security-deploy.sh (from pinned ops dir only)
  → exec bash pinned vps-deploy-release.sh
  → rolling replicas A/B (3001 / 3002) + verify
  → P4B16 attestation + public health
```

### Commands (operator on VPS)

```bash
source /opt/synqdrive/shared/vo5c-pinned-executor.env
export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1
export SYNQDRIVE_REQUESTED_DEPLOY_SHA=<approved-40-char-sha>
cd "${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops"
bash vps-vo5c-first-security-deploy-preflight.sh   # optional but recommended
bash vps-vo5c-run-pinned-security-deploy.sh
```

Verify replicas and public health:

```bash
curl -sS http://127.0.0.1:3001/api/v1/health
curl -sS http://127.0.0.1:3002/api/v1/health
curl -sS https://app.synqdrive.eu/api/v1/health
```

**Evidence in repo:** pin promotion + preflight PASS on Production — [DSRG_02_PIN_REPROMOTION_2026-10-11.md](../../../architecture/dsrg/evidence/DSRG_02_PIN_REPROMOTION_2026-10-11.md). Full application promotion via pinned runner without owner attestation — **not claimed** in [GATE_A_READINESS.md](../../../architecture/dsrg/evidence/GATE_A_READINESS.md).

Optional staged checkout on the **same** VPS: `SYNQDRIVE_STAGED_RELEASE_ROOT` (not a second VM).

## Agent-assisted git (not production deploy)

1. `git status` / `git diff` — no secrets.
2. Commit + `git push origin main` when the user requests.
3. Remind the user that **only the operator** may run the VO5C pinned runner on the VPS with human authorization.

SSH preflight from a Cloud Agent (connectivity / read-only audit prep only):

```bash
bash .cursor/scripts/cloud-agent-ssh-preflight.sh
```

## Cloud Agent `cloud-agent-deploy.sh` — inactive (do not use as standard)

| Field | Value |
|-------|--------|
| Status | `NOT_INSTALLED_INACTIVE` (R8B) |
| VPS bootstrap | `/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh` — **not installed** |
| Agent action | **Do not** run automatically; **do not** document as ready |
| Future install doc | [VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md](../../../architecture/dsrg/evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md) (historical procedure — inactive until owner installs) |

When bootstrap is eventually installed, delegate deploy would require a root-owned `/opt/synqdrive/shared/vo5c-operator-deploy-session.env` (TTL-bound) — see runbook §D.2. Until then, exit **44** from `cloud-agent-deploy.sh` is expected.

## Not supported for routine production

| Path | Status |
|------|--------|
| `root@` SSH | **Forbidden** |
| Second VPS / staging VM | **Not supported** |
| Shallow-fetch `vps-deploy-release.sh` from `/current` | **Blocked** in repository contract |
| Direct `current/.../vps-deploy-release.sh` without pin | Legacy; blocked when VO5C enforcement armed |
| `vps-deploy-connectivity-staging.sh` | Fail-closed unless `SYNQDRIVE_VO5C_CONNECTIVITY_STAGING_ALLOW=1` (break-glass) |
| Agent sets `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1` | **Forbidden** |

## Rollback

```bash
sudo bash /opt/synqdrive/current/backend/scripts/ops/vps-rollback-production-release.sh
```

Exit `3` = replicas restored; P4B16 attestation incomplete (not unsafe physical rollback).

## Multi-replica

| Replica | PM2 | Port |
|---------|-----|------|
| A | `synqdrive` | 3001 |
| B | `synqdrive-b` | 3002 |

## Status vocabulary

| Term | Meaning |
|------|---------|
| IMPLEMENTED | Script/libs in repository |
| DEPLOYED | Change promoted on VPS `/current` |
| ACTIVATED | P4B16 / enforcement / gates actually exercised in production |
| VALIDATED | Fresh production evidence (not claimed by docs-only PRs) |

## Stop rule

If pinned executor env, human authorization, or runner path is unavailable — **stop and report**. Do not invent alternate deploy paths.
