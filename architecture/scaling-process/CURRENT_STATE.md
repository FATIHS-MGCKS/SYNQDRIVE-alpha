# SCALING PROCESS — Current State

**Last verified:** 2026-09-04T09:17Z (P1.8.3.6 INC-07 natural warm-tier retrospective)  
**Verifier:** P1.8.3.6 INC-07 retrospective audit agent

> `MAIN_SHA_AT_LAST_AUTHORITY_SYNC` is a snapshot at authority sync — not a live pointer to `origin/main`.

---

## Machine-readable header

```
WORKSTREAM = SCALING_PROCESS
AUTHORITY_STATUS = ACTIVE_VERIFIED
MAIN_SHA_AT_LAST_AUTHORITY_SYNC = 95234b28bfa88b328430bb7af769e57ad30a275a
CURRENT_PRODUCTION_SHA = 5b788a223d0461f29b96b142e51388c9831366a2
MAIN_AHEAD_OF_PRODUCTION = NO
N2_RETROSPECTIVE_AUDIT_VERDICT = EARLY_PASS
P1_8_3_3_EVIDENCE_PRECISION = FORENSIC_AUTHORITY_CLOSURE_V4
P1_8_3_3_OPERATIONAL_24H_PLUS = PASS_WITH_FINDINGS
P1_8_3_3_CONTINUOUS_24H_SOAK = NOT_MET
N2_PRODUCTION_CERTIFICATION = EARLY
RUNTIME_N2_SIGNAL = HEALTHY_EARLY
APPLICATION_DEFECT_FOUND = YES
SCALING_READINESS_DEFECT_FOUND = YES
N2_MULTI_REPLICA_CAUSED_DEFECT_FOUND = NO_PROVEN
N2_SEGMENTED_HORIZON_SECONDS = 158877
N2_FULL_N2_RUNTIME_SECONDS = 158815
N2_EXCLUDED_TRANSITION_SECONDS = 62
N2_LONGEST_CONTINUOUS_SEGMENT_SECONDS = 81024
N2_AUDIT_WINDOW_CLASS = SEGMENTED_POST_DEPLOY
ATE_MULTI_REPLICA_CERTIFICATION = UNEXERCISED
BATTERY_V2_FAILED_BASELINE = 64
BATTERY_V2_FAILED_AT_AUDIT = 100
BATTERY_V2_FAILED_AT_FORENSIC_RECHECK = 101
BATTERY_V2_NET_DELTA_AT_AUDIT = 36
BATTERY_EXACT_ID_RECONCILIATION_AVAILABLE = NO
BATTERY_FAILURE_TAXONOMY = RESOLVED_PARTIAL
BATTERY_SCALING_CAUSALITY = NO_PROVEN_RELATION
DUPLICATE_TRIP_ROOT_CAUSE = RECONCILIATION_REAPPLICATION_IDEMPOTENCY_DEFECT
DUPLICATE_TRIP_MULTI_REPLICA_CAUSALITY = NO_PROVEN_RELATION
PM2_FAILED_DEPLOY_CAUSALITY = RULED_OUT
PM2_INITIAL_STOP_CAUSE = UNAVAILABLE
PM2_SCALING_CAUSALITY = NO_PROVEN_RELATION
CURRENT_PRODUCTION_REPLICA_COUNT = 2
REPLICA_A = synqdrive @ 3001 ONLINE LEADER
REPLICA_B = synqdrive-b @ 3002 ONLINE FOLLOWER
NGINX_DUAL_UPSTREAM = YES (configured) / EFFECTIVE = HEALTHY (both upstreams live)
SCHEDULER_SINGLE_LEADER = YES (count=1 at verification)
SCHEDULER_ROLE_SNAPSHOT = A@3001 LEADER / B@3002 FOLLOWER at 2026-09-03T21:19:07Z
DIMO_GLOBAL_BUDGET = ENABLED (limit 50 per architecture)
RECONCILIATION_MUTEX = ENABLED
ROLLING_DEPLOYMENT = YES (#1472 + P1.8.3.1 convergence gate verified)
MIXED_SHA_PROTECTION = YES
DEPLOY_LEADER_CONVERGENCE_GATE = VERIFIED_PRODUCTION
DEPLOY_EXACT_SHA_INVARIANT = VERIFIED_PRODUCTION
DEC_016_FULL_INVARIANT_PRODUCTION_PROOF = YES
DEC_016_PRODUCTION_VALIDATION = FULLY_PRODUCTION_VALIDATED
DEC_016_PRODUCTION_VALIDATED = FULLY_PRODUCTION_VALIDATED
DEC_016_FULL_INVARIANT = VERIFIED_PRODUCTION
OQ_18_STATUS = CLOSED
OQ_18_CLOSURE_CANDIDATE = YES
PROVIDER_CEILING_VERIFIED = NO
N1000_CERTIFICATION = CONDITIONAL (software only)
OPEN_P0 = 0
OPEN_P1 = 0
OPEN_P2 = 1
INC_07_FIX_IMPLEMENTED = YES
INC_07_LOCAL_VALIDATION = PASS
INC_07_CRASH_SAFETY_LOCAL = PASS
INC_07_APPLIED_TERMINALITY_LOCAL = PASS
INC_07_PRODUCTION_DEPLOYED = YES
INC_07_PRODUCTION_VALIDATED = NO
INC07_VALIDATION_START_UTC = 2026-09-03T21:19:07Z
INC07_RETROSPECTIVE_AUDIT_UTC = 2026-09-04T09:17:20Z
NATURAL_WARM_TIER_CYCLES_OBSERVED = 2
INC07_PRODUCTION_EVIDENCE_STRENGTH = WEAK
CURRENT_FULL_N2_SEGMENT_START = 2026-09-03T21:18:36Z
CURRENT_FULL_N2_SEGMENT_SECONDS = 43103
OQ28_EARLIEST_24H_CHECKPOINT_UTC = 2026-09-04T21:18:36Z
PRE_EXISTING_P3 = 1
INC_06 = CLOSED
INC_07 = FIX_DEPLOYED_PRODUCTION_VALIDATION_IN_PROGRESS
OQ_17 = CLOSED
OQ_18 = CLOSED
OQ_28 = PARTIAL
OQ_30 = PARTIAL
P1_8_3_3_MERGE_RECOMMENDATION = EXTERNAL_GITHUB_GATE
NEXT_ARCHITECTURE_STAGE = CONTINUE_NATURAL_INC07_PRODUCTION_OBSERVATION
```

