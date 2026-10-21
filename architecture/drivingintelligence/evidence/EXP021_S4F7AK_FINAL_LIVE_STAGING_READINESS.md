# EXP-021 S4F-7AK — Final live Tiny staging readiness & human authorization gate (read-only)

**Date (UTC):** 2026-10-08  
**Scope:** Read-only Production observation + `main` authority reconciliation after merges **#1930**, **#1932**, **#1934**, **#1937**. **Does not** mint JIT, `AUTHORIZED_*`, `DI_S4F7Y_LIVE_STAGING_AUTHORIZED`, or run `DRY_RUN=0`.

**Observation transcript (sanitized):** `/opt/cursor/artifacts/s4f7ak-production-readonly-observation.log` (agent artifact; not committed).

---

## 1. Git authority

| Check | Result |
|-------|--------|
| `CURRENT_MAIN_SHA` | `7da67fbac8b21335a72ce42117a38cc7a3ab2b08` (#1937 evidence merge) |
| `PR1930` / `PR1932` / `PR1934` / `PR1937` | **Merged** (reachable on `main`) |
| `CERTIFIED_TOOL_SHA` | `ed78748bc9493cdc8da56000e333e4940114f9f1` |
| Six-file blob parity @ `ed78748bc…` on `main` | **PASS** (`S4F7AI` pin lib + seal) |
| Shared ops dependency paths @ `ed78748bc…` | **PRESENT** |
| Semantic ops change on `main` since seal | **NONE** on six operator paths (docs-only deltas on `main` since #1937) |
| `DRY_RUN_BOOTSTRAP` | `.cursor/scripts/cloud-agent-s4f7ai-fresh-jit-production-dry-run.sh` (SHA256 `d380c3119cd028aa2afa2cf9ab335d27977f3b5149b819c4ca38d99cfa73d871`) |

---

## 2. Production observation @ 2026-10-08T21:09:35Z

| Field | Current (read-only) | S4F-7AJ certified reference |
|-------|---------------------|-----------------------------|
| `CURRENT_PRODUCTION_SHA` | `3b557e208c1a06e91c0a13fb8ba861b1255ee375` | **SAME** |
| `CURRENT_RELEASE_ID` | `20261008182454_v4994` | **SAME** |
| `CURRENT_BACKEND_ENV_SHA256` | `03179b0cc59f933e2db5dcc42710edce8c08ac2e91cdcafa70c376064e14e6c8` | `778da0aa6e5205e8b81da7fd9061b6f8526438e0d46005ad02474b3d52afeb24` (**DRIFT**) |
| Replica A/B PID | `2183193` / `2183206` | `2174936` / `2174949` (**DRIFT** — restarts after dry-run) |
| Health A/B | HTTP **200** / **200** | — |
| Attestation A/B | **PRESTATE**, fp `b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d`, v1, sample **1** | **MATCH** (parity **YES**) |
| `GLOBAL_KILL_STATE` | **KILLED** | **MATCH** |
| S4 pipeline / work items | **0** / **0** | **MATCH** |
| Six S4 enable flags | **OFF** | **MATCH** |
| Three Tiny staging keys | **MISSING** | **MATCH** |
| Tiny vehicle / org | `c10351f8-b6a2-4258-947f-631aeaa6d359` **ACTIVE** / `faa710c9-6d91-4079-a7d5-91fdccdec14a` **LTE_R1** | **MATCH** |
| Scheduler leaders | **1** | **MATCH** |
| NGINX | `nginx -t` **PASS**; dual upstream **YES** | — |
| Redis | **REACHABLE** | — |
| DIMO global budget | **1** on A and B | — |

**Deployed operator blobs @ release `3b557e208…` vs certified `ed78748bc…`:**

| Path | Parity |
|------|--------|
| `di-v0-s4-fresh-tiny-staging-production-cli.ts` | **MATCH** |
| `di-v0-s4-fresh-tiny-staging-live-authority.lib.ts` | **MATCH** |
| `di-v0-s4-fresh-tiny-staging-live-poststate.lib.ts` | **MATCH** |
| `di-v0-s4-stage-tiny-fresh-production.sh` | **MISMATCH** (release tree ≠ certified bash wrapper) |
| `di-v0-s4-fresh-tiny-staging-live-transaction.lib.sh` | **MISMATCH** |
| `di-v0-s4-fresh-tiny-staging-production.lib.sh` | **MISMATCH** |

S4F-7AJ **Production `DRY_RUN=1`** used **detached checkout** of `ed78748bc…` via **S4F-7AI bootstrap** (`DRY_RUN=1`-only) — **not** the release-tree bash paths alone.

For a **future live** transaction (`DRY_RUN=0`): **not** S4F-7AI bootstrap — only the certified **S4F-7Y** operator (`di-v0-s4-stage-tiny-fresh-production.sh` + libs) from **detached checkout** `ed78748bc9493cdc8da56000e333e4940114f9f1`, after separate live-dispatch-path review and **new** human authorization. **Do not** invoke staging from `/opt/synqdrive/current` release-tree bash paths alone.

---

## 3. NO_BACKFILL (read-only, observation clock)

| Field | Value |
|-------|--------|
| `DB_CLOCK_CANONICAL_UTC` | `2026-10-08T21:09:59.208Z` |
| `LATEST_COMPLETED_TRIP_END` | `2026-10-08T20:53:16.164Z` |
| Future completed trips | **0** |
| Eligible trips at observation clock | **0** |
| `NO_BACKFILL_HYPOTHETICAL_AT_CLOCK` | **WOULD_PASS** |

**Not authority:** live execution requires **new** `AUTHORIZED_FRESH_NOT_BEFORE` + fingerprint at run time (S4F-7AJ JIT `2026-10-08T20:11:22.464Z` is **expired** and **not reusable**).

---

## 4. Live authorization (explicitly absent)

| Item | Status |
|------|--------|
| S4F-7AF.1C one-shot human grant | **CONSUMED** (failed before mutation) |
| S4F-7AJ JIT | **Historical only** — **do not reuse** |
| `NEW_HUMAN_LIVE_AUTHORIZATION_PRESENT` | **NO** |
| `FRESH_LIVE_JIT_PRESENT` | **NO** |
| `DI_S4F7Y_LIVE_STAGING_AUTHORIZED=YES` | **NOT SET** (this slice) |

Future **Production `DRY_RUN=1`** (if repeated): S4F-7AI bootstrap only (`cloud-agent-s4f7ai-fresh-jit-production-dry-run.sh`).

Future **live** attempt still requires: new human one-shot authorization, fresh DB clock, fresh JIT ≤900s, eight `AUTHORIZED_*` pins bound to **current** Production SHA/env/PIDs, NO_BACKFILL re-proof, and execution from **detached certified tool checkout** `ed78748bc…` via the S4F-7Y live path — **not** S4F-7AI bootstrap.

---

## 5. Technical control matrix (certified vs engineering-only)

| Control | S4F-7AJ Production `DRY_RUN=1` | Engineering tests / review |
|---------|-------------------------------|----------------------------|
| Initial / final DB clock export | **CERTIFIED** | `di-v0-s4-fresh-tiny-staging-live-db-clock-7ag.spec.ts` |
| Fresh-authority fail-closed | **CERTIFIED** (dry-run path) | CLI + wrapper specs |
| CLI exit propagation | **CERTIFIED** (dry-run) | specs |
| Exact three env keys / no unexpected keys | **CERTIFIED** (simulation) | specs |
| Backup before mutation | **NOT PROVEN** on Production | harness |
| Backup integrity check | **NOT PROVEN** on Production | harness |
| A→B rolling restart barrier | **NOT PROVEN** on Production | specs + harness |
| Fresh **OTHER** runtime attestation (live) | **NOT PROVEN** on Production | specs |
| Abort missing replica A attestation | **NOT PROVEN** on Production | specs |
| Final replica B attestation | **NOT PROVEN** on Production | specs |
| Poststate verification | **NOT PROVEN** on Production live | specs |
| Rollback env + restart accounting | **NOT PROVEN** on Production live | S4F-7L historical rollback; Y.2 harness |
| Restore runtime PRESTATE | **NOT PROVEN** after live forward path | engineering |
| Terminal forensics (Y.2) | **NOT PROVEN** on Production live | harness |
| NO_BACKFILL final gate | **CERTIFIED** at S4F-7AJ JIT time; **hypothetical PASS** at observation | SQL + CLI |
| Zero provider calls from staging op | **CERTIFIED** (dry-run) | dry-run counters |

`npm run test:di:s4f7v:fresh-tiny-staging-wrapper` — **131** tests **PASS** on agent @ `main` (2026-10-08).

---

## 6. Deployment freeze

| Topic | Finding |
|-------|---------|
| Technical deploy freeze enforcement | **NO** — no platform lock preventing deploy/migrate/restart |
| Active release | `20261008182454_v4994` @ `3b557e208…` |
| Concurrent deploy observed | **NO** (read-only; recent releases listed) |
| Human freeze coordination | **PENDING** — prior S4F-7AF coordination was organizational, not technically enforced |
| Required before live attempt | Explicit human freeze/deploy window confirmation **in addition to** new live authorization |

---

## 7. Readiness decision

| State | Value |
|-------|--------|
| `ENGINEERING_READY` | **YES** |
| `PRODUCTION_PRESTATE_READY` | **YES** (S4 safety + topology; env/PID pins **stale** vs S4F-7AJ POST) |
| `ROLLBACK_ENGINEERING_READY` | **YES** (code + tests; Production live rollback **unproven**) |
| `HUMAN_LIVE_AUTHORIZATION_PRESENT` | **NO** |
| `FRESH_LIVE_JIT_PRESENT` | **NO** |
| `LIVE_EXECUTION_AUTHORIZED` | **NO** |
| `GATE_6` | **NOT_SATISFIED** |
| `READINESS` | **TECHNICALLY_READY_PENDING_HUMAN_AUTHORIZATION** |

Technical readiness **does not** imply permission to run `DRY_RUN=0`.

---

## 8. Remaining risks

1. **First successful A→B live forward transition never proven** on Production (S4F-7AJ dry-run only).
2. **Release-tree bash operator blobs** on deployed SHA **≠** certified `ed78748bc…` — use **detached checkout** of certified operator (S4F-7AI bootstrap for **`DRY_RUN=1` only**; live requires separate certified S4F-7Y dispatch, not S4F-7AI).
3. **`backend.env` SHA256 and replica PIDs drifted** since S4F-7AJ POST — all `AUTHORIZED_*` pins must be re-minted at execution.
4. **No technical deploy-freeze lock** — concurrent deploy risk remains without human coordination.
5. **S4F-7AF.1C authorization consumed** — new explicit human grant required.
6. **Trip churn** — NO_BACKFILL must be re-evaluated at fresh JIT time.

---

## Machine block

```
EXP021_S4F7AK_FINAL_LIVE_READINESS_RESULT=COMPLETE

CURRENT_MAIN_SHA=7da67fbac8b21335a72ce42117a38cc7a3ab2b08
CERTIFIED_TOOL_SHA=ed78748bc9493cdc8da56000e333e4940114f9f1
TOOL_BLOB_PARITY=PASS_ON_MAIN_AT_CERTIFIED_COMMIT
SHARED_DEPENDENCY_PARITY=PASS

CURRENT_PRODUCTION_SHA=3b557e208c1a06e91c0a13fb8ba861b1255ee375
CURRENT_RELEASE_ID=20261008182454_v4994
CURRENT_BACKEND_ENV_SHA256=03179b0cc59f933e2db5dcc42710edce8c08ac2e91cdcafa70c376064e14e6c8
PRODUCTION_DRIFT_FROM_AJ=YES_ENV_SHA_AND_REPLICA_PIDS

REPLICA_A_HEALTH=HTTP_200
REPLICA_B_HEALTH=HTTP_200
REPLICA_ATTESTATION_PARITY=YES_PRESTATE_MATCH

GLOBAL_KILL_STATE=KILLED
ALL_S4_FLAGS_OFF=YES
THREE_STAGING_KEYS_MISSING=YES
S4_ZERO_STATE=YES
NO_BACKFILL_READINESS=HYPOTHETICAL_WOULD_PASS_AT_OBSERVATION_NEW_JIT_REQUIRED_AT_EXECUTION

SCHEDULER_SINGLE_LEADER=YES
NGINX_DUAL_UPSTREAM=YES
REDIS=REACHABLE
DIMO_GLOBAL_BUDGET=ENABLED_BOTH

INITIAL_DB_CLOCK_PATH=PRODUCTION_DRY_RUN_CERTIFIED_S4F7AJ
FINAL_DB_CLOCK_PATH=PRODUCTION_DRY_RUN_CERTIFIED_S4F7AJ
CLI_EXIT_PROPAGATION=PRODUCTION_DRY_RUN_CERTIFIED_S4F7AJ
BACKUP_READINESS=ENGINEERING_ONLY
ROLLBACK_READINESS=ENGINEERING_ONLY
A_TO_B_RESTART_BARRIER=ENGINEERING_ONLY
LIVE_RUNTIME_OTHER_ATTESTATION_PRODUCTION_PROVEN=NO

DEPLOYED_RELEASE_SIX_FILE_PARITY=PARTIAL_THREE_BASH_MISMATCH_DETACHED_ed78748_CHECKOUT_REQUIRED
S4F7AI_BOOTSTRAP_SCOPE=PRODUCTION_DRY_RUN1_ONLY_NOT_LIVE

DEPLOYMENT_FREEZE_TECHNICALLY_ENFORCED=NO
CONCURRENT_DEPLOYMENTS_ABSENT=YES_OBSERVATION_ONLY
HUMAN_FREEZE_CONFIRMATION=PENDING

AF1C_AUTHORIZATION_CONSUMED=YES
NEW_HUMAN_LIVE_AUTHORIZATION_PRESENT=NO
FRESH_LIVE_JIT_PRESENT=NO

ENGINEERING_READY=YES
PRODUCTION_PRESTATE_READY=YES
ROLLBACK_ENGINEERING_READY=YES
LIVE_EXECUTION_AUTHORIZED=NO

DRY_RUN0_EXECUTED=NO
ENV_MUTATION_OCCURRED=NO
BACKEND_RESTART_OCCURRED=NO
S4_TINY_ACTIVATED=NO
GATE_6=NOT_SATISFIED

READINESS=TECHNICALLY_READY_PENDING_HUMAN_AUTHORIZATION
REMAINING_RISKS=FIRST_LIVE_A_TO_B_UNPROVEN;RELEASE_TREE_BASH_BLOB_DRIFT;STALE_AUTHORIZED_PINS;NO_TECH_FREEZE;AF1C_CONSUMED;TRIP_CHURN
EVIDENCE_PATH=architecture/drivingintelligence/evidence/EXP021_S4F7AK_FINAL_LIVE_STAGING_READINESS.md
PR_NUMBER=PENDING
NEXT_SAFE_ACTION=HUMAN_ISSUES_NEW_ONE_SHOT_LIVE_AUTHORIZATION;CONFIRM_DEPLOY_FREEZE_WINDOW;MINT_FRESH_JIT_AND_AUTHORIZED_PINS_AT_EXECUTION_ONLY;LIVE_VIA_DETACHED_ed78748_S4F7Y_OPERATOR_ONLY;OPTIONAL_FRESH_DRY_RUN1_VIA_S4F7AI_BOOTSTRAP_ONLY
FINAL_RESULT=PASS
```
