# DSRG SSH RCA — Cloud Agent VPS access (2026-10-12)

## Symptom

EXP021-S4P8 reported VPS access failure with `CLOUD_AGENT_SSH_PRIVATE_KEY` unset and `Permission denied (publickey)` against `root@srv1374778.hstgr.cloud`.

## Verified root cause

**Wrong SSH principal for Hostinger production (path A).** Root SSH is disabled; the authorized principal is **`synqdrive-admin@srv1374778.hstgr.cloud`**.

Contributing gaps:

1. `cloud_agent_ssh_user()` defaulted to `root` when `CLOUD_AGENT_SSH_USER` was unset.
2. Manual agent commands and `AGENTS.md` examples used `root@…` without the Hostinger override.
3. `cloud-agent-verify-vps.sh` only attempted SSH auth when `CLOUD_AGENT_SSH_PRIVATE_KEY` was set, so a working **baked** `~/.ssh/id_ed25519` was never validated.

`CLOUD_AGENT_SSH_PRIVATE_KEY` is **not** required when the Cloud Agent image already contains the authorized private key at `~/.ssh/id_ed25519` (fingerprint SHA256:jI+cmbcM5EvUnkK3iBffxt7phDdqEDd7GTHlhP1LSQQ — no secret material recorded).

## EXP021-S4P8 outcome (production)

**S4P8 production deployment was not executed.** The failed SSH attempt (`root@` + missing runtime secret assumption) stopped before any VPS deploy, pin promotion, GLOBAL_KILL change, or Gate-6 mutation. Owner LIVE_OPEN / deploy authorizations were not consumed by a completed release.

## Remediation (DSRG R5 — integrated on PR #1991 branch)

- Central Hostinger mapping in `cloud-agent-ssh-common.sh` (`root` → `synqdrive-admin` when host matches `*hstgr.cloud*`).
- `cloud-agent-ssh-preflight.sh` — fail-closed identity + auth check.
- `cloud-agent-verify-vps.sh` and `cloud-agent-deploy.sh` use shared identity + auth preflight; deploy fails before git preflight if SSH is wrong.
- **Trusted host-key policy:** Hostinger production (`*hstgr.cloud*`) requires a pre-verified entry in `CLOUD_AGENT_SSH_KNOWN_HOSTS_FILE` or `~/.ssh/known_hosts`. **Blind `ssh-keyscan` append is blocked** on deploy and EXP021 remote bootstrap entrypoints.
- `AGENTS.md` path A documents `synqdrive-admin`, optional runtime secret, and verified host keys.
- VO5C fixed bootstrap + R4.2 pre-source executor integrity on #1991 are **preserved**; SSH layer is additive only.

## Related PRs (not merged in this RCA)

| PR | Role |
|----|------|
| #1983 | Canonical Production VPS access + deploy runbook (DSRG-04) |
| #1991 | VO5C pinned bootstrap + `cloud-agent-vo5c-remote-pinned-deploy` consolidation |

**Canonical deploy path (post R5 integration):** `cloud-agent-ssh-preflight.sh` → `cloud-agent-deploy.sh` → `sudo -n -H` VO5C pinned bootstrap on VPS → `vps-vo5c-run-pinned-security-deploy.sh` (exact SHA, session file, P4B16 attestation). No shallow-fetch `/current` deploy.

## Read-only production snapshot (2026-10-12, post-recovery)

| Check | Value |
|-------|--------|
| Production `/opt/synqdrive/current` | `bc7e80715d09767312b0f389f5cb0978f8ec0dbb` |
| Pinned executor SHA | `bc7e80715d09767312b0f389f5cb0978f8ec0dbb` |
| Replica A/B health | HTTP 200 (3001 / 3002) |
| GLOBAL_KILL | Not queried in this RCA (no Gate-6 mutation) |
| APDS-R5 | Not re-verified in this RCA |

## S4P8 continuation

Owner deploy/LIVE_OPEN authorizations remain valid. Re-run S4P8 Phase 1+ with `bash .cursor/scripts/cloud-agent-ssh-preflight.sh` before VO5C deploy.
