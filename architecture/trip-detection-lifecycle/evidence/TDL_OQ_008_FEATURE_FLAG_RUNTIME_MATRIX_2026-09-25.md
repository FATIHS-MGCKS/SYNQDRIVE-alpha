# TDL-OQ-008 — Trip feature-flag / runtime-control matrix (read-only audit)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-OQ008-FLAG-MATRIX-001 |
| **Observed at (UTC)** | `2026-09-25T22:43:57Z` (Production env + release SHA) |
| **Repository baseline** | `origin/main` @ `6af181bf9396fac707edc00491e48dda0f7ed9e6` |
| **Production baseline** | `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2` @ `20260925182907_v4994` |
| **Audit mode** | READ_ONLY — no env/deploy/DB/Redis mutation |
| **Verdict** | **`RESOLVED_COMPLETE_MATRIX`** |

## Phase 0 — Baseline verification

| Axis | SHA / release | Method |
|------|---------------|--------|
| Task anchor `origin/main` | `6af181bf9396fac707edc00491e48dda0f7ed9e6` | `git fetch origin main && git rev-parse origin/main` |
| Production release | `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2` / `20260925182907_v4994` | SSH read `current/.git/HEAD` + release dirname |

**Wording:** Code defaults ≠ Production configured values. Effective runtime = normalized parser output at process boot from `/opt/synqdrive/shared/backend.env` (both PM2 apps).

---

## Matrix A — Feature / mode controls (productive runtime)

Legend columns: **ENV_KEY** · **CONFIG_OWNER** · **PARSER** · **CODE_DEFAULT** · **PROD_CONFIGURED** · **PROD_EFFECTIVE** · **CONSUMER_CLASS** · **ON/OFF BEHAVIOR** · **SHADOW vs AUTHORITATIVE** · **ROLLBACK**

### Snapshot polling authority

| ENV_KEY | CONFIG_OWNER | PARSER | CODE_DEFAULT | PROD_CONFIGURED | PROD_EFFECTIVE | CONSUMERS | BEHAVIOR | AUTHORITY | ROLLBACK |
|---------|--------------|--------|--------------|-----------------|----------------|-----------|----------|-----------|----------|
| `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE` | `snapshot-polling-tier.config.ts` | `parseBool` → invalid/missing → `false` | `false` | ENV_ABSENT | `false` | `loadSnapshotPollingTierConfig`, `DimoSnapshotScheduler`, wake coordinator | `true` → forces legacy O(N) enqueue every scheduler tick (~30s) for all pollable vehicles; disables tier gating | **AUTHORITATIVE** ingress cadence | Set `true` (overrides tier flag) |
| `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED` | same | `parseBool`; **preempted** when legacy=true → effective `false` | `true` (when legacy=false) | `true` | `true` | `DimoSnapshotScheduler` (`isSnapshotPollDue`) | `true` → per-vehicle tier intervals; `false` → all eligible vehicles each tick | **AUTHORITATIVE** | Set legacy=true OR `false` |
| Tier intervals (`WORKER_SNAPSHOT_TIER_*_MS`, demotion hold, movement km/h) | same | `parsePositiveInt` / movement int | 30s / 60s / 5m / 30m / 90s / 3 km/h | ENV_ABSENT (all) | code defaults | tier derivation + hysteresis | Changes due-time per tier | **AUTHORITATIVE** (knobs — see appendix) | Adjust env or legacy rollback |

**Production snapshot mode (Phase 6):** **`ACTIVITY_TIERED`**

- Scheduler **wake**: `@Interval(30000)` + `WORKER_SNAPSHOT_INTERVAL_MS` effective **30000** — leader tick every **30s**, not per-vehicle poll every 30s for entire fleet.
- Tier due-times (effective): ACTIVE_DRIVING=**30000**, RECENTLY_ACTIVE=**60000**, RESTING_STANDBY=**300000**, LONG_IDLE=**1800000** (all from code defaults; Production env absent).
- `WORKER_SNAPSHOT_CONCURRENCY`: configured **8**, code default **5** — worker parallelism only.