---

## TYPE: FACT — Production topology (2026-09-03 P1.8.3.3)

| Component | Observed state | Evidence |
|-----------|----------------|----------|
| Host | `srv1374778.hstgr.cloud` / `app.synqdrive.eu` | SSH |
| Release | `20260903055433_v4994` | `readlink -f /opt/synqdrive/current` |
| Production SHA | `7d53da51e3b4dfaad711af735e568f97813ddfeb` | release git HEAD |
| PM2 `synqdrive` | online, port 3001, FOLLOWER | `pm2 list`, readiness |
| PM2 `synqdrive-b` | online, port 3002, LEADER | `pm2 list`, readiness |
| Port 3001 / 3002 | both listening, health 200 | `ss -tlnp`, curl |
| nginx upstream | `synqdrive_backend { 3001; 3002 }` | `/etc/nginx/sites-enabled/synqdrive` |
| External health | PASS | `https://app.synqdrive.eu/api/v1/health` |
| Scheduler leader | 1 (A=FOLLOWER, B=LEADER) | readiness @ 07:55Z |
| Redis DB | 0 | `redis-cli -n 0 PING` |
| `battery.v2` failed (BullMQ) | 100 at audit (+36 vs P1.8.3.2); 101 at forensic re-check | `ZCARD bull:battery.v2:failed` |
| Queue wait/active | 0 on sampled queues | Redis LLEN |

