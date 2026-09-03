# Scaling Process — Validation Evidence

**TYPE:** EVIDENCE_INDEX  
Map claims → evidence with confidence.

Confidence: **HIGH** | **MEDIUM** | **LOW**

---

## P1.2 — Snapshot polling / trip loss

| Claim | Phase | PR/Commit | Evidence | Result | Confidence |
|-------|-------|-----------|----------|--------|------------|
| Trip-loss safety gates | P1.2 | #1409 | `SNAPSHOT_POLLING_P1_2_*`, Jest suites | PASS | HIGH |
| Partial boundary repair | P1.2 FINAL-3 | #1409 | architecture docs | Merged | HIGH |
| Production cutover | P1.2 | — | post-merge audit | PASS | MEDIUM |

---

## P1.3 — DIMO global provider budget

| Claim | Phase | PR | Evidence | Result | Confidence |
|-------|-------|-----|----------|--------|------------|
| Global limit enforced | P1.3 | #1417 | unit + multi-instance tests | PASS | HIGH |
| No double acquire | P1.3 | #1417 | executor specs | PASS | HIGH |
| Fail-closed Redis | P1.3 | #1417 | service specs | PASS | HIGH |
| Production soak budget | P1.8 | — | 24h audit metrics | 0 breaches | HIGH |
| Multi-replica budget | P1.8.2 | — | coordination probe DB 0 | 45/50 max | HIGH |
| N1000 provider ceiling | P1.3 | — | — | NOT VERIFIED | HIGH (that it's unverified) |

---

## P1.7 — Scheduler leader election

| Claim | Phase | PR | Evidence | Result | Confidence |
|-------|-------|-----|----------|--------|------------|
| Single leader steady | Staging | #1440 | leader probe | leaderCountMax=1 | HIGH |
| Graceful failover | Staging | #1440 | VPS | 7.9s | HIGH |
| Crash failover | Staging | #1440 | VPS | 10.3s | HIGH |
| Production soak | P1.8 | #1469 | 24h audit | leader max=1 | HIGH |
| Production failover | P1.8.2 | #1471 | controlled test | 32s | HIGH |
| 42 schedulers guarded | P1.7 | #1430 | registry + arch test | PASS | HIGH |

---

## P1.4 — Reconciliation mutex

| Claim | Phase | PR | Evidence | Result | Confidence |
|-------|-------|-----|----------|--------|------------|
| Same-vehicle concurrency=1 | Staging | #1440 | coordination probe | PASS | HIGH |
| No double execution soak | P1.8 | #1469 | audit | PASS | HIGH |
| Production probe | P1.8.2 | #1471 | DB 0 probe | PASS | HIGH |

---

## Staging multi-replica

| Claim | Phase | PR | Evidence | Result | Confidence |
|-------|-------|-----|----------|--------|------------|
| Logical twin validation | Staging | #1438 | Jest gate 382 tests | CONDITIONAL_PASS | HIGH |
| True process-level | Staging | #1440 | VPS 3010/3011 | CONDITIONALLY_CERTIFIED | HIGH |
| Redis DB 15 not DB 0 | Staging | #1440 | doc limitation | Acknowledged | HIGH |

---

## P1.8 — 24h single-replica soak

| Claim | Phase | PR | Evidence | Result | Confidence |
|-------|-------|-----|----------|--------|------------|
| 24h window complete | P1.8 | #1469 | retrospective audit | YES | HIGH |
| GO_WITH_CONDITIONS | P1.8 | #1469 | machine block | YES | HIGH |
| Trip pipeline | P1.8 | — | 11 COMPLETED | PASS | MEDIUM |
| Route V2 | P1.8 | — | metrics | NO regression | MEDIUM |
| Energy refuel | P1.8 | — | 0 new events | NEUTRAL | HIGH |

---

## P1.8.1 — Remediation

| Claim | Phase | PR | Evidence | Result | Confidence |
|-------|-------|-----|----------|--------|------------|
| Orphan 3010 removed | P1.8.1 | #1470 | VPS + harness fix | PASS | HIGH |
| Battery.v2 forensics | P1.8.1 | #1470 | classification doc | PASS | HIGH |

---

## P1.8.2 — Controlled scale-to-2

| Claim | Phase | PR | Evidence | Result | Confidence |
|-------|-------|-----|----------|--------|------------|
| Scale executed | P1.8.2 | #1471 | VPS log | SCALE_TO_2_SUCCESS | HIGH |
| Scheduler failover | P1.8.2 | #1471 | 32s test | PASS | HIGH |
| nginx dual upstream | P1.8.2 | #1471 | config | PASS | HIGH |
| Sustained N=2 after | Post | — | P1.8.3 introspection | **PASS** (restored) | HIGH |

---

## P1.8.2.1 — Deploy hardening

| Claim | Phase | PR | Evidence | Result | Confidence |
|-------|-------|-----|----------|--------|------------|
| Rolling deploy implemented | P1.8.2.1 | #1472 | branch code | Implemented | HIGH |
| Unit tests | P1.8.2.1 | #1472 | 7/7 util tests | PASS | HIGH |
| Shell syntax + selftest | P1.8.2.1 | #1472 | `bash -n`, selftest | PASS | HIGH |
| Rebase onto main | P1.8.2.1 | #1472 | merge gate 2026-09-01 | 2 conflicts resolved | HIGH |
| Coordination regression suite | P1.8.2.1 | #1472 | 56 tests (leader/mutex/budget/gate) | PASS | HIGH |
| Merged to main | P1.8.2.1 | #1472 | — | YES (d6884ce) | HIGH |
| Production deploy test | P1.8.2.1 | #1472 | P1.8.3 | Rolling path exercised | MEDIUM |

---

## P1.8.3 — Post-merge verification

| Claim | Phase | PR/Commit | Evidence | Result | Confidence |
|-------|-------|-----------|----------|--------|------------|
| #1472 merged to main | P1.8.3 | d6884ce | git log | YES | HIGH |
| Production N=2 restored | P1.8.3 | — | SSH audit 10:25Z | PASS | HIGH |
| SHA match both replicas | P1.8.3 | — | d6884ce | PASS | HIGH |
| Scheduler leader = 1 | P1.8.3 | — | readiness after 35s | PASS | HIGH |
| nginx dual upstream live | P1.8.3 | — | config + ports | PASS | HIGH |
| Rolling deploy exercised | P1.8.3 | — | deploy2.log | PASS_WITH_FINDINGS | MEDIUM |
| Deploy auto-gate pass | P1.8.3 | — | leader timing abort | FAIL then recovered | MEDIUM |
| INC-05 closed | P1.8.3 | — | N=2 coherent | CLOSED | HIGH |
| Queue stability | P1.8.3 | — | failed counts unchanged | PASS | HIGH |
| Trip/route/energy regression | P1.8.3 | — | no new failures | PASS | MEDIUM |

---

## P1.8.3.1 — Deploy leader-wait hardening

| Claim | Phase | PR/Commit | Evidence | Result | Confidence |
|-------|-------|-----------|----------|--------|------------|
| Convergence state machine | P1.8.3.1 | — | `vps-multi-replica-deploy.util.mjs` | IMPLEMENTED | HIGH |
| Cases A–H unit tests | P1.8.3.1 | — | 18/18 PASS | PASS | HIGH |
| Shell integration | P1.8.3.1 | — | `vps-production-replica.lib.sh` | IMPLEMENTED | HIGH |
| No blind fixed sleep | P1.8.3.1 | — | poll loop | YES | HIGH |
| Split-brain immediate fail | P1.8.3.1 | — | CASE E/G tests | PASS | HIGH |
| Production deploy exercise | P1.8.3.1 | — | attempt 3 deploy log | PASS (14s convergence) | HIGH |
| INC-06 closed | P1.8.3.1 | — | production convergence trace | CLOSED | HIGH |
| OQ-17 leader convergence | P1.8.3.1 | 3772d992d | attempt 3 trace | CLOSED | HIGH |
| OQ-18 bootstrap false-abort | P1.8.3.1 | 3772d992d | attempts 1–2 ROLLBACK | RELEASE_OPS_DIR MITIGATED | HIGH |
| OQ-18 cloud-agent exact-SHA bootstrap | P1.8.3.1 authority | PR #1490 merged | not prod observed post-merge | PENDING | MEDIUM |
| DEC-016 exact-SHA provenance | P1.8.3.1 authority | PR #1490 | unit tests 7 cases | IMPLEMENTED | HIGH |

---

## P1.8.3.2 — N=2 retrospective stability audit

| Claim | Phase | PR/Commit | Evidence | Result | Confidence |
|-------|-------|-----------|----------|--------|------------|
| N=2 topology stable (snapshot) | P1.8.3.2 | — | SSH audit 14:26Z | SNAPSHOT_PASS | HIGH |
| Scheduler singleton (snapshot) | P1.8.3.2 | — | `/api/v1/health/readiness` schedulerLeader | SNAPSHOT_PASS | HIGH |
| Split brain post-stable | P1.8.3.2 | — | limited PM2 log grep | NO_SIGNAL_IN_LIMITED_SAMPLE | MEDIUM |
| Queue depths (snapshot) | P1.8.3.2 | — | Redis BullMQ | PASS (idle at audit) | HIGH |
| battery.v2 delta in window | P1.8.3.2 | — | failed ZSET scores | VERIFIED_ZERO_DELTA (64→64) | HIGH |
| battery.v2 backlog reclassification | P1.8.3.2 | — | audit scope | NOT_RECLASSIFIED | HIGH |
| Trip duplicates in window | P1.8.3.2 | — | SQL `vehicle_id,start_time` | VERIFIED_ZERO | HIGH |
| Trip/route volume | P1.8.3.2 | — | 2 trips, 2 routes | LOW_VOLUME_NEUTRAL | MEDIUM |
| DIMO in-flight at audit | P1.8.3.2 | — | Redis snapshot | 0 at audit | MEDIUM |
| DIMO max in-flight (window) | P1.8.3.2 | — | — | UNAVAILABLE | HIGH |
| Mutex overlap (window) | P1.8.3.2 | — | — | UNAVAILABLE | HIGH |
| Mutex certification | P1.8.3.2 | — | snapshot only | PARTIAL | MEDIUM |
| ATE multi-replica | P1.8.3.2 | — | zero jobs in window | UNEXERCISED / NEUTRAL | HIGH |
| Observational notes (FIND-01..03) | P1.8.3.2 | — | audit Phase 18 | 3 notes; NEW_P3=0 | HIGH |
| 24h soak certification | P1.8.3.2 | — | window 9532s | NOT_MET | HIGH |
| Evidence precision | P1.8.3.2 | — | v2 correction pass | CORRECTED | HIGH |
| N2 retrospective verdict | P1.8.3.2 | — | audit artifact | EARLY_PASS | HIGH |

---

## P1.8.3.3 — N=2 24h+ segmented retrospective audit

| Claim | Phase | PR/Commit | Evidence | Result | Confidence |
|-------|-------|-----------|----------|--------|------------|
| Calendar observation >24h | P1.8.3.3 | — | horizon 158877s | YES | HIGH |
| Longest continuous N=2 segment | P1.8.3.3 | — | PM2/deploy boundaries | 81024s NOT_MET | HIGH |
| Operational 24h+ retrospective | P1.8.3.3 | — | segmented audit | PASS_WITH_FINDINGS | HIGH |
| Continuous 24h soak | P1.8.3.3 | — | segment math | NOT_MET | HIGH |
| Post-checkpoint deploy count | P1.8.3.3 | — | auth.log + releases | 3 PASS, 2 FAIL attempts | HIGH |
| DEC-016 exact-SHA production | P1.8.3.3 | — | auth.log TMP bootstrap | NEEDS_PRECISION_REVIEW | MEDIUM |
| OQ-18 stale-current fix | P1.8.3.3 | — | auth.log | LIKELY_PRODUCTION_VERIFIED | MEDIUM |
| OQ-28 closure | P1.8.3.3 | — | segment <86400s | PARTIAL (not closed) | HIGH |
| Trip duplicates (horizon) | P1.8.3.3 | — | SQL + trip_repairs | PROVEN; RECONCILIATION_DUPLICATE (INC-07) | HIGH |
| battery.v2 net delta | P1.8.3.3 | — | Redis + dead letters | +36; 48-vs-36 reconciled; taxonomy RESOLVED_PARTIAL | HIGH |
| PM2 unexpected restarts | P1.8.3.3 | — | pm2.log + auth.log | PM2_AUTO_RECOVERY; not deploy cleanup | HIGH |
| Segment model corrected | P1.8.3.3 forensic | — | PM2 boundaries | 158815+62=158877 | HIGH |
| Scaling defect | P1.8.3.3 forensic | — | INC-07 | YES (idempotency defect) | HIGH |
| Merge recommendation | P1.8.3.3 forensic | — | causality closed | MERGE | HIGH |

---

## CI / build evidence

| Suite | Typical gate | Confidence |
|-------|--------------|------------|
| GitHub CI on scaling PRs | 25/25 workflows | HIGH |
| P1.2 regression | 112+ tests | HIGH |
| P1.3 + P1.7 + P1.4 gate | 36+ tests | HIGH |
| `SYNQDRIVE_BOOT_CHECK=1` | VPS deploy | HIGH |

---

## Evidence gaps (explicit)

1. No **continuous** 24h soak at N=2 (P1.8.3.3: longest segment 81024s; calendar ~44h with deploy segmentation)
2. No provider ceiling verification at N≈1000
3. Staging validation Redis DB ≠ production DB
4. Deploy leader-wait **verified in production** (P1.8.3.1 attempt 3)
5. Exact-SHA deploy: stale-current fix **likely** production-verified; full DEC-016 invariant **NEEDS_PRECISION_REVIEW** (P1.8.3.3 forensic)
6. INC-07 trip reconciliation idempotency — runtime remediation open
