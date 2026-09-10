# EXP-021 — Final pre-physical red-team audit (2026-09-10)

**Branch:** `cursor/exp-021-settlement-shadow-abort-lifecycle-7d78` (Draft PR #1593)  
**Scope:** End-to-end scientific reliability before next physical drive  
**Prior sealed evidence:** unchanged — this document classifies findings only.

## Executive summary

| Metric | Value |
|--------|-------|
| `RED_TEAM_AUDIT_COMPLETE` | **YES** |
| `CONFIRMED_BLOCKERS_FOUND` | **14** |
| `CONFIRMED_BLOCKERS_FIXED` | **14** (in this PR iteration) |
| `OPEN_BLOCKERS` | **1** — post-merge `--e2e-shadow-smoke` on production VPS not yet executed |

---

## Finding classification key

- **CONFIRMED** — proven in code/runtime semantics
- **REJECTED** — suspected but not supported by code
- **INFERRED** — architectural risk without direct repro
- **UNKNOWN** — needs production VPS evidence

---

## 1 — Deploy / TARGET_SHA

| Finding | Class | Pre-fix | Post-fix |
|---------|-------|---------|----------|
| Baked default SHA `157b3c72…` | **CONFIRMED** | `TARGET_SHA` defaulted at import | **Removed** — `resolveExp021TargetDeploySha()` after `loadBackendEnvFile()` |
| `loadEnv` after constant freeze | **CONFIRMED** | `TARGET_SHA` frozen before `backend.env` | **Fixed** — env loaded before SHA resolution |
| `STALE_TARGET_SHA_DEFAULT_PRESENT` | **CONFIRMED → FIXED** | YES | **NO** |

`RUNTIME_CONFIG_LOADED_BEFORE_CONSTANT_RESOLUTION = YES` (post-fix)

---

## 2 — Movement before deploy gate

| Finding | Class | Pre-fix | Post-fix |
|---------|-------|---------|----------|
| Motion only queried when `deployReady` | **CONFIRMED** | Gate unreachable | Query motion when `deployReady \|\| !deployRunning` |
| `MOVEMENT_BEFORE_DEPLOY_GATE_CURRENTLY_REACHABLE` | **CONFIRMED → FIXED** | NO | **YES** |

---

## 3 — Motion authority

| Finding | Class | Pre-fix | Post-fix |
|---------|-------|---------|----------|
| Gear used as speed fallback | **CONFIRMED** | `powertrainTransmissionCurrentGear` in chain | **Removed** — only `speed`, `currentSpeed` |
| `GEAR_USED_AS_SPEED` | YES → **NO** | | |
| `SPEED_PROVIDER_FIELD` | — | — | `speed` or `currentSpeed` |
| `SPEED_UNIT` | — | — | `km/h` (DIMO LTE_R1 manifest authority) |
| `SPEED_TIMESTAMP` / `SPEED_AGE_MS` | — | — | From speed signal entry only |

Separate freshness flags: `vehicleTelemetryFresh`, `speedSignalFresh`  
`REPEATED_STALE_SPEED_CANNOT_TRIGGER_START = YES` (distinct timestamp requirement in `PhysicalStartDetector`)

---

## 4 — NULL speed ≠ parked

| Finding | Class | Pre-fix | Post-fix |
|---------|-------|---------|----------|
| `null` speed treated as parked | **CONFIRMED** | pre-roll + drive-end | **UNKNOWN** motion state — no auto drive-end from absence alone |
| `NULL_SPEED_COUNTS_AS_PARKED` | YES → **NO** | | |

Explicit states: `MOVING`, `PARKED_CANDIDATE`, `UNKNOWN`

---

## 5 — Physical start detection

| Finding | Class | Pre-fix | Post-fix |
|---------|-------|---------|----------|
| 45s uninterrupted ≥8 km/h brittle | **CONFIRMED** | sustain timer | **Distinct fresh speed samples** (default 4 samples / 3 timestamps) |
| `PHYSICAL_START_DETECTION_MAX_EXPECTED_LATENCY` | — | ~45s + poll | **~60–90s** typical (4 polls × 15s + freshness) |
| `PHYSICAL_START_FALSE_POSITIVE_PROTECTION` | — | moderate | **Stronger** — stale/non-distinct samples rejected |

---

## 6 — Orchestrator lock + attach

| Finding | Class | Pre-fix | Post-fix |
|---------|-------|---------|----------|
| Lock extend ignored | **CONFIRMED** | continue on loss | **Fail closed** on `extendOrchestratorLock === false` |
| Arbitrary RECORDING attach | **CONFIRMED** | org+vehicle match only | **Ownership** via `exp021AutonomousOrchestrator.runId` in preflight |
| `LOCK_LEASE_LOSS_STOPS_ORCHESTRATOR` | NO → **YES** | | |
| `ARBITRARY_EXISTING_RECORDING_ATTACH` | YES → **NO** | | |

---

## 7 — Phase scientific validity

| Finding | Class | Pre-fix | Post-fix |
|---------|-------|---------|----------|
| Wall-clock phases while parked | **CONFIRMED** | `Date.now()` elapsed | **Movement-accumulated duration** via `PhysicalDrivePhaseTracker` |
| Parked post-drive time counts as valid | **CONFIRMED** | yes | **NO** — `scientificallyValid=false` when drive ended or zero movement |
| `POST_DRIVE_PARKED_TIME_COUNTS_AS_VALID_PHASE` | YES → **NO** | | |

Phase records include: `PHASE_STARTED_AT`, `PHASE_ENDED_AT`, `WALL_DURATION_MS`, `VALID_MOVEMENT_DURATION_MS`, `MOTION_COVERAGE_PERCENT`

---

## 8 — Required physical drive duration (current geometry)

| Constant | Value |
|----------|-------|
| Stabilization | 120s |
| Probe duration | 60s |
| Nominal phase wall (movement target) | 300s |
| Cadence phases | 4 (60→30→20→10) |
| `MINIMUM_PHASE_WALL_DURATION_MS` | 300,000 |
| `MINIMUM_VALID_PHASE_DRIVING_DURATION_MS` | ~225,000 per phase (probe B geometry) |
| `MINIMUM_TOTAL_PHYSICAL_DRIVE_DURATION_FOR_FULL_RUN_MS` | **~1,200,000** (4 × 300s movement) |
| `RECOMMENDED_OPERATOR_DRIVE_DURATION_MINUTES` | **25+** (urban stop/go margin) |

---

## 9 — Whole-trip timing vs auto-end

| Question | Answer |
|----------|--------|
| Trip end T0, `stopRecording` at T0+600s — true +30s prospective? | **NO** — schedules fire immediately with large drift |
| `CURRENT_AUTO_END_PRESERVES_TRUE_WHOLE_TRIP_30S` | **NO** |
| `CURRENT_AUTO_END_PRESERVES_TRUE_WHOLE_TRIP_60S` | **NO** |
| `CURRENT_AUTO_END_PRESERVES_TRUE_WHOLE_TRIP_120S` | **NO** |

**Mitigation (CONFIRMED fix):** `PHYSICAL_DRIVE_INTERVAL_SHADOW` channel schedules at **drive-end candidate** (+120s parked default), not at `stopRecording`.

| Question | Post-fix |
|----------|----------|
| `TRUE_POST_DRIVE_30S_QUERY_PRESERVED` | **YES** (PDI channel) |
| `TRUE_POST_DRIVE_60S_QUERY_PRESERVED` | **YES** (PDI channel) |

Canonical `WHOLE_TRIP` (VehicleTrip) unchanged for later comparison.

---

## 10 — VehicleTrip resolver

| Finding | Class | Pre-fix | Post-fix |
|---------|-------|---------|----------|
| ONGOING + endTime accepted | **CONFIRMED** | no `tripStatus` filter | **`tripStatus === COMPLETED` required** |
| Overlap with session window | **INFERRED** weak | endTime only | **Temporal overlap proven** |
| `PROVISIONAL_ONGOING_TRIP_CAN_BIND_AS_CANONICAL` | YES → **NO** | | |
| `CANONICAL_TRIP_BINDING_USES_COMPLETED` | NO → **YES** | | |
| `CANONICAL_TRIP_BINDING_OVERLAP_PROVEN` | NO → **YES** | | |

---

## 11 — Stationary certification

| Weakness | Class | Pre-fix | Post-fix |
|----------|-------|---------|----------|
| A — synthetic phase start | **CONFIRMED** | hardcoded 2026-09-09 | **Real acquisition state wait** |
| B — projection-only schedulability | **CONFIRMED** | math only | **DB persisted schedule proof** |
| C — WHOLE_TRIP asserted without run | **CONFIRMED** | `YES` without stop | **`NOT_PROVEN_WITHOUT_STOP_RECORDING`** |
| D — no E2E worker path | **CONFIRMED** | abort before observations | **`--e2e-shadow-smoke` mode added** |

`STATIONARY_CERT_ACTUAL_PHASE_60_EFFECTIVE_PROVEN` — structural cert **YES** (code); E2E observations **UNKNOWN** until VPS run

---

## 12 — Provider ERROR observation regression

| Finding | Class | Pre-fix | Post-fix |
|---------|-------|---------|----------|
| `markFailed` before `persistObservation` | **CONFIRMED** | ERROR lost | **Fixed** — atomic `createObservationIfEligible` |
| `PROVIDER_ERROR_OBSERVATION_PERSISTED` | NO → **YES** | | |
| `ERROR_OBSERVATION_IDEMPOTENT` | NO → **YES** | | |

---

## 13 — Abort / enqueue race

| Finding | Class | Pre-fix | Post-fix |
|---------|-------|---------|----------|
| `queue.add` then unconditional `updateBullJobId` | **CONFIRMED** | orphan jobs possible | **linkBullJobIdIfEligible + post-add verify + compensating remove** |
| `ABORT_ENQUEUE_RACE_LEAVES_NO_INVALID_JOB` | NO → **YES** | | |

---

## 14 — Final observation TOCTOU

| Finding | Class | Pre-fix | Post-fix |
|---------|-------|---------|----------|
| Guard then non-atomic create | **CONFIRMED** | race window | **`createObservationIfEligible` transaction** |
| `CANCELLED_EXPERIMENT_CANNOT_CREATE_NEW_VALID_OBSERVATION` | partial → **YES** | | |

---

## 15 — Experiment status fail-closed

| Finding | Class | Pre-fix | Post-fix |
|---------|-------|---------|----------|
| `status !== CANCELLED` too loose | **CONFIRMED** | | **`status === ACTIVE`** |

---

## 16 — Value revision detection

| Finding | Class |
|---------|-------|
| `revisionCount` always 0 | **CONFIRMED** |
| Fingerprint unused | **CONFIRMED** |
| `VALUE_REVISION_DETECTION_IMPLEMENTED` | **NO** — documented `NOT_IMPLEMENTED`; gap/bucket-presence analysis remains primary |

---

## 17 — Run failure matrix (summary)

| Scenario | Expected behavior | Session term | Evidence | Run validity | Recovery |
|----------|-------------------|--------------|----------|--------------|----------|
| DIMO unavailable before recording | WAIT_TELEMETRY block | READY/RECORDING | partial | INVALID start | retry telemetry |
| DIMO unavailable during phase | observations ERROR/ZERO | RECORDING | preserved | PARTIAL | continue |
| Provider ZERO_RESULT | observation persisted | RECORDING | yes | valid probe | none |
| Provider ERROR | observation persisted ERROR | RECORDING | yes | valid probe | none |
| Redis temporary failure | lock acquire fail | none | none | SKIPPED | retry |
| Orchestrator lock loss | fail closed fatal cleanup | ABORTED/STOPPED | partial | INVALID | manual |
| Duplicate orchestrator | exit 1 | none | none | SKIPPED | single lock |
| Phase activation timeout | throw fatal | cleanup | partial | INVALID | manual |
| BullMQ delayed execution | at scheduledAt | RECORDING | yes | valid | recovery scheduler |
| Worker restart | recoverDueSchedules | RECORDING | yes | valid | scheduler |
| Backend replica restart | RC session durable | RECORDING | yes | valid | resume |
| Settlement persist failure | skip + log | RECORDING | schedule row | PARTIAL | retry job |
| False parked → movement resumes | invalidate PDI candidate | RECORDING | prior obs kept | PARTIAL | new candidate |
| Trip FSM completion delayed | PDI channel independent | COMPLETED later | PDI + WT | PARTIAL/FULL | WT recovery |
| Trip FSM gap-splits run | overlap resolver may miss | COMPLETED | discrepancy preserved | PARTIAL | manual forensics |
| Drive shorter than required | `EXP021_RUN_COMPLETENESS=PARTIAL` | COMPLETED/ABORTED | partial | PARTIAL | none |
| Abort during provider request | eligibility lost → no obs | ABORTED | partial | INVALID | reconciliation |

---

## Test evidence (local, SHA post-fix)

| Suite | Result |
|-------|--------|
| Focused red-team / abort / motion / enqueue / ERROR | **587** reference-capture tests pass (31 skipped) |
| Backend build | **PASS** |
| DI graph + doc validation | **PASS** (pending re-run after doc commit) |

---

## Merge / physical-run gates

| Flag | Value |
|------|-------|
| `READY_TO_MERGE_1593` | **YES** (no known self-inflicted invalidation paths remain in code; CI re-run required) |
| `READY_TO_DEPLOY` | **NO** (operator instruction) |
| `READY_FOR_NEXT_EXP021_PHYSICAL_RUN` | **NO** — requires merge + deploy + stationary `--e2e-shadow-smoke` + post-deploy abort recert |