### FSM shadow observability

| ENV_KEY | CONFIG_OWNER | PARSER | CODE_DEFAULT | PROD_CONFIGURED | PROD_EFFECTIVE | CONSUMERS | BEHAVIOR | AUTHORITY | ROLLBACK |
|---------|--------------|--------|--------------|-----------------|----------------|-----------|----------|-----------|----------|
| `TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED` | `trip-fsm-shadow-observability.config.ts` (+ duplicate parse in `worker.config.ts` **unused**) | bool; invalid → fallback `false` | `false` | `true` | `true` | `trip-fsm-shadow-observability.integration.ts` via orchestration | Enables shadow branch for allowlisted vehicles only | **OBSERVABILITY_ONLY** | `false` |
| `TRIP_FSM_SHADOW_VEHICLE_IDS` | same | CSV → `Set`; empty set | empty | present (count **1**, IDs not exported) | **1 vehicle** effective | same | enabled + empty allowlist → **no vehicle** (fail-closed) | Vehicle-scoped allowlist | Clear list or disable master flag |

**Shadow authority (Phase 7):**

| Question | TRIP_FSM_SHADOW | DI V2 detector shadows |
|----------|-----------------|-------------------------|
| CAN_SHADOW_WRITE_CANONICAL_TRIP | **NO** — merges into `rawDetectionMeta` summary only | **NO** — persistence is evidence tables via `ShadowDetectorPersistence` |
| CAN_SHADOW_CHANGE_BOUNDARY | **NO** | **NO** |
| CAN_SHADOW_TRIGGER_PRODUCTION_MUTATION | **NO** | **NO** — does not gate finalize or repair |

Proof: `trip-fsm-shadow-authority-non-consumption.spec.ts`; shadow integration returns summary patches only.

**Effective shadow fleet size:** `FSM_SHADOW_EFFECTIVE_VEHICLE_COUNT=1` (enabled + non-empty allowlist).

### Repair / reconciliation

| ENV_KEY | CONFIG_OWNER | PARSER | CODE_DEFAULT | PROD_CONFIGURED | PROD_EFFECTIVE | CONSUMERS | BEHAVIOR | AUTHORITY | ROLLBACK |
|---------|--------------|--------|--------------|-----------------|----------------|-----------|----------|-----------|----------|
| `TRIP_REPAIR_COVERAGE_MODE` | `worker.config.ts` → `normalizeCoverageMode` | `legacy` \| `shadow` \| `enforce`; else → **`shadow`** | **`shadow`** | ENV_ABSENT | **`shadow`** | `TripReconciliationService`, `TripOverlapDetector` | **legacy/shadow:** binary overlap (`legacyVerdict`) decides suppress; coverage computed + audited. **enforce:** coverage verdict decides; repair spans = uncovered portions only | **AUTHORITATIVE** (mutation gate) | `legacy` (historic binary) or stay `shadow` |
| `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED` | `worker.config.ts` `parseTripPartialBoundaryRepairEnabled` | bool; only `'false'` disables | `true` | `true` | `true` | `TripReconciliationService.isPartialBoundaryRepairEnabled` | `false` → skips `tryPartialBoundaryExtension` for DIMO_SEGMENT candidates; **other** reconciliation (missing trip, overlap path, mid-gap policy, CH assist repairs) **remain active** | **AUTHORITATIVE** (partial extension only) | `false` |

### ClickHouse trip assist

| ENV_KEY | CONFIG_OWNER | PARSER | CODE_DEFAULT | PROD_CONFIGURED | PROD_EFFECTIVE | CONSUMERS | BEHAVIOR | AUTHORITY | ROLLBACK |
|---------|--------------|--------|--------------|-----------------|----------------|-----------|----------|-----------|----------|
| `CLICKHOUSE_TRIP_ASSIST_ENABLED` | `clickhouse-env.util.ts` | only `'false'` disables | **on** (true) | `true` | `true` | `TripDetectionOrchestrationService`, `TripReconciliationService` | `false` → CH-assisted start/continuity/repair paths skipped | **AUTHORITATIVE** (when CH available) | `false` |