---

## TYPE: FACT — P1.8.3.3 segmented horizon (post-checkpoint)

**Checkpoint:** `2026-09-01T11:47:23Z` (P1.8.3.1 stable N=2)

| Metric | Value |
|--------|-------|
| Calendar observation | ~44.1h (`158877s`) |
| Full N=2 runtime (gaps excluded) | ~44.1h (`158815s`) |
| Excluded transition seconds | `62` (deploy rolling + PM2 recovery gaps) |
| Longest continuous FULL_N=2 segment | ~22.5h (`81024s`) — **NOT_MET** for 24h soak |
| Successful deploys | 3 (`bf1be9b6`, `f00a4939`, `7d53da51`) |
| Failed deploy attempts | 2 (2026-09-02T10:32Z; **382ms** sessions; no PM2 touch) |
| Unexpected PM2 restarts | 2 (recovery from stopped; initial stop **UNAVAILABLE**) |
| Duplicate trip groups | 2 (**INC-07** reconciliation reapplication idempotency) |

**EVIDENCE:** `architecture/P1_8_3_3_N2_24H_PLUS_SEGMENTED_RETROSPECTIVE_AUDIT_2026-09-03.md`

---

## TYPE: IMPLEMENTATION — P1.8.3.1 leader-wait hardening (2026-09-01)

**STATUS:** **VERIFIED IN PRODUCTION** (2026-09-01T11:47Z)  
**INCIDENT:** INC-06 **CLOSED**  
**EVIDENCE:** `architecture/P1_8_3_1_DEPLOY_LEADER_WAIT_PRODUCTION_VALIDATION_2026-09-01.md`

---

## TYPE: IMPLEMENTATION — DEC-016 exact-SHA deploy (2026-09-03)

**STATUS:** **PARTIALLY_PRODUCTION_VALIDATED** — stale-current fix likely verified; full six-link invariant **NEEDS_PRECISION_REVIEW**  
**EVIDENCE:** `/var/log/auth.log` TMP bootstrap entries 2026-09-02/03; release SHA match (replica SHA RELEASE_INFERRED)

---

## TYPE: INCIDENT — INC-07 (fix deployed; production validation in progress)

**STATUS:** **FIX_DEPLOYED_PRODUCTION_VALIDATION_IN_PROGRESS** (P2) — remediation PR #1525 deployed to production `5b788a223` on 2026-09-03; validation start `2026-09-03T21:19:07Z`. Historical duplicates frozen (2 groups / 4 rows). **Not closed** until ≥2 natural warm-tier cycles with STRONG or MODERATE evidence.  
**EVIDENCE:** P1.8.3.3 forensic closure; P1.8.3.4 remediation + local regression PASS; `FAILURE_AND_RECOVERY_MODEL.md`

---

## TYPE: DECISION — Coordination layers

| Layer | Status | Introduced by |
|-------|--------|---------------|
| Scheduler leader election (P1.7) | ACTIVE | #1430 |
| DIMO global provider budget (P1.3) | ACTIVE | #1417 |
| Reconciliation mutex (P1.4) | ACTIVE | #1435 |
| Multi-replica deploy hardening (P1.8.2.1) | **MERGED** #1472 | rolling deploy |
| Deploy leader convergence gate (P1.8.3.1) | **VERIFIED** | #1487 + prod validation |
| Exact-SHA deploy provenance (DEC-016) | **NEEDS_PRECISION_REVIEW** | P1.8.3.3 audit |

---

## Quick health summary

| Check | Result |
|-------|--------|
| Application externally reachable | PASS |
| Single scheduler leader | PASS |
| Two-replica production invariant | **PASS** |
| Deploy path preserves 2 replicas | **YES** |
| Exact-SHA deploy invariant (routine) | **NEEDS_PRECISION_REVIEW** |
| Continuous 24h N=2 soak | **NOT_MET** (OQ-28 PARTIAL) |
| Scale-readiness blockers | **INC-07** fix implemented; production validation pending |
