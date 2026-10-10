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
| `git -C current rev-parse HEAD` | Running app | Replica processes |
| `SYNQDRIVE_DEPLOYED_GIT_SHA` | Declared deploy attestation in `backend.env` | Live release after successful deploy (P4B16 target) |
| `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` | APDS authorized release | **Independent** workflow; never auto-updated on deploy |

## P6 seal notes

- New pin directory `555` root:root; parent `755` root:root
- `chattr +i` not applied until OS activation phase
- dc30 tree preserved side-by-side
