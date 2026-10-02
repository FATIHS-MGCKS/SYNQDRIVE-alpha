# S4A — Work-item state machine (frozen)

**Contract:** [`s4a-contract.v2.json`](s4a-contract.v2.json) `states` / `transitions` / `mustBeIllegal` (**AMENDED BY C1D.10C**; v1 historical) · **Validator:** `validate-s4a-contract.sh` §1 · **Parent:** [S4A_CONTRACT_DESIGN.md](S4A_CONTRACT_DESIGN.md)

## 1. States

| State | Lifecycle terminal | Lease | `shadow_run_id` | Pin | `next_attempt_at` |
|-------|:-----------------:|-------|-----------------|-----|-------------------|
| PENDING | no | none | forbidden | optional, immutable once set | required |
| LEASED | no | required | forbidden | optional, immutable once set | NULL |
| FAILED_RETRYABLE | no | none | forbidden | optional, immutable once set | required |
| COMPLETED | no¹ | none | **required** | **required** | NULL |
| FAILED_TERMINAL | no¹ | none | forbidden | optional | NULL |
| SKIPPED_INELIGIBLE | no¹ | none | forbidden | forbidden (only unpinned PRIMARY / REACQUISITION, C1D.10C) | NULL |
| SUPERSEDED | **yes** | none | retained if present | retained if present | NULL |

¹ These are **execution-terminal** (`executionTerminalStates`): no more execution happens. They can still be superseded when the trip boundary or pipeline changes. SUPERSEDED is the only lifecycle-terminal state; the immutability trigger rejects every update of a SUPERSEDED row.

A pin can exist in PENDING or FAILED_RETRYABLE: the worker pinned, then failed or crashed. The next attempt must reuse that pin (race G, R08).

## 2. Transitions (AMENDED BY C1D.10C)

| Id | From | To | Actor | Epoch | Attempts | Guards |
|----|------|----|-------|-------|----------|--------|
| T01_CREATE | NONE | PENDING | discovery | 0 | 0 | tenant scope, logical-key unique, active-PRIMARY unique, discovery control plane enabled, pvk ACTIVE |
| T02_CLAIM | PENDING, FAILED_RETRYABLE | LEASED | worker | +1 | +1 | `next_attempt_at <= clock_timestamp()`, attempts < 5, worker control plane enabled, `FOR UPDATE SKIP LOCKED`, **pvk match**, pvk ACTIVE |
| T03_HEARTBEAT | LEASED | LEASED | lease holder | keep | keep | epoch match, lease not expired (DB clock), absolute lease ceiling applied |
| T04_TAKEOVER | LEASED | LEASED | worker | +1 | +1 | lease expired (DB clock), attempts < 5, worker control plane enabled, SKIP LOCKED, **pvk match**, pvk ACTIVE |
| T05_PIN | LEASED | LEASED | lease holder | keep | keep | epoch match, not expired, `pinned_snapshot_hash IS NULL`, snapshot same org/trip, worker control plane enabled |
| T06_COMPLETE | LEASED | COMPLETED | lease holder | keep | keep | row lock, epoch match, not expired, pin set, fingerprint unchanged, tenant scope, S2 written in the same tx, **S2 execution identity match**, **pvk match**, pvk ACTIVE, worker control plane enabled |
| T07_FAIL_RETRYABLE | LEASED | FAILED_RETRYABLE | lease holder | keep | keep | row lock, epoch match, **not expired**, attempts remain, failure retryable (the only holder write allowed while the control plane is disabled) |
| T08_FAIL_TERMINAL | LEASED | FAILED_TERMINAL | lease holder | keep | keep | row lock, epoch match, **not expired**, reason set |
| T09_SKIP_INELIGIBLE | LEASED | SKIPPED_INELIGIBLE | lease holder | keep | keep | row lock, epoch match, **not expired**, **pin not set**, **purpose ≠ RECALIBRATION_REPLAY**, permanent ineligibility for this fingerprint |
| T10_EXHAUST | LEASED | FAILED_TERMINAL | reaper | +1 | keep | lease expired, attempts exhausted, SKIP LOCKED, maintenance control plane enabled |
| T11_SUPERSEDE | PENDING, LEASED, FAILED_RETRYABLE, COMPLETED, FAILED_TERMINAL, SKIPPED_INELIGIBLE | SUPERSEDED | drift watcher | +1 | keep | row lock, fingerprint changed, reason set, successor same org/trip or NULL, maintenance control plane enabled |
| T12_RETIRE | PENDING, LEASED, FAILED_RETRYABLE | SUPERSEDED | retirement reaper | +1 | keep | row lock, SKIP LOCKED, pvk RETIRED in registry, lease expired or not leased, reason `PIPELINE_RETIRED`, no successor, maintenance control plane enabled |
| T13_HOLDER_SUPERSEDE | LEASED | SUPERSEDED | lease holder | +1 | keep | row lock, epoch match, not expired, fingerprint changed, reason set, **superseded_by pointer NULL** (no successor insert — see [S4A_T13_HOLDER_SUPERSEDE_AUTHORITY.md](S4A_T13_HOLDER_SUPERSEDE_AUTHORITY.md)), worker control plane enabled |

