# Pinning & attestation

## Pin configuration (VPS)

- **File:** `/opt/synqdrive/shared/vo5c-pinned-executor.env` (root:root `0600`)
- **Keys:** `SYNQDRIVE_PINNED_EXECUTOR_ROOT`, `SYNQDRIVE_PINNED_EXECUTOR_SHA`
- **Trees:** `/opt/synqdrive/shared/pinned-executor/<full-sha>/` (git checkout at exact SHA)

## Integrity contract

`vps_vo5c_verify_executor_tree_integrity`:

- `HEAD` must equal declared pin SHA
- `backend/scripts/ops` must be **git-clean** (no chmod-induced drift)
- Tracked security paths must exist at `HEAD`

**Implication:** Production pins cannot rely on `chmod +x` on `vps-deploy-release.sh` (git mode **100644**). The pinned runner must invoke deploy via **`exec bash`** (DSRG-01).

## Attestation layers

| Field | Meaning | Must align with |
|-------|---------|-----------------|
| `git -C current rev-parse HEAD` | Release tree identity (when `.git` present) | Symlink target after deploy |
| `SYNQDRIVE_DEPLOYED_GIT_SHA` | Declared deploy attestation in `backend.env` | **P4B16:** commit only after post-deploy verify (**today:** manual / stale risk — see R0 audit) |
| `SYNQDRIVE_REQUESTED_DEPLOY_SHA` | Admitted deploy target | Clone + `TARGET_SHA` invariant in `vps-deploy-release.sh` |
| `SYNQDRIVE_DEPLOY_IN_PROGRESS_SHA` | Rolling target marker | **NOT_IMPLEMENTED** (P4B16 design) |
| `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` | APDS authorized release | **Independent** workflow; **never** auto-updated by deploy/attestation |

**P4B16 R0 evidence:** [`evidence/P4B16_R0_PRODUCTION_ATTESTATION_AUDIT.md`](evidence/P4B16_R0_PRODUCTION_ATTESTATION_AUDIT.md) · [`evidence/P4B16_R0_ATTESTATION_DESIGN.md`](evidence/P4B16_R0_ATTESTATION_DESIGN.md)

**PM2 note:** Updating `backend.env` does **not** reload in-memory `process.env` in running Node processes; attestation commit must align with **verified** restart on target release tree, not file write alone.

## Production pin lineage (VPS)

| Pin SHA | Role | Status |
|---------|------|--------|
| `dc30d2c91e458603c7d45ba2e25c1ca0a1d0c672` | Pre-P4B15 bootstrap | Preserved on disk |
| `40c6dd99d60cb07575bcb687586c66c50651e213` | P4B15 merge (P6) | Preserved; superseded in config |
| `448a88985b78b6a7c4d973913b9a6213bae3e9b4` | DSRG-01 merge (#1970) | **Active** in `vo5c-pinned-executor.env` |

## Seal notes

- Prefer **git-clean** ops trees over `chmod +x` on `vps-deploy-release.sh` (mode 100644).
- Invoke runner only from `$PINNED_EXECUTOR_ROOT/backend/scripts/ops/`.
- `chattr +i` not applied until OS activation phase (R2 seal: absent).
- Side-by-side old pin directories retained for rollback forensics.
