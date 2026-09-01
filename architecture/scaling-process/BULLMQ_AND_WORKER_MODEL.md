# BullMQ and Worker Model

**TYPE:** ARCHITECTURE  
**SOURCE:** Worker modules, P1.7/P1.3 final responses, staging validation

---

## Core model

```
Scheduler Leader (one replica)
    → enqueues jobs to Redis/BullMQ
All replicas (workers)
    → consume jobs concurrently
DimoRequestExecutor + Mutex
    → bound provider HTTP + reconciliation mutations
```

**TYPE: DECISION** — Workers are **not** leader-guarded. **Producers** are.

---

## WHY all replicas consume

- Horizontal scale requires distributed job processing
- BullMQ designed for multi-consumer competition
- Safety from idempotency + mutex + global DIMO budget, not single consumer

**Alternatives rejected:**
- Leader-only workers — **rejected** (wastes capacity; single point of throughput)
- Separate worker PM2 app — **FUTURE_OPTION** (not current)

---

## Production queues (representative)

| Queue | Producer | Consumer safety |
|-------|----------|-----------------|
| `dimo.snapshot.poll` | Scheduler (leader) | Idempotent poll per vehicle |
| `dimo.trip-tracking` | Trip pipeline | Vehicle-scoped |
| `trip.behavior.enrichment` | Post-trip | Trip idempotency |
| `trip.driving-impact.compute` | Orchestrator | Trip scoped |
| `battery.v2` | Battery scheduler | Lock per vehicle (`battery:v2:lock:*`) |
| `notification.*` | Various | Outbox patterns |

**TYPE: FACT** — Inspect via `vps-inspect-bullmq-redis.sh`.

---

## Failed / dead-letter jobs

**TYPE: DECISION** — Historical failed jobs are **not** auto-purged during scaling workstreams.

P1.8.1 classified `battery.v2` failed backlog (67→65): legacy `restWindowId`, REST pending false-failures, lock contention, Prisma errors — **not** primarily LOCK_CONTENTION as initially assumed.

**RISK_IF_CHANGED:** Blind retry of historical failed jobs without classification.

---

## Retry storms

**TYPE: INVARIANT** — Scaling audits monitor:
- `RETRY_AMPLIFICATION = NO`
- `QUEUE_BACKLOG_RUNAWAY = NO`
- `STALLED_JOB_ANOMALY = NO`

P1.8 soak: PASS. P1.8.2: PASS.

---

## Deterministic job IDs

**TYPE: FACT** — e.g. battery.v2 colon-free SHA-256 digests (`battery-v2-<hash>`) to avoid BullMQ custom ID errors.

---

## Producer vs consumer concurrency

| Setting | Example env | Effect |
|---------|-------------|--------|
| `WORKER_SNAPSHOT_CONCURRENCY` | per process | Local snapshot workers |
| `WORKER_TRIP_TRACKING_CONCURRENCY` | per process | Local trip workers |
| `DIMO_GLOBAL_MAX_IN_FLIGHT` | 50 | **Global** HTTP cap |

**TYPE: INVARIANT** — Do not assume doubling replicas doubles safe provider throughput.

---

## Evidence

- P1.8 soak queue health PASS
- P1.8.2 post-scale queue snapshot (battery.v2 failed unchanged)
- Staging multi-replica validation (no duplicate job execution in probes)
