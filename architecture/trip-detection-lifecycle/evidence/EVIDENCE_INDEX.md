# Trip Detection & Lifecycle — Evidence Index

**origin/main (historical @ R9 rebase):** `a4725514866a03099e7a1e485ccf0b7ea37d6fec` — **does not contain R9**

**origin/main (current @ R12 hardening #1594 merged):** `f4109e34c24f1eb497e2023f4b4bb997abfc159f` — includes R12 pre-drive hardening (AUD-002/003/004/007)

**R9 audit branch (historical):** `1186e9d23a9b07e24da17b06a72f2614038db77a` on `trip-fsm/r9-adaptive-polling-wake`

**Production release (current known — PRE_HARDENING_R12):** `157b3c72226869e4e35d1a9398b78cab50d3fa54` @ `/opt/synqdrive/releases/20260909190912_v4994` — **does not include #1594 hardening**

**Production release (historical @ R11):** `f7eb94cb5228a341becd346f9d5f7448345d2ad0` @ `/opt/synqdrive/releases/20260909024150_v4994`

**Production release (historical @ R10):** `68495041974135f7c6565fd5b836b3e2f9176fae` @ `/opt/synqdrive/releases/20260908172927_v4994`

**Production release (historical @ R9):** `0ba96e03fc2f1551db79d2dae151c928a9fd936a` @ `/opt/synqdrive/releases/20260907204434_v4994`

**Production release (historical @ pre-R9):** `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` @ `/opt/synqdrive/releases/20260906213654_v4994`

Historical FSM corpus: [`docs/audits/trip-fsm/`](../../../docs/audits/trip-fsm/) — **supporting evidence only**, not canonical authority.

## Schema

| Column | Meaning |
|--------|---------|
| **Evidence ID** | Stable identifier — never reuse |
| **Source type** | Standard-1.0 evidence class |
| **Source path / method** | Repository path or sanitized observation method |
| **Timestamp** | ISO-8601 UTC when applicable |
| **Audited SHA** | Full document-commit SHA and/or full application-baseline SHA cited in artifact (`doc=` / `app=`) |
| **Supported claim** | What this evidence supports |
| **Currentness** | Separate from source type — see legend |
| **Limitations** | Residual uncertainty |

### Source types used

`CODE` · `HISTORICAL_RECORD` · `PRODUCTION_OBSERVATION`

### Currentness legend

| Label | Meaning |
|-------|---------|
| **CONFIRMED_ON_MAIN** | Repository claim reconfirmed on current `origin/main` (includes R9 @ `4bef60463…`) |
| **CONFIRMED_ON_R9_AUDIT_BRANCH** | **Historical** — present on pre-merge audit branch @ `1186e9d23…`; superseded by main merge (#1553) |
| **CONFIRMED_AT_PRODUCTION_RELEASE** | Observation confirmed against stated Production release SHA at stated UTC timestamp |
| **PARTIALLY_CURRENT** | Core claim valid; stale Production refs, line numbers, or pre-R context in artifact |
| **HISTORICAL** | Pre-remediation, pre-R9 deploy, or superseded runtime context |
| **NOT_ON_PRODUCTION (historical)** | Present on `main` but absent on **historical** Production release `01541c2ab…` at the time of that audit |
| **CI_VALIDATED** | Repository/test claim validated by Trip FSM Production Readiness CI (or equivalent) at stated Audited SHA — **does not imply Production deploy** |
| **CONFIRMED_CI** | CI observation confirmed at stated run — separate from Production deploy currentness |
| **UNKNOWN** | Not re-verified in this authority pass |
| **UNKNOWN_NOT_RECOVERED** | Exact SHA not recoverable from repository history |

### Qualifiers (not Currentness labels — use in Supported claim / Limitations)

| Qualifier | Meaning |
|-----------|---------|
| **PRE_HARDENING_R12** | Production deploy or runtime claim refers to R12 base @ `157b3c722…` **before** PR #1594 hardening; distinct from hardened main @ `f4109e34…` |

---

## P1 — ownership invariants (no Markdown artifact)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EV-P1-001 |
| **Source type** | CODE |
| **Source path** | [`backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts`](../../../backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts) |
| **Timestamp** | `2026-09-06T23:09:32Z` |
| **Audited SHA** | `06095af91ce6f58366734a182ac5962830e858db` |
| **Supported claim** | P1 ownership: sole creator/lifecycle writer (`TripDecisionEngine`); detectors read-only; repair routes through decision engine |
| **Currentness** | CONFIRMED_ON_MAIN |
| **Limitations** | No separate P1 Markdown in `docs/audits/trip-fsm/` |

---

## Historical audit and implementation records (P2–R8)

| Evidence ID | Source type | Source path | Document commit (`doc=`) | Application baseline in artifact (`app=`) | Doc timestamp (UTC) | Supported claim | Currentness | Limitations |
|-------------|-------------|-------------|--------------------------|-------------------------------------------|---------------------|-----------------|-------------|-------------|
| TDL-EV-P2-001 | HISTORICAL_RECORD | [`P2…`](../../../docs/audits/trip-fsm/P2_STATE_MACHINE_EXECUTION_PHASE_AUDIT_2026-09-05.md) | `c52d0c7654a41043496311478888821268dcefae` | `3d5040b67abfdc7e95c1b507e13f45d1bc65af11` | `2026-09-05T18:45:16Z` | FSM vs execution phases; `ENDED` dead; finalize→RESTING | PARTIALLY_CURRENT | P2 Production SSH/SQL stale vs current baseline |
| TDL-EV-P3-001 | HISTORICAL_RECORD | [`P3…`](../../../docs/audits/trip-fsm/P3_SIGNAL_AUTHORITY_TIMESTAMP_ORDERING_AUDIT_2026-09-05.md) | `b62c4c445e6f1294fe4e38b25904737d157465f6` | `3d5040b67abfdc7e95c1b507e13f45d1bc65af11` | `2026-09-05T19:24:05Z` | EVENT_TIME vs WORKER_TIME separation | PARTIALLY_CURRENT | P3 Production access failed at audit time |
| TDL-EV-P4-001 | HISTORICAL_RECORD | [`P4…`](../../../docs/audits/trip-fsm/P4_TRIP_START_DEEP_DIVE_AUDIT_2026-09-05.md) | `a4377f3a200ca45a97b7ce422caf8d92faddabbe` | `3d5040b67abfdc7e95c1b507e13f45d1bc65af11` | `2026-09-05T23:15:35Z` | Start detectors, policies, failure windows | PARTIALLY_CURRENT | P4-F11/F12 addressed on main via R3 |
| TDL-EV-P5-001 | HISTORICAL_RECORD | [`P5…`](../../../docs/audits/trip-fsm/P5_TRIP_END_DEEP_DIVE_AUDIT_2026-09-06.md) | `70249e1966a37cc127149f3792b07c3dd2a4c9b0` | `3d5040b67abfdc7e95c1b507e13f45d1bc65af11` | `2026-09-05T23:33:42Z` | End modes, CUSUM, finalize semantics | PARTIALLY_CURRENT | Several P5 findings addressed via R5–R7 on main |
| TDL-EV-P6-001 | HISTORICAL_RECORD | [`P6…`](../../../docs/audits/trip-fsm/P6_TARGET_ARCHITECTURE_REMEDIATION_PLAN_2026-09-06.md) | `64de2333f0475e1eadb7f0c4f386d441f9979cb7` | `3d5040b67abfdc7e95c1b507e13f45d1bc65af11` | `2026-09-05T23:41:43Z` | R1–R8 remediation dependency graph | PARTIALLY_CURRENT | P6 deferred canonical docs to this authority |
| TDL-EV-R1-001 | HISTORICAL_RECORD | [`R1…`](../../../docs/audits/trip-fsm/R1_EVENT_TIME_AUTHORITY_IMPLEMENTATION_2026-09-06.md) | `8ddf73e562cc5fbe2e88056836bfd0b7ca493411` | `3d5040b67abfdc7e95c1b507e13f45d1bc65af11` | `2026-09-06T06:51:15Z` | EVENT_TIME boundary field contract | CONFIRMED_ON_MAIN | **HISTORICAL:** NOT_ON_PRODUCTION at `01541c2ab…` session only |
| TDL-EV-R2-001 | HISTORICAL_RECORD | [`R2…`](../../../docs/audits/trip-fsm/R2_LIFECYCLE_INVARIANTS_IMPLEMENTATION_2026-09-06.md) | `ff95395d61706556643fe0d83c0e0e85c8f7ef63` | `8ddf73e562cc5fbe2e88056836bfd0b7ca493411` | `2026-09-06T07:47:23Z` | Lifecycle commit + orphan recovery | CONFIRMED_ON_MAIN | Artifact cites post-R1 main baseline |
| TDL-EV-R3-001 | HISTORICAL_RECORD | [`R3…`](../../../docs/audits/trip-fsm/R3_START_LIVENESS_ORDERING_IMPLEMENTATION_2026-09-06.md) | `12a5fdac9e034aa445825e5c9f4318444a9612b3` | `ff95395d61706556643fe0d83c0e0e85c8f7ef63` | `2026-09-06T10:03:40Z` | Queue handoff settlement / start liveness | CONFIRMED_ON_MAIN | — |
| TDL-EV-R4-001 | HISTORICAL_RECORD | [`R4…`](../../../docs/audits/trip-fsm/R4_START_DETECTION_CONSISTENCY_IMPLEMENTATION_2026-09-06.md) | `eb51d8f807347514e7499dec5986b745ec1dc134` | `12a5fdac9e034aa445825e5c9f4318444a9612b3` | `2026-09-06T10:50:59Z` | Start detection consistency | CONFIRMED_ON_MAIN | — |
| TDL-EV-R5-001 | HISTORICAL_RECORD | [`R5…`](../../../docs/audits/trip-fsm/R5_END_VALIDATION_SEMANTICS_IMPLEMENTATION_2026-09-06.md) | `4cd02d7f8b2814c1c5dc773d206f295f94169cf4` | `eb51d8f807347514e7499dec5986b745ec1dc134` | `2026-09-06T11:52:19Z` | End validation semantics | CONFIRMED_ON_MAIN | — |
| TDL-EV-R6-001 | HISTORICAL_RECORD | [`R6…`](../../../docs/audits/trip-fsm/R6_MID_GAP_SPLIT_SAFETY_IMPLEMENTATION_2026-09-06.md) | `de402f7c9b2cccd4706ae30af70bd6347a8730a0` | `4cd02d7f8b2814c1c5dc773d206f295f94169cf4` | `2026-09-06T15:52:20Z` | Mid-gap split safety | CONFIRMED_ON_MAIN | — |
| TDL-EV-R7-001 | HISTORICAL_RECORD | [`R7…`](../../../docs/audits/trip-fsm/R7_TERMINAL_RESTING_RECOVERY_IMPLEMENTATION_2026-09-06.md) | `140ebdd33c9102bcacb969ce5bef01b144c4b64a` | `de402f7c9b2cccd4706ae30af70bd6347a8730a0` | `2026-09-06T19:11:29Z` | Terminal→RESTING recovery | CONFIRMED_ON_MAIN | — |
| TDL-EV-R8-001 | HISTORICAL_RECORD | [`R8…`](../../../docs/audits/trip-fsm/R8_OBSERVABILITY_FORENSICS_IMPLEMENTATION_2026-09-06.md) | `6ea95124343e15e971220cb0c672239ac4b077d6` | `140ebdd33c9102bcacb969ce5bef01b144c4b64a` | `2026-09-06T22:26:34Z` | Forensic metadata / metric fixes | CONFIRMED_ON_MAIN | **HISTORICAL:** absent on Production `01541c2ab…`; deployed @ `0ba96e03…` not re-verified in this pass |
| TDL-EV-R9-001 | HISTORICAL_RECORD | [`R9…`](../../../docs/audits/trip-fsm/R9_ADAPTIVE_POLLING_WAKE_IMPLEMENTATION_2026-09-07.md) | `1186e9d23a9b07e24da17b06a72f2614038db77a` | `4bef60463…` (main merge) | `2026-09-07T02:37:37Z` | R9 adaptive polling wake: durable mailboxes, handoff queue, RESTING continuation, UNKNOWN bounded retry | CONFIRMED_ON_MAIN | Audit doc authored @ branch SHA; merged #1553 |
| TDL-EV-R9-CODE-001 | CODE | [`snapshot-wake-coordinator.service.ts`](../../../backend/src/workers/snapshot-wake/snapshot-wake-coordinator.service.ts) | — | `4bef60463…` | `2026-09-07T02:37:37Z` | R9 wake coordinator: pending/successor mailboxes, coalesce QUEUED/ACTIVE, handoff dispatch, continuation, UNKNOWN retry, gen-1 terminal | CONFIRMED_ON_MAIN | Deployed @ `0ba96e03…`; natural wake not observed |
| TDL-EV-R9H-001 | CODE | [`snapshot-wake-handoff-recovery.spec.ts`](../../../backend/src/workers/snapshot-wake/snapshot-wake-handoff-recovery.spec.ts), [`snapshot-wake-handoff-recovery.scheduler.ts`](../../../backend/src/workers/schedulers/snapshot-wake-handoff-recovery.scheduler.ts) | — | `4bef60463…` | `2026-09-07T05:20:00Z` | R9H orphan recovery: SCAN + bounded re-arm, persist OK + queue fail → recovery → canonical dispatch once | CONFIRMED_ON_MAIN | Regression on main; Production behavior not separately observed |
| TDL-EV-R9-BOOTSTRAP-001 | PRODUCTION_OBSERVATION | Authorized six-vehicle scoped DIMO trigger bootstrap + GET audit @ `0ba96e03…` | — | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` | `2026-09-07T22:10:00Z` | R9 provider trigger bootstrap **ROLLED_BACK**; **0/6** coverage | **HISTORICAL** | [R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md](R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md) |
| TDL-EV-R9-PERM-001 | PRODUCTION_OBSERVATION | Read-only DIMO permission root-cause audit | — | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` | `2026-09-07T22:20:00Z` | tokenId **190497** = `FORMER_FLEET_VEHICLE` / excluded; re-grant rejected | CONFIRMED_AT_PRODUCTION_RELEASE | [R9_PERMISSION_ROOT_CAUSE_AUDIT_2026-09-07.md](R9_PERMISSION_ROOT_CAUSE_AUDIT_2026-09-07.md) |
| TDL-EV-R9-CANARY-001 | PRODUCTION_OBSERVATION | Authorized five-vehicle R9 canary provider mutation + GET audit | — | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` | `2026-09-07T22:35:00Z` | R9 provider wiring **PASS** — 5/5 speed+ignition; 190497 excluded | CONFIRMED_AT_PRODUCTION_RELEASE | [R9_FIVE_VEHICLE_CANARY_2026-09-07.md](R9_FIVE_VEHICLE_CANARY_2026-09-07.md) |

Document commit SHAs recovered via `git log -1 --format=%H -- <path>`. Application baseline SHAs taken from each artifact's stated baseline (full 40-char where present in artifact).

---

## Production observations (read-only) — historical session `2026-09-06T23:47:41Z` @ `01541c2ab…`

**Note:** These observations remain valid for the **historical** release @ `01541c2ab…` @ `2026-09-06T23:47:41Z`. **Current known Production** is `157b3c722…` — see TDL-EV-R12-PROD-DEPLOY-001.

| Evidence ID | Source type | Method | Timestamp (UTC) | Environment | Supported claim | Currentness | Limitations |
|-------------|-------------|--------|-----------------|-------------|-----------------|-------------|-------------|
| TDL-EV-PROD-001 | PRODUCTION_OBSERVATION | SSH: `readlink` + release `.git/HEAD` ref file | `2026-09-06T23:47:41Z` | `01541c2ab…` @ `20260906213654_v4994` | Active release path and SHA | CONFIRMED_AT_PRODUCTION_RELEASE | No `git config` on Production |
| TDL-EV-PROD-002 | PRODUCTION_OBSERVATION | HTTPS `GET /api/v1/health` | `2026-09-06T23:47:41Z` | Production edge | API health HTTP 200 | CONFIRMED_AT_PRODUCTION_RELEASE | Liveness only |
| TDL-EV-PROD-003 | PRODUCTION_OBSERVATION | SSH: `pgrep -f '/opt/synqdrive/.+/backend/dist/src/main\.js'` + `sudo pm2 jlist` | `2026-09-06T23:47:41Z` | Production VPS | **Two** Node PIDs (`3789590`, `3789796`) correlate 1:1 with PM2 apps `synqdrive` and `synqdrive-b` (each `instances=1`) | CONFIRMED_AT_PRODUCTION_RELEASE | Not replicas of one app; trip roles not verified |
| TDL-EV-PROD-004 | PRODUCTION_OBSERVATION | SSH: `redis-cli --scan` prefix counts | `2026-09-06T23:47:41Z` | Production Redis | snapshot.poll=**5**; trip-tracking=**7** | CONFIRMED_AT_PRODUCTION_RELEASE | Prefix counts ≠ queue depth |
| TDL-EV-PROD-005 | PRODUCTION_OBSERVATION | SSH-local `psql` read-only aggregate | `2026-09-06T23:47:41Z` | Production PostgreSQL | FSM: 6× RESTING | CONFIRMED_AT_PRODUCTION_RELEASE | Small cohort |
| TDL-EV-PROD-006 | PRODUCTION_OBSERVATION | SSH-local `psql` read-only aggregate | `2026-09-06T23:47:41Z` | Production PostgreSQL | Trips: 1994 COMPLETED, 18 CANCELLED, 0 ONGOING | CONFIRMED_AT_PRODUCTION_RELEASE | Aggregate only |
| TDL-EV-PROD-007 | PRODUCTION_OBSERVATION | SSH-local `psql` read-only aggregate | `2026-09-06T23:47:41Z` | Production PostgreSQL | Route artifacts: 94 | CONFIRMED_AT_PRODUCTION_RELEASE | ~4.7% of completed trips |
| TDL-EV-PROD-008 | PRODUCTION_OBSERVATION | SSH-local `psql` read-only aggregates | `2026-09-06T23:47:41Z` | Production PostgreSQL | Repair status/type distributions (see baseline) | CONFIRMED_AT_PRODUCTION_RELEASE | PROPOSED volume not root-caused |
| TDL-EV-PROD-009 | PRODUCTION_OBSERVATION | SSH-local `psql` read-only 7-day aggregate | `2026-09-06T23:47:41Z` | Production PostgreSQL | Tracking runs by `run_type` (PSV=6964, PEC=3753, …) | CONFIRMED_AT_PRODUCTION_RELEASE | Rolling 7-day window |

Detail: [PRODUCTION_BASELINE.md](PRODUCTION_BASELINE.md).

---

## R10 — motor-off pause / false resume (2026-09-08)

| Evidence ID | Source type | Source path | Timestamp (UTC) | Audited SHA | Supported claim | Currentness | Limitations |
|-------------|-------------|-------------|-----------------|-------------|-----------------|-------------|-------------|
| TDL-EVID-R10-KS-MX-001 | PRODUCTION_OBSERVATION + CODE | [KS_MX_MOTOR_OFF_PAUSE_2026-09-08.md](KS_MX_MOTOR_OFF_PAUSE_2026-09-08.md) | `2026-09-08T05:25:00Z` | Production `7b9a7857…`; pre-R10 reference case | False resume from pre-boundary motion; stale finalize guards; mid-gap split reject @ 798 m | HISTORICAL_REFERENCE | Observed on pre-R10 release; natural-drive revalidation pending post-deploy |
| TDL-EV-R10-PROD-DEPLOY-001 | PRODUCTION_DEPLOY_AUDIT | [R10_PRODUCTION_DEPLOY_2026-09-08.md](R10_PRODUCTION_DEPLOY_2026-09-08.md) | `2026-09-08T17:40:29Z` | Deployed `684950419…` @ `20260908172927_v4994` | R10 runtime promoted; rolling two-replica restart; post-deploy health/SHA/R10-artifact checks PASS | CURRENT | Deploy success only — **not** natural-drive validation |
| TDL-EVID-KS-MS-661-001 | PRODUCTION_OBSERVATION + CODE | [KS_MS_661_NATURAL_DRIVE_2026-09-08.md](KS_MS_661_NATURAL_DRIVE_2026-09-08.md) | `2026-09-08T20:53:16Z` (addendum) | Historical app `684950419…` | R9 natural start wake observed; blocked empty-core; **STALE_ONGOING repair** @ 21:40:38Z; 0× POSSIBLE_END; R10 **NOT_EXERCISED** | CONFIRMED_AT_PRODUCTION_RELEASE | Webhook payloads not archived; partial corrections in TDL-EVID-KS-MS-661-002 |
| TDL-EVID-KS-MS-661-002 | PRODUCTION_OBSERVATION + CODE | [KS_MS_661_STOP_BOUNDARY_AUDIT_CORRECTION_2026-09-09.md](KS_MS_661_STOP_BOUNDARY_AUDIT_CORRECTION_2026-09-09.md) | `2026-09-09T01:00:00Z` | `684950419…`; R11 merge `32526c95a` | Corrects late-phase `vls_row_absent`; 16.9 s worker anchor vs 76 s motor-off; ignition OFF guard; Scenario J CI | CONFIRMED_ON_MAIN | Supersedes partial claims in 001/TEMPORAL/REPRO |
| TDL-EVID-KS-MS-661-REPRO-001 | CODE + RECONSTRUCTED | [KS_MS_661_DECISION_REPRODUCTION_2026-09-08.md](KS_MS_661_DECISION_REPRODUCTION_2026-09-08.md) | `2026-09-08T21:20:00Z` | `684950419…` | Reference run 19:54:38 inner blocker `operational_inactivity_below_threshold`; VLS fresh-not-stale @ 67 s; **16.9 s = worker anchor only** | CONFIRMED_ON_MAIN | Raw core sample timestamps still absent |
| TDL-EVID-KS-MS-661-TEMPORAL-001 | PRODUCTION_OBSERVATION | [KS_MS_661_TEMPORAL_FLOW_2026-09-08.md](KS_MS_661_TEMPORAL_FLOW_2026-09-08.md) | `2026-09-08T22:10:00Z` | `684950419…` | Full 19:50–20:05 UTC tracking-run timeline; rows 20:01:58+ **`vls_row_absent` SUPERSEDED** per 002 | CONFIRMED_AT_PRODUCTION_RELEASE | Late phase = load ACTIVE → stale/UNKNOWN with persisted VLS row |
| TDL-EVID-KS-MS-661-SCENARIOS-001 | RECONSTRUCTED + SYNTHETIC | [KS_MS_661_R11_SCENARIO_MATRIX_2026-09-08.md](KS_MS_661_R11_SCENARIO_MATRIX_2026-09-08.md) | `2026-09-08T22:15:00Z` | `684950419…` helpers | Nine-scenario **design prototype** S1–S9 (CURRENT vs PROPOSED inline gate) | PROPOSED | Integration proof = TDL-TEST-R11-* A–J on main |
| TDL-EVID-KS-MS-661-PROPOSAL-001 | PROPOSED_DESIGN | [KS_MS_661_EMPTY_CORE_SOLUTION_PROPOSAL_2026-09-08.md](KS_MS_661_EMPTY_CORE_SOLUTION_PROPOSAL_2026-09-08.md) | `2026-09-08T22:20:00Z` | n/a | TDL-DEC-R11-001 design contract; **45 s / PD-2 not activated**; partial base merged #1584 | PROPOSED + PARTIAL_IMPL | See TDL-EVID-R11-IMPL-001 for implemented subset |

---

## R11 — empty-core evidence implementation (2026-09-08)

| Evidence ID | Source type | Source path | Timestamp (UTC) | Audited SHA | Supported claim | Currentness | Limitations |
|-------------|-------------|-------------|-----------------|-------------|-----------------|-------------|-------------|
| TDL-EVID-R11-IMPL-001 | CURRENT_CODE + CURRENT_TEST | [TDL-DEC-R11-001_IMPLEMENTATION_2026-09-08.md](TDL-DEC-R11-001_IMPLEMENTATION_2026-09-08.md) | `2026-09-09T01:34:00Z` | Deployed `f7eb94cb…` | Provider anchor, stop boundary (Scenario J), wake preemption, Scenarios C+I+J CI; PD-2 off; 45 s off | **DEPLOYED_CI** | Natural end-path **not validated** — see TDL-EVID-KS-MS-661-R11-NATURAL-001 |
| TDL-EV-R11-PROD-DEPLOY-001 | PRODUCTION_DEPLOY_AUDIT | [R11_PRODUCTION_DEPLOY_2026-09-09.md](R11_PRODUCTION_DEPLOY_2026-09-09.md) | `2026-09-09T02:52:13Z` | Deployed `f7eb94cb…` @ `20260909024150_v4994` | R11 runtime promoted; tree-equivalent CI 34302677308; rolling two-replica; T0 KS MX 187336 | **HISTORICAL** (superseded by R12 @ `157b3c722…`) | Deploy + health only — **not** natural-drive validation |
| TDL-TEST-R11-001 | CURRENT_TEST | [trip-fsm-r11-empty-core-evidence.spec.ts](../../../backend/src/modules/vehicle-intelligence/trips/trip-fsm-r11-empty-core-evidence.spec.ts) | `2026-09-08T23:45:00Z` | Merged #1584 | Unit scenarios A–H | CONFIRMED_CI | — |
| TDL-TEST-R11-002 | CURRENT_TEST | [trip-r11-empty-core-completion-chain.postgres-redis.integration.spec.ts](../../../backend/src/modules/vehicle-intelligence/trips/trip-r11-empty-core-completion-chain.postgres-redis.integration.spec.ts) | `2026-09-08T23:45:00Z` | Merged #1584 | Scenario **C** — pre-seeded `stopBoundaryAt` | CONFIRMED_CI | redis-memory-server; not production load |
| TDL-TEST-R11-003 | CURRENT_TEST | [trip-r11-backoff-wake-queue.postgres-redis.integration.spec.ts](../../../backend/src/modules/vehicle-intelligence/trips/trip-r11-backoff-wake-queue.postgres-redis.integration.spec.ts) | `2026-09-08T23:45:00Z` | Merged #1584 | Scenario I queue/wake/concurrency | CONFIRMED_CI | — |
| TDL-TEST-R11-004 | CURRENT_TEST | [trip-r11-scaling-simulation.spec.ts](../../../backend/src/modules/vehicle-intelligence/trips/trip-r11-scaling-simulation.spec.ts) | `2026-09-08T23:45:00Z` | Merged #1584 | Synthetic scaling probe 5/1k/10k — **not** production load | CONFIRMED_CI | Design load model in PROPOSAL-001 separate |
| TDL-TEST-R11-005 | CURRENT_TEST | [trip-r11-stop-boundary-completion-chain.postgres-redis.integration.spec.ts](../../../backend/src/modules/vehicle-intelligence/trips/trip-r11-stop-boundary-completion-chain.postgres-redis.integration.spec.ts) | `2026-09-09T01:34:00Z` | Merged #1584 | Scenario **J** — boundary from orchestration; R10 chain; no STALE_ONGOING | CONFIRMED_CI | Reconstructed KS661 fixture; not natural drive |
| TDL-EVID-KS-MS-661-R11-NATURAL-001 | PRODUCTION_OBSERVATION | [KS_MS_661_R11_NATURAL_DRIVE_2026-09-09.md](KS_MS_661_R11_NATURAL_DRIVE_2026-09-09.md) | `2026-09-09T05:17:34Z` | Deployed `f7eb94cb…` @ `20260909024150_v4994` | Five-axis natural drive: A/B/D **PASS**; C **INCONCLUSIVE**; E **FAIL** — 0× POSSIBLE_END; `stopBoundaryAt` null; empty-core + stale VLS block; trip **ONGOING** @ audit | CONFIRMED_AT_PRODUCTION_RELEASE | Post-audit: STALE_ONGOING @ 06:51:54Z; motivates TDL-DEC-R12-001 |

---

## R12 — provider stop boundary + boundary-backed end liveness (2026-09-09)

| Evidence ID | Source type | Source path | Timestamp (UTC) | Audited SHA | Supported claim | Currentness | Limitations |
|-------------|-------------|-------------|-----------------|-------------|-----------------|-------------|-------------|
| TDL-EVID-R12-IMPL-001 | CURRENT_CODE + CURRENT_TEST | [TDL-DEC-R12-001_IMPLEMENTATION_2026-09-09.md](TDL-DEC-R12-001_IMPLEMENTATION_2026-09-09.md) | `2026-09-09T14:10:00Z` | `091c478af…` PR #1591 | R12 provider stop boundary + boundary-backed silence + lifecycle | **CONFIRMED_CI** | Later **PRE_HARDENING_R12** deploy @ `157b3c722…` (tree-equivalent CI head `0ebf248c0`) — see TDL-EV-R12-PROD-DEPLOY-001; does **not** include #1594 hardening; behavior not validated |
| TDL-EVID-R12-CLOCK-001 | CURRENT_CODE + CURRENT_TEST | [TDL-DEC-R12-001_IMPLEMENTATION_2026-09-09.md](TDL-DEC-R12-001_IMPLEMENTATION_2026-09-09.md) | `2026-09-09T18:00:00Z` | `e5b21b0d3…` PR #1591 run 34377256197 | Stop boundary clock authority + provenance/trust | **CONFIRMED_CI** | Included in **PRE_HARDENING_R12** deploy tree @ `157b3c722…` (tree-equivalent); not natural-drive proof |
| TDL-EVID-R12-TRUST-001 | CURRENT_CODE + CURRENT_TEST | [TDL-DEC-R12-001_IMPLEMENTATION_2026-09-09.md](TDL-DEC-R12-001_IMPLEMENTATION_2026-09-09.md) | `2026-09-09T19:00:00Z` | `0ebf248c0…` PR #1591 run 34387586390 | Trust-transition seam R12-TRUST-A/B | **CONFIRMED_CI** | CI head tree-equivalent to deployed `157b3c722…` — see TDL-EV-R12-PROD-DEPLOY-001 |
| TDL-EV-R12-PROD-DEPLOY-001 | PRODUCTION_DEPLOY_AUDIT | [R12_PRODUCTION_DEPLOY_2026-09-09.md](R12_PRODUCTION_DEPLOY_2026-09-09.md) | `2026-09-09T19:21:10Z` | Deployed `157b3c722268…` @ `20260909190912_v4994` | **PRE_HARDENING_R12** runtime promoted; tree-equivalent CI 34387586390 @ `0ebf248c0`; rolling two-replica ~14s mixed; KS MS 661 T0 **PHYSICAL_TEST_READY=NO** | **CONFIRMED_AT_PRODUCTION_RELEASE** | Deploy + health only — **not** #1594 hardened deploy; **not** natural-drive validation |
| TDL-EVID-R12-CI-PASS-001 | CI_OBSERVATION | GitHub Actions run 34360964547 | `2026-09-09T14:08:00Z` | `091c478af…` | Trip FSM Production Readiness CI + i18n-authority-protection PASS | CONFIRMED_CI | PR #1591 not merged |
| TDL-EVID-R12-CI-FAIL-001 | CI_OBSERVATION | GitHub Actions run 34354237230 job 102476180546 | `2026-09-09T13:09:55Z` | `f92cd1ff…` | K1 same-tick POSSIBLE_END false positive; R11 J regression | CONFIRMED | Motivated intensive review remediation |
| TDL-TEST-R12-001 | CURRENT_TEST | [trip-fsm-r12-stop-boundary-end-liveness.spec.ts](../../../backend/src/modules/vehicle-intelligence/trips/trip-fsm-r12-stop-boundary-end-liveness.spec.ts) | `2026-09-09T14:08:00Z` | `091c478af…` | Unit K1–K9 + latch + retire | CONFIRMED_CI | via `test:trip-r11:unit` |
| TDL-TEST-R12-002 | CURRENT_TEST | [trip-r12-ks661-production-ordering.postgres-redis.integration.spec.ts](../../../backend/src/modules/vehicle-intelligence/trips/trip-r12-ks661-production-ordering.postgres-redis.integration.spec.ts) | `2026-09-09T14:08:00Z` | `091c478af…` | K1/K2/K11 + same-tick regression | CONFIRMED_CI | via `test:trip-r11:postgres-redis:ci` |
| TDL-TEST-R12-003 | CURRENT_TEST | [trip-r12-lifecycle-safety.postgres-redis.integration.spec.ts](../../../backend/src/modules/vehicle-intelligence/trips/trip-r12-lifecycle-safety.postgres-redis.integration.spec.ts) | `2026-09-09T14:08:00Z` | `091c478af…` | B1-resume-without-B2, K7 orchestration, K12 idempotency | CONFIRMED_CI | via `test:trip-r11:postgres-redis:ci` |
| TDL-EVID-R12-HARDENING-001 | CURRENT_CODE + CURRENT_TEST | [TDL-DEC-R12-PRE-DRIVE-HARDENING_2026-09-09.md](TDL-DEC-R12-PRE-DRIVE-HARDENING_2026-09-09.md) | `2026-09-10T01:12:40Z` | `f4109e34…` PR #1594 **merged** | R12 pre-drive fail-closed continuity + evidence ordering + ignition-ON keep-open + finalize resume case E | **CI_VALIDATED** | **NOT_DEPLOYED** — distinct from **PRE_HARDENING_R12** deploy @ `157b3c722268…`; **NOT_PRODUCTION_BEHAVIOR_VALIDATED** |
| TDL-TEST-R12-HARDENING-001 | CURRENT_TEST | [trip-decision.engine.continuity.spec.ts](../../../backend/src/modules/vehicle-intelligence/trips/decision/trip-decision.engine.continuity.spec.ts) | `2026-09-10T01:12:40Z` | `f4109e34…` PR #1594 merged | AUD-003 fail-closed + legacy-field regression | CONFIRMED_CI | via `test:trip-r11:unit` + Trip FSM CI run 34424546044 |
| TDL-TEST-R12-HARDENING-002 | CURRENT_TEST | [trip-finalize-end-cycle.postgres.integration.spec.ts](../../../backend/src/modules/vehicle-intelligence/trips/trip-finalize-end-cycle.postgres.integration.spec.ts) | `2026-09-10T01:12:40Z` | `f4109e34…` PR #1594 merged | AUD-007 scenario E resume-before-finalize | CONFIRMED_CI | via `test:trip-finalize:postgres:ci` run 34424546044 |
| TDL-EVID-R12-KS661-ACCEPT-FAIL-001 | PRODUCTION_OBSERVATION + CODE | [KS_MS_661_R12_PHYSICAL_ACCEPTANCE_FAILURE_2026-09-10.md](KS_MS_661_R12_PHYSICAL_ACCEPTANCE_FAILURE_2026-09-10.md) | `2026-09-10T22:00:00Z` | Production `2f1b4f53…`; fix PR #1600 | KS MS 661 stuck POSSIBLE_END — lock contention + NULL PE columns; #1600 family arbitration + clock durability | **HISTORICAL** (pre-#1600 drive `2bdc6e71…`) | Trip not repaired; superseded for POST-#1600 drive by DISPATCH-GAP-001 |
| TDL-EVID-R12-KS661-DISPATCH-GAP-001 | PRODUCTION_OBSERVATION + CODE | [KS_MS_661_R12_DISPATCH_GAP_ROOT_CAUSE_2026-09-11.md](KS_MS_661_R12_DISPATCH_GAP_ROOT_CAUSE_2026-09-11.md) | `2026-09-11T12:00:00Z` | Production #1600 lineage; fix branch | POST-#1600 drive `fc93f98f…`: 15× EV enqueue/pickup, 0× EV tracking runs; PEC-held worker lock vs zero-delay EV | **OPEN** | Trip not repaired; fix **NOT_DEPLOYED**; **PENDING_NEW_DRIVE** |
| TDL-TEST-R12-PEC-EV-001 | CURRENT_TEST | [trip-r12-pec-ev-lock-collision.postgres-redis.integration.spec.ts](../../../backend/src/modules/vehicle-intelligence/trips/trip-r12-pec-ev-lock-collision.postgres-redis.integration.spec.ts) | `2026-09-11T12:00:00Z` | `b5af0df07…` PR #1603 | Lock-order + natural completion chain + EV/FINALIZE natural lock-miss retry | **CONFIRMED_CI** (Trip FSM run 34621495010) | via `test:trip-r11:postgres-redis:ci` + 10× repeat |
| TDL-TEST-R12-PEC-EV-002 | CURRENT_TEST | [trip-r12-end-cycle-lock-contention.spec.ts](../../../backend/src/modules/vehicle-intelligence/trips/trip-r12-end-cycle-lock-contention.spec.ts) | `2026-09-11T12:00:00Z` | fix branch | EV + FINALIZE lock miss → `TripTrackingHandoffLockContentionError` | CONFIRMED_CI | via `test:trip-r12:hardening` |
| TDL-TEST-R12-PEC-EV-003 | CURRENT_TEST | [trip-r12-pec-ev-base-head-red-probe.postgres-redis.integration.spec.ts](../../../backend/src/modules/vehicle-intelligence/trips/trip-r12-pec-ev-base-head-red-probe.postgres-redis.integration.spec.ts) | `2026-09-11T22:06:00Z` | portable probe + `test:trip-r11:postgres-redis:ci` @ `c78dcfd21…` | BASE-compatible probe; JSON metrics; worktree proof; `BASE_RED_REPRODUCED=YES` / `HEAD_GREEN_PROVEN=YES` | **CONFIRMED_CI** (Trip FSM run **34650475053**) | via `test:trip-r12:pec-ev:base-head-red-proof` |

---

## Explicit non-artifacts

- **Competing authority paths** — must not be created under `architecture/trip-fsm/` or `docs/architecture/trip-fsm/`