### Driving Intelligence V2 (post-finalize only)

| ENV_KEY | CODE_DEFAULT | PROD_CONFIGURED | PROD_EFFECTIVE | Master gate | CONSUMERS |
|---------|--------------|-----------------|----------------|-------------|-----------|
| `DRIVING_INTELLIGENCE_V2_ENABLED` | `false` | `true` | `true` | — | `DrivingIntelligenceV2Config.isMasterEnabled()` |
| `DRIVING_V2_DIMO_SEGMENT_VALIDATION_ENABLED` | `false` | `false` | `false` (requires master) | master AND flag | `DimoTripSegmentValidationService` — **post-trip** SEGMENT_VALIDATE stage |
| `DRIVING_V2_ENGINE_DETECTOR_SHADOW_ENABLED` | `true` | `true` | `true` when master on | master AND flag | `ShadowDetectorOrchestratorService` |
| `DRIVING_V2_HF_DETECTOR_SHADOW_ENABLED` | `true` | `true` | `true` when master on | master AND flag | same |

**Important:** `DrivingIntelligenceV2Config.isTripDetectionAffected()` is hard **`false`**. Post-finalize **`DrivingAnalysisInitService`** runs regardless of V2 master; V2 master gates **DIMO segment validation job** and **shadow detector framework**, not trip FSM.

**Production:** master **on** → engine+HF shadow framework **runs** for completed trips in DI pipeline; DIMO segment validation stage **off**.

### Qualified stop / mid-gap — not feature flags

`TRIP_SAME_TRIP_MAX_STOP_MS` / `TRIP_MID_GAP_SPLIT_MS` → **RUNTIME_KNOB_NOT_FEATURE_FLAG** (duration authority, Production **CANONICAL_DEFAULT** 300000 ms — env absent). CUSUM retry, provider silence, CH assist thresholds → knobs (appendix).

### R9 provider wake

**No env feature flag.** Ingress = DIMO webhooks + `SnapshotWakeIntakeService` + BullMQ `SNAPSHOT_WAKE_HANDOFF` (code-owned).

---

## Matrix B — Dead / unused / test-only controls

| ENV_KEY / surface | CLASS | Reason |
|-------------------|-------|--------|
| `worker.tripFsmShadowObservabilityEnabled` / `tripFsmShadowVehicleIds` in Nest config | **DEAD_UNUSED** | Parsed in `worker.config.ts` but **no** `ConfigService.get('worker.tripFsmShadow*')` consumer; runtime uses `trip-fsm-shadow-observability.config.ts` |
| `TRIP_FSM_SHADOW_POSTGRES_REDIS_INTEGRATION`, `TRIP_R12_*_INTEGRATION`, probe metrics files | **TEST_ONLY** | CI / integration specs only |
| `TRIP_MID_GAP_SPLIT_MS` alone | **LEGACY_COMPAT** | Superseded by `TRIP_SAME_TRIP_MAX_STOP_MS` precedence; still read if canonical absent |

---

## Phase 3 — Default semantics summary

| Pattern | RAW absent | RAW invalid | Normalized |
|---------|------------|-------------|------------|
| Bool flags (`parseBoolEnv`, tier `parseBool`, DI `parseBooleanEnv`) | code fallback | fallback (fail-safe to default) | true/false |
| `TRIP_REPAIR_COVERAGE_MODE` | **`shadow`** | **`shadow`** | legacy/shadow/enforce |
| `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED` | **`true`** | non-`false` → true | only `'false'` disables |
| `CLICKHOUSE_TRIP_ASSIST_ENABLED` | **`true`** | not `'false'` → true | opt-out only |
| FSM shadow enabled + empty allowlist | — | — | **effective off all vehicles** (fail-closed) |
| `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=true` | — | — | **activity tier forced off** regardless of second env |

