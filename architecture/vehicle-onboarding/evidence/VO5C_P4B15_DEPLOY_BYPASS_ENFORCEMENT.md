# VO5C P4B15 — Deploy bypass enforcement engineering

**Mode:** CODE_ENGINEERING_AND_OFFLINE_TESTS_ONLY  
**Production enforcement:** NOT activated in this change set.

## Bypass entrypoint inventory

| Entrypoint | Class | Can change `current` | Restarts replicas | Prisma migrate | Restore prior release | Bypass pinned executor | Bypass human auth |
|------------|-------|---------------------|-------------------|----------------|----------------------|------------------------|-------------------|
| `vps-deploy-release.sh` | A | YES | YES | YES | via `ROLLBACK_ON_FAIL` | YES (today) / NO (when authority file active) | partial (VO5C admission) |
| `vps-vo5c-run-pinned-security-deploy.sh` | A | YES (via pinned exec) | YES | YES | guarded rollback | NO | requires `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1` |
| `vps-vo5c-first-security-deploy-preflight.sh` | A (gate) | NO | NO | NO | NO | N/A | NO |
| `.cursor/scripts/cloud-agent-deploy.sh` | A (CI/SSH) | YES (shallow-fetch deploy) | YES | YES | NO | YES (today) / blocked when authority active | NO |
| `di-v0-s4-exact-rc-attestation-deploy-production.sh` | A (EXP021) | YES when `EXECUTE_DEPLOY=1` | YES | YES | NO | YES (today) / redirects fail-closed when authority active | `OPERATOR_ACK` only |
| `vps-rollback-production-release.sh` | B | YES | YES | NO | YES | N/A (not deploy) | NO (security floor guard) |
| `vps-deploy-release.sh` `ROLLBACK_ON_FAIL` | B | YES | YES | NO | YES | inherits executor | guard via release ops lib |
| `rfrf-production-rollback.sh` | C | env-stage only | YES | NO | feature flags | N/A | RFRF plan validation |
| `vps-deploy-connectivity-staging.sh` | D | YES (staging path) | YES | YES | NO | YES | NO |
| `di-v0-s4-gate6-open-rekill-production.sh` | E | NO | NO | NO | NO | N/A | emergency kill |
| PM2 manual / `pm2 resurrect` | E | indirect | YES | NO | dump risk | YES | YES (root) |

Rollback procedures are **not** equivalent: class B uses deploy-state capture; class C (RFRF) mutates `backend.env` rollout stages with fail-closed recovery; deploy enforcement must not disable RFRF traps or security-floor rollback guards.

## Authority boundary design

1. **Pinned executor SHA** — `SYNQDRIVE_PINNED_EXECUTOR_SHA` in root-owned `/opt/synqdrive/shared/vo5c-production-deploy-authority.env`.
2. **Release target SHA** — existing `SYNQDRIVE_REQUESTED_DEPLOY_SHA` + `vps_vo5c_assert_deploy_target_admitted`.
3. **Security-floor ancestry** — `vps_vo5c_verify_ancestry_includes_floor` on pinned executor and requested target.
4. **Executor-tree integrity** — `vps_vo5c_verify_executor_tree_integrity` including P4B15 lib in tracked paths.
5. **Human deploy authorization** — `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1` (set only at pinned runner entry; not auto-set by cloud-agent).
6. **No implicit current fallback** — when enforcement active, executor root must equal pinned root (blocks `/opt/synqdrive/current/.../vps-deploy-release.sh`).
7. **No caller-controlled enforcement bypass** — `VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE` read only from authority file (selftest may redirect file path when `SYNQDRIVE_VO5C_DEPLOY_SELFTEST=1`).
8. **Legacy rollback** — still blocked below security floor via existing replica lib guards.
9. **PM2 dump** — `vps_vo5c_log_unsafe_rollback_containment` / resurrect disabled paths unchanged.
10. **APDS / EXP021 / RFRF** — deploy enforcement is pre-promotion only; no APDS epoch pin mutation; S4F-7Q wrapper fails closed to pinned runner when enforcement active; RFRF script untouched.

