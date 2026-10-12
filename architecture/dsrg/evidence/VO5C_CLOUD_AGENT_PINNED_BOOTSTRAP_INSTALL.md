# VO5C Cloud Agent — fixed VPS bootstrap (one-time install)

**Status:** `REPOSITORY_CONTRACT` · **NOT** executed in consolidation PRs  
**Production validation:** requires operator evidence after install — **not claimed here**

## Purpose

Cloud Agent invokes **only** a fixed VPS bootstrap with a single deploy SHA (no tar-stream, no arbitrary remote scripts):

```text
sudo -n -H /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh <REQUESTED_DEPLOY_SHA>
```

Preflight (from Cloud Agent as `synqdrive-admin`):

```text
sudo -n -H /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh --preflight-check
```

Bootstrap is **root-owned mode `750`** (`rwxr-x---`, group `root`). Non-root SSH users **must not** rely on group membership; they **must** use the sudoers contract below. **No** world (`other`) bits.

## Artifacts (repository)

| VPS path | Repo source |
|----------|-------------|
| `vo5c-cloud-agent-pinned-deploy-bootstrap.sh` | `backend/scripts/ops/vo5c-cloud-agent-pinned-deploy-bootstrap.sh` |
| `vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh` | `backend/scripts/ops/lib/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh` |
| `vo5c-cloud-agent-pinned-deploy-bootstrap.manifest.env` | generated on VPS |
| Pinned impl + session libs | `${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops/lib/…` (hash-bound in manifest) |

## Sudoers contract (separately authorized VPS change)

Install a **dedicated** sudoers drop-in (visudo / configuration management). Example only — adjust after operator review:

```sudoers
Defaults:synqdrive-admin !requiretty
synqdrive-admin ALL=(root) NOPASSWD: /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh
```

Rules:

- **Only** that absolute bootstrap path — no wildcards, no `sudo bash`, no directory.
- Cloud Agent exit **48** when `sudo -n` is denied.
- Do **not** grant sudo to pin env, session files, or pinned runner scripts.

## One-time install (operator on VPS — not Cloud Agent)

Prerequisites: **pinned executor promotion** already points `vo5c-pinned-executor.env` at commit **C** containing R4.1+ bootstrap artifacts.

1. Copy shared install bundle from pinned tree:

   ```bash
   PIN_ROOT="$(source /opt/synqdrive/shared/vo5c-pinned-executor.env && echo "$SYNQDRIVE_PINNED_EXECUTOR_ROOT")"
   sudo install -m 750 -o root -g root \
     "${PIN_ROOT}/backend/scripts/ops/vo5c-cloud-agent-pinned-deploy-bootstrap.sh" \
     /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh
   sudo install -m 600 -o root -g root \
     "${PIN_ROOT}/backend/scripts/ops/lib/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh" \
     /opt/synqdrive/shared/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh
   ```

2. Write manifest (SHA256 binds bootstrap, verify lib, and pinned impl/session libs to **C**):

   ```bash
   COMMIT="$(source /opt/synqdrive/shared/vo5c-pinned-executor.env && echo "$SYNQDRIVE_PINNED_EXECUTOR_SHA")"
   sudo bash "${PIN_ROOT}/backend/scripts/ops/vo5c-cloud-agent-pinned-deploy-bootstrap-write-manifest.sh" \
     /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh \
     /opt/synqdrive/shared/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh \
     /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.manifest.env \
     "$PIN_ROOT" "$COMMIT"
   ```

3. Preflight (as `synqdrive-admin`, read-only):

   ```bash
   sudo -n -H /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh --preflight-check
   ```

4. **Do not** enable new VO5C enforcement flags in this procedure.

## Recovery / rollback

```bash
sudo rm -f /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh \
           /opt/synqdrive/shared/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh \
           /opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.manifest.env
```

Remove the sudoers drop-in when rolling back Cloud Agent deploy. Manual pinned-runner deploy (`SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1` on VPS console) remains available.

Cloud Agent fails closed with exit **44** (bootstrap missing / preflight fail) or **45** (integrity / pin mismatch).

## Trust boundary

| Layer | Trust |
|-------|--------|
| Cloud Agent | SSH + SHA-only via `sudo -n -H` bootstrap |
| Shared bootstrap | Root-owned, manifest SHA256, verify lib co-installed |
| Pinned tree | Impl/session SHA256 + `vps_vo5c_verify_executor_tree_integrity` before `source` |
| Pinned runner | VO5C security floor, session file, P4B16 attestation |

## Offline tests

```bash
bash backend/scripts/ops/vo5c-cloud-agent-pinned-bootstrap.selftest.sh
bash backend/scripts/ops/vo5c-cloud-agent-pinned-bootstrap-execution.selftest.sh
```