---

## Phase 4 — Production effective snapshot (normalized only)

Observed `2026-09-25T22:43:57Z` via `sudo grep` on `/opt/synqdrive/shared/backend.env`:

```
WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED=true
WORKER_SNAPSHOT_INTERVAL_MS=30000
WORKER_SNAPSHOT_CONCURRENCY=8
TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED=true
TRIP_FSM_SHADOW_VEHICLE_IDS_COUNT=1
TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=true
CLICKHOUSE_TRIP_ASSIST_ENABLED=true
DRIVING_INTELLIGENCE_V2_ENABLED=true
DRIVING_V2_DIMO_SEGMENT_VALIDATION_ENABLED=false
DRIVING_V2_ENGINE_DETECTOR_SHADOW_ENABLED=true
DRIVING_V2_HF_DETECTOR_SHADOW_ENABLED=true
WORKER_TRIP_TRACKING_CONCURRENCY=5
```

Absent → effective from code: `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=false`, tier MS defaults, `TRIP_REPAIR_COVERAGE_MODE=shadow`, `WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK=0`, all DI absent sub-flags follow master-gated defaults.

**Trip-related env line fingerprint (both replicas share file):** SHA256 `260af363c91767ab3cfec5c5c0aaf9f0516683ece3ecef189ab6264c7b47a799` (12 lines).

---

## Phase 5 — Multi-replica consistency

| Field | Value |
|-------|-------|
| PM2 apps | `synqdrive`, `synqdrive-b` — both **online** |
| Env source | Single shared `backend.env` linked at deploy; trip flags not duplicated in `/proc/environ` (dotenv at boot) |
| **REPLICA_FLAG_CONFIG_CONSISTENT** | **YES** — one canonical env file; no per-replica override observed |

---

## Phase 9 — Flag interactions (precedence)

1. `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=true` → `activityTierPollingEnabled=false` regardless of `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED`.
2. `TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED=true` + empty `TRIP_FSM_SHADOW_VEHICLE_IDS` → effective shadow **off** for all vehicles.
3. `DRIVING_INTELLIGENCE_V2_ENABLED=false` → `isDimoSegmentValidationEnabled`, `isEngineDetectorShadowEnabled`, `isHfDetectorShadowEnabled` all **false** at runtime regardless of sub-env values.
4. `TRIP_REPAIR_COVERAGE_MODE=shadow` (Production effective) → overlap **mutation** still follows **legacy binary** overlap; coverage metrics recorded for comparison (`decisionSource=legacy`).
5. `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=false` → disables **partial boundary extension** branch only; overlap-based missing-trip repair continues.

---

## Phase 10 — Stale documentation

| Claim | Location | Classification |
|-------|----------|----------------|
| "Default enabled for PR testing; disable in production" on partial boundary repair | `worker.config.ts` comment ~L179 | **COMMENT_ONLY_STALE** — Production has **`TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=true`** (verified) |
| `.env.example` implies `DRIVING_INTELLIGENCE_V2_ENABLED=false` as product default | `.env.example` | **DOC_STALE** vs Production explicit **`true`** — example reflects code default, not Production |
| QS acceptance doc Production SHA `99d722b4…` | `QUALIFIED_STOP_V1_PRODUCTION_ACCEPTANCE_2026-09-25.md` | **DOC_STALE** for release pointer — superseded by `8a1d9c6586…` (flag semantics unchanged on lineage) |

**RUNTIME_CONTRACT_MISMATCH_FOUND=NO** — parser behavior matches implemented consumers.

---

## Phase 12 — Production drift vs code default