### OS-level privilege boundary (required for production activation)

Script guards alone do not stop a root shell from editing trees or invoking deploy directly. Production activation requires (see `vo5c-production-deploy-privilege-boundary.sudoers.example`):

- Immutable root-owned pinned executor directory.
- Authority file `0444` root:root.
- CI/cloud-agent refuses shallow-fetch deploy when authority active.
- sudoers / service account: **only** `vps-vo5c-run-pinned-security-deploy.sh` for routine deploy role.
- Break-glass: separate root-only emergency containment (class E), audited.

**ROOT_BYPASS_RISK:** HIGH until sudoers + immutable pinned tree + authority file are installed and `VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=1` is set with SRE sign-off.

## P4B15 R2 security findings (offline)

| ID | Finding | Preconditions | Mitigation in PR |
|----|---------|---------------|------------------|
| A | Caller `SYNQDRIVE_VO5C_DEPLOY_SELFTEST` could redirect authority file | Attacker exports selftest env before invoking deploy | Removed from production lib; selftest uses harness-only function override |
| B | Authority load failure treated as inactive | Present but unreadable/malformed authority file | Fail closed when file exists; invalid `ACTIVE` flag denied |
| C | `!env_reset` sudoers example | Compromised operator env inherits into root sudo | Example uses `env_reset`, `secure_path`, `!setenv`, wrapper script |
| D | `vps-deploy-connectivity-staging.sh` promotes `current` | Enforcement inactive or root bypasses script guard | `vps_vo5c_assert_protected_deploy_entry_authority` + OS chmod deny list |
| E | Cloud-agent shallow-fetch deploy | Enforcement inactive or SSH root | Remote pre-check; blocks when authority active or invalid |
| F | Pinned executor `dc30d2c` lacks P4B15 lib | `ENFORCEMENT_ACTIVE=1` before executor promotion | Promotion required before activation; dc30 is ancestor of `7f47c9f` app target |

## Release attestation gap (P4B16 scope)

Observed: `SYNQDRIVE_DEPLOYED_GIT_SHA=dc30d2c…` while replicas run `7f47c9f…` (mixed-replica rolling deploy without post-deploy attestation sync).

**Proposed permanent sync (design only):**

1. At end of successful `vps-deploy-release.sh` promotion, write `SYNQDRIVE_DEPLOYED_GIT_SHA=<REQUESTED_SHA>` into shared `backend.env` atomically (backup + checksum) **after** both replicas report ready on the same target SHA.
2. During mixed-SHA rolling window, expose `SYNQDRIVE_DEPLOY_IN_PROGRESS_SHA` + per-replica SHA in deploy state file; attestation readers must treat mismatch as `IN_PROGRESS` not `STALE`.
3. Independent evidence: `git -C $(readlink -f /opt/synqdrive/current) rev-parse HEAD` compared to env attestation; fail-closed monitoring alert on divergence > TTL.
4. **Never** auto-update `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` — separate APDS authorization workflow.

## Implementation

- `lib/vps-vo5c-production-deploy-bypass-enforcement.lib.sh`
- Wired in `vps-deploy-release.sh` (when VO5C libs present)
- `di-v0-s4-exact-rc-attestation-deploy-production.sh` fail-closed redirect
- `cloud-agent-deploy.sh` remote pre-check
- Offline selftest: `vps-vo5c-p4b15-production-deploy-bypass-enforcement.selftest.sh`

## Production enforcement activation (not done in P4B15)

1. Merge PR and deploy new ops scripts via pinned runner (authorized).
2. Install `/opt/synqdrive/shared/vo5c-production-deploy-authority.env` from example with `ENFORCEMENT_ACTIVE=0` first; validate pinned preflight.
3. Apply sudoers / file permissions per SRE runbook.
4. Flip `VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=1` with dual human approval.
5. Negative test: direct `vps-deploy-release.sh` from current must abort; pinned runner must succeed.
