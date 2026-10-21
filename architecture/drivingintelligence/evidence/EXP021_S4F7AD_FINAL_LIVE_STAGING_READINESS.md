# EXP-021 S4F-7AD — Final Production live-staging readiness & human authorization decision (read-only)

**Date (UTC):** 2026-10-08  
**Scope:** Independent read-only Production observation + authority reconciliation. **Not** live authorization. **Not** `DRY_RUN=0`. **Not** JIT packet issuance.

**Observation transcript (sanitized):** `/opt/cursor/artifacts/s4f7ad-production-readonly-observation.log` (agent artifact; not committed).

---

## 1. Git & authority baseline

| Check | Result |
|-------|--------|
| `CURRENT_MAIN_SHA` | `c5d81408bb686ef0a0c2aa5ab5e5439a96e426b6` (#1925 merge) |
| `PR1925_MERGE_REACHABLE` | **YES** |
| `PR1924_MERGE_SHA` | `17c49854df4aa1a337561cfc9fc7a6b3c6723941` (reachable) |
| S4F-7AC / AC.1 / AB / AA.1 / Z2 / 7Y evidence on `main` | **YES** (paths under `architecture/drivingintelligence/evidence/`) |
| `SEALED_TOOL_SHA` | `715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` — five-file Z2 blobs **unchanged** on `main` @ sealed commit |
| Deployed Production five-file blobs | **Byte match** Z2 table (verified on VPS @ `54fc704f…`) |
| `AA1_BOOTSTRAP_SHA256` | `007eb88581d26cc52447ea96635a1f707931f0f102a21cd395fd843f743b8351` on `main` |
| Post–#1925 S4 ops code changes entailing seal break | **NONE** on `main` since production deploy (`54fc704f…` ancestor; `main` +7 commits, docs/governance only in S4 ops paths) |

**Historical vs current:** S4F-7AC / S4F-7AC.1 machine blocks remain **historical** (pre–#1924 merge). This document is the **current** authority for Production observation @ 2026-10-08T11:48Z.

---

## 2. Fresh Production read-only observation

| Field | Value |
|-------|--------|
| `CURRENT_PRODUCTION_SHA` | `54fc704fb50c285c68470d8fa274d72a67438482` |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261008001031_v4994` |
| `BACKEND_ENV_SHA256` | `9aae449e809ff7f1ac6cb3411e09d52b2e1f28923c453589218ebe26bab97e05` |
| Replica A/B PID | `1872240` / `1872498` |
| Health HTTP | **200** / **200** |
| Attestation A/B | **PRESTATE**, fingerprint `b648908a…`, contract **v1**, sample count **1** each |
| `RUNTIME_ATTESTATION_PARITY` | **YES** (matching PRESTATE + fingerprint) |
| `GLOBAL_KILL_STATE` | **KILLED** |
| S4 pipeline / work items | **0** / **0** |
| Six S4 enable flags | **OFF** |
| Three Tiny staging env keys | **ALL_MISSING** |
| Tiny vehicle | `c10351f8-b6a2-4258-947f-631aeaa6d359` — **ACTIVE**, hardware **LTE_R1** |
| Tiny organization | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| Global DIMO budget (metrics) | **1** on A and B |
| Redis | **REACHABLE** |
| Scheduler leaders | **1** |
| NGINX | `sudo nginx -t` **PASS**; dual-upstream indicator **YES** |

No Production mutation, restart, or deploy performed in this slice.

---

## 3. NO_BACKFILL & freshness (read-only)

| Field | Value |
|-------|--------|
| `DB_CLOCK_CANONICAL_UTC` (observation) | `2026-10-08T11:48:30.255Z` |
| `LATEST_COMPLETED_TRIP_END` | `2026-10-08T09:05:22.866Z` |
| Future completed trips | **0** |
| Eligible trips @ **hypothetical** cutoff `2026-10-08T11:48:30.368Z` | **0** |
| `NO_BACKFILL_PREFLIGHT` (observation-time hypothetical) | **WOULD_PASS** |

**Not authority:** hypothetical cutoff / fingerprint are **analysis-only**. A live attempt requires a **new** `AUTHORIZED_FRESH_NOT_BEFORE` + `AUTHORIZED_FRESH_EXPECTED_FINGERPRINT` minted ≤900s before mutation and bound to observed Production pins:

| Future `AUTHORIZED_*` binding (must match observation at execution time) |
|---|
| `AUTHORIZED_TOOL_SHA` = `715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` |
| `AUTHORIZED_PRODUCTION_SHA` = `54fc704fb50c285c68470d8fa274d72a67438482` |
| `AUTHORIZED_PRODUCTION_RELEASE_ID` = `20261008001031_v4994` |
| `AUTHORIZED_PRE_ENV_SHA256` = `9aae449e809ff7f1ac6cb3411e09d52b2e1f28923c453589218ebe26bab97e05` |
| `AUTHORIZED_ORGANIZATION_ALLOWLIST` = `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `AUTHORIZED_VEHICLE_ALLOWLIST` = `c10351f8-b6a2-4258-947f-631aeaa6d359` |

Do **not** reuse S4F-7AA / S4F-7AB JIT timestamps or fingerprints.

---

## 4. S4F-7Y live transaction safety (code @ sealed tool on Production)

Reviewed against deployed blobs (match Z2). Summary:

| Area | Assessment |
|------|------------|
| **A. External authorization** | Requires `DI_S4_TINY_STAGING_ACK=YES`, `DI_S4F7Y_LIVE_STAGING_AUTHORIZED=YES`, eight `AUTHORIZED_*` pins; rejects legacy `DI_S4F7V_LIVE_STAGING_AUTHORIZED` alone; no in-shell synthesis (7Y.1 tests) |
| **B. Pre-mutation barriers** | SHA/release/env-hash pins, JIT age, NO_BACKFILL, global kill, S4 zero, flags off, topology, budget, Redis, Tiny identity |
| **C. Mutation contract** | Exact three env keys; backup/recovery; no S4 enable |
| **D. Replica sequencing** | A before B; metrics `prove-fresh-runtime` / `prove-recovery-prestate` — **not** `/proc` env (S4F-7M path) |
| **E. Rollback / forensics** | 7Y.2 monotonic terminal outcomes; poststate reverify |

**Not executed** in this slice.

---

## 5. S4F-7L regression risk

| S4F-7L (2026-10-02) | S4F-7Y (2026-10-08) |
|---------------------|---------------------|
| Proc-env **PRIMARY_STAGING** proof failed | Live path uses **authenticated metrics** attestation |
| Rollback **COMPLETE** | Rollback + recovery prestate + poststate library retained |
| No Tiny activation | Still **no** S4F-7Y live run on Production |

| Question | Answer |
|----------|--------|
| Root cause addressed in code? | **YES** (engineering) — metrics authority replaces proc-env proof |
| Can **current** Production deliver post-staging **OTHER** fingerprint? | **UNKNOWN** — not production-validated; PRESTATE observed today |
| Engineering-only coverage | First live `prove-fresh-runtime` on both replicas after env promotion |
| Residual rollback/restart risk | Multi-replica rolling restart under live transaction; partial recovery scenarios covered in tests, **not** production-proven |
| Must-fix before first live attempt? | Human authorization packet + fresh JIT; optional: independent temp-artifact hygiene review |

---

## 6. Residual risk & cleanup

| Item | Status |
|------|--------|
| `S4F7AB_TEMP_ARTIFACT_CLEANUP` | **NOT_VERIFIED** historically; **read-only scan** @ observation: no `/tmp/s4f7aa-fresh-wrapper.*` dirs; no committed proof of AA.1 EXIT-trap execution |
| Cleanup code (AA.1 EXIT trap) | **Present** in bootstrap on `main` |
| Secret exposure | Observation used bearer token **in-process only**; not logged in evidence |
| Production release drift | `main` **7** commits ahead of deploy SHA; **no** deployed S4 operator blob drift detected |
| Concurrent deploy / trip churn | Operational risk — requires fresh preflight at execution time |
| Provider calls | **None** in this slice |
| Gate 6 | **NOT_SATISFIED** |

---

## 7. Go / No-Go matrix

| State | Verdict |
|-------|---------|
| `ENGINEERING_READY` | **YES** (#1915/#1922 + sealed blobs on Production) |
| `READONLY_PRODUCTION_PREFLIGHT_PASS` | **YES** (this observation) |
| `READY_FOR_HUMAN_AUTHORIZATION_DECISION` | **YES** — operators may **decide** whether to issue a **separate** authorization packet for a future attempt |
| `LIVE_STAGING_AUTHORIZED` | **NO** |
| `CONFIG_STAGING_EXECUTED` | **NO** |
| `S4_TINY_ACTIVATED` | **NO** |

**Does not imply:** permission to run `DRY_RUN=0` or to mint JIT in this task.

---

## Machine block

```
EXP021_S4F7AD_FINAL_LIVE_STAGING_READINESS_RESULT=COMPLETE

CURRENT_MAIN_SHA=c5d81408bb686ef0a0c2aa5ab5e5439a96e426b6
PR1925_MERGE_REACHABLE=YES

SEALED_TOOL_SHA=715dea5648ebb862eeedfc30e7dc3d3cd57bb02c
TOOL_AUTHORITY_VALID=YES
AA1_BOOTSTRAP_AUTHORITY_VALID=YES

CURRENT_PRODUCTION_SHA=54fc704fb50c285c68470d8fa274d72a67438482
CURRENT_PRODUCTION_RELEASE_ID=20261008001031_v4994
BACKEND_ENV_SHA256=9aae449e809ff7f1ac6cb3411e09d52b2e1f28923c453589218ebe26bab97e05

REPLICA_A_HEALTH=HTTP_200
REPLICA_B_HEALTH=HTTP_200
RUNTIME_ATTESTATION_PARITY=YES_PRESTATE_MATCH

GLOBAL_KILL_STATE=KILLED
ALL_S4_FLAGS_OFF=YES
S4_ZERO_STATE=YES
TINY_STAGING_KEYS_STATE=ALL_MISSING

NO_BACKFILL_PREFLIGHT=HYPOTHETICAL_WOULD_PASS_AT_OBSERVATION
LATEST_COMPLETED_TRIP_END=2026-10-08T09:05:22.866Z
FRESHNESS_PRECONDITIONS=NEW_JIT_REQUIRED_AT_EXECUTION_NOT_THIS_SLICE

S4F7Y_LIVE_TRANSACTION_ENGINEERING_READY=YES
S4F7L_FAILURE_MODE_COVERED=YES_ENGINEERING_NOT_PRODUCTION_LIVE_VALIDATED
ROLLBACK_READINESS=ENGINEERING_READY
POSTSTATE_READINESS=ENGINEERING_READY

TEMP_ARTIFACT_CLEANUP=NOT_VERIFIED_SCAN_NO_WRAPPER_DIRS
PRODUCTION_DRIFT_DETECTED=MAIN_AHEAD_DOCS_ONLY_NO_DEPLOYED_OPS_BLOB_DRIFT
RESIDUAL_RISKS=FIRST_LIVE_METRICS_OTHER_STATE_UNPROVEN;TEMP_CLEANUP_UNVERIFIED;TRIP_STATE_CHURN;GATE6

ENGINEERING_READY=YES
READONLY_PRODUCTION_PREFLIGHT_PASS=YES
READY_FOR_HUMAN_AUTHORIZATION_DECISION=YES

EXPLICIT_HUMAN_AUTHORIZATION_PRESENT=NO
LIVE_STAGING_AUTHORIZED=NO
CONFIG_STAGING_EXECUTED=NO
S4_TINY_ACTIVATED=NO
GATE_6=NOT_SATISFIED

BLOCKERS=HUMAN_AUTHORIZATION_DECISION_REQUIRED;FRESH_JIT_AT_EXECUTION;NO_DRY_RUN0_IN_THIS_SLICE
NEXT_SAFE_ACTION=HUMAN_DECIDES_AUTHORIZATION_PACKET;IF_APPROVED_MINT_FRESH_JIT_BIND_AUTHORIZED_PINS;OPTIONAL_DRY_RUN1_BEFORE_LIVE_SLICE

FINAL_RESULT=READY_FOR_HUMAN_DECISION
```
