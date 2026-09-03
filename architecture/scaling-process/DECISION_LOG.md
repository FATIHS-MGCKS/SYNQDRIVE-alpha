# Scaling Process — Decision Log

**TYPE:** DECISION_AUTHORITY  
Format: Decision ID | Date/Phase | Status

---

## DEC-001: Global scheduler leader (P1.7)

| Field | Value |
|-------|-------|
| **DATE** | 2026-08-30 |
| **CONTEXT** | Multi-replica deploy planned after P1.3 |
| **PROBLEM** | Duplicate cron/interval producers |
| **DECISION** | One global leader via Redis lease; 42 singleton schedulers guarded |
| **WHY** | Minimal change; reuses Redis; tested failover |
| **ALTERNATIVES** | PM2 cluster; host cron; DB locks — rejected/deferred |
| **TRADE-OFF** | ~35s max failover gap |
| **EVIDENCE** | #1430, staging #1438/#1440 |
| **STATUS** | ACTIVE |
| **INTRODUCED_BY** | #1430 |

---

## DEC-002: BullMQ consumers on all replicas

| Field | Value |
|-------|-------|
| **DATE** | 2026-08-30 |
| **PROBLEM** | Throughput vs safety |
| **DECISION** | Workers not leader-guarded |
| **WHY** | BullMQ designed for multi-consumer; safety via idempotency + mutex + budget |
| **STATUS** | ACTIVE |
| **INTRODUCED_BY** | P1.7 design |

---

## DEC-003: Global DIMO provider budget (P1.3)

| Field | Value |
|-------|-------|
| **DATE** | 2026-08-29 |
| **PROBLEM** | Per-process concurrency does not cap provider HTTP across replicas |
| **DECISION** | Redis ZSET lease semaphore; limit 50 default; `DimoRequestExecutor` mandatory |
| **WHY** | Provider 429 prevention; priority + starvation handling |
| **ALTERNATIVES** | Rate limit per replica — **rejected** (multiplies ceiling) |
| **STATUS** | ACTIVE |
| **INTRODUCED_BY** | #1417 |

---

## DEC-004: Reconciliation execution mutex (P1.4)

| Field | Value |
|-------|-------|
| **DATE** | 2026-08-30 |
| **PROBLEM** | Leader election does not serialize per-vehicle reconciliation |
| **DECISION** | Redis lock per org+vehicle trip scope |
| **WHY** | API + worker paths bypass scheduler leader |
| **STATUS** | ACTIVE |
| **INTRODUCED_BY** | #1435 |

---

## DEC-005: Fail-closed on Redis outage

| Field | Value |
|-------|-------|
| **DATE** | 2026-08-29–30 |
| **DECISION** | Leader, mutex, budget all fail-closed |
| **WHY** | Prefer known degradation over duplicate side effects |
| **STATUS** | ACTIVE |
| **INTRODUCED_BY** | P1.3, P1.4, P1.7 |

---

## DEC-006: Controlled scale-to-2 before higher N

| Field | Value |
|-------|-------|
| **DATE** | 2026-08-31 |
| **DECISION** | Production scale 1→2 only after soak + remediation gates |
| **WHY** | Evidence-based; avoid leap to N>2 without prod DB 0 proof |
| **EVIDENCE** | #1469 GO_WITH_CONDITIONS, #1470, #1471 |
| **STATUS** | EXECUTED (2026-08-31); **runtime drift 2026-09-01** |

---

## DEC-007: Retrospective soak audit (not agent 24h wait)

| Field | Value |
|-------|-------|
| **DATE** | 2026-08-31 |
| **DECISION** | Agent performs retrospective audit, not live 24h observation |
| **WHY** | Soak already occurred; audit is evidence synthesis |
| **STATUS** | ACTIVE |
| **INTRODUCED_BY** | #1469 |

---

## DEC-008: Validation ports 3010/3011 isolated

| Field | Value |
|-------|-------|
| **DATE** | 2026-08-30 |
| **DECISION** | Process validation uses Redis DB 15, not production DB 0 |
| **WHY** | Safe VPS testing without touching prod leases |
| **LIMITATION** | Coordination semantics identical; namespace differs |
| **STATUS** | ACTIVE |

---

## DEC-009: Do not mutate historical failed jobs

| Field | Value |
|-------|-------|
| **DATE** | 2026-08-31 |
| **DECISION** | Scaling tasks do not purge/retry historical BullMQ failed sets |
| **WHY** | Forensics + avoid unintended side effects |
| **STATUS** | ACTIVE |

---

## DEC-010: Rolling multi-replica deploy (P1.8.2.1)

| Field | Value |
|-------|-------|
| **DATE** | 2026-08-31 |
| **PROBLEM** | Single `pm2 restart synqdrive` leaves replica B stale/absent |
| **DECISION** | Rolling A→B restart, SHA invariant, auto-rollback |
| **WHY** | INC-05 topology drift |
| **STATUS** | **ACTIVE** — merged #1472 (d6884ce); production verified P1.8.3 |
| **EVIDENCE** | P1.8.3 deploy logs; CURRENT_STATE |
| **SUPERSEDES** | implicit single-restart deploy model |

---

## DEC-011: PM2 fork not cluster

| Field | Value |
|-------|-------|
| **DECISION** | Independent fork processes per replica |
| **WHY** | Explicit ports, health per replica, matches validation harness model |
| **STATUS** | ACTIVE |

---

## DEC-012: No physical refuel duration fabrication

