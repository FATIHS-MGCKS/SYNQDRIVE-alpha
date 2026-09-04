# Open Questions and Future Work

**TYPE:** OPEN_QUESTION / FUTURE_OPTION registry  
**STATUS:** Living document

Do **not** treat items here as current production architecture.

**Validation:** `node architecture/scaling-process/scripts/validate-open-questions.mjs` — fails on duplicate OQ IDs.

---

## Provider and fleet scale

| ID | Topic | Category | Notes |
|----|-------|----------|-------|
| OQ-01 | Provider ceiling verification at N≈1000 | OPEN_QUESTION | `PROVIDER_CEILING_VERIFIED=NO` |
| OQ-02 | True N≈1000 multi-replica production soak | OPEN_QUESTION | Requires DB 0, sustained load |
| OQ-03 | DIMO quota adaptation / dynamic limit | FUTURE_OPTION | Not implemented |
| OQ-04 | Per-org fairness under saturation | FUTURE_OPTION | P1.3 priority exists; org fairness TBD |

---

## Replica count and topology

| ID | Topic | Category | Notes |
|----|-------|----------|-------|
| OQ-05 | ~~Restore production replica B~~ | **CLOSED** | P1.8.3 2026-09-01 |
| OQ-06 | ~~Merge #1472 before next deploy~~ | **CLOSED** | Merged d6884ce |
| OQ-07 | Replica count > 2 | FUTURE_OPTION | Not authorized |
| OQ-08 | Separate scheduler / API / worker processes | FUTURE_OPTION | Architecture split |
| OQ-09 | Kubernetes / Docker orchestration | FUTURE_OPTION | Explicitly out of scope P1.8.2.1 |

---

## Deploy lifecycle and provenance

| ID | Topic | Category | Notes |
|----|-------|----------|-------|
| OQ-17 | Deploy scheduler leader convergence / leader-election wait | **CLOSED** | P1.8.3.1 production verified; INC-06 CLOSED; `DEPLOY_LEADER_CONVERGENCE_GATE=VERIFIED_PRODUCTION` |
| OQ-18 | Bootstrap deploy can execute stale logic from pre-success `current` | **CLOSED** | P1.8.3.5: INC-07 deploy used canonical TMP exact-SHA bootstrap; full DEC-016 invariant directly verified in deploy log |

---

## Observability and SLOs

| ID | Topic | Category | Notes |
|----|-------|----------|-------|
| OQ-10 | Leader failover SLO formalization | OPEN_QUESTION | Measured 7.9s–32s; no SLO doc |
| OQ-11 | Queue age/depth alert thresholds | OPEN_QUESTION | Soak checked qualitatively |
| OQ-12 | Health endpoint git SHA exposure | FUTURE_OPTION | Would simplify deploy verify |
| OQ-13 | Prometheus TSDB retention for soak graphs | LIMITATION | VPS limited history |

---

## Infrastructure HA

| ID | Topic | Category | Notes |
|----|-------|----------|-------|
| OQ-14 | Redis HA / Sentinel | FUTURE_OPTION | Single instance today |
| OQ-15 | PostgreSQL HA | FUTURE_OPTION | Single primary today |
| OQ-16 | Multi-region scaling | FUTURE_OPTION | Not in scope |

---

## Deployment maturity

| ID | Topic | Category | Notes |
|----|-------|----------|-------|
| OQ-19 | nginx upstream auto-sync with PM2 | FUTURE_OPTION | Manual/config today |
| OQ-28 | P1.8.3 post-scale retrospective / sustained N=2 soak | **PARTIAL** | P1.8.3.2 EARLY_PASS (~2h39m); P1.8.3.3 calendar ~44h but longest continuous segment 81024s (<86400); 3 deploys segmented runtime |
| OQ-29 | Automated deploy CI for ops scripts | FUTURE_OPTION | Shell + unit tests exist; exact-SHA tests added |

---

## Trip reconciliation idempotency

| ID | Topic | Category | Notes |
|----|-------|----------|-------|
| OQ-30 | `INTRA_TRIP_GAP_SPLIT` reconciliation idempotency | **PARTIAL** | P1.8.3.5: fix deployed production `5b788a223`; validation start `2026-09-03T21:19:07Z`; natural warm-tier evidence pending; INC-07 closes only after STRONG/MODERATE replay evidence |

---

## Queue architecture

| ID | Topic | Category | Notes |
|----|-------|----------|-------|
| OQ-20 | Queue partitioning by tenant | FUTURE_OPTION | |
| OQ-21 | Historical battery.v2 failed backlog remediation | OPEN_QUESTION | P1.8.3.3 taxonomy RESOLVED_PARTIAL (REST/assessment/lock); not scaling-related |
| OQ-22 | Autoscaling workers | FUTURE_OPTION | |

---

## Energy / refuel

| ID | Topic | Category | Notes |
|----|-------|----------|-------|
| OQ-23 | Historical refuel backfill | FUTURE_OPTION | Explicitly excluded from scaling tasks |
| OQ-24 | Live refuel validation at N=2 | OPEN_QUESTION | NEUTRAL in P1.8.2 (no events) |

---

## Cost and operations

| ID | Topic | Category | Notes |
|----|-------|----------|-------|
| OQ-25 | Cost model for N replicas + DIMO calls | FUTURE_OPTION | |
| OQ-26 | Regional scaling | FUTURE_OPTION | |

---

## PR #1442

| ID | Topic | Category | Notes |
|----|-------|----------|-------|
| OQ-27 | P1.8 scale-to-2 readiness gate PR | OPEN_QUESTION | #1442 still OPEN — may overlap #1469–#1471 |
