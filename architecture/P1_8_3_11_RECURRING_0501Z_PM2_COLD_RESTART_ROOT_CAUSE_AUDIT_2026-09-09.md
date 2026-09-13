# P1.8.3.11 — Recurring ~05:01Z PM2 Cold-Restart Root-Cause Forensic Audit

**DATE:** 2026-09-09  
**AUDITOR:** Cursor Cloud Agent (read-only production forensics)  
**AUDIT_START_UTC:** `2026-09-09T02:34:00Z`  
**AUDIT_END_UTC:** `2026-09-09T02:39:00Z`  
**METHOD:** Read-only SSH as `synqdrive-admin` with `sudo -n` for log/state inspection — **no deploy, no PM2 mutation, no config change**

---

## Executive summary

The OQ-28 certification-breaking cold restart at **`2026-09-08T05:01:28Z`** was **not** PM2-internal policy, host maintenance, cron, or N=2 architecture failure. It was the **rolling restart phase of an intentional production deploy** initiated **~11 minutes earlier** by a **Cursor Cloud Agent SSH session** running the canonical exact-SHA deploy path.

| Question | Answer |
|----------|--------|
| WHO initiated Sep 8 restart? | Cursor Cloud Agent (`synqdrive-admin` SSH, shared deploy key fingerprint) |
| WHY? | Production deploy of `7b9a7857` (#1570 EXP-021 settlement shadow scheduling) |
| Scheduled / recurring cron? | **NO** — deploy started `04:50:25Z`, ~36s after merge timestamp `04:49:55Z` |
| PM2 caused it internally? | **NO** — SIGINT stop from `vps_replica_rolling_deploy()` |
| Scaling defect? | **NO** — operations/deploy boundary interrupted OQ-28 soak |
| Sep 7 ~05:01Z? | **Separate mechanism** — agent SSH + `sudo bash -s` proximate to PM2 SIGINT restart; **no** `pm2-pre-deploy` / **no** `vps-deploy-release.sh` — causal chain **incomplete** |

**Primary classification (Sep 8 OQ-28 break):** `B` — **CONFIRMED_DEPLOY_INVOCATION**  
**Confidence:** **HIGH** (full causal chain in auth.log + deploy artifacts + PM2 daemon log)

---

## Phase 0 — Authority / git state

| Field | Value |
|-------|-------|
| `LATEST_MAIN_SHA` | `0b91dcd96f68164282a38458242fe8489e0b3b82` |
| `LATEST_MAIN_COMMIT_TIME` | `2026-09-09T04:34:55+02:00` |
| `PR_1586_MERGED` | **YES** |
| `PR_1586_MERGE_SHA` | `43e825cd7943bfa730864cd08b523eb2f1ef6701` (ancestor of current main) |

**Preserved authority:** INC-07 CLOSED · OQ-30 CLOSED · DEC-016 FULLY_PRODUCTION_VALIDATED · OQ-18 CLOSED · OQ-28 PARTIAL · N2_PRODUCTION_CERTIFICATION EARLY

---

## Phase 1 — Restart event inventory

**Forensic window:** `2026-09-01T00:00:00Z` → `2026-09-09T02:39:00Z`  
**Primary sources:** `/root/.pm2/pm2.log` (SIGINT stop/start), Nest bootstrap lines in rotated `synqdrive-out*.log`, `pm2-pre-deploy-*.dump`, `/var/log/auth.log`

### Summary metrics

| Metric | Value |
|--------|-------|
| `RESTART_EVENTS_TOTAL` | **36** replica-A rolling-restart incidents (each typically paired with replica B within ~20s) |
| `RESTART_EVENTS_NEAR_0501Z` | **2** (2026-09-07, 2026-09-08) |
| `DATES_WITH_0501Z_RESTART` | `2026-09-07`, `2026-09-08` |
| `TIME_CLUSTER_CONFIDENCE` | **MEDIUM** — two consecutive calendar days near 05:01Z UTC, **different mechanisms**; not proven daily cron |

### Near-~05:01Z events (detailed)

#### RESTART_01 — 2026-09-07

| Field | Value |
|-------|-------|
| `RESTART_01_TIMESTAMP` | A `2026-09-07T05:01:32Z` / B `2026-09-07T05:01:43Z` |
| `RESTART_01_REPLICA` | A then B (rolling pattern) |
| `RESTART_01_OLD_PID` | A `3881783` / B `3882036` |
| `RESTART_01_NEW_PID` | cold bootstrap (Nest logs ~05:01:40Z A) |
| `RESTART_01_SHA_BEFORE` | `01541c2a` (unchanged) |
| `RESTART_01_SHA_AFTER` | `01541c2a` |
| `RESTART_01_RELEASE_BEFORE` | `20260906213654_v4994` |
| `RESTART_01_RELEASE_AFTER` | same (no new release dir) |
| `RESTART_01_RESTART_KIND` | `PM2_SIGINT_ROLLING` |
| `RESTART_01_CORRELATED_DEPLOY` | **NO** — no `pm2-pre-deploy`, no `db-pre-deploy`, no `vps-deploy-release.sh` in auth.log |
| `RESTART_01_KNOWN_INITIATOR` | **Cloud Agent SSH proximate** — `sudo bash -s` at `05:01:31Z`; no deploy SHA logged |
| `RESTART_01_EVIDENCE` | `pm2.log` SIGINT; auth.log SSH `52.40.48.127`; absent deploy-state artifacts |

#### RESTART_02 — 2026-09-08 (OQ-28 break)

| Field | Value |
|-------|-------|
| `RESTART_02_TIMESTAMP` | A `2026-09-08T05:01:22Z` / B `2026-09-08T05:01:30Z` |
| `RESTART_02_REPLICA` | A then B |
| `RESTART_02_OLD_PID` | A `4120999` / B `4121205` |
| `RESTART_02_NEW_PID` | A `25368` (Nest bootstrap `05:01:27Z`) |
| `RESTART_02_SHA_BEFORE` | `0ba96e03` |
| `RESTART_02_SHA_AFTER` | `7b9a7857` (target of deploy; `current` symlink promoted during deploy) |
| `RESTART_02_RELEASE_BEFORE` | pre-deploy `current` on `0ba96e03` |
| `RESTART_02_RELEASE_AFTER` | `20260908045043_v4994` |
| `RESTART_02_RESTART_KIND` | `DEPLOY_ROLLING_RESTART` |
| `RESTART_02_CORRELATED_DEPLOY` | **YES** — release dir birth `04:50:43Z`, `db-pre-deploy-20260908045043.sql.gz`, `pm2-pre-deploy-20260908050120.dump` |
| `RESTART_02_KNOWN_INITIATOR` | **Cursor Cloud Agent** — auth.log exact-SHA deploy command |
| `RESTART_02_EVIDENCE` | auth.log `04:50:25Z`; pm2-pre-deploy; pm2.log; release `20260908045043` |

### Recurrence statistics (~05:01Z cluster only)

| Metric | Value |
|--------|-------|
| `MEAN_RESTART_TIME_UTC` | `~05:01:27Z` (mean of A-replica stop times) |
| `MIN_RESTART_TIME_UTC` | `2026-09-08T05:01:22Z` |
| `MAX_RESTART_TIME_UTC` | `2026-09-07T05:01:32Z` |
| `MAX_TIME_DEVIATION_SECONDS` | `10` |
| `RECURRENCE_PERIOD_HOURS` | `~24` (only two samples) |
| `RECURRENCE_PATTERN` | **INSUFFICIENT_DATA** for daily cron; Sep 8 correlates with **post-merge deploy**, not wall-clock scheduler |

---

## Phase 2 — Sep 8 causal timeline (04:45–05:15Z)

| T_MINUS | EVENT | SOURCE | INTERPRETATION |
|---------|-------|--------|----------------|
| T-11:00 | SSH polling sessions from Cloud Agent IP ranges (~60s interval from `04:45Z`) | auth.log | Agent connectivity / preflight pattern; not deploy yet |
| T-00:30 | SSH accept `54.201.20.43` | auth.log | Cloud Agent session |
| **T-00:00** | **`sudo bash -c` … `SYNQDRIVE_REQUESTED_DEPLOY_SHA=7b9a7857` … `vps-deploy-release.sh`** | auth.log | **Deploy invocation — canonical DEC-016 path** |
| T+00:18 | `pg_dump synqdrive` (root→postgres) | auth.log | Pre-deploy DB backup → `db-pre-deploy-20260908045043.sql.gz` |
| T+06:29 | `psql` migrate/fix ownership on release `20260908045043` | auth.log | Build/migrate phase |
| T+10:55 | `pm2-pre-deploy-20260908050120.dump` created | deploy-state dir mtime | `vps_replica_capture_deploy_state()` immediately before symlink switch + rolling restart |
| T+10:57 | PM2 SIGINT stop `synqdrive` pid `4120999` | pm2.log | Rolling deploy replica A |
| T+11:03 | Nest cold bootstrap PID `25368` port 3001 | synqdrive-out log | Replica A online on new release |
| T+11:05 | PM2 SIGINT stop `synqdrive-b` pid `4121205` | pm2.log | Rolling deploy replica B |
| T+11:13+ | Post-deploy SSH audit sessions (`bash -s`, read deploy state) | auth.log | Read-only verification after restart — not cause |

**Merge correlation:** commit `7b9a7857` merged `2026-09-08T04:49:55Z` (#1570). Deploy SSH command `04:50:25Z` — **reactive to merge**, not a fixed 05:01Z scheduler.

---

## Phase 3 — `pm2-pre-deploy-*` forensics

| # | Finding |
|---|---------|
| 1 | **Creator file:** `backend/scripts/ops/lib/vps-production-replica.lib.sh` |
| 2 | **Function:** `vps_replica_capture_deploy_state()` |
| 3 | **Invoker:** `backend/scripts/ops/vps-deploy-release.sh` line ~138, immediately before `ln -sfn` + `vps_replica_rolling_deploy()` |
| 4 | **Conditions:** Successful build/boot-check; about to promote release and roll replicas |
| 5 | **Immediately before:** `pm2 save` + copy to `pm2-pre-deploy-$(date -u +%Y%m%d%H%M%S).dump` |
| 6 | **Immediately after:** Symlink promotion + `vps_replica_restart_one()` per replica |
| 7 | **Implies deployment attempt?** **YES** — always paired with rolling deploy path |
| 8 | **Rollback/preflight?** Captured for rollback (`vps_replica_rollback` reads state file); failed deploys before this step leave **no** dump |
| 9 | **Before PM2 stop?** **YES** — snapshot precedes intentional SIGINT rolling restart |
| 10 | **Timestamp reliability?** **HIGH** — UTC `date -u +%Y%m%d%H%M%S`; Sep 8 dump `20260908050120` = `05:01:20Z`, 2s before PM2 stop |

**Call chain:**

```
cloud-agent-deploy.sh → run_remote_deploy()
  → sudo bash -c 'TMP=…; SYNQDRIVE_REQUESTED_DEPLOY_SHA=<sha> bash …/vps-deploy-release.sh'
    → vps_replica_capture_deploy_state()  → pm2-pre-deploy-<ts>.dump
    → ln -sfn <release> /opt/synqdrive/current
    → vps_replica_rolling_deploy() → vps_replica_restart_one() → pm2 restart (SIGINT)
```

---

## Phase 4 — Cron audit

| Field | Value |
|-------|-------|
| `HOST_TIMEZONE` | `Etc/UTC` |
| `CRON_TIMEZONE` | UTC (system) |
| `05:01Z_LOCAL_EQUIVALENT` | `05:01` local |

| CRON_ID | OWNER | SCHEDULE | COMMAND | CAN_TOUCH_SYNQDRIVE | CAN_TOUCH_PM2 | CAN_TRIGGER_DEPLOY | OBSERVED_0501Z |
|---------|-------|----------|---------|---------------------|---------------|-------------------|----------------|
| synqdrive-postgresql-backup | root | `0 2 * * *` | vps-backup-postgresql.sh | backup only | NO | NO | NO |
| synqdrive-clickhouse-backup | root | `30 3 * * *` | vps-backup-clickhouse.sh | backup only | NO | NO | NO |
| synqdrive-redis-backup | root | `0 4 * * *` | vps-backup-redis.sh | backup only | NO | NO | NO (04:00Z) |
| docker-builder-prune | root | `58 4 * * 6` | docker builder prune | NO | NO | NO | NO |
| certbot | root | `0 */12 * * *` | certbot renew | NO | NO | NO | NO |

**`CRON_CAUSAL` = NO**

---

## Phase 5 — Systemd timer audit

Relevant timers: `apt-daily-upgrade` (~06:30Z), `certbot.timer`, `dpkg-db-backup` (midnight). **None at ~05:01Z.**

**`SYSTEMD_TIMER_CAUSAL` = NO**

---

## Phase 6 — PM2 internal policy

| Check | Result |
|-------|--------|
| `PM2_CRON_RESTART_CONFIGURED` | **NO** (`cron_restart=None`) |
| `max_memory_restart` | **None** |
| `watch` | disabled |
| `autorestart` | default (not implicated — stops were SIGINT, not crash loop) |

| Field | Value |
|-------|-------|
| `PM2_CRON_RESTART_CAUSAL` | **NO** |
| `PM2_MAX_MEMORY_RESTART_CAUSAL` | **NO** |
| `MEMORY_LIMIT_TRIGGER_PLAUSIBLE` | **NO** |

PM2 **executed** deploy-requested SIGINT restarts; it did **not** autonomously initiate them.

---

## Phase 7 — System / host causes

| Check | Result |
|-------|--------|
| `HOST_REBOOT_AT_0501Z` | **NO** (last reboot `2026-07-16`) |
| `OOM_KILL_AT_0501Z` | **NO** (journal search empty) |
| `SYSTEMD_PM2_RESTART_AT_0501Z` | **NO** |
| `KERNEL_PROCESS_KILL_AT_0501Z` | **NO** evidence |
| `RESOURCE_PRESSURE_AT_0501Z` | **NO** evidence |

---

## Phase 8 — Package / OS maintenance

| Check | Result |
|-------|--------|
| `UNATTENDED_UPGRADE_RAN` | Yes at `01:30Z` and `06:30Z` Sep 8 — **not** 05:01Z |
| `NEEDRESTART_RAN` | not observed at 05:01Z |
| `AUTO_REBOOT_CONFIGURED` | not implicated |
| `PACKAGE_UPDATE_RESTARTED_PM2` | **NO** |
| `OS_MAINTENANCE_CORRELATION` | **NO** at 05:01Z |

**`UNATTENDED_UPGRADE_CAUSAL` = NO** (for 05:01Z boundary)

---

## Phase 9 — Deploy automation inventory

| DEPLOY_ENTRYPOINT | TRIGGER | AUTH | SCHEDULED | UNATTENDED | LOG_SOURCE | CORRELATED_0501Z |
|-------------------|---------|------|-----------|------------|------------|------------------|
| `cloud-agent-deploy.sh` | manual/agent | SSH key + sudo | NO | YES | auth.log | **YES Sep 8** |
| `vps-deploy-release.sh` | called by above | root sudo | NO | YES | auth.log + stdout | **YES Sep 8** |
| GitHub Actions workflows | CI only | N/A | NO production deploy | NO | GH Actions | NO |
| cron backups | time | root | YES | YES | cron logs | NO |
| `reference-capture-exp-021d-enable-settlement-shadow.sh` | manual | SSH | NO | possible | auth partial | possible Sep 7 pattern |

**`DEPLOY_SCRIPT_CAUSAL` = YES** (Sep 8)  
**`CLOUD_AGENT_CAUSAL` = YES** (Sep 8)  
**`GITHUB_ACTION_CAUSAL` = NO**

---

## Phase 10 — Auth / operator forensics

### Sep 8 deploy window

| Field | Value |
|-------|-------|
| `SSH_SESSION_ACTIVE` | YES `04:50:25Z` |
| `SSH_USER` | `synqdrive-admin` |
| `SSH_SOURCE` | Cloud Agent AWS egress (redacted; fingerprint `SHA256:jI+cmbcM5EvUnkK3iBffxt7phDdqEDd7GTHlhP1LSQQ`) |
| `NON_INTERACTIVE_SESSION` | YES |
| `KNOWN_DEPLOY_SCRIPT_INVOCATION` | **YES** — full `vps-deploy-release.sh` command logged |
| Classification | **CURSOR/CLOUD_AGENT** deploy |

### Sep 7 05:01 window

| Field | Value |
|-------|-------|
| `SSH_SESSION_ACTIVE` | YES — minute polling `04:45–05:01Z` |
| `SUDO_COMMANDS_IF_LOGGED` | `sudo bash -s` + `git rev-parse HEAD` at `05:01:31Z` |
| `KNOWN_DEPLOY_SCRIPT_INVOCATION` | **NO** |
| PM2 SIGINT | `05:01:32Z` (1s after sudo) |
| Classification | **CURSOR/CLOUD_AGENT proximate** — **MANUAL_OPERATOR_CAUSAL = UNPROVEN** |

### Sep 7 04:19 (related overnight boundary, not 05:01)

Env mutations `HF_RECOVERY_POLICY_V2_ENABLED` + backup `backend.env.bak-exp-016-retry-20260907041800` → PM2 SIGINT `04:19:41Z`. **EXP-016 live calibration operator session** — separate from 05:01 cluster.

---

## Phase 11 — GitHub Actions correlation

No workflow deploys to production VPS on schedule. Trip-FSM / i18n / module-registry workflows are CI-only.

| WORKFLOW | PRODUCTION_SIDE_EFFECT | CORRELATED_0501Z |
|----------|------------------------|------------------|
| All `.github/workflows/*` | **NO** SSH deploy | **NO** |

Merge of #1570 at `04:49:55Z` **preceded** deploy; merge alone is not proof — **auth.log proves SSH deploy invocation**.

---

## Phase 12 — Release-directory forensics (Sep 8)

| Check | Result |
|-------|--------|
| `RELEASE_CREATED_BEFORE_RESTART` | YES — `20260908045043` birth `04:50:43Z` |
| `RELEASE_BUILD_COMPLETED` | YES — migrate step `04:56:54Z` |
| `RELEASE_PROMOTED` | YES — during deploy before rolling restart |
| `CURRENT_SYMLINK_CHANGED` | YES (at deploy; later overwritten by `17:40Z` deploy) |
| `ROLLBACK_OCCURRED` | NO |
| `DEPLOY_ABORTED` | NO |
| `DEPLOY_LOG_EXISTS` | YES — auth.log + artifact chain |

**Note:** `current` symlink at `05:01Z` pointed at new release; OQ-28 segment broke on **process continuity**, not on failed promotion.

---

## Phase 13 — Expected vs unexpected classification

| Event | Classification |
|-------|----------------|
| Sep 8 05:01Z | **EXPECTED_ROLLING_DEPLOY** (authorized EXP-021 deploy) |
| Sep 7 05:01Z | **UNKNOWN** — SIGINT rolling pattern without deploy artifacts |
| Sep 7 04:19Z | **MANUAL_OPERATOR_RESTART** (EXP-016 env change + PM2 restart) |

---

## Phase 14 — Recurrence analysis

Two consecutive days show ~05:01Z restarts, but:

- Sep 8 timing is **deploy-duration artifact** (deploy started 04:50Z, restart when build finished).
- Sep 7 lacks deploy markers; may be agent script PM2 restart or unrelated operator action.
- **Not** sufficient evidence for `DAILY` or `CRON_LIKE` automation at 05:01Z.

---

## Phase 15 — Causal chain (Sep 8 — OQ-28 break)

```
GitHub merge #1570 (7b9a7857) @ 04:49:55Z
  → Cursor Cloud Agent cloud-agent-deploy.sh (SSH)
    → sudo bash -c TMP exact-SHA fetch + SYNQDRIVE_REQUESTED_DEPLOY_SHA=7b9a7857 bash vps-deploy-release.sh @ 04:50:25Z
      → clone/build/migrate release 20260908045043
        → vps_replica_capture_deploy_state() → pm2-pre-deploy-20260908050120 @ 05:01:20Z
          → vps_replica_rolling_deploy()
            → PM2 SIGINT stop/start A @ 05:01:22Z, B @ 05:01:30Z
              → Cold Nest bootstrap → OQ-28 FULL_N2 segment break @ 05:01:28Z
```

**`CAUSAL_CHAIN_COMPLETE` = YES** (Sep 8)

---

## Phase 16 — Root cause classification

| Field | Value |
|-------|-------|
| `ROOT_CAUSE_CLASS` | **B** — CONFIRMED_DEPLOY_INVOCATION |
| `ROOT_CAUSE_CONFIDENCE` | **HIGH** |
| `ROOT_CAUSE_SUMMARY` | OQ-28 break caused by authorized Cloud Agent production deploy (#1570 / `7b9a7857`), not PM2/host/cron/N2 defect |

---

## Phase 17 — Scaling defect determination

| Field | Value |
|-------|-------|
| `N2_ARCHITECTURE_CAUSED_RESTART` | **NO** |
| `DEPLOYMENT_SYSTEM_CAUSED_RESTART` | **YES** |
| `HOST_SYSTEM_CAUSED_RESTART` | **NO** |
| `OPERATOR_OR_AGENT_CAUSED_RESTART` | **YES** (Cloud Agent initiated deploy) |
| `OQ28_BREAK_CAUSE_CLASS` | **OPERATIONS_BOUNDARY** |

---

## Phase 18 — Security / governance check

| Field | Value |
|-------|-------|
| `DEPLOY_TRIGGER_ACTOR_TRACEABLE` | **YES** — SSH key fingerprint + sudo COMMAND in auth.log |
| `DEPLOY_TRIGGER_SERIALIZED` | **PARTIAL** — no distributed deploy lock evidenced |
| `DEPLOY_TRIGGER_AUDITABLE` | **YES** — auth.log retains full deploy command + SHA |
| `DEPLOY_TRIGGER_CAN_RUN_UNINTENDED` | **YES** — agent can deploy without OQ-28 soak guard |
| `DEPLOY_TRIGGER_GOVERNANCE_GAP` | **YES** — no production-soak interlock; deploy can break active OQ-28 candidate |

---

## Phase 19 — OQ-28 candidate protection

| Field | Value |
|-------|-------|
| `CURRENT_OQ28_CANDIDATE_START` | `2026-09-08T17:40:39Z` |
| `CURRENT_OQ28_24H_CHECKPOINT` | `2026-09-09T17:40:39Z` |
| `CURRENT_CANDIDATE_STILL_CONTINUOUS` | **YES** at audit end |
| Evidence | PM2 `created_at` A `17:40:30Z` B `17:40:39Z`; health uptime ~32300s; no PM2 stop since `17:40Z` |
| `PRODUCTION_MUTATION_EXECUTED` | **NO** |
| `PRODUCTION_DEPLOY_EXECUTED` | **NO** |
| `PM2_RESTART_EXECUTED` | **NO** |

---

## Phase 20–21 — Incident rule

**`NEW_INCIDENT_CREATED` = NO**

Sep 8 restart was **intentional authorized deploy**, not an unresolved production defect. Sep 7 05:01Z remains **forensically incomplete** but does not meet incident creation threshold without proven defect.

---

## Phase 22 — Remediation recommendations (NOT implemented)

1. **OQ-28 soak deploy interlock** — block or warn on `cloud-agent-deploy.sh` when active FULL_N2 certification candidate is in progress.
2. **Deploy actor metadata** — write `DEPLOY_INITIATOR`, `DEPLOY_REASON`, `OQ28_CANDIDATE_ACTIVE` into `last-deploy-state.env`.
3. **Sep 7 follow-up** — capture full stdin of `sudo bash -s` sessions (audit script naming in auth/sudo logging).
4. **Governance** — require explicit `DEPLOY_APPROVED_FOR_PRODUCTION=1` secret for unattended agent deploys during certification windows.

**`REMEDIATION_IMPLEMENTED` = NO**

---

## Machine-readable verdict block

```
P1_8_3_11_ROOT_CAUSE_VERDICT = CONFIRMED_DEPLOY_INVOCATION_SEP8_HIGH_CONFIDENCE_SEP7_PARTIAL

AUDIT_START_UTC = 2026-09-09T02:34:00Z
AUDIT_END_UTC = 2026-09-09T02:39:00Z

LATEST_MAIN_SHA = 0b91dcd96f68164282a38458242fe8489e0b3b82

PR_1586_MERGED = YES
PR_1586_MERGE_SHA = 43e825cd7943bfa730864cd08b523eb2f1ef6701

FORENSIC_WINDOW_START = 2026-09-01T00:00:00Z
FORENSIC_WINDOW_END = 2026-09-09T02:39:00Z

RESTART_EVENTS_TOTAL = 36
RESTART_EVENTS_NEAR_0501Z = 2
DATES_WITH_0501Z_RESTART = 2026-09-07,2026-09-08

RECURRENCE_PATTERN = INSUFFICIENT_DATA
RECURRENCE_PERIOD_HOURS = ~24
TIME_CLUSTER_CONFIDENCE = MEDIUM

SEP8_RESTART_A_UTC = 2026-09-08T05:01:22Z
SEP8_RESTART_B_UTC = 2026-09-08T05:01:30Z
SEP8_PRE_DEPLOY_ARTIFACT_UTC = 2026-09-08T05:01:20Z

PM2_PRE_DEPLOY_CREATOR_FILE = backend/scripts/ops/lib/vps-production-replica.lib.sh
PM2_PRE_DEPLOY_CREATOR_FUNCTION = vps_replica_capture_deploy_state
PM2_PRE_DEPLOY_CALL_CHAIN = cloud-agent-deploy.sh → vps-deploy-release.sh → vps_replica_capture_deploy_state → vps_replica_rolling_deploy

CRON_CAUSAL = NO
SYSTEMD_TIMER_CAUSAL = NO
PM2_CRON_RESTART_CAUSAL = NO
PM2_MAX_MEMORY_RESTART_CAUSAL = NO
HOST_REBOOT_CAUSAL = NO
OOM_CAUSAL = NO
UNATTENDED_UPGRADE_CAUSAL = NO
GITHUB_ACTION_CAUSAL = NO
CLOUD_AGENT_CAUSAL = YES
MANUAL_OPERATOR_CAUSAL = NO
DEPLOY_SCRIPT_CAUSAL = YES

ROOT_CAUSE_CLASS = B
ROOT_CAUSE_SUMMARY = Sep 8 OQ-28 break: Cloud Agent exact-SHA deploy of 7b9a7857 (#1570) rolling PM2 restart at ~05:01Z
ROOT_CAUSE_CONFIDENCE = HIGH

CAUSAL_CHAIN_COMPLETE = YES
CAUSAL_CHAIN = merge #1570 → cloud-agent SSH deploy → vps-deploy-release.sh → pm2-pre-deploy → rolling PM2 SIGINT → cold bootstrap

N2_ARCHITECTURE_CAUSED_RESTART = NO
DEPLOYMENT_SYSTEM_CAUSED_RESTART = YES
HOST_SYSTEM_CAUSED_RESTART = NO
OPERATOR_OR_AGENT_CAUSED_RESTART = YES

OQ28_BREAK_CAUSE_CLASS = OPERATIONS_BOUNDARY

DEPLOY_TRIGGER_ACTOR_TRACEABLE = YES
DEPLOY_TRIGGER_SERIALIZED = PARTIAL
DEPLOY_TRIGGER_AUDITABLE = YES
DEPLOY_TRIGGER_CAN_RUN_UNINTENDED = YES
DEPLOY_TRIGGER_GOVERNANCE_GAP = YES

CURRENT_OQ28_CANDIDATE_START = 2026-09-08T17:40:39Z
CURRENT_OQ28_24H_CHECKPOINT = 2026-09-09T17:40:39Z
CURRENT_CANDIDATE_STILL_CONTINUOUS = YES

NEW_INCIDENT_CREATED = NO
NEW_INCIDENT_ID = NONE

RECOMMENDED_REMEDIATION = OQ-28 soak deploy interlock; deploy actor metadata; governance approval during certification windows
REMEDIATION_IMPLEMENTED = NO

PRODUCTION_MUTATION_EXECUTED = NO
PRODUCTION_DEPLOY_EXECUTED = NO
PM2_RESTART_EXECUTED = NO

NEW_P0_COUNT = 0
NEW_P1_COUNT = 0
NEW_P2_COUNT = 0
NEW_P3_COUNT = 0
```
