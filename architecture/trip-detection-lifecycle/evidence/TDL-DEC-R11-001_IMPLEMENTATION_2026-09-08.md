# TDL-DEC-R11-001 — Implementation record (runtime)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R11-IMPL-001 |
| **Decision** | TDL-DEC-R11-001 |
| **Status** | **IMPLEMENTED (CI)** — not PRODUCTION_VALIDATED |
| **Design basis** | Draft PR #1583 documentation (`a352e9bcc`) — referenced, not merged |
| **Branch** | `cursor/trip-fsm-r11-empty-core-evidence-64c8` |
| **Base** | `main` @ `020c89c34` |

## Implemented behaviour

| Area | Implementation | Time boundaries |
|------|----------------|-----------------|
| Provider operational anchor | `resolveProviderOperationalAnchor()` — prefers `lastProviderActivityAt`, then `lastMeaningfulMovementAt`; worker `lastActivityAt` not used for empty-core silence | Existing **120 s** `TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS` |
| Stop boundary | `stopBoundaryAt` in `lastEvidenceSummary`; set on pause corroboration, `IDLE_WITHIN_TRIP` | Provider EVENT_TIME |
| Pause detection | `pauseDetectedAt` when corroborated motor-off + silence `< 120 s` | Does not trigger `POSSIBLE_END` |
| Empty-core gate | `stopBoundaryAt` semantics; pre-boundary stationary → `vls_stop_boundary_corroboration`; post-boundary motor load → `UNKNOWN`; inner/outer reason split | **120 s** corroboration TTL (no default 45 s) |
| Active continuity | `resumeAfterStopAt` on detector + `assessActiveContinuity` | Post-boundary core only |
| Fetch taxonomy | `trip-fetch-outcome.ts`; errors not coerced to empty stream | — |
| Backoff | `computeEmptyCoreBackoffMs` 30 s base → 600 s cap, ±15 % jitter | Config via `TRIP_EMPTY_CORE_BACKOFF_*` |
| PD-2 | **NOT implemented** | Flag absent |

## KS MS 661 (Audi) — addressed vs remaining

| Cause | Addressed? |
|-------|------------|
| Worker-time anchor shrink | **Yes** — provider anchor |
| Stale core motion before pause | **Yes** — `resumeAfterStopAt` filter |
| Stale engine load after IDLE | **Partial** — stop-boundary corroboration when VLS row present |
| Prolonged `vls_row_absent` | **No false end** — remains UNKNOWN/open (documented limitation) |
| Missing end corroboration within 120 s | **Unchanged product limit** when provider sends nothing |

## Scenario test results (local Jest)

| Scenario | Result |
|----------|--------|
| A — 60 s pause + resume | **PASS** |
| B — 136 s pause (SYNTHETIC) | **PASS** |
| C — COMPLETED chain | **NOT_RUN** (postgres integration gated/skipped in CI env) |
| D — data loss standing | **PASS** |
| E — data loss while moving | **PASS** |
| F — motor at standstill | **PASS** |
| G — stale load at stop boundary | **PASS** (+ documented absent-VLS limit) |
| H — fetch error taxonomy | **PASS** |
| I — backoff | **PASS** |
| J — R10 regression | **PASS** (`trip-fsm-motor-off-pause-r10`, `trip-end-cycle-reset`, R5 suites) |

## Files changed (runtime)

- `trip-empty-core-end-gate.ts` — gate semantics + forensics
- `trip-fsm-evidence-state.ts` — anchors, pause, backoff streak (new)
- `trip-empty-core-backoff.ts` (new)
- `trip-fetch-outcome.ts` (new)
- `trip-evidence.helpers.ts` — boundary filter + continuity param
- `trip-fsm-clock-contract.ts` — unchanged (legacy anchor retained for compat)
- `trip-detection-orchestration.service.ts` — integration
- `trip-end-cycle-reset.ts` — strip keys
- `worker.config.ts` — backoff env
- `detector.interfaces.ts` / `continuity-assessment.detector.ts`
- Specs: `trip-fsm-r11-empty-core-evidence.spec.ts`, updated gate/backoff specs

## Validators

```bash
cd backend && npm test -- --testPathPattern="trip-fsm-r11|trip-empty-core|trip-fsm-motor-off-pause-r10|trip-end-validation-r5|trip-end-cycle-reset"
bash architecture/scripts/validate-module-registry.sh
bash architecture/trip-detection-lifecycle/scripts/validate-graph.sh
```

**Mutations:** NONE on Production · **Authority promotion:** NONE
