# Scaling Envelopes

**TYPE:** CERTIFICATION_MODEL  
**STATUS:** Bootstrap 2026-09-01

Certification levels:

| Level | Meaning |
|-------|---------|
| **CURRENTLY PROVEN** | Production or authoritative VPS evidence |
| **CONDITIONALLY CERTIFIED** | Strong software/tests; external/provider gaps |
| **NOT YET CERTIFIED** | Design only or insufficient evidence |

---

## N = 1 (single replica)

| Aspect | Status | Evidence |
|--------|--------|----------|
| Scheduler leader | PROVEN (trivial) | P1.8 soak |
| DIMO budget | PROVEN | Soak: limit 50, in-flight ≤1, 0 breaches |
| Mutex | PROVEN | Soak: 335 acquires, 0 double exec |
| Trip pipeline | PROVEN | 11 trips COMPLETED in window |
| Route V2 | PROVEN | 0 retryable failures in soak |
| 24h stability | PROVEN | 0 PM2 restarts during soak window |
| Provider ceiling | NOT VERIFIED | Soak single-tenant load |

**Verdict:** `GO_WITH_CONDITIONS` (#1469)

---

## N = 2 (production replicas)

| Aspect | Status | Evidence |
|--------|--------|----------|
| Process-level coordination | PROVEN (2026-08-31) | P1.8.2 controlled scale |
| Scheduler failover | PROVEN | 32s, leader max 1 |
| Mutex contention | PROVEN | coordination probe DB 0 |
| DIMO global budget | PROVEN | limit 50, no breach in probe |
| nginx dual upstream | PROVEN (configured) | P1.8.2 |
| Sustained 24h at N=2 | **NOT YET** | Only active validation window |
| Deploy preserves N=2 | **NOT on main** | #1472 open; drift 2026-09-01 |
| Current production N=2 | **NO** (drift) | CURRENT_STATE 2026-09-01 |

**Verdict:** Architecture **proven** 2026-08-31; **runtime currently at N=1** until restored.

---

## N ≤ 50 / N ≤ 100

| Aspect | Status |
|--------|--------|
| Software gates | CONDITIONAL — P1.3 load model tests |
| Multi-replica logic | CONDITIONAL — staging only |
| Production soak | NOT YET |

**Assumptions:** DIMO limit 50 adequate; queue depths stable; single Redis.

---

## N ≈ 250

| Aspect | Status |
|--------|--------|
| All N=100 gaps | Apply |
| Scheduler tick fanout | NOT YET CERTIFIED |
| Snapshot enqueue rate | NOT YET CERTIFIED |

**FUTURE_OPTION:** Queue partitioning, per-org fairness.

---

## N ≈ 1000

| Aspect | Status |
|--------|--------|
| Provider ceiling verified | **NO** |
| Multi-replica prod Redis DB 0 soak | **NO** (validation used DB 15) |
| N1000 certification | **CONDITIONAL** (P1.3 final response) |

**Required for full certification:**
- Provider quota verification with DIMO
- Sustained multi-replica production soak
- Queue age/depth SLOs
- Observability at fleet scale
- Deploy/rollback automation merged (#1472+)

---

## Topology assumptions by envelope

| Envelope | PM2 | Redis | Postgres | nginx |
|----------|-----|-------|----------|-------|
| N=1 | 1 fork | single DB 0 | single | 1 upstream |
| N=2 | 2 fork | single DB 0 | single | 2 upstream |
| N≈1000 | 2+ ? | HA TBD | HA TBD | LB TBD |

**TYPE: OPEN_QUESTION** — Replica count beyond 2 not authorized in current workstream.

---

## Worker concurrency assumptions

**TYPE: FACT** — Documented in `p13-production-scale-gate.spec.ts`:
- Local concurrency × replicas ≠ provider safe throughput
- Global budget is the provider gate

---

## Risk summary table

| Envelope | Primary risk if scaled without evidence |
|----------|----------------------------------------|
| N=2 deploy drift | Mixed SHA, dead upstream |
| N=50+ | DIMO 429, queue backlog |
| N=1000 | Provider hard limit, Redis single point |
