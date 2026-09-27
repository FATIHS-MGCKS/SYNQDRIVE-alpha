# S4A — Threat model and multi-replica race catalogue

**Parent:** [S4A_CONTRACT_DESIGN.md](S4A_CONTRACT_DESIGN.md) · **Mechanisms:** [S4A_IDENTITY_AND_FENCING.md](S4A_IDENTITY_AND_FENCING.md) · **Executable model:** `fixtures.races` R01–R14 in [`s4a-contract.v1.json`](s4a-contract.v1.json) (validator §race model)

## 1. Adversary and failure model

This is not a malicious-tenant model: there is no customer surface, so tenant input cannot reach S4. The adversary is the environment:

- two PM2 replicas (`synqdrive`, `synqdrive-b`), possibly on different code during a rolling restart;
- process crash or `SIGKILL` at any instruction;
- GC or event-loop stalls longer than the lease;
- clock skew between replicas;
- BullMQ duplicate, lost or delayed jobs (with Redis restarts);
- DIMO timeouts, 429s, partial pages, late data and schema drift;
- concurrent canonical trip mutation (finalize, split, merge reopen, repair, discard, ops `deleteMany`);
- operator raw SQL and mistaken re-runs.

Goal: for every interleaving, (a) no stale write, (b) at most one live PRIMARY result, (c) no canonical write ever blocked or failed by S4, (d) no silent input substitution.

## 2. Races A–Q

| # | Scenario | Mechanism | Outcome | Fixture |
|---|----------|-----------|---------|---------|
| A | Two discoverers create the same item | logical-key unique; `INSERT … ON CONFLICT DO NOTHING` | one row | R01 |
| B | Two replicas claim the same item | `FOR UPDATE SKIP LOCKED` + conditional epoch increment | one lease; the other gets 0 rows | R02 |
| C | Lease expires (GC stall), B takes over, stale A tries to complete | T04 increments the epoch; T06 checks the epoch under row lock | A rolls back; only B can complete | R03 |
| D | Stale A heartbeats after takeover | T03 `WHERE lease_epoch=$e` | rowcount 0; A aborts | R04 |
| E | Long run with heartbeats | T03 extends the lease with the DB clock | no takeover while alive | R05 |
| F | Duplicate BullMQ job after completion | job carries only `workItemId`; claim requires PENDING/FAILED_RETRYABLE | no-op | R06 |
| G | Crash after pin, retry | pin immutable; retry loads the pin and skips acquisition | same input, same S2 key | R08 |
| H | Crash before pin | nothing persisted except the lease; the next claim re-acquires | valid; the first pin wins | R07 |
| I | Crash inside the S2/completion transaction | single transaction; ROLLBACK removes S2 rows and the completion together | item stays LEASED, then takeover or reap | R09 |
| J | Boundary repair between claim and complete | T06 re-hashes the fingerprint in the transaction; the drift watcher does T11 + successor | stale fingerprint never completes | R11 |
| K | Split: first trip's end changes, second trip is new | first trip fingerprint changes → supersede; second trip → new discovery | no cross-trip reuse (fingerprint includes `tripId`) | R10 |
| L | Merge reopen (COMPLETED→ONGOING, `endTime` NULL) | `tripStatus` / `endTime` in the fingerprint → T11 `TRIP_NOT_COMPLETED`; discovery requires COMPLETED | no result for an open trip | R11 |
| M | Discard (CANCELLED) | T11 `TRIP_CANCELLED`; discovery ignores CANCELLED | superseded, retained for audit | R10 |
| N | Trip/vehicle/org deleted mid-lease | CASCADE deletes the item; the worker's conditional updates hit 0 rows; the S2 insert FK fails → ROLLBACK | canonical delete succeeds, no orphan | migration test |
| O | Replay requested while PRIMARY exists | different `run_purpose`; never occupies the active-PRIMARY slot; no acquisition | coexist | R13 |
| P | Mixed-version replicas during rolling restart | `PIPELINE_VERSION_MATCH` on T02/T04/T06 | each replica only touches its own pvk | contract guard (validator) |
| Q | Attempts exhausted with an expired lease | T10 reaper, epoch increment, FAILED_TERMINAL | no infinite retry | R14 |

Additional cases:

- **Concurrent supersession by two watchers:** row lock plus the active-PRIMARY partial unique. The successor insert of the loser conflicts → ROLLBACK (R10).
- **Concurrent reacquisition with the same request id:** logical unique, one row (R12).
- **Clock skew:** all expiry uses `clock_timestamp()` in SQL; worker clocks are irrelevant.
- **Redis flush:** DB rows remain; discovery re-wakes. BullMQ holds no authority.
- **Operator re-runs discovery:** idempotent (A).
- **Operator raw SQL:** the CHECKs and immutability trigger hold; residual edge case in [state machine §2](S4A_STATE_MACHINE.md).

## 3. Answers

| Question | Answer |
|----------|--------|
| `STALE_WORKER_WRITE_POSSIBLE` | **NO** (C, D, I, J) |
| `DOUBLE_PRIMARY_COMPLETION_POSSIBLE` | **NO** (A, B, C, K, logical + partial unique, S2 final guard) |
| `CROSS_TENANT_WORK_ITEM_POSSIBLE` | **NO** (scope-guard triggers + composite FKs) |
| `ILLEGAL_TRANSITION_REPRESENTABLE` | **NO** via the repository; persisted-state CHECKs for raw SQL |
| Can S4 block/fail a canonical write? | **NO.** The T06 trip read takes no lock; no trigger or constraint on canonical tables; deletes cascade |

## 4. Multi-replica test list (S4A Postgres integration tests, required)

Real PostgreSQL with two independent connection pools, no mocks for the DB layer:

1. R01–R14 executed as interleavings using explicit barriers (advisory-lock rendezvous in the test harness only).
2. Race N: delete trip / vehicle / org while a lease is held and while the completion transaction is open (the delete waits for the row lock, then cascades).
3. Race P: two repositories with different pvk on one table.
4. A lease-expiry test with `lease_expires_at` forced into the past via a test-only SQL fixture (no sleeps).
5. A CHECK/trigger negative suite: every illegal persisted state from [state machine §1](S4A_STATE_MACHINE.md) is rejected by the DB when inserted via raw SQL.
6. The tenant suite from `fixtures.tenantScope` (7 cases) against the real triggers.
7. A migration-apply test on a populated canonical fixture plus the empty-S2 guard.
8. A static zero-impact test: no import of S4 symbols outside `driving-intelligence/`, no Nest module registration, no canonical Prisma model write.
