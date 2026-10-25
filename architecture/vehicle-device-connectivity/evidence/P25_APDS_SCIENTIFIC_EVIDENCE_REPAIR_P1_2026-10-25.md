# P25 APDS — Scientific evidence repair P1 (shadow-only)

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-P25-APDS-SCI-EVID-P1-001 |
| **Date** | 2026-10-25 |
| **Mode** | TARGETED_CODE_FIX — evidence path only; no policy/cohort/activation changes |
| **Fable audit reference** | 796 WOULD_SKIP / 5 informative LV loss / 0 wired skipped-informative counter |

## BEFORE

- `newLvSourceObserved` read `battery_measurements` at poll completion (async Battery-V2 race → 90/90 false negatives).
- `newTopLevelSourceObserved` used `previousTopLevelSourceMs: null` (always true when snapshot had source timestamp).
- `synqdrive_apd_shadow_skipped_informative_poll_total` had no call site.
- `simulatedNextPollAt` / `additionalDiscoveryDelayMs` never populated for WOULD_SKIP.

## CHANGE

- **LV observational authority:** live DIMO payload `resolveLvBatteryObservedAt` → `baselineLvProviderSourceMs`; strict advance vs pre-poll `previousLvSourceMs`.
- **Top-level observational authority:** `vehicle_latest_states.sourceTimestamp` before fetch vs applied snapshot `sourceTimestamp`; UNKNOWN when previous missing.
- **Simulated LV state unchanged:** `realPollVisibleLvSourceAt` still gated by `evaluateLvProviderTimestampAdmission` (WOULD_SKIP excluded).
- **Metric:** `recordSkippedInformative` when `WOULD_SKIP` + SUCCESS + trustworthy LV/top advance (per policy).
- **Discovery delay:** next executed baseline SUCCESS snapshot poll (causal), not cadence estimate.
- **Deferred path:** optional reconcile after LIVE_VOLTAGE persistence via snapshot `correlationId` (no extra DIMO calls).

## Validation

- `p25-apd-shadow-baseline-poll-evidence.spec.ts` replays frozen Fable loss cases.
- `apd-shadow-skipped-informative-metric.spec.ts` wires counter.
- APDS shadow unit suite (18 suites) green excluding postgres integration env.

## P1 hardening (2026-10-25, PR #2168 follow-up)

- Strict LV: `resolveStrictLvBatteryProviderSourceAt` — no `collectionLastSeenAt` fallback for observational evidence.
- LV classes: `STRICT_LV_ADVANCE` | `FIRST_VALID_LV_OBSERVATION` | `NO_ADVANCE` | `UNKNOWN`; skip-informative uses **STRICT_LV_ADVANCE** only.
- Discovery delay: `NEXT_BASELINE_POLL_OBSERVED` fills `simulatedNextPollAt` + `additionalDiscoveryDelayMs` only; **no** `simulatedDiscoveryAt` (later SUCCESS poll ≠ confirmed rediscovery).
- Deferred strict-LV on the **same** `realPollId` sets baseline `newLvSourceObserved` only — never `simulatedDiscoveryAt` (skipped poll cannot rediscover itself). `INFORMATION_REDISCOVERED` remains reserved for future non–same-poll proof paths.
- Metric correctness: promote-guarded durable transitions; `recordInformativeRealPoll` once per physical poll; per-policy `recordSkippedInformative` only after `updateMany` count === 1; no success counters on persist failure.
- Deferred LV uses pre-persist `providerTimestamp` authority (not `lastLvSourceAt` simulated field).
- Bootstrap visibility restored: `pipelineResult.lvProviderTimestampMs ?? latestVisibleLvProviderMs`.

## Remaining gap

Top-level per-poll advance remains **NOT_ASSESSABLE** without VSI P2C capture rows (`vehicle_provider_source_observations`); P2C activation explicitly out of scope for P1.