| Control | Drift class |
|---------|-------------|
| Tier MS, legacy cadence, repair mode, max enqueue | **DEFAULT_IN_USE** (env absent) |
| `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED`, `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED`, `CLICKHOUSE_TRIP_ASSIST_ENABLED`, DI sub-shadows `true`, `WORKER_SNAPSHOT_INTERVAL_MS=30000`, `WORKER_TRIP_TRACKING_CONCURRENCY=5` | **EXPLICIT_OVERRIDE_SAME_AS_DEFAULT** (or opt-out default for CH) |
| `WORKER_SNAPSHOT_CONCURRENCY=8` | **EXPLICIT_OVERRIDE_DIFFERS_FROM_DEFAULT** (5→8) |
| `TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED=true` | **EXPLICIT_OVERRIDE_DIFFERS_FROM_DEFAULT** (false→true) |
| `DRIVING_INTELLIGENCE_V2_ENABLED=true` | **EXPLICIT_OVERRIDE_DIFFERS_FROM_DEFAULT** (false→true) |
| `DRIVING_V2_DIMO_SEGMENT_VALIDATION_ENABLED=false` | **EXPLICIT_OVERRIDE_SAME_AS_DEFAULT** |

---

## Phase 13 — Rollback matrix (documentation only)

| Active authoritative control | ROLLBACK_ENV_KEY | ROLLBACK_VALUE | Effect |
|------------------------------|------------------|----------------|--------|
| Activity-tier polling | `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE` | `true` | Fleet-wide ~30s enqueue each tick |
| FSM shadow | `TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED` | `false` | No shadow summary writes |
| Partial boundary repair | `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED` | `false` | No extension-only partial repairs |
| Coverage rollout | `TRIP_REPAIR_COVERAGE_MODE` | `legacy` | Binary overlap only (same as shadow decision path today) |
| CH assist | `CLICKHOUSE_TRIP_ASSIST_ENABLED` | `false` | Disable CH-assisted lifecycle assists |
| DI V2 shadow + validation | `DRIVING_INTELLIGENCE_V2_ENABLED` | `false` | Disables V2-gated segment validation + detector shadows |
| DI segment validate alone | `DRIVING_V2_DIMO_SEGMENT_VALIDATION_ENABLED` | `false` | Already off on Production |

---

## Appendix — Runtime knobs (trip lifecycle; not feature flags)

Selected productive knobs from `worker.config.ts` / tier config / qualified-stop resolver:

`WORKER_SNAPSHOT_INTERVAL_MS`, tier MS keys, demotion hold, movement km/h, `WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK`, `WORKER_SNAPSHOT_CONCURRENCY`, `WORKER_TRIP_TRACKING_*`, `TRIP_CONTINUITY_*`, `WORKER_TRIP_END_TIMEOUT_MS`, `TRIP_END_STABILITY_WINDOW_MS`, `TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS`, `TRIP_END_CH_ASSIST_*`, `TRIP_EMPTY_CORE_BACKOFF_*`, `TRIP_END_VALIDATION_*`, `TRIP_END_SEGMENT_*`, `TRIP_MID_GAP_*`, `TRIP_SAME_TRIP_MAX_STOP_MS`, `WORKER_TRIP_START_BOUNDARY_MAX_LOOKBACK_MS`, `WORKER_FAST_RECONCILIATION_*`.

**ACTIVE_RUNTIME_KNOB_COUNT (inventory):** **28** productive numeric/timing env keys with trip lifecycle consumers (excluding pure retention `RETENTION_TRIP_*`).

---

## Phase 14 — Closure

| Gate | Status |
|------|--------|
| Productive controls inventoried | YES — 10 mode/boolean feature controls + 28 knobs |
| Code defaults proven | YES — parser source cited |
| Production effective state | YES — read-only `backend.env` @ `8a1d9c6586…` |
| Interactions documented | YES |
| Dead/stale separated | YES |
| Replica drift | NONE — **CONSISTENT=YES** |

**OQ-008 status:** **CLOSED** — `RESOLVED_COMPLETE_MATRIX`

**NEW_RUNTIME_DEFECT_FOUND=NO**

**BLOCKERS=NONE**

**NEXT_ACTION=** Use this matrix for TDL-OQ-009 tiered polling vs ingress documentation; refresh QS acceptance doc Production SHA when convenient (non-blocking).
