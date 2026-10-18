# DTC-02 P3 — adaptive scheduler shadow (repository)

**Date:** 2026-10-17  
**Epistemic:** `CONFIRMED` for pure planner + shadow wiring under unit tests; `NOT_DEPLOYED`; metrics are **projected**, not observed poll savings.

## Planner contract

**Module:** `backend/src/modules/vehicle-intelligence/dtc/adaptive/dtc-02-adaptive-planner.ts`

| Input | Source (shadow read-only) |
|-------|---------------------------|
| `registryLifecycle` | `vehicles.registry_lifecycle` |
| `providerCapability` | DIMO `tokenId` presence → `dimo_linked` / `unknown` |
| `lastSuccessfulDtcCheckAtMs` | VLS `last_dtc_successful_check_at` |
| `lastPollFetchAtMs` | source head `last_poll_fetch_at` or VLS poll |
| `lastConfirmedCompleteSourceAtMs` | source head |
| `lastPartialWebhookSourceAtMs` | source head |
| `webhookEvidenceQuality` | derived (`deriveWebhookEvidenceQuality`) — not inferred from movement |
| `hasActiveDtc` | active `vehicle_dtc_events` count |
| `providerErrorState` | VLS `dtc_poll_status` / `dtc_poll_error` |
| `evaluatedAtMs` | fan-out tick wall clock |

| Output | Meaning |
|--------|---------|
| `legacyNextCheckAtMs` | Existing 3h cadence anchor |
| `proposedNextCheckAtMs` | Shadow-only next check proposal |
| `decisionReason` | Stable string for logs/metrics |
| `evidenceQuality` | `high` / `medium` / `low` / `unknown` |
| `requiresLegacyFallback` | Planner defers to legacy tick |
| `safetyConstraints` | Invariants applied |
| `projectedPollReductionMs` | `proposed - legacyNext` (≤ 0 under P3 no-later-than-legacy bound; **projected**) |

## Safety invariants

- Unknown / partial webhook evidence does not justify confirmed-complete deferral.
- Partial webhook newer than complete blocks complete-trust deferral.
- Offboarded/archived excluded.
- Provider failures cannot justify deferral; may **accelerate** shadow proposal only.
- `proposedNextCheckAtMs <= legacyNextCheckAtMs` (no defer beyond legacy 3h window).
- Minimum spacing `DTC02_MIN_SHADOW_INTERVAL_MS` when accelerating (anti-starvation).
- **No** DIMO calls, episode mutations, source-head writes, or adaptive enqueue.

## Shadow integration

- Hook: `runDtc02AdaptiveSchedulerShadowBatch` at end of existing `dtc-poll` fan-out (`DimoDtcProcessor`).
- Flags: `DTC_02_ADAPTIVE_SCHEDULER_SHADOW_ENABLED`, `DTC_02_ADAPTIVE_SCHEDULER_SHADOW_VEHICLE_ALLOWLIST`.
- Failures are caught; legacy fan-out enqueue unchanged.
- `DimoDtcScheduler` repeat interval remains **3h**.

## Metrics (projected)

- `synqdrive_dtc02_adaptive_shadow_total{phase}`
- `synqdrive_dtc02_adaptive_plan_total{outcome,evidence_quality}`
- `synqdrive_dtc02_adaptive_fallback_total{reason}`
- `synqdrive_dtc02_adaptive_projected_poll_reduction_seconds{kind=projected|freshness_tradeoff}`

## P4 validation requirements (future)

- Compare projected vs observed poll counts on allowlisted cohort before any enqueue cutover.
- Production evidence for webhook delivery quality (not assumed in P3).
- Explicit owner approval before enabling adaptive enqueue or changing repeat scheduler.

## Validation

```bash
cd backend && npm test -- --testPathPatterns='dtc-02-adaptive|dtc02-'
```
