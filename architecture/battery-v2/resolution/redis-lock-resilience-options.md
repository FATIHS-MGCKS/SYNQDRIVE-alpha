# Redis Lock Resilience — Resolution Dossier (Phase 4)

**Gap:** `BAT-V2-GAP-LOCK-FAILOPEN-001`  
**Priority:** P2  
**Readiness:** RESEARCH_REQUIRED

## Per-scope analysis

| Scope | Jobs | Duplicate risk if fail-open | DB idempotency | Recommendation |
|-------|------|----------------------------|----------------|----------------|
| `ingest` | snapshot, observation | Duplicate measurements possible | Partial unique keys | **DEGRADE: fail-open OK** with idempotency audit |
| `assess` | assessment recompute | Duplicate assessments | Idempotency service | **DEGRADE: fail-open** — acceptable |
| `publish` | publication update | Duplicate publication writes | Publication versioning | **FAIL_CLOSED preferred** |
| `hv` | shadow, recharge | Duplicate shadow rows | Observation keys | **DEGRADE: fail-open** |

## Outage durations

| Duration | Effect |
|----------|--------|
| 30s | Rare duplicate job; idempotency absorbs |
| 5min | Elevated duplicate + queue depth |
| Prolonged | Risk of conflicting assessments; monitor Redis |

## OPTIONS

| Option | Verdict |
|--------|---------|
| FAIL_OPEN (status quo) | Default ingest/assess/hv |
| FAIL_CLOSED global | Too brittle for ingest |
| **DEGRADE_BY_SCOPE** | **RECOMMENDED** — publish fail-closed |
| DB-lock fallback | Future if Redis SPOF proven |

## EVIDENCE REQUIRED

- Multi-replica duplicate measurement count under Redis flap (read-only audit)
- Chaos test in staging: Redis down 60s during assess job

## NON-EFFECTS

No implementation in Phase 4.
