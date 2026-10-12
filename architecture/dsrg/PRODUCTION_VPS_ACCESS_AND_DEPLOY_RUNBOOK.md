# Production VPS access and deployment — canonical runbook

**Status:** CURRENT_CANONICAL (DSRG-04, R6 + deploy-standard doc fix)  
**Repository baseline:** `main` includes merged [DSRG deployment consolidation #1991](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1991) (R4.2 pre-source integrity + R5 SSH recovery)  
**Audience:** Cursor Cloud Agents, operators, and any agent performing Production VPS read-only audit or authorized deploy.

---

## 0. Operational standard (read first)

| Item | Current binding rule |
|------|----------------------|
| **Production footprint** | Exactly **one** Hostinger VPS: **`srv1374778.hstgr.cloud`** — no second VPS, no staging VM, no alternate deploy target |
| **SSH login** | **`synqdrive-admin`** — **never** `root@` for routine operations |
| **Authoritative release path** | **VO5C pinned operator deployment** on the VPS using the **pinned executor** tree |
| **SHA + CI** | Owner-authorized exact **`SYNQDRIVE_REQUESTED_DEPLOY_SHA`** (40 hex) with **successful CI** on that commit |
| **Runner chain** | `vps-vo5c-first-security-deploy-preflight.sh` (optional) → `vps-vo5c-run-pinned-security-deploy.sh` → `exec bash` pinned `vps-deploy-release.sh` → rolling replicas **A** (`3001`) / **B** (`3002`) → health/readiness → **P4B16 attestation** |
| **Cloud Agent dev environment** | Normal: build, test, PRs, read-only audit when separately authorized — **distinct** from production deploy |
| **Cloud Agent VPS deploy bootstrap** | **`CLOUD_AGENT_DEPLOY_BOOTSTRAP_STATUS=NOT_INSTALLED_INACTIVE`** (R8B — fixed bootstrap **not** installed; further introduction **deferred**) |
| **`cloud-agent-deploy.sh`** | **Not** an operational standard while bootstrap is inactive — **do not** auto-run from agents; fail-closed exit **44** is expected until install |

**Agent stop rule:** If the VO5C operator path (pinned env + human authorization + runner) is unavailable, **stop and report**. Do not invent tar-stream, shallow-fetch, `/current` direct deploy, or agent-side authorization.

**Documented production evidence (do not over-claim):**

| Record | What is evidenced |
|--------|-------------------|
| [DSRG_02_PIN_REPROMOTION_2026-10-11.md](./evidence/DSRG_02_PIN_REPROMOTION_2026-10-11.md) | Authorized operator pin promotion on Production; `vps-vo5c-first-security-deploy-preflight.sh` **PREFLIGHT_PASS**; dual-replica scheduler roles on `:3001` / `:3002` |
| Ops selftests @ pin SHA (same doc) | Pinned runner / rollback contract **TEST_EXECUTED** offline on promoted pin tree |
| [GATE_A_READINESS.md](./evidence/GATE_A_READINESS.md) | Live pinned-runner **application** deploy proof — **NOT CLAIMED** in repository evidence |
| [DSRG_SSH_RCA_CLOUD_AGENT_VPS_ACCESS_2026-10-12.md](./evidence/DSRG_SSH_RCA_CLOUD_AGENT_VPS_ACCESS_2026-10-12.md) | Failed Cloud Agent deploy attempt did **not** execute VPS release (SSH principal correction) |

---

This document is the **single authoritative operational runbook** for SynqDrive Production on the **one Hostinger VPS**. It supersedes conflicting instructions that recommend `root` SSH, `mein-vps.internal`, routine Tailscale deploy, treating inactive `cloud-agent-deploy` as ready, or bare `/opt/synqdrive/current/.../vps-deploy-release.sh` as the security deploy entry when VO5C pinning applies.

**Related governance (read before deploy):**

- [DEPLOYMENT_AUTHORIZATION.md](./DEPLOYMENT_AUTHORIZATION.md)
- [PINNING_AND_ATTESTATION.md](./PINNING_AND_ATTESTATION.md)
- [OS_PRIVILEGE_BOUNDARY.md](./OS_PRIVILEGE_BOUNDARY.md)
- [ROLLBACK_AND_CONTAINMENT.md](./ROLLBACK_AND_CONTAINMENT.md)
- [evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md](./evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md)
- [evidence/VO5C_CLOUD_AGENT_BOOTSTRAP_INSTALL_READINESS.md](./evidence/VO5C_CLOUD_AGENT_BOOTSTRAP_INSTALL_READINESS.md) (operator checklist; read-only until install authorized)

---

## A. Production identity

| Field | Current value |
|-------|----------------|
| **Host** | `srv1374778.hstgr.cloud` |
| **SSH port** | `22` |
| **SSH user (login principal)** | `synqdrive-admin` |
| **Transport** | **Direct public SSH** (Path A). **Not** Tailscale for routine Production operations. |
| **Application URL** | `https://app.synqdrive.eu` |
| **Privilege after login** | Selected deploy operations use **`sudo -n -H`** (passwordless, scoped). Login is **not** `root`. |

### Credential source

| Source | When it applies |
|--------|------------------|
| **Existing on-disk key** | `~/.ssh/id_ed25519` when already provisioned (`cloud-agent-start.sh` or prior bootstrap). `CLOUD_AGENT_SSH_PRIVATE_KEY` may be **unset**. |
| **Cursor Runtime Secret** | `CLOUD_AGENT_SSH_PRIVATE_KEY` — materialized by `cloud_agent_materialize_ssh_key` when the on-disk key is absent. |

**Never** print, commit, or log private-key material.

### Host-key verification (mandatory)

Production scripts (`cloud-agent-ssh-common.sh`) **fail closed** for `*hstgr.cloud*` hosts:

- Require a **pre-verified** host key in `CLOUD_AGENT_SSH_KNOWN_HOSTS_FILE` or `~/.ssh/known_hosts`.
- Use **`StrictHostKeyChecking=yes`** with that file — **no** blind `ssh-keyscan` append on deploy or EXP021 remote bootstrap entrypoints.
- Verify fingerprints out-of-band (Hostinger panel, prior operator record, or org policy) before first connect.

### SSH preflight (Cloud Agent / operator workstation)

```bash
bash .cursor/scripts/cloud-agent-ssh-preflight.sh
bash .cursor/scripts/cloud-agent-verify-vps.sh
```

`cloud-agent-ssh-preflight.sh` reports identity presence, optional public fingerprint, and **BatchMode** auth against `synqdrive-admin@srv1374778.hstgr.cloud:22`.

Manual SSH (strict host key):

```bash
ssh -p 22 -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$HOME/.ssh/known_hosts" \
  synqdrive-admin@srv1374778.hstgr.cloud 'id -un; hostname'
```

Expected: `synqdrive-admin` and host identity `srv1374778` (or documented equivalent).

---

## B. Cursor Cloud Agent — development vs production deploy

### B.1 Development environment (active)

| Step | Behavior |
|------|----------|
| Purpose | Code, tests, PRs, MCP, local/CI validation — **no** implied production deploy |
| Env | `CLOUD_AGENT_VPS_HOST=srv1374778.hstgr.cloud` for SSH **preflight/audit** when authorized |
| User | `cloud_agent_ssh_user` maps `*hstgr.cloud*` + unset/`root` → **`synqdrive-admin`**. |
| Tailscale | `cloud-agent-start.sh` connects **only if** `TAILSCALE_AUTH_KEY` is set (Path B). Path A omits it. |
| SSH check | `bash .cursor/scripts/cloud-agent-ssh-preflight.sh` — connectivity only |

### B.2 Fixed VPS deploy bootstrap + `cloud-agent-deploy.sh` (NOT_INSTALLED_INACTIVE)

| Field | Value |
|-------|--------|
| Status constant | `CLOUD_AGENT_DEPLOY_BOOTSTRAP_STATUS=NOT_INSTALLED_INACTIVE` |
| R8B | Additional fixed bootstrap **not** installed; deliberate deferral |
| VPS path (when installed) | `/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh` |
| Agent rule | **Do not** describe or run `bash .cursor/scripts/cloud-agent-deploy.sh` as production-ready until owner installs bootstrap and updates this runbook |
| Install procedure (historical / future) | [evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md](./evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md) — **inactive** until separately authorized |

### B.3 `cloud-agent-deploy.sh` flow (repository design — inactive until bootstrap installed)

1. Optional `cloud-agent-verify-vps.sh` (TCP/DNS; SSH auth when identity available).
2. **SSH identity** + **trusted host key** + **`cloud_agent_ssh_auth_preflight`**.
3. Git preflight: clean tree, `HEAD` == `origin/main`, resolve `REQUESTED_DEPLOY_SHA`.
4. SSH → **`sudo -n -H /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh --preflight-check`** then **`…/vo5c-cloud-agent-pinned-deploy-bootstrap.sh <SHA>`** (SHA only).
5. Bootstrap verifies co-installed manifest + **R4.2 pre-source executor integrity** before sourcing pin-tree libs; then pinned **`vps-vo5c-run-pinned-security-deploy.sh`** on VPS.
6. Public health check (`https://app.synqdrive.eu/api/v1/health`).

| Exit | Meaning |
|------|---------|
| `0` | Pinned deploy OK + public health OK |
| `2` | Deploy OK; public health failed |
| `3` | P4B16 partial success (replicas OK; attestation reconciliation) |
| `4` | Monitoring outcome failure (immutable) |
| `42` | Missing/invalid operator session or SHA mismatch |
| `44` | Bootstrap missing / preflight failed |
| `45` | Bootstrap or pin integrity failure |
| `48` | `sudo -n` denied for bootstrap |

**Agents must never** set `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1` or use legacy `CLOUD_AGENT_VPS_DEPLOY_SCRIPT` → `/current/.../vps-deploy-release.sh` (blocked).

---

## C. Read-only Production audit

| Concept | Source |
|---------|--------|
| **ACTUAL_RUNNING_SHA** | `git -C "$(readlink -f /opt/synqdrive/current)" rev-parse HEAD` when git metadata exists |
| **Pinned executor** | `/opt/synqdrive/shared/vo5c-pinned-executor.env` → `SYNQDRIVE_PINNED_EXECUTOR_ROOT` + `SYNQDRIVE_PINNED_EXECUTOR_SHA` |
| **`SYNQDRIVE_DEPLOYED_GIT_SHA` in `backend.env`** | May be stale — verify runtime separately |

Safe read-only examples (on VPS as `synqdrive-admin`):

```bash
readlink -f /opt/synqdrive/current
git -C "$(readlink -f /opt/synqdrive/current)" rev-parse HEAD 2>/dev/null || true
source /opt/synqdrive/shared/vo5c-pinned-executor.env
git -C "$SYNQDRIVE_PINNED_EXECUTOR_ROOT" rev-parse HEAD
curl -sS http://127.0.0.1:3001/api/v1/health
curl -sS http://127.0.0.1:3002/api/v1/health
```

**EXP021 Gate-6 / GLOBAL_KILL / APDS / Battery / RFRF:** read-only audit does **not** authorize flag changes, kill toggles, or activation epochs. See [CROSS_MODULE_DEPENDENCIES.md](./CROSS_MODULE_DEPENDENCIES.md).

---

## D. Canonical deployment procedure

Deployment requires **explicit owner authorization**, exact **40-character** `SYNQDRIVE_REQUESTED_DEPLOY_SHA`, and **accepted CI** on that SHA (aggregate gates **success** — cancelled is not pass).

**Authoritative path today:** **§D.1 operator console** on `srv1374778.hstgr.cloud`. §D.2 Cloud Agent delegate path remains **blocked** until bootstrap install changes `CLOUD_AGENT_DEPLOY_BOOTSTRAP_STATUS`.

### D.1 Operator console (VPS) — operational standard

After human authorization:

```bash
export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1
export SYNQDRIVE_REQUESTED_DEPLOY_SHA=<40-char-hex>
# optional: SYNQDRIVE_STAGED_RELEASE_ROOT, pin env already on VPS
bash "${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops/vps-vo5c-run-pinned-security-deploy.sh"
```

Preflight (must pass before runner):

```bash
bash "${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops/vps-vo5c-first-security-deploy-preflight.sh"
```

Runner: preflight → admission → security floor → **`exec bash`** pinned `vps-deploy-release.sh` → rolling replicas **A/B** (3001/3002) → **P4B16 attestation** → eligible VO5C rollback on promotion failure.

Post-deploy verification (operator):

```bash
curl -sS http://127.0.0.1:3001/api/v1/health
curl -sS http://127.0.0.1:3002/api/v1/health
curl -sS https://app.synqdrive.eu/api/v1/health
```

### D.2 Cloud Agent delegate deploy (inactive — bootstrap not installed)

**Status:** `CLOUD_AGENT_DEPLOY_BOOTSTRAP_STATUS=NOT_INSTALLED_INACTIVE` — agents **must not** execute this path as standard operations.

When bootstrap is **installed** (future, owner-authorized only):

1. Operator creates **root-owned** session file `/opt/synqdrive/shared/vo5c-operator-deploy-session.env` (mode `600`, TTL-bound) — see `.cursor/skills/vps-deploy/SKILL.md`.
2. Operator verifies bootstrap preflight on VPS.
3. Human runs `cloud-agent-ssh-preflight.sh` then `cloud-agent-deploy.sh` from an authorized workstation/agent.

Cloud Agent accepts **only** the VPS session file for delegate authorization (not shell `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED` on the agent).

### D.3 Post-deploy attestation

Verify from **runtime**: `current` HEAD, both replicas on target SHA, health/readiness, single scheduler leader, `backend.env` SHA256 per scope, P4B16 status, safety flags (GLOBAL_KILL, APDS, Battery) unchanged unless separately authorized.

---

## E. Environment change scope

| Scope | Authorization |
|-------|----------------|
| Application deploy (release, PM2, build) | Owner deploy + pinned runner / Cloud Agent path above |
| `backend.env` / `SYNQDRIVE_DEPLOYED_GIT_SHA` | **Separate** explicit scope |
| APDS epoch, Battery publication, EXP021 S4, Global Kill | **Never** side effects of routine deploy |
| VPS bootstrap install | **Separate** operator procedure; not implied by merge #1991 |

---

## F. Emergency recovery

```
SSH fails?
├─ Wrong user (root)? → synqdrive-admin (CURRENT)
├─ No trusted host key? → Verify fingerprint; update known_hosts (no blind keyscan on production path)
├─ KEY_MISSING? → Baked ~/.ssh/id_ed25519 or CLOUD_AGENT_SSH_PRIVATE_KEY
├─ AUTH_FAILURE with correct user? → Stop; no Tailscale/root rotation without owner
└─ Break-glass → Hostinger console (owner authorization only)

Deploy fails?
├─ Exit 44/45 → Bootstrap not installed or integrity failure (install doc)
├─ Exit 42 → Session file / authorization
├─ Exit 3 → P4B16 partial — reconcile attestation before declaring success
└─ Post-promotion → VO5C rollback if eligible (ROLLBACK_AND_CONTAINMENT.md)
```

---

## G. Legacy and non-canonical (do not use for current Production)

| Item | Classification |
|------|----------------|
| `root@srv1374778.hstgr.cloud` | **OUTDATED** — use `synqdrive-admin` |
| `mein-vps.internal` / routine Tailscale deploy | **HISTORICAL Path B** — not current Production transport |
| Shallow-fetch `vps-deploy-release.sh` via Cloud Agent | **REMOVED** (#1991) |
| `cloud-agent-deploy.sh` while bootstrap not installed | **NOT_INSTALLED_INACTIVE** — do not use as deploy standard |
| Bare `/opt/synqdrive/current/.../vps-deploy-release.sh` as security entry | **OUTDATED** when pin required |
| Deploy without exact SHA + CI success | **FORBIDDEN** |

Historical evidence (EXP021 S4F-7X, older deploy reports) remains **HISTORICAL**; follow this runbook for **current** operations.

---

## H. Evidence

- DSRG-04 introduction: [evidence/DSRG_04_PRODUCTION_VPS_ACCESS_RUNBOOK.md](./evidence/DSRG_04_PRODUCTION_VPS_ACCESS_RUNBOOK.md)
- SSH RCA (EXP021-S4P8): [evidence/DSRG_SSH_RCA_CLOUD_AGENT_VPS_ACCESS_2026-10-12.md](./evidence/DSRG_SSH_RCA_CLOUD_AGENT_VPS_ACCESS_2026-10-12.md)
- Consolidation contract: [evidence/DSRG_DEPLOYMENT_CONSOLIDATION_SINGLE_VPS.md](./evidence/DSRG_DEPLOYMENT_CONSOLIDATION_SINGLE_VPS.md)

Update this runbook when Production transport, principal, bootstrap install status, or deploy entrypoints change.
