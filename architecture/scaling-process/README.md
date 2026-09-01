# SCALING PROCESS — Canonical Knowledge Graph & Architecture Authority

**Workstream:** SCALING PROCESS  
**Authority status:** Bootstrap established 2026-09-01  
**Maturity:** Living architecture authority (not a final report)

---

## What this is

`architecture/scaling-process/` is the **persistent canonical knowledge system** for SynqDrive horizontal scaling, multi-replica coordination, production scale gates, and deployment lifecycle.

It preserves:

- what the scaling architecture **currently is** (runtime truth)
- **why** each coordination layer exists
- what was **tested and proven** vs **conditional / unproven**
- **incidents** and lessons that shaped decisions
- **invariants** future agents must not break
- **open work** for higher replica counts and provider certification

The **repository** is the source of truth. This directory synthesizes it for independent agents.

---

## Epistemic categories

Every important statement should be classifiable as:

| Category | Meaning |
|----------|---------|
| **FACT** | Verified from code, runtime, or primary evidence |
| **DECISION** | Chosen architecture path with rationale |
| **INVARIANT** | Must hold for safe operation |
| **EVIDENCE** | Test, soak, validation, or observation supporting a claim |
| **INCIDENT** | Failure or near-miss with documented timeline |
| **LIMITATION** | Known boundary of current certification |
| **OPEN_QUESTION** | Unresolved; not current architecture |
| **FUTURE_OPTION** | Deferred alternative; not implemented |
| **SUPERSEDED_DECISION** | Historical; replaced but preserved |

Do not present **FUTURE_OPTION** or **OPEN_QUESTION** as production **FACT**.

---

## Entry points

| Document | Purpose |
|----------|---------|
| [CURRENT_STATE.md](./CURRENT_STATE.md) | Machine-friendly snapshot of runtime truth **now** |
| [SCALING_PROCESS_KNOWLEDGE_GRAPH.md](./SCALING_PROCESS_KNOWLEDGE_GRAPH.md) | Navigable graph + dependency edges |
| [SYSTEM_TOPOLOGY.md](./SYSTEM_TOPOLOGY.md) | PM2, nginx, Redis, PostgreSQL production layout |
| [SCHEDULER_LEADER_ELECTION.md](./SCHEDULER_LEADER_ELECTION.md) | P1.7 singleton scheduler producer model |
| [DIMO_GLOBAL_PROVIDER_BUDGET.md](./DIMO_GLOBAL_PROVIDER_BUDGET.md) | P1.3 global provider HTTP ceiling |
| [RECONCILIATION_EXECUTION_MUTEX.md](./RECONCILIATION_EXECUTION_MUTEX.md) | P1.4 per-vehicle reconciliation lock |
| [BULLMQ_AND_WORKER_MODEL.md](./BULLMQ_AND_WORKER_MODEL.md) | Queue consumers vs scheduler producers |
| [MULTI_REPLICA_DEPLOYMENT.md](./MULTI_REPLICA_DEPLOYMENT.md) | Deploy/rollback lifecycle (P1.8.2.1) |
| [FAILURE_AND_RECOVERY_MODEL.md](./FAILURE_AND_RECOVERY_MODEL.md) | Failover, rollback, incident patterns |
| [SCALING_ENVELOPES.md](./SCALING_ENVELOPES.md) | What is proven at N=1, N=2, N≈1000, etc. |
| [DECISION_LOG.md](./DECISION_LOG.md) | Why decisions were made |
| [VALIDATION_EVIDENCE.md](./VALIDATION_EVIDENCE.md) | Claims → evidence mapping |
| [OPEN_QUESTIONS_AND_FUTURE_WORK.md](./OPEN_QUESTIONS_AND_FUTURE_WORK.md) | Not yet certified |
| [AGENT_MAINTENANCE_POLICY.md](./AGENT_MAINTENANCE_POLICY.md) | Rules for future agents |

---

## Phase workstream map (historical)

| Phase | Focus | Key PRs / artifacts |
|-------|--------|---------------------|
| **P1.2** | Snapshot polling, trip-loss safety, activity tiers | #1409, `SNAPSHOT_POLLING_P1_2_*` |
| **P1.3** | Global DIMO provider budget (Redis lease semaphore) | #1417, S1–S6 stages |
| **P1.4** | Reconciliation execution mutex | #1435 |
| **P1.7** | Scheduler leader election | #1430 |
| **Staging** | Multi-replica validation (logical + process-level) | #1438, #1440 |
| **P1.8** | 24h single-replica soak retrospective | #1469 |
| **P1.8.1** | Pre-scale remediation (orphan 3010, battery.v2 forensics) | #1470 |
| **P1.8.2** | Controlled production scale 1→2 | #1471 |
| **P1.8.2.1** | Multi-replica deploy lifecycle hardening | #1472 (open) |

---

## Related legacy architecture (evidence sources)

- `architecture/P1_*` phase final responses
- `architecture/STAGING_*_MULTI_REPLICA_*`
- `architecture/SNAPSHOT_POLLING_P1_2_*`
- `architecture/DIMO_GLOBAL_PROVIDER_BUDGET_*`
- `architecture/SCHEDULER_LEADER_ELECTION_P1_7_RUNBOOK_*`

---

## Maintenance

See [AGENT_MAINTENANCE_POLICY.md](./AGENT_MAINTENANCE_POLICY.md). No scaling architecture change is complete without updating this authority when runtime truth or decisions change.
