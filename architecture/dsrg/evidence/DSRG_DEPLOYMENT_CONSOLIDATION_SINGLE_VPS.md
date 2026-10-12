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
| Cloud Agent remote | `sudo -n -H` fixed bootstrap + **only** `REQUESTED_DEPLOY_SHA` (or `--preflight-check`); no tar-stream |
| Sudoers | Dedicated NOPASSWD for bootstrap path only (`synqdrive-admin`) — see install doc |
| Bootstrap install | One-time operator procedure: [`VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md`](VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md) — **not executed in repo PRs** |
| Session format | `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1`, exact 40-char `AUTHORIZED_REQUESTED_SHA`, finite `AUTHORIZED_UNTIL_EPOCH` (≤ 1800s TTL); parsed line-by-line (**not** `source`d) |
| Revocation | `sudo rm -f /opt/synqdrive/shared/vo5c-operator-deploy-session.env` after deploy or on abort |
| Pin | `/opt/synqdrive/shared/vo5c-pinned-executor.env` |
| Runner | `${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops/vps-vo5c-run-pinned-security-deploy.sh` |
| Deploy | `exec bash` pinned `vps-deploy-release.sh` with `SYNQDRIVE_REQUESTED_DEPLOY_SHA` |
| Staged checkout (same VPS) | `SYNQDRIVE_STAGED_RELEASE_ROOT` for preflight/admission only |

## Legacy path changes (repository)

| Path | Consolidation |
|------|----------------|
| `.cursor/scripts/cloud-agent-deploy.sh` | SSH invokes fixed VPS bootstrap only; exit **44** if bootstrap not installed; **no** tar-stream; blocks legacy shallow-fetch / `vps-deploy-release.sh` override; exit `42` without session; `2` public health; preserves remote `3`/`4` |
| `vo5c-cloud-agent-pinned-deploy-bootstrap.sh` | Root-owned `750` + manifest SHA256 + pin commit binding; loads impl from pinned tree |
| `vps-deploy-connectivity-staging.sh` | Fail-closed unless `SYNQDRIVE_VO5C_CONNECTIVITY_STAGING_ALLOW=1` (production-mutating break-glass) |
| `vps-deploy-release.sh` | `DEPLOY_OUTCOME` + immutable exit `4` when post-deploy monitoring refresh fails |

## Fail-closed until VPS bootstrap installed

Cloud Agent production deploy **must not** run until operators install and verify the fixed bootstrap on the existing VPS (see install doc). No fallback to tar execution, shallow-fetch, `/current` executor, or agent-supplied root scripts.

## Preserved invariants

- VO5C security floor, rollback guards, P4B15 bypass table when enforcement armed
- APDS `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` independent of deploy attestation
- EXP021 Gate-6 / RFRF / Battery isolated CI and activation gates unchanged
- No agent auto-authorization

## Offline validation

```bash
bash .cursor/scripts/cloud-agent-deploy.contract.selftest.sh
bash .cursor/scripts/cloud-agent-deploy.outcome.selftest.sh
bash backend/scripts/ops/vo5c-cloud-agent-pinned-bootstrap.selftest.sh
bash backend/scripts/ops/vps-deploy-monitoring-outcome.selftest.sh
bash backend/scripts/ops/vps-vo5c-p4b15-production-deploy-bypass-enforcement.selftest.sh
bash backend/scripts/ops/vps-release-attestation*.selftest.sh
bash architecture/dsrg/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```
