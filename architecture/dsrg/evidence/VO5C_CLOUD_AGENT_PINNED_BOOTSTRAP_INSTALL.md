# VO5C Cloud Agent — fixed VPS bootstrap (one-time install)

**Status:** `REPOSITORY_CONTRACT` · **NOT** executed in consolidation PRs  
**Production validation:** requires operator evidence after install — **not claimed here**

## Purpose

Replace mutable agent tar-stream root execution with a **fixed**, root-owned bootstrap on the existing Hostinger VPS. Cloud Agent invokes **only**:

```text
/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh <REQUESTED_DEPLOY_SHA>
```

All other paths (`pin` env, operator session, staged root, authority) are **hard-coded** inside the bootstrap implementation shipped from the **pinned executor** tree.

## Artifacts (repository)

| File | Role |
|------|------|
| `backend/scripts/ops/vo5c-cloud-agent-pinned-deploy-bootstrap.sh` | VPS-installed entry (copy to shared) |
| `backend/scripts/ops/lib/vo5c-cloud-agent-pinned-bootstrap.lib.sh` | Logic loaded from **pinned** ops tree after install |
| `backend/scripts/ops/vo5c-cloud-agent-pinned-deploy-bootstrap-write-manifest.sh` | Operator manifest generator |
| `backend/scripts/ops/lib/vo5c-operator-deploy-session.lib.sh` | Session parse-only helper (pinned tree) |

## One-time install (operator, on VPS — do not run from Cloud Agent)

Prerequisites: promoted `vo5c-pinned-executor.env` pointing at release commit **C** that contains these files.

1. Copy bootstrap from pinned tree (example):

   ```bash
   PIN_ROOT="$(source /opt/synqdrive/shared/vo5c-pinned-executor.env && echo "$SYNQDRIVE_PINNED_EXECUTOR_ROOT")"
   sudo install -m 750 -o root -g root \
     "${PIN_ROOT}/backend/scripts/ops/vo5c-cloud-agent-pinned-deploy-bootstrap.sh" \
     /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh
   ```

2. Write manifest (binds bootstrap bytes to commit **C**):

   ```bash
   COMMIT="$(source /opt/synqdrive/shared/vo5c-pinned-executor.env && echo "$SYNQDRIVE_PINNED_EXECUTOR_SHA")"
   sudo bash "${PIN_ROOT}/backend/scripts/ops/vo5c-cloud-agent-pinned-deploy-bootstrap-write-manifest.sh" \
     /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh \
     /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.manifest.env \
     "$COMMIT"
   ```

3. Preflight verification (read-only):

   ```bash
   sudo test -x /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh
   sudo test -f /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.manifest.env
   sha256sum -c <<<"$(grep VO5C_CLOUD_AGENT_BOOTSTRAP_SHA256= /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.manifest.env | cut -d= -f2)  /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh"
   ```

4. **Do not** enable new enforcement flags in this procedure. Manual pinned deploy remains available without Cloud Agent.

## Rollback

```bash
sudo rm -f /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh \
           /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.manifest.env
```

Cloud Agent `cloud-agent-deploy.sh` fails closed with exit **44** when bootstrap is absent. Manual `vps-vo5c-run-pinned-security-deploy.sh` is unchanged.

## Trust boundary

| Layer | Trust |
|-------|--------|
| Cloud Agent | SSH + single SHA argument only; **no** tar, no arbitrary remote script |
| VPS bootstrap | Root-owned `750`, SHA256 manifest, commit-bound to pin |
| Pinned runner | Existing VO5C security floor, session file, P4B16 attestation |

Until install + preflight evidence exists, treat Cloud Agent production deploy as **disabled** (fail-closed).

## Offline test

```bash
bash backend/scripts/ops/vo5c-cloud-agent-pinned-bootstrap.selftest.sh
```
