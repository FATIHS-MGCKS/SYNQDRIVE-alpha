# Open Questions and Future Work

**TYPE:** OPEN_QUESTION / FUTURE_OPTION registry  
**STATUS:** Living document

Do **not** treat items here as current production architecture.

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
| OQ-17 | Deploy leader-election wait in verify | **IMPLEMENTED** | P1.8.3.1; prod validation pending |
| OQ-18 | Bootstrap deploy uses old script from current | OPEN_QUESTION | First post-merge deploy caveat |
| OQ-07 | Replica count > 2 | FUTURE_OPTION | Not authorized |
| OQ-08 | Separate scheduler / API / worker processes | FUTURE_OPTION | Architecture split |
| OQ-09 | Kubernetes / Docker orchestration | FUTURE_OPTION | Explicitly out of scope P1.8.2.1 |

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
| OQ-17 | P1.8.3 post-scale retrospective audit | OPEN_QUESTION | NEXT_STAGE from P1.8.2 |
| OQ-18 | Automated deploy CI for ops scripts | FUTURE_OPTION | Shell tests exist |
| OQ-19 | nginx upstream auto-sync with PM2 | FUTURE_OPTION | Manual/config today |

---

## Queue architecture

| ID | Topic | Category | Notes |
|----|-------|----------|-------|
| OQ-20 | Queue partitioning by tenant | FUTURE_OPTION | |
| OQ-21 | Historical battery.v2 failed backlog remediation | OPEN_QUESTION | Classified; not auto-fixed |
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
