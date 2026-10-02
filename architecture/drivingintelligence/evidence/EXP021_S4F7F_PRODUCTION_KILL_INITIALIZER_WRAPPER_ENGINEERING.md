# EXP-021 S4F-7F — Production GLOBAL kill initializer wrapper engineering

**Date:** 2026-10-02 (UTC)  
**Repository `main`:** `24a47282937546f14d7df12b8560d01ae9df801b`  
**Production SHA (execution authority):** `ee9588548845c8077aa0cba0684b06eac7c9d4d2`  
**Production release:** `20261002014651_v4994`  
**Scope:** Engineering + tests + governance only. **No** Production DB/env/deploy/restart.

## Deliverables

| Artifact | Path |
|----------|------|
| Production wrapper entrypoint | `backend/scripts/ops/di-v0-s4-initialize-global-kill-row-production.sh` |
| Bash helpers | `backend/scripts/ops/lib/di-v0-s4-global-kill-init-production.lib.sh` |
| Guard logic + CLI | `backend/scripts/ops/di-v0-s4-global-kill-init-production/di-v0-s4-global-kill-init-production.lib.ts` |
| CLI | `backend/scripts/ops/di-v0-s4-global-kill-init-production/di-v0-s4-global-kill-init-production-cli.ts` |
| Tests | `backend/scripts/ops/di-v0-s4-global-kill-init-production/di-v0-s4-global-kill-init-production.lib.spec.ts` |
| npm script | `npm run test:di:s4f7f:kill-init-wrapper` |

## Architecture: main vs deployed release

- Wrapper **may** be executed from a **newer** checkout (e.g. current `main`) on the VPS operator path.
- **DB mutation authority** remains the initializer under the **verified release tree**:
  - `VERIFIED_RELEASE_DIR/backend/scripts/ops/di-v0-s4-initialize-global-kill-row.ts`
- Wrapper verifies `readlink -f $SYNQDRIVE_CURRENT_LINK` basename = `DI_S4_KILL_INIT_REQUIRED_RELEASE_ID` and `git rev-parse` = `DI_S4_KILL_INIT_REQUIRED_SHA` before invoke.
- **`WRAPPER_REQUIRES_NEW_CODE_DEPLOY_BEFORE_USE=NO`** — no app deploy required to use the wrapper; only the wrapper script/CLI from the engineering checkout.
- **`NEWER_MAIN_INITIALIZER_SUBSTITUTION_POSSIBLE=NO`** at runtime when guards pass — shell invokes only the deployed-release script path.

## Mandatory guards (pre-mutation)

| Guard | Env / mechanism |
|-------|----------------|
| Human ACK | `DI_S4_KILL_INIT_ACK=YES` (exact) |
| Production SHA | `DI_S4_KILL_INIT_REQUIRED_SHA` vs live release `git rev-parse` |
| Release ID | `DI_S4_KILL_INIT_REQUIRED_RELEASE_ID` vs `basename $(readlink -f current)` |
| Env hash | `DI_S4_KILL_INIT_REQUIRED_ENV_SHA256` vs `sha256sum backend.env` |
| GLOBAL pre-state | `DI_S4_KILL_INIT_EXPECTED_PRESTATE` ∈ `MISSING`, `KILLED` (strict match; `NOT_KILLED` always aborts) |
| Actor / reason | `DI_S4_KILL_INIT_ACTOR`, `DI_S4_KILL_INIT_REASON` (required, non-empty, bounded, no control chars) |
| Topology | Replica health, **steady-state** process release identity (`/proc/<pid>/cwd` vs verified release `backend`), single scheduler leader, nginx dual upstream — **not** post-deploy uptime helper |
| Production DB reads | Fail-closed (`GLOBAL_PRESTATE_READ_FAILED`, `S4_PERSISTENCE_READ_FAILED`); no `\|\| echo 0` / default zeros |
| Deployed release integrity | Git tracked + clean worktree for initializer + kill implementation paths |
| Initializer path pin | `INITIALIZER_SUBSTITUTION_RISK` when resolved initializer escapes verified release `backend/` |
| Metrics | Deployed-release **S4F-4** CLI `fetch-live-metric` + `redis-ping` (`METRICS_BEARER_TOKEN`; `METRICS_AUTH_USED=YES`) |
| Post-write GLOBAL | DB-observed `reason` / `actor` (not request echo) for `INSERTED_KILLED` |
| Remote bootstrap | `.cursor/scripts/cloud-agent-s4-global-kill-init.sh` — temp checkout at `CLOUD_AGENT_S4_KILL_WRAPPER_SHA`, Production runtime pinned separately |
| S4 env | All S4 enable flags off; org/vehicle allowlists effectively **NONE**; `NOT_BEFORE` classified only |
| Global budget | Config `EXPLICIT_ENABLED`; live Prometheus gauge **ENABLED** on A+B; Redis **PONG** (S4F-4 metric authority) |
| S4 persistence | Pre-state counts (defaults 0 via optional `DI_S4_KILL_INIT_EXPECTED_S4_*` env pins) |

## Dry-run

`DRY_RUN=1` runs all feasible guards, prints `INTENDED_INITIALIZER=…`, **`INITIALIZER_INVOKED=NO`**, **`PRODUCTION_DB_WRITE_OCCURRED=NO`**.

## Allowed mutation

Only `di_v0_s4_control` row `GLOBAL` with `kill_state=KILLED`. Outcomes: `INSERTED_KILLED` (first run) or `ALREADY_KILLED` when pre-state explicitly `KILLED`.

## Post-write verification

Read-back GLOBAL row; `POST_WRITE_VERIFY`; env SHA unchanged; S4 table deltas 0; topology re-check. **No** automatic delete on mismatch (`PRESERVE_KILL_ROW=YES`).

## Non-effects

- Not Tiny operator authorization; not `NOT_KILLED`; no S4 activation; no env/PM2/deploy; no provider calls.

## Prior gate

[S4F-7E](EXP021_S4F7E_DB_KILL_INITIALIZATION_PREFLIGHT.md) — `DB_KILL_INITIALIZATION_READINESS` was **BLOCKED** on missing wrapper; this slice closes the engineering gap. **Separate** human authorization still required before Production execution.

## Decision

**`PRODUCTION_KILL_INITIALIZER_WRAPPER_READINESS=PASS`** (engineering). Production GLOBAL row remains **MISSING** until a future authorized execution.

## S4F-7F-1 safety closure (PR #1882)

Engineering hardening only (2026-10-02): fail-closed Production DB reads, steady-state replica identity, S4F-4 authenticated metrics, DB-backed post-write metadata, initializer path pin + worktree clean guards, cloud-agent remote bootstrap without deploy. **No** Production dry-run in this closure.

**`NEXT_ACTION`:** `WAIT_EXACT_HEAD_CI_THEN_HUMAN_MERGE_PR_1882_THEN_RUN_SEPARATE_PRODUCTION_DRY_RUN`
