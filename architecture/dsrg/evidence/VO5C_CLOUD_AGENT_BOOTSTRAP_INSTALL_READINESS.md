# VO5C Cloud Agent — bootstrap install readiness (read-only checklist)

**Status:** `READINESS_CHECKLIST` · **NOT** an install authorization  
**Production mutation:** **None** until a separate owner-authorized VPS change  
**Repository baseline:** `main` @ `7d44f861…` (merged #1991)

Use this checklist **before** scheduling the one-time fixed bootstrap install on Production. Complete items from repository + operator records only — **do not** infer VPS state without read-only audit when authorized.

Install procedure (when authorized): [VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md](./VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md)  
Operational context: [PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md](../PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md)

---

## 1. Pinned executor prerequisites

| # | Requirement | Verify (read-only or repo) |
|---|-------------|----------------------------|
| 1.1 | `vo5c-pinned-executor.env` exists on VPS (`/opt/synqdrive/shared/`) | `source` + `SYNQDRIVE_PINNED_EXECUTOR_ROOT` / `SYNQDRIVE_PINNED_EXECUTOR_SHA` |
| 1.2 | Pin SHA **C** contains R4.2+ artifacts (`vo5c-cloud-agent-pinned-deploy-bootstrap.sh`, `vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh`, impl/session libs) | `git -C "$SYNQDRIVE_PINNED_EXECUTOR_ROOT" cat-file -e <path>` or tree listing |
| 1.3 | Pin promotion is **separate** from bootstrap install | No assumption that merge #1991 installed bootstrap on VPS |

---

## 2. SSH access contract (Cloud Agent + operator)

| # | Requirement | Verify |
|---|-------------|--------|
| 2.1 | Login principal `synqdrive-admin` @ `srv1374778.hstgr.cloud:22` | `cloud-agent-ssh-preflight.sh` or manual BatchMode SSH |
| 2.2 | Authorized SSH identity (baked key or provisioned secret) | `cloud_agent_require_ssh_identity` / fingerprint policy |
| 2.3 | **Trusted host key** in `known_hosts` (or `CLOUD_AGENT_SSH_KNOWN_HOSTS_FILE`) | Fingerprint matches Hostinger / prior operator record — **no** blind keyscan on production deploy path |
| 2.4 | Fail-closed preflight passes | `bash .cursor/scripts/cloud-agent-ssh-preflight.sh` |

---

## 3. Sudoers contract (separate VPS change)

| # | Requirement | Verify |
|---|-------------|--------|
| 3.1 | Dedicated sudoers drop-in: **only** `/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh` | `visudo` / config management review |
| 3.2 | `synqdrive-admin` may `sudo -n -H` that path only | On VPS: `sudo -n -H … --preflight-check` (after install) |
| 3.3 | No sudo grant for pin env, session file, or pinned runner scripts | Sudoers file audit |

---

## 4. Bootstrap artifacts and SHA256 manifest

| # | Requirement | Verify |
|---|-------------|--------|
| 4.1 | Bootstrap script installed `750` root:root at shared path | `stat` mode/owner |
| 4.2 | Co-installed verify lib `600` root:root | `stat` |
| 4.3 | `vo5c-cloud-agent-pinned-deploy-bootstrap.manifest.env` binds SHA256 of bootstrap, verify lib, impl/session libs to pin **C** | Manifest writer + offline selftest contract |
| 4.4 | R4.2 pre-source integrity runs **before** any `source` of pin-tree libraries | `vo5c-cloud-agent-pinned-bootstrap.selftest.sh` PASS on CI / operator workstation |

---

## 5. Bootstrap preflight (post-install, read-only)

| # | Requirement | Expected |
|---|-------------|------------|
| 5.1 | `sudo -n -H /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh --preflight-check` | Exit `0` |
| 5.2 | Cloud Agent `cloud-agent-deploy.sh` without session | Exit `42` (auth), **not** `44` (bootstrap missing) |
| 5.3 | Missing sudo | Exit `48` |

---

## 6. Deploy path safety (unchanged by bootstrap alone)

| # | Requirement | Notes |
|---|-------------|--------|
| 6.1 | Human authorization via VPS session file or operator shell | Agents never set `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1` on agent host |
| 6.2 | Exact 40-char `SYNQDRIVE_REQUESTED_DEPLOY_SHA` + admitted CI | Fail-closed git preflight on agent |
| 6.3 | Pinned runner only — legacy `/current/.../vps-deploy-release.sh` blocked | P4B15 when enforcement armed |
| 6.4 | Rolling replicas **A/B** (3001/3002) + P4B16 attestation | Exit `3` = partial — reconcile before success |
| 6.5 | VO5C rollback eligibility on promotion failure | [ROLLBACK_AND_CONTAINMENT.md](../ROLLBACK_AND_CONTAINMENT.md) |

---

## 7. Production replicas and parallel workstreams

| # | Confirmation |
|---|--------------|
| 7.1 | Bootstrap install does **not** require application redeploy by itself |
| 7.2 | No change to EXP021 Gate-6, GLOBAL_KILL, APDS epoch, or Battery publication unless **separately** authorized |
| 7.3 | RFRF / vehicle-onboarding / DIMO workstreams are **not** blocked by doc-only R6; runtime unchanged until install + authorized deploy |

---

## 8. Rollback (bootstrap)

| # | Action |
|---|--------|
| 8.1 | Remove sudoers drop-in (authorized) |
| 8.2 | Remove shared bootstrap, verify lib, manifest |
| 8.3 | Cloud Agent returns to exit `44` (bootstrap missing) — **fail-closed** |

Evidence after install: append operator notes to install doc § “Production validation” — not claimed in this checklist.

---

## Offline repository tests (reference)

Run on a workstation (not Production):

```bash
bash .cursor/scripts/cloud-agent-ssh-common.test.sh
bash .cursor/scripts/cloud-agent-deploy.outcome.selftest.sh
bash .cursor/scripts/cloud-agent-deploy.contract.selftest.sh
bash backend/scripts/ops/vo5c-cloud-agent-pinned-bootstrap.selftest.sh
```

Passing offline tests are **necessary** but **not sufficient** for Production install sign-off.