| Field | Value |
|-------|-------|
| **DATE** | 2026-08-30 |
| **CONTEXT** | P1.3 energy/refuel semantics |
| **DECISION** | Do not fabricate physical refuel duration from detection window |
| **STATUS** | ACTIVE |
| **SOURCE** | P1.3-S5 energy semantics docs |

---

## DEC-013: SYNQDRIVE_BOOT_CHECK before release promotion

| Field | Value |
|-------|-------|
| **DATE** | Post INC-01 |
| **DECISION** | Boot check builds full module graph before `current` switch |
| **WHY** | Catch Prometheus duplicate registration |
| **STATUS** | ACTIVE |

---

## DEC-014: Scheduler leader convergence gate during deploy (P1.8.3.1)

| Field | Value |
|-------|-------|
| **DATE** | 2026-09-01 |
| **PROBLEM** | INC-06: deploy false-aborted on `leaderCount=0` before election converged (~35s observed) |
| **DECISION** | Bounded poll gate: 0=transient retry, 1=candidate (2 stable obs), >1=immediate FAIL_SPLIT_BRAIN |
| **WHY** | Preserve INV-01 without blind sleep; observable diagnostics; no split-brain tolerance |
| **PARAMETERS** | poll=2000ms, timeout=44000ms, stableObs=2 |
| **TIMEOUT_FORMULA** | `(2×replicaCount+2)×acquireInterval + 2×poll + margin` |
| **STATUS** | **ACTIVE** — production verified P1.8.3.1 |
| **EVIDENCE** | P1.8.3.1 production validation attempt 3 |
| **SUPERSEDES** | immediate single-snapshot leader check as sole deploy gate |

---

## DEC-015: Source deploy ops libs from promoted release (P1.8.3.1 bootstrap)

| Field | Value |
|-------|-------|
| **DATE** | 2026-09-01 |
| **PROBLEM** | OQ-18: `vps-deploy-release.sh` sourced libs from stale `current` before switch — P1.8.3.1 gate not active on first deploy |
| **DECISION** | Source topology + lib from `RELEASE_DIR/backend/scripts/ops` (RELEASE_OPS_DIR) — verification logic belongs to the release being promoted |
| **WHY** | Pre-switch `current` symlink may contain stale ops libs; promoted release must own verify_post_deploy semantics |
| **RELATED** | DEC-016 handles exact-SHA bootstrap of deploy entry script and release clone — distinct from RELEASE_OPS_DIR sourcing |
| **STATUS** | **ACTIVE** — RELEASE_OPS_DIR production verified (P1.8.3.1 attempt 3) |

---

## DEC-016: Exact-SHA deployment provenance (P1.8.3.1 authority pass)

| Field | Value |
|-------|-------|
| **DATE** | 2026-09-01 |
| **PROBLEM** | Mutable `main` branch between local preflight, remote bootstrap clone, and release clone can cause TOCTOU drift |
| **DECISION** | Resolve one `SYNQDRIVE_REQUESTED_DEPLOY_SHA` and verify it end-to-end |
| **INVARIANT** | `REQUESTED_DEPLOY_SHA == BOOTSTRAP_SCRIPT_SHA == RELEASE_SOURCE_SHA == TARGET_SHA == REPLICA_A_SHA == REPLICA_B_SHA` |
| **FAILURE** | Any mismatch → abort; rollback if promotion began |
| **WHY** | Guarantees authorized artifact is promoted; prevents branch-tip drift |
| **STATUS** | **IMPLEMENTED** — unit tests; stale-current fix **LIKELY_PRODUCTION_VERIFIED** (P1.8.3.3); full invariant **NEEDS_PRECISION_REVIEW** |
| **EVIDENCE** | `vps-deploy-release.sh`, `cloud-agent-deploy.sh`, `assertDeployShaProvenance` tests |

---

## DEC-017: Durable semantic repair identity for trip reconciliation (P1.8.3.4)

| Field | Value |
|-------|-------|
| **DATE** | 2026-09-03 |
| **PROBLEM** | `INTRA_TRIP_GAP_SPLIT` used random `trip_repairs` IDs; warm-tier re-execution created duplicate repaired trips (INC-07) |
| **DECISION** | Enforce idempotency via deterministic `trip_repairs` primary key; **one PostgreSQL transaction** atomically claims, splits, finalizes, and marks `APPLIED` |
| **INVARIANT A** | Same semantic repair → at most one committed trip mutation |
| **INVARIANT B** | `TripRepair APPLIED` is terminal — no code path may downgrade to `REJECTED` or `PROPOSED` |
| **INVARIANT C** | Post-commit side-effect failures (enqueue, metrics, recursion read) cannot alter repair mutation authority |
| **INVARIANT D** | Transaction-client error after possible server commit is resolved by durable-state re-read before writing failure status |
| **INVARIANT E** | Redis reconciliation mutex serializes concurrent execution but is **not** the idempotency authority |
| **LOCKING** | `pg_advisory_xact_lock64` only inside the transaction (64-bit key). Session-scoped `pg_advisory_lock` across separate Prisma calls is **prohibited** |
| **DOWNSTREAM** | Route/ATE/enrichment enqueue occurs **after** transaction commit only |
| **LEGACY** | Pre-fix random-UUID `APPLIED` rows matched by `(vehicleId, repairType, windowFrom, windowTo)` lookup |
| **STATUS** | **IMPLEMENTED** — local regression PASS; production validation pending |
| **EVIDENCE** | `P1_8_3_4_INC_07_TRIP_RECONCILIATION_IDEMPOTENCY_REMEDIATION_2026-09-03.md` |
