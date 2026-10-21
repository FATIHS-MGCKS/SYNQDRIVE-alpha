# Trip FSM Shadow Observability (End + Pause Separation)

| Field | Value |
|-------|-------|
| **Status** | Non-authoritative observability layer — **NOT end authority** |
| **Default rollout** | `TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED=false` |
| **Vehicle scope** | `TRIP_FSM_SHADOW_VEHICLE_IDS` (comma-separated stable vehicle UUIDs) |
| **Last updated** | 2026-09-14 |

## Purpose

Shadow observability answers production questions **without changing** trip start, stay-open, end, finalize, separation, queue timing, CUSUM, or #1603/#1617/#1627/#1635 runtime semantics:

1. **Provider-silence counterfactual (#1635)** — Would provider-silence have admitted `POSSIBLE_END` if a stronger end authority had not already won?
2. **Pause / resume observation** — When the vehicle pauses and later moves, did the same trip continue, resume during `POSSIBLE_END`, or start a new trip after terminalization?

## Safety contract

- Shadow evaluation has **zero FSM decision authority**.
- Failures inside shadow code are **fail-open** (`runTripObservabilitySafely` / `runShadowObservabilitySafely`).
- No extra provider, ClickHouse, DIMO, or queue calls.
- Persisted under **`shadowObservability`** namespace only — no authoritative reader may consume it.

## Provider-silence counterfactual semantics

- Reuses `assessProviderSilenceEmptyCoreAdmission()` from `trip-empty-core-end-gate.ts` — same #1635 contract.
- **`trust=false`** and **`clockAuthority=PROVIDER_EVENT_TIME`** invariants preserved.
- Stale/UNKNOWN VLS is **not promoted** to fresh ACTIVE.
- Post-candidate movement invalidation is recorded separately from eligibility.
- When ClickHouse end assist or trusted boundary wins, the **real path is unchanged**; shadow may still record counterfactual eligibility.

## Pause / resume model

- Observes real stationary episodes via existing pause/stop evidence (`pauseDetectedAt`, `IDLE_WITHIN_TRIP`, movement resume).
- Duration buckets (`<2min`, `2-5min`, …) are **reporting only** — not FSM thresholds.
- Classifications: `SAME_TRIP_RESUME`, `RESUME_DURING_POSSIBLE_END`, `NEW_TRIP_AFTER_COMPLETION`, `NEW_TRIP_AFTER_RESTING`, etc.

## Persistence sinks (preferred order)

1. `vehicle_trip_tracking_runs.result_summary.shadowObservability` (event-level)
2. `vehicle_trip_detection_states.last_evidence_summary.shadowObservability` (rolling per trip)
3. `vehicle_trips.raw_detection_meta.shadowObservability` (terminal per-trip summary at finalize)

## Read-only audit command

```bash
cd backend
npm run trip:shadow:audit -- --vehicle-id=<uuid> --since=2026-09-01T00:00:00.000Z --until=2026-09-15T00:00:00.000Z
npm run trip:shadow:audit -- --fixtures-only
```

Real audit requires `DATABASE_URL`, `--vehicle-id`, `--since`, and `--until`. Missing `DATABASE_URL` without `--fixtures-only` exits non-zero.

## Canary strategy (initial)

Fail-closed: `ENABLED=true` with an **empty** allowlist enables shadow for nobody. Explicit vehicle UUIDs required.

Enable for test vehicles by **stable vehicle ID** (not registration plate):

- KS MX 2024 — `a60c0749-a7cd-494e-b5b9-dea3c6b97d63`
- WOB L 7503 — configure via dashboard secret/env
- KS MS 661 — configure via dashboard secret/env

Example:

```bash
TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED=true
TRIP_FSM_SHADOW_VEHICLE_IDS=a60c0749-a7cd-494e-b5b9-dea3c6b97d63
```

## Implementation map

| Component | Path |
|-----------|------|
| Config | `trip-fsm-shadow-observability.config.ts` |
| Provider silence evaluator | `trip-fsm-shadow-provider-silence.evaluator.ts` |
| Pause/resume tracker | `trip-fsm-shadow-summary.builder.ts` |
| Orchestration hooks | `trip-detection-orchestration.service.ts` (observability-only) |
| Unit tests | `trip-fsm-shadow-observability.spec.ts` |
| Audit script / domain | `scripts/ops/audit-trip-fsm-shadow-observability.ts`, `trip-fsm-shadow-audit.domain.ts` |
| Authority non-consumption tests | `trip-fsm-shadow-authority-non-consumption.spec.ts` |
| Postgres integration | `trip-fsm-shadow-observability.postgres-redis.integration.spec.ts` |

## Closure review (2026-09-14)

- **Regression fix:** shadow hooks use module-level `runShadowObservabilitySafely()` so prototype `.call(harness)` unit tests (R10/R5/R7) retain authoritative finalize behavior.

- **Canary fail-closed:** `ENABLED=true` + empty allowlist disables shadow for all vehicles.
- **Generation isolation:** shadow stores `candidateEndCycleGeneration` / `candidateTripId`; reuse compares stored vs current orchestration token.
- **Cross-trip pause correlation:** read-only audit layer (`correlateConsecutiveTripPauses`) correlates Trip A terminal timestamps with Trip B start — never influences Trip B creation.
- **Audit timestamp authority:** `REAL_END_AT`, `REAL_COMPLETED_AT` (`endRecognizedAt`), `REAL_RESTING_AT` (RESTING tracking run) — never synthesized from `endTime` alone.
- **Forensic fields derived:** `SHADOW_CROSS_TRIP_LEAK_OBSERVED`, `SHADOW_FALSE_END_RISK_OBSERVED`, `SHADOW_PROVIDER_SILENCE_COMPETED_WITH_STRONGER_PATH`, `PROVIDER_SILENCE_COUNTERFACTUAL_STATUS` — no hardcoded PASS/NO.
- **Audit CLI fail-closed:** missing `DATABASE_URL` without `--fixtures-only` exits non-zero; real audit requires bounded `--vehicle-id` + `--since` + `--until`.

## Historical evidence preserved

Prior KS MX 2024 physical PASS, KS MS 661 audits, and #1635/#1627 acceptance records remain unchanged. Shadow observability does not rewrite or repair historical trips.
