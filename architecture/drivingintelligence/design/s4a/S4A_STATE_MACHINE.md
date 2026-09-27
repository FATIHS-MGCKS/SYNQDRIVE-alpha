# S4A — Work-item state machine (frozen)

**Contract:** [`s4a-contract.v1.json`](s4a-contract.v1.json) `states` / `transitions` · **Validator:** `validate-s4a-contract.sh` §1 · **Parent:** [S4A_CONTRACT_DESIGN.md](S4A_CONTRACT_DESIGN.md)

## 1. States

| State | Lifecycle terminal | Lease | `shadow_run_id` | Pin | `next_attempt_at` |
|-------|:-----------------:|-------|-----------------|-----|-------------------|
| PENDING | no | none | forbidden | optional, immutable once set | required |
| LEASED | no | required | forbidden | optional, immutable once set | NULL |
| FAILED_RETRYABLE | no | none | forbidden | optional, immutable once set | required |
| COMPLETED | no¹ | none | **required** | **required** | NULL |
| FAILED_TERMINAL | no¹ | none | forbidden | optional | NULL |
| SKIPPED_INELIGIBLE | no¹ | none | forbidden | forbidden | NULL |
| SUPERSEDED | **yes** | none | retained if present | retained if present | NULL |

¹ These are **execution-terminal** (`executionTerminalStates`): no more execution happens. They can still be superseded when the trip boundary or pipeline changes. SUPERSEDED is the only lifecycle-terminal state; the immutability trigger rejects every update of a SUPERSEDED row.

A pin can exist in PENDING or FAILED_RETRYABLE: the worker pinned, then failed or crashed. The next attempt must reuse that pin (race G, R08).

## 2. Transitions

| Id | From | To | Actor | Epoch | Attempts | Guards |
|----|------|----|-------|-------|----------|--------|
| T01_CREATE | NONE | PENDING | discovery | 0 | 0 | tenant scope, logical-key unique, active-PRIMARY unique |
| T02_CLAIM | PENDING, FAILED_RETRYABLE | LEASED | worker | +1 | +1 | `next_attempt_at <= clock_timestamp()`, attempts < 5, kill switch open, `FOR UPDATE SKIP LOCKED`, **pvk match** |
| T03_HEARTBEAT | LEASED | LEASED | lease holder | keep | keep | epoch match, lease not expired (DB clock) |
| T04_TAKEOVER | LEASED | LEASED | worker | +1 | +1 | lease expired (DB clock), attempts < 5, kill switch, SKIP LOCKED, **pvk match** |
| T05_PIN | LEASED | LEASED | lease holder | keep | keep | epoch match, not expired, `pinned_snapshot_hash IS NULL`, snapshot same org/trip |
| T06_COMPLETE | LEASED | COMPLETED | lease holder | keep | keep | row lock, epoch match, not expired, pin set, fingerprint unchanged, tenant scope, S2 written in the same tx, **pvk match** |
| T07_FAIL_RETRYABLE | LEASED | FAILED_RETRYABLE | lease holder | keep | keep | row lock, epoch match, attempts remain, failure retryable |
| T08_FAIL_TERMINAL | LEASED | FAILED_TERMINAL | lease holder | keep | keep | row lock, epoch match |
| T09_SKIP_INELIGIBLE | LEASED | SKIPPED_INELIGIBLE | lease holder | keep | keep | row lock, epoch match, permanent ineligibility for this fingerprint |
| T10_EXHAUST | LEASED | FAILED_TERMINAL | reaper | +1 | keep | lease expired, attempts exhausted, SKIP LOCKED |
| T11_SUPERSEDE | PENDING, LEASED, FAILED_RETRYABLE, COMPLETED, FAILED_TERMINAL, SKIPPED_INELIGIBLE | SUPERSEDED | drift watcher or lease holder | +1 | keep | row lock, reason set, successor same org/trip or NULL |

The validator reports **14 legal pairs and 42 illegal pairs** out of 56 (NONE plus 7 states → 7 states). Illegal examples that the validator requires to stay illegal: COMPLETED→LEASED (no re-execution of a completed item: a new pipeline version is a new item), SUPERSEDED→any, SKIPPED_INELIGIBLE→LEASED, FAILED_TERMINAL→PENDING, NONE→COMPLETED.

**`ILLEGAL_TRANSITION_REPRESENTABLE = NO`**, with two layers:

1. Every repository transition is one conditional `UPDATE … WHERE id=$1 AND status = ANY($from) AND lease_epoch=$epoch [AND …] RETURNING`. Rowcount 0 means the transition was lost and never forces a write.
2. The DB rejects the persisted state even if the repository is bypassed: CHECKs (§1 column rules) plus the immutability trigger (SUPERSEDED is frozen, the pin is immutable, the epoch is monotonic, identity is immutable).

Residual: CHECKs validate the resulting row, not the edge. An operator using raw SQL could move a pin-less PENDING row to FAILED_TERMINAL, which is a legal persisted state reached through an illegal edge. Accepted: operators are not an execution path; the state is harmless (no S2 write) and visible in S4F metrics.

## 3. Failure classification

| Class | Examples | Transition |
|-------|----------|------------|
| Retryable | position `SOURCE_FAILURE` (timeout, 5xx, 429), R1 `SOURCE_FAILURE`, DB serialization/lock timeout, budget exceeded (240 s) | T07 with backoff `[900, 3600, 14400, 14400, 14400]` s |
| Terminal | position `AUTHORIZATION_FAILURE`, `INVALID_REQUEST`, `MALFORMED`, S1 invariant failure, pinned snapshot hash mismatch on load | T08 |
| Ineligible (per fingerprint) | window > 8 h, position `UNSUPPORTED_SOURCE`, trip not COMPLETED at claim, source family `UNKNOWN` | T09 (or T11 `TRIP_NOT_COMPLETED` / `TRIP_CANCELLED` if the fingerprint changed) |
| Exhausted | 5 attempts consumed, lease expired | T10 by the reaper |

`AUTHORIZATION_FAILURE` is terminal for this item. Re-authorization (a new vehicle token) is an operator REACQUISITION, not a silent retry, so a revoked consent never becomes a retry loop against DIMO.

## 4. Kill switch

T02 and T04 require the kill switch to be open (S4B: env flag, code default OFF). Closing it stops new claims. Running leases finish or expire, and T03, T05 and T06 are still allowed so in-flight work stays consistent. With the switch closed and no worker registered (the S4A state), there is **no actor** for T02–T11.