**AMENDED BY C1D.10F (2026-09-28):** T13 does not perform `W_SUCCESSOR_PRIMARY_INSERT`; next PRIMARY is T01 (discovery) or T11 drift watcher.

C1D.10C changes against v1: T11's actor was "drift watcher or lease holder". The lease-holder path is now the separate T13 with full fencing, so the validator can require `EPOCH_MATCH` and `LEASE_NOT_EXPIRED_DB_CLOCK` on **every** lease-holder transition. T12 replaces the unspecified "operator step" for retired pipeline versions. The "kill switch open" guard is replaced by the control-plane guards ([S4A_CONTROL_PLANE.md](S4A_CONTROL_PLANE.md)).

The validator reports **14 legal pairs and 42 illegal pairs** out of 56 (NONE plus 7 states → 7 states); T12 and T13 add no new pairs. Illegal examples that the validator requires to stay illegal: COMPLETED→LEASED (no re-execution of a completed item: a new pipeline version is a new item), SUPERSEDED→any, SKIPPED_INELIGIBLE→LEASED, FAILED_TERMINAL→PENDING, NONE→COMPLETED.

**`ILLEGAL_TRANSITION_REPRESENTABLE = NO`**, with two layers:

1. Every repository transition is one conditional `UPDATE … WHERE id=$1 AND status = ANY($from) AND lease_epoch=$epoch [AND …] RETURNING`. Rowcount 0 means the transition was lost and never forces a write.
2. The DB rejects the persisted state even if the repository is bypassed: CHECKs (§1 column rules) plus the immutability trigger (SUPERSEDED is frozen, the pin is immutable, the epoch is monotonic, identity is immutable).

Residual: CHECKs validate the resulting row, not the edge. An operator using raw SQL could move a pin-less PENDING row to FAILED_TERMINAL, which is a legal persisted state reached through an illegal edge. Accepted: operators are not an execution path; the state is harmless (no S2 write) and visible in S4F metrics.

## 3. Failure classification

| Class | Examples | Transition |
|-------|----------|------------|
| Retryable | position `SOURCE_FAILURE` (timeout, 5xx, 429), R1 `SOURCE_FAILURE`, DB serialization/lock timeout, budget exceeded (240 s) | T07 with backoff `[900, 3600, 14400, 14400, 14400]` s |
| Terminal | position `AUTHORIZATION_FAILURE`, `INVALID_REQUEST`, `MALFORMED`, S1 invariant failure, pinned snapshot hash mismatch on load, `S2_EXECUTION_IDENTITY_MISMATCH` (C1D.10C) | T08 |
| Ineligible, before pin (per fingerprint) | window > 8 h, position `UNSUPPORTED_SOURCE`, trip not COMPLETED at claim, source family `UNKNOWN` — PRIMARY and REACQUISITION only | T09 (or T13 / T11 `TRIP_NOT_COMPLETED` / `TRIP_CANCELLED` if the fingerprint changed) |
| Ineligible, after pin or replay (C1D.10C) | any ineligibility found once a pin exists; RECALIBRATION_REPLAY is always pinned, so an invalid or unusable replay is `REPLAY_INELIGIBLE` | T08 (never T09: SKIPPED forbids a pin, so a T09 attempt would fail its CHECK and loop) |
| Exhausted | 5 attempts consumed, lease expired | T10 by the reaper |

`AUTHORIZATION_FAILURE` is terminal for this item. Re-authorization (a new vehicle token) is an operator REACQUISITION, not a silent retry, so a revoked consent never becomes a retry loop against DIMO.

## 4. Control plane (AMENDED BY C1D.10C)

**v1 (historical):** "T02 and T04 require the kill switch to be open … T03, T05 and T06 are still allowed" while the switch is closed.

**v2:** T01 requires the discovery control plane; T02, T04, T05, T06 and T13 require the worker control plane (MASTER ∧ WORKER ∧ POSITION ∧ allowlisted ∧ vehicle-org match ∧ DB kill row NOT_KILLED, read inside the transaction); T10, T11 and T12 require MASTER ∧ NOT_KILLED. After a kill, a lease holder may only release its own still-valid lease via T07 (race R17); it can no longer pin or complete. With every flag at its default OFF and no worker registered (the S4A state), there is **no actor** for T01–T13. Details: [S4A_CONTROL_PLANE.md](S4A_CONTROL_PLANE.md).
