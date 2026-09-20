# EXP-021 global scheduler leader starvation (2026-09-20)

## Production incident (read-only forensic)

- **SHA:** `762e899da4124147f302b7ae8298798b6f7c81fa`
- **Global Redis lease:** `synqdrive:scheduler:leader`
- **Holder:** cohort operator `PID 4111560` (`reference-capture-exp021-maturation-shadow-canary-enroll.ts --watch-cohort --execute`)
- **PM2 replicas:** `synqdrive` / `synqdrive-b` — both **FOLLOWER**, activation timer **installed**, ~1660 `skipped_not_leader` callbacks each
- **Cohort leader:** **no** `EXP-021 canary live window activation scheduler active` log → timerless leader
- **Post-cutover drives:** ledger/RC/settlement/PDI/M2 = 0 (today's completed trips remain **NO_LEDGER_MISS_NO_BACKFILL** forensic only)

## Root cause

1. Cohort operator bootstrapped **full `AppModule`** → participated in **global scheduler leader election** without hosting EXP-021 activation timer.
2. Activation scheduler used **conditional `setInterval`** at `onModuleInit` → timerless process could become leader after env cutover.

## Repair (code)

1. **Option D:** `Exp021MaturationShadowCanaryOperatorModule` — slim CLI root (no `AppModule`, `WorkersModule`, `SchedulerLeaderElectionModule`, singleton schedulers).
2. **Option A:** Always install activation scheduler interval; fail-closed inside `tick()` via dynamic `resolveConfigFromEnv()` + leader guard.

## Readiness gate correction

`GLOBAL_LEADER_COUNT=1` or `synqdrive_scheduler_leader_status=1` **alone** does **not** prove EXP-021 activation health. Require:

- `EXP021_SCHEDULER_TIMER_INSTALLED`
- `EXP021_SCHEDULER_LAST_SUCCESSFUL_TICK_AT` (or executed tick with valid config on leader)
- Leader `ownerId` on a **backend replica**, not cohort CLI

## Live validation after deploy

1. Stop or redeploy cohort operator on slim module (no lease capture).
2. Confirm one PM2 replica is leader with activation timer installed.
3. Prove ledger on **ONGOING** prospective trip before completion (no backfill of 2026-09-20 forensic drives).
