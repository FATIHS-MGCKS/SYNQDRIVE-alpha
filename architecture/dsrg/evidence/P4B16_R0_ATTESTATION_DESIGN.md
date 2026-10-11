# P4B16 R0 — Release attestation design (proposed)

**Status:** `PROPOSED` — no runtime script changes in R0.  
**Pin for future execution:** `448a88985b78b6a7c4d973913b9a6213bae3e9b4` (new logic ships via **main → pin promotion → authorized deploy**).

## Root cause (repository + production)

1. `vps-deploy-release.sh` ends after `vps_replica_verify_post_deploy` **without** writing `SYNQDRIVE_DEPLOYED_GIT_SHA` to `/opt/synqdrive/shared/backend.env`.
2. `backend.env` is **shared** across releases (`ln -sfn` into each release). Edits persist; PM2 **does not** reload `process.env` when the file changes — only **restart** picks up file contents loaded at process start (and only for vars read at bootstrap unless explicit reload).
3. Deploy verification uses **release tree git** (`vps_replica_release_sha`) and **current symlink**, not the attestation env var.
4. Consumers (APDS operator CLI, VO5C master offboard gates, frontend build-time `VITE_*`) can therefore observe **stale or divergent** attestation vs running tree.

## Variable classification

| Variable | Status | Writer (today) | Reader (today) |
|----------|--------|----------------|----------------|
| `SYNQDRIVE_REQUESTED_DEPLOY_SHA` | **EXISTING** | Operator / `cloud-agent-deploy.sh` / selftests | `vps-deploy-release.sh`, preflight, admission libs |
| `SYNQDRIVE_DEPLOYED_GIT_SHA` | **EXISTING** (manual / ops) | **No automated deploy writer** | APDS epoch CLI/authority, VO5C offboard admission, `.env.example` |
| `SYNQDRIVE_DEPLOY_IN_PROGRESS_SHA` | **NOT_IMPLEMENTED** | — | P4B15 design only |
| `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` | **EXISTING** | Separate APDS ops / manual env | APDS activation authority (**must not** be updated by P4B16) |

## Durable state contract (proposed)

**Primary file:** `/opt/synqdrive/shared/deploy-state/release-attestation.env` (new, root-owned `0640`).

| Key | Meaning |
|-----|---------|
| `ATTESTATION_PHASE` | Lifecycle enum (below) |
| `REQUESTED_SHA` | Target admitted at deploy start |
| `IN_PROGRESS_SHA` | Active rollout target (equals REQUESTED during deploy) |
| `CURRENT_SYMLINK_SHA` | Last observed `git -C current HEAD` |
| `REPLICA_A_OBSERVED_SHA` | Post-restart observation |
| `REPLICA_B_OBSERVED_SHA` | Post-restart observation |
| `COMMITTED_SHA` | Written only after full verification |
| `PREVIOUS_COMMITTED_SHA` | Prior COMMITTED before this deploy |
| `CORRELATION_ID` | Matches `SYNQDRIVE_DEPLOY_CORRELATION_ID` when set |
| `CAPTURED_AT` / `UPDATED_AT` | ISO-8601 UTC |
| `CHECKSUM` | sha256 of canonical body (excluding CHECKSUM line) |

**Secondary:** extend `last-deploy-state.env` only for rollback rollback pointers (keep VO5C floor semantics).

### Lifecycle (`ATTESTATION_PHASE`)

| Phase | Entry | Exit |
|-------|-------|------|
| `PREPARED` | Deploy admitted; pre-switch state captured | Rolling restart starts |
| `IN_PROGRESS` | First replica restart for target | All replicas healthy on target OR failure |
| `VERIFIED` | `vps_replica_verify_post_deploy` PASS | Atomic commit started |
| `COMMITTED` | Attestation + `SYNQDRIVE_DEPLOYED_GIT_SHA` updated **after** verify | Next deploy PREPARED |
| `FAILED` | Rolling or verify abort | Rollback or manual containment |
| `ROLLBACK_IN_PROGRESS` | `vps_replica_rollback` started | Rollback verify pass/fail |
| `ROLLED_BACK` | Rollback verify PASS | Reconcile attestation to `PREVIOUS_SHA` |
| `CONTAINED` | Rollback denied / unsafe / partial | Human break-glass |

**Fail-closed:** Readers treat `REQUESTED_SHA != COMMITTED_SHA` or `CURRENT_SYMLINK_SHA != COMMITTED_SHA` as **not COMMITTED** (mixed or stale), unless phase is `IN_PROGRESS` / `ROLLBACK_IN_PROGRESS`.

## Atomic commit design

1. **Never** set `COMMITTED` before `vps_replica_verify_post_deploy` succeeds (including scheduler convergence + no mixed SHA).
2. Write new env to `backend.env.new` + `release-attestation.env.new` with backup `*.bak-<ts>`.
3. Record checksum file `release-attestation.env.sha256`.
4. `mv` atomically into place (same filesystem).
5. **Do not** claim PM2 env updated until replicas restarted **after** commit (deploy path already restarted; commit runs **after** verify — order: verify running processes on target SHA, then commit attestation to match **tree**, not vice versa).
6. Optional: emit metrics/log line `synqdrive_deploy_attestation_committed{sha=...}`.

## Rollback reconciliation

On successful `vps_replica_rollback`:

- Set phase `ROLLED_BACK`
- Set `COMMITTED_SHA` = `PREVIOUS_SHA` from rollback state file (from git in previous release dir)
- Update `SYNQDRIVE_DEPLOYED_GIT_SHA` to match **only after** rollback verify PASS
- Clear `IN_PROGRESS_SHA`
- On rollback **denied** (security floor): phase `CONTAINED`, do **not** mutate attestation to target SHA

## Crash recovery

- On deploy script start: if phase is `IN_PROGRESS` and `UPDATED_AT` older than threshold → fail-closed or require `--recover-attestation` human flag.
- Re-read `current` symlink + git HEAD + replica health; reconcile or enter `CONTAINED`.
- Idempotent commit: if `COMMITTED_SHA == REQUESTED_SHA` and verify passes, no-op success.

## Lock semantics

- Exclusive lock file `deploy-state/.attestation.lock` (flock) held for IN_PROGRESS→COMMITTED window.
- Duplicate deploy: second writer aborts if lock held.

## Implementation boundaries (follow-up phases)

| Layer | P4B16 change |
|-------|----------------|
| **Main repo** | New `lib/vps-release-attestation.lib.sh`; hooks in `vps-deploy-release.sh` + `vps_replica_rollback` |
| **Application release** | Deploy runs **candidate** release copy of scripts (already sourced from `RELEASE_OPS_DIR`) |
| **Pinned executor** | Must promote pin containing P4B16 before pinned-runner production use |
| **Not in P4B16** | APDS pin, Gate-6, RFRF, enforcement, sudoers |

## Non-interference (mandatory)

- **No write** to `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` from attestation module.
- **No** APDS epoch activation/side effects.
- **No** EXP021 Gate-6 open/rekill.
- **No** RFRF stage changes.
- **No** VO5C product admission flag mutation.
- **No** enforcement / authority file / armed stamp installation.

`BREAK_GLASS_READY` remains `NOT_VERIFIED`.

## Alerting thresholds (proposed)

| Condition | Severity |
|-----------|----------|
| `COMMITTED_SHA` ≠ `git -C current HEAD` > 5 min | CRITICAL |
| Phase `IN_PROGRESS` > 30 min | WARNING |
| Phase `CONTAINED` | PAGE |
| `SYNQDRIVE_DEPLOYED_GIT_SHA` ≠ `COMMITTED_SHA` | CRITICAL |
