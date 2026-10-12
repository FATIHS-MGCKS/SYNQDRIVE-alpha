# DSRG — Deployment consolidation (single VPS)

**Status:** `IMPLEMENTED` (repository contract) · **NOT** a production deploy or pin promotion  
**Repository baseline:** `main` @ consolidation PR  
**Production validation:** requires fresh operator evidence after merge — **not claimed here**

## Goal

One Hostinger VPS for production. No second staging VM. Canonical routine path = VO5C pinned runner + admitted SHA + `vps-deploy-release.sh` + replica verification + P4B16 attestation.

## Canonical entrypoint

| Step | Artifact |
|------|----------|
| Human gate (Cloud Agent) | Root-owned `/opt/synqdrive/shared/vo5c-operator-deploy-session.env` only — **never** operator-shell `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED` for `cloud-agent-deploy.sh` |
| Human gate (manual VPS console) | Operator may `export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1` and run `vps-vo5c-run-pinned-security-deploy.sh` from the pinned ops tree |
| Session format | `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1`, exact 40-char `AUTHORIZED_REQUESTED_SHA`, finite `AUTHORIZED_UNTIL_EPOCH` (≤ 1800s TTL); parsed line-by-line (**not** `source`d) |
| Revocation | `sudo rm -f /opt/synqdrive/shared/vo5c-operator-deploy-session.env` after deploy or on abort |
| Pin | `/opt/synqdrive/shared/vo5c-pinned-executor.env` |
| Runner | `${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops/vps-vo5c-run-pinned-security-deploy.sh` |
| Deploy | `exec bash` pinned `vps-deploy-release.sh` with `SYNQDRIVE_REQUESTED_DEPLOY_SHA` |
| Staged checkout (same VPS) | `SYNQDRIVE_STAGED_RELEASE_ROOT` for preflight/admission only |

## Legacy path changes (repository)

| Path | Consolidation |
|------|----------------|
| `.cursor/scripts/cloud-agent-deploy.sh` | Tar-stream pinned delegate over SSH (`printf %q` args); blocks legacy shallow-fetch / `vps-deploy-release.sh` override; allows pinned path when `VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=1`; exit `42` without human auth; `2` public health; preserves remote `3`/`4` |
| `vps-deploy-connectivity-staging.sh` | Fail-closed unless `SYNQDRIVE_VO5C_CONNECTIVITY_STAGING_ALLOW=1` (production-mutating break-glass) |
| `vps-deploy-release.sh` | `DEPLOY_OUTCOME` + immutable exit `4` when post-deploy monitoring refresh fails (`SYNQDRIVE_DEPLOY_MONITORING_FAIL_RC=0` forbidden) |

## Root tar-stream trust boundary (residual risk)

`cloud-agent-deploy.sh` SSHs to the VPS as a privileged user and runs a **mutable** bundle from the agent workspace: `tar` extracts `cloud-agent-vo5c-remote-pinned-deploy.sh` + libs into `mktemp`, then executes that script as root (or via `sudo`).

| Trusted today | Not proven |
|---------------|------------|
| Operator session file on VPS (parse-only, TTL-bound) | Production audit that tar-stream delegate matches a pinned, immutable VPS-installed bootstrap |
| Pinned runner + `vps-vo5c-run-pinned-security-deploy.sh` after delegate sets `SYNQDRIVE_REQUESTED_DEPLOY_SHA` | Compromised agent checkout or SSH key could substitute delegate code **before** pinned ops `exec` |

**Target hardening (not deployed here):** install a fixed bootstrap entrypoint under `/opt/synqdrive/shared/` from a promoted pin (hash-verified); Cloud Agent invokes only that script with quoted args — **no** per-run agent-supplied root script tar-stream. Until that VPS change is separately authorized and evidenced, treat tar-stream as **repository contract only**; do not claim production security validation or enable new enforcement bypasses.

Shared paths under `/opt/synqdrive` are canonicalized (`realpath`) with `..` rejection and parent-symlink escape checks before `mkdir` / staged `git` operations.

## Preserved invariants

- VO5C security floor, rollback guards, P4B15 bypass table when enforcement armed
- APDS `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` independent of deploy attestation
- EXP021 Gate-6 / RFRF / Battery isolated CI and activation gates unchanged
- No agent auto-authorization

## Offline validation

```bash
bash .cursor/scripts/cloud-agent-deploy.contract.selftest.sh
bash .cursor/scripts/cloud-agent-deploy.outcome.selftest.sh
bash backend/scripts/ops/vps-deploy-monitoring-outcome.selftest.sh
bash backend/scripts/ops/vps-vo5c-p4b15-production-deploy-bypass-enforcement.selftest.sh
bash backend/scripts/ops/vps-release-attestation*.selftest.sh
bash architecture/dsrg/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```
