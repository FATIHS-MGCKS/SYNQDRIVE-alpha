# TDL-DEC-R11-001 — Implementation record (runtime)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R11-IMPL-001 |
| **Decision** | TDL-DEC-R11-001 |
| **Status** | **IMPLEMENTED (CI)** — not PRODUCTION_VALIDATED |
| **Design basis** | Draft PR #1583 documentation (`a352e9bcc`) — referenced, not merged |
| **Branch** | `cursor/trip-fsm-r11-empty-core-evidence-64c8` |
| **Runtime PR** | #1584 |

## Merge order vs #1583 (documentation)

1. **Optional first:** merge #1583 (docs-only contract) — no runtime dependency for #1584.
2. **Required for runtime:** merge #1584 (implementation + integration evidence).
3. **After merge to `main`:** authorized deploy of pinned SHA → natural-drive validation.

#1583 does not overwrite #1584 implementation artifacts; if #1583 lands first, re-read `TDL-DEC-R11-001_IMPLEMENTATION_2026-09-08.md` after merge for any contract wording drift. If #1584 lands first, #1583 remains valid design basis without changing runtime behaviour.

**SynqDrive Code views:** `ChangesView.tsx` / `ArchitekturView.tsx` updates are **deferred** from #1584 (i18n authority-protection gate blocks mixed `.github/workflows/*` + `frontend/src/*` product changes). Apply in a follow-up PR after merge or bundled with #1583 docs-only merge — architecture evidence here remains canonical for R11 integration proof.

## Implemented behaviour

| Area | Implementation | Time boundaries |
|------|----------------|-----------------|
| Provider operational anchor | `resolveProviderOperationalAnchor()` | **120 s** corroboration TTL |
| Stop boundary | `stopBoundaryAt` + `vls_stop_boundary_corroboration` | Provider EVENT_TIME |
| Pause detection | `pauseDetectedAt`; no `POSSIBLE_END` from pause alone | `< 120 s` silence |
| Wake preemption | `accelerateActiveTickAfterWake()` + `enqueuePreemptiveTripTrackingJob` | Replaces delayed ACTIVE_TICK |
| Backoff | `computeEmptyCoreBackoffMs` 30 s → 600 s cap | `TRIP_EMPTY_CORE_BACKOFF_*` |
| PD-2 | **NOT implemented** | — |

## Scenario matrix (test names + results)

| Scenario | Test suite / case | Result |
|----------|-------------------|--------|
| A — 60 s pause + resume | `trip-fsm-r11-empty-core-evidence.spec.ts` › A | **PASS** (unit) |
| B — 136 s KS MS 661 (SYNTHETIC) | `trip-fsm-r11-empty-core-evidence.spec.ts` › B | **PASS** (unit) |
| C — full completion chain | `trip-r11-empty-core-completion-chain.postgres-redis.integration.spec.ts` › `C — provider anchor → … COMPLETED + RESTING` | **PASS** (CI postgres+redis-memory-server BullMQ) |
| D/E — data loss standing/moving | `trip-fsm-r11-empty-core-evidence.spec.ts` › D/E | **PASS** (unit) |
| F — motor at standstill | `trip-fsm-r11-empty-core-evidence.spec.ts` › F | **PASS** (unit) |
| G — stale load at boundary | `trip-fsm-r11-empty-core-evidence.spec.ts` › G + `trip-r11-stop-evidence-semantics.spec.ts` | **PASS** |
| H — fetch taxonomy | `trip-fsm-r11-empty-core-evidence.spec.ts` › H | **PASS** (unit) |
| I — backoff/wake/queue | `trip-r11-backoff-wake-queue.postgres-redis.integration.spec.ts` › I-a…I-f | **PASS** (CI postgres+BullMQ) |
| J — R10 regression | `trip-fsm-motor-off-pause-r10`, `trip-finalize-end-cycle.postgres.integration` | **PASS** (CI) |
| Stop evidence semantics | `trip-r11-stop-evidence-semantics.spec.ts` | **PASS** (unit) |
| Scaling probe (synthetic) | `trip-r11-scaling-simulation.spec.ts` (5 / 1 000 / 10 000) | **PASS** (measured enqueue/backoff only — **not** production load) |

## Scaling — measurement vs model

| Cohort | Normal (deferral 0) | Outage (deferral 4) | Notes |
|--------|---------------------|---------------------|-------|
| 5 | measured enqueue/backoff | measured enqueue/backoff | `trip-r11-scaling-simulation.spec.ts` |
| 1 000 | measured enqueue/backoff | measured enqueue/backoff | no provider/DB/Redis IO |
| 10 000 | measured enqueue/backoff | measured enqueue/backoff | jitter unseeded; wall-time extrapolation **not** measured |

Design load model remains in #1583 contract docs; execution evidence is the synthetic probe above only.

## KS MS 661 (Audi) — addressed vs remaining

| Cause | Addressed? |
|-------|------------|
| Worker-time anchor shrink | **Yes** |
| Stale core motion before pause | **Yes** |
| Stale engine load after IDLE (VLS present) | **Partial** |
| Prolonged `vls_row_absent` | **Open** — UNKNOWN, no false end |
| Missing end corroboration within 120 s | **Unchanged product limit** |

## CI commands

```bash
cd backend && npm run test:trip-r11:unit
cd backend && npm run test:trip-r11:postgres-redis:ci   # requires Postgres service
cd backend && npm run test:trip-finalize:postgres:ci      # R10 regression
bash architecture/trip-detection-lifecycle/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```

**Mutations:** NONE on Production · **Authority promotion:** NONE
