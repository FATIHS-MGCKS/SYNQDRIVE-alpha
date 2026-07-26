# Notification Engine — Load & Resilience Test Report

**Date:** 2026-07-26 (UTC)  
**Environment:** Isolated in-memory test harness (Jest) — **not production**  
**Suite:** `notification-load-resilience.spec.ts`  
**Report artifact:** `backend/tmp/notification-load-resilience-report.json` (generated via `NOTIFICATION_LOAD_REPORT=1`)

---

## 1. Executive summary

| Expectation | Result |
|-------------|--------|
| No active fingerprint duplicates | **Pass** (all scenarios) |
| No cross-tenant mixing | **Pass** |
| No lost occurrences | **Pass** |
| Controlled retries | **Pass** |
| Stable API under parallel load | **Pass** |

**16/16 scenarios passed** after fixing an out-of-order timestamp bug in `NotificationCoreService`.

**Scope limitation:** Metrics reflect in-memory Prisma simulation with fingerprint-level locking. Real staging benchmarks (Postgres, Redis, BullMQ, multi-PM2) remain a follow-up before production cutover sign-off.

---

## 2. Test matrix

| # | Scenario | Result |
|---|----------|--------|
| 1 | 10,000 distinct notifications (one org) | Pass |
| 2 | 10 parallel identical candidates | Pass |
| 3 | 100 parallel distinct candidates | Pass |
| 4 | Two backend instances (shared store) | Pass |
| 5 | WARNING → CRITICAL escalation | Pass |
| 6 | CRITICAL → recovery (SUCCESS) | Pass |
| 7 | Resolve and reopen | Pass |
| 8 | Out-of-order events | Pass (after fix) |
| 9 | BullMQ retry analog (P2002 retry) | Pass |
| 10 | Redis interruption analog (V2 flag off) | Pass |
| 11 | Worker restart (new service instance) | Pass |
| 12 | Provider timeout → outbox retry | Pass |
| 13 | DB conflict / parallel dedup (20 ingests) | Pass |
| 14 | API list — 50 parallel requests | Pass |
| 15 | API counts — 50 parallel requests | Pass |
| 16 | Multi-org parallel ingest | Pass |

---

## 3. Latency measurements (ms)

### Ingestion (`ingestCandidate`)

| Scenario | p50 | p95 | p99 | max | Error rate |
|----------|-----|-----|-----|-----|------------|
| 10k distinct (n=10,000) | 0.44 | 0.87 | 1.34 | 20.33 | 0% |
| 10 parallel identical (n=10) | 1.11 | 1.20 | 1.20 | 1.20 | 0% |
| 100 parallel distinct (n=100) | 1.77 | 2.07 | 2.10 | 2.17 | 0% |

### API (mocked repository, 200 rows)

| Endpoint | p50 | p95 | p99 | Parallel |
|----------|-----|-----|-----|----------|
| `GET /notifications` (list) | 45.4 | 45.5 | 45.8 | 50 |
| `GET /notifications/counts` | 1.10 | 1.13 | 1.25 | 50 |

---

## 4. Integrity metrics

| Metric | Value |
|--------|------:|
| Active duplicate fingerprint groups | **0** |
| Orphan occurrences | **0** |
| Lost occurrences (20-way parallel dedup) | **0** |
| Outbox backlog (harness) | 0 at rest |
| Dead letters (harness) | 0 |
| Cross-tenant leak (scenario 16) | false |

---

## 5. Infrastructure metrics

| Resource | Measured in harness |
|----------|---------------------|
| CPU | Not instrumented (in-memory) |
| RAM | Not instrumented |
| Redis | Simulated (flag-off path only) |
| PostgreSQL locks | Simulated via P2002 + retry |
| Queue delay | N/A (BullMQ not in harness) |

**Note:** For staging validation, run `NOTIFICATION_EVALUATION_LIVE_INTEGRATION=1` against local `infra:up` Redis/Postgres.

---

## 6. SLO assessment

| SLO | Target | Harness result | Status |
|-----|--------|----------------|--------|
| No duplicate active fingerprints | 0 | 0 | **Met** |
| Ingest error rate | < 0.1% | 0% | **Met** |
| Occurrence integrity | 100% | 100% | **Met** |
| 10k notifications/org throughput | Documented gap | ~4.6s total (~0.46ms p50) | **Met (harness)** |
| API list p95 | < 500ms (informal) | 45.5ms (mocked) | **Met (mock)** |
| Real DB ingest p99 | TBD staging | Not measured | **Open** |
| Multi-PM2 instance | TBD staging | Simulated via dual service | **Partial** |

---

## 7. Bug fixed during testing

### Out-of-order `occurredAt` corrupted `firstSeenAt` / `lastSeenAt`

**Symptom:** When a newer event was ingested before an older event, `firstSeenAt` remained at the newer timestamp instead of expanding to the earliest occurrence.

**Fix:** `NotificationCoreService.updateActiveFromCandidate` and `reopenNotificationInternal` now use min/max bounds:

- `firstSeenAt = min(existing, candidate.occurredAt)`
- `lastSeenAt = max(existing, candidate.occurredAt)`

**Files:** `notification-core.service.ts`, regression tests in `notification-core.service.spec.ts` and scenario 8.

---

## 8. Remaining blockers

1. **No staging/VPS load run** — harness is in-memory; production Postgres contention not measured.
2. **BullMQ live retry** — only P2002 retry unit test; full queue delay not benchmarked.
3. **CPU/RAM/Redis/PG lock metrics** — require staging observability stack.
4. **Remediation code not on production** — see VPS control audit (Prompt 33).

---

## 9. How to reproduce

```bash
cd backend
npm test -- --testPathPattern=notification-load-resilience

# Generate machine-readable report:
NOTIFICATION_LOAD_REPORT=1 npm test -- --testPathPattern=notification-load-resilience --silent
cat tmp/notification-load-resilience-report.json
```

---

## Related

- `docs/audits/notification-engine-vps-control-audit-2026-07.md`
- `docs/notification-engine-production-readiness.md` §10
- `backend/src/modules/notifications/testing/notification-test-harness.ts`
