# Redis Lock Resilience — Resolution Dossier (Phase 4)

**Gap:** `BAT-V2-GAP-LOCK-FAILOPEN-001`  
**Priority:** P2  
**Readiness:** RESEARCH_REQUIRED

## Confirmed fact

Redis unavailable → `BatteryV2VehicleLockService` returns `{ token: 'redis-unavailable' }` → **execution proceeds without lock** for all scopes (`ingest`, `assess`, `publish`, `hv`).

See `architecture/battery-v2/execution/locking.md`.

## Per-scope side-effect trace (RESEARCH_REQUIRED)

Do **not** claim "fail-open OK", "idempotency absorbs", or "rare duplicate" without per-scope evidence. Queue job-id idempotency ≠ proof that concurrent worker side effects are universally safe.

| Scope | Jobs | Tables / models | Unique / upsert | Deterministic keys | Concurrent distinct-job risk | Supersession / retry | Status |
|-------|------|-----------------|-----------------|-------------------|------------------------------|----------------------|--------|
| `ingest` | observation, snapshot, REST evaluate | `BatteryMeasurement`, observations | Partial unique on idempotencyKey | Observation + measurement keys | **UNKNOWN** — duplicate measurement possible | Retry re-enters handler | **RESEARCH_REQUIRED** |
| `assess` | `BATTERY_ASSESSMENT_RECOMPUTE` | `BatteryAssessment` | Assessment idempotency | `assess:{vehicle}:{type}:{inputVersion}` | **UNKNOWN** — parallel recompute | Handler idempotent execution service | **RESEARCH_REQUIRED** |
| `publish` | `BATTERY_PUBLICATION_UPDATE` | `BatteryPublication` | `idempotencyKey` unique | `pub:{assessmentId}:v{version}` | **UNKNOWN** — duplicate publication attempt | P2002 catch → find existing | **RESEARCH_REQUIRED** |
| `hv` | shadow, recharge, capability | HV sessions, shadow rows | Observation / session keys | Method-specific | **UNKNOWN** | Varies by job | **RESEARCH_REQUIRED** |

## OPTIONS

| Option | Verdict |
|--------|---------|
| FAIL_OPEN (status quo) | **CONFIRMED** behavior — safety **not validated** |
| FAIL_CLOSED global | Too brittle for ingest — **PROPOSED reject** without evidence |
| **DEGRADE_BY_SCOPE** | **PROPOSED** — e.g. publish fail-closed — **RESEARCH_REQUIRED** |
| DB-lock fallback | Future if Redis SPOF proven |

## EVIDENCE REQUIRED

- Multi-replica duplicate measurement count under Redis flap (read-only audit)
- Chaos test in staging: Redis down during concurrent assess + publish on same vehicle
- Trace whether `BatteryV2IdempotentExecutionService` prevents all duplicate persists per scope

## NON-EFFECTS

No implementation in Phase 4. No outage-frequency claims.
