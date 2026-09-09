# TDL-DEC-R11-001 — Implementation record (runtime)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R11-IMPL-001 |
| **Decision** | TDL-DEC-R11-001 |
| **Status** | **IMPLEMENTED (CI)** — not PRODUCTION_VALIDATED |
| **Design basis** | Draft PR #1583 documentation (`a352e9bcc`) — referenced, not merged |
| **Branch** | `cursor/trip-fsm-r11-empty-core-evidence-64c8` |
| **Head SHA (evidence)** | `4cf4d616e96203c0f7f21b268c46c5f056cb3606` |
| **Runtime PR** | #1584 |

## Merge order vs #1583 (documentation)

1. **Optional first:** merge #1583 (docs-only contract) — no runtime dependency for #1584.
2. **Required for runtime:** merge #1584 (implementation + integration evidence).
3. **After merge to `main`:** authorized deploy of pinned SHA → natural-drive validation.

#1583 does not overwrite #1584 implementation artifacts; if #1583 lands first, re-read `TDL-DEC-R11-001_IMPLEMENTATION_2026-09-08.md` after merge for any contract wording drift. If #1584 lands first, #1583 remains valid design basis without changing runtime behaviour.

**SynqDrive Code views:** `ChangesView.tsx` / `ArchitekturView.tsx` updates are **deferred** from #1584 (i18n authority-protection gate blocks mixed `.github/workflows/*` + `frontend/src/*` product changes). Apply in a follow-up PR after merge or bundled with #1583 docs-only merge — architecture evidence here remains canonical for R11 integration proof.

**CI merge gate (non-R11):** `.github/workflows/trip-fsm-production-readiness.yml` changes require trusted `i18n-governance-authority-change` label approval (`GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL`) — expected until maintainer labels the PR.

## Implemented behaviour

| Area | Implementation | Time boundaries |
|------|----------------|-----------------|
| Provider operational anchor | `resolveProviderOperationalAnchor()` | **120 s** corroboration TTL |
| Stop boundary | `stopBoundaryAt` + `resolveIdleStopBoundaryAt()` + `vls_stop_boundary_corroboration` | Provider EVENT_TIME; IDLE prefers stationary VLS obs |
| Pause detection | `pauseDetectedAt`; no `POSSIBLE_END` from pause alone | `< 120 s` silence |
| Wake preemption | `accelerateActiveTickAfterWake()` + `enqueuePreemptiveTripTrackingJob` | Replaces delayed ACTIVE_TICK |
| Backoff | `computeEmptyCoreBackoffMs` 30 s → 600 s cap | `TRIP_EMPTY_CORE_BACKOFF_*` |
| PD-2 | **NOT implemented** | — |

## Scenario matrix (test names + results)

| Scenario | Test suite / case | Result |
|----------|-------------------|--------|
| A — 60 s pause + resume | `trip-fsm-r11-empty-core-evidence.spec.ts` › A | **PASS** (unit) |
| B — 136 s KS MS 661 (SYNTHETIC) | `trip-fsm-r11-empty-core-evidence.spec.ts` › B | **PASS** (unit) |
| C — full completion chain (pre-seeded boundary) | `trip-r11-empty-core-completion-chain.postgres-redis.integration.spec.ts` › C | **PASS** (CI) |
| **J — stop boundary generation + full chain (KS661 entry)** | `trip-r11-stop-boundary-completion-chain.postgres-redis.integration.spec.ts` › J | **PASS** (CI) — proves boundary from orchestration, not fixture |
| D/E — data loss standing/moving | `trip-fsm-r11-empty-core-evidence.spec.ts` › D/E | **PASS** (unit) |
| F — motor at standstill | `trip-fsm-r11-empty-core-evidence.spec.ts` › F | **PASS** (unit) |
| G — stale load at boundary | `trip-fsm-r11-empty-core-evidence.spec.ts` › G + `trip-r11-stop-evidence-semantics.spec.ts` | **PASS** |
| H — fetch taxonomy | `trip-fsm-r11-empty-core-evidence.spec.ts` › H | **PASS** (unit) |
| I — backoff/wake/queue | `trip-r11-backoff-wake-queue.postgres-redis.integration.spec.ts` › I-a…I-f | **PASS** (CI) |
| R10 regression | `trip-fsm-motor-off-pause-r10`, `trip-finalize-end-cycle.postgres.integration` | **PASS** (CI) |
| Stop boundary + counter-cases | `trip-fsm-evidence-state.spec.ts` | **PASS** (unit) |
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
| Stale engine load after IDLE (VLS present) | **Yes** — `resolveIdleStopBoundaryAt` + boundary corroboration (Scenario J) |
| **`vls_row_absent` misclassified on KS MS 661 Production** | **Corrected** — see [KS_MS_661_STOP_BOUNDARY_AUDIT_CORRECTION_2026-09-09.md](KS_MS_661_STOP_BOUNDARY_AUDIT_CORRECTION_2026-09-09.md); actual blocker was load/freshness |
| True `telemetry === null` (`vls_row_absent`) | **Open** — UNKNOWN, no false end |
| Natural Production validation | **After authorized deploy** — not claimed pre-deploy |

**Audit correction:** Prior docs cited `vls_row_absent` for KS MS 661 late phase; Production DB forensics show persistent VLS row with `vls_stale_provider_observation` / engine-load ACTIVE. Production trip completed via **`STALE_ONGOING` repair**, not FSM end detection.

## CI commands

```bash
cd backend && npm run test:trip-r11:unit
cd backend && npm run test:trip-r11:postgres-redis:ci   # requires Postgres service
cd backend && npm run test:trip-finalize:postgres:ci      # R10 regression
bash architecture/trip-detection-lifecycle/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```

**Mutations:** NONE on Production · **Authority promotion:** NONE
