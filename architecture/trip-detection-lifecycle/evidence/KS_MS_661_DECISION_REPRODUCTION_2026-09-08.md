# KS MS 661 — Blocked empty-core decision reproduction

> **Partial supersession (TDL-EVID-KS-MS-661-002):** Row **20:01:58+** citing **`vls_row_absent`** is **incorrect** for this Production drive — a **persisted VLS row** remained (`vlsProviderObservedAt=19:59:22Z`); late blocker was **`vls_engine_load_active` → `vls_stale_provider_observation` → UNKNOWN**. **16.9 s** = worker `lastActivityAt` anchor only; **76 s** = reported motor-off → first empty-core tick @ 19:54:38. Trip completed via **`STALE_ONGOING` repair** @ 21:40:38Z — **not** regular FSM end detection. See [KS_MS_661_STOP_BOUNDARY_AUDIT_CORRECTION_2026-09-09.md](KS_MS_661_STOP_BOUNDARY_AUDIT_CORRECTION_2026-09-09.md).

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-KS-MS-661-REPRO-001 |
| **Source type** | PRODUCTION_OBSERVATION + CODE + RECONSTRUCTED |
| **Historical Production SHA** | `68495041974135f7c6565fd5b836b3e2f9176fae` |
| **Code reproduction SHA** | `68495041974135f7c6565fd5b836b3e2f9176fae` (compiled helpers from workspace @ same contract) |
| **Reference tracking run** | `2026-09-08T19:54:38.318Z` · `tripId=e324ee8c…` |
| **Epistemic split** | Production forensics = **OBSERVED**; helper replay = **RECONSTRUCTED/SYNTHETIC** |

## Purpose

Explain **one** blocked pre-`POSSIBLE_END` decision with code-backed precision, correct prior audit wording, and bounded local reproduction. Does **not** claim full historical event reconstruction where raw fetch samples are absent.

---

## §A — Corrected claims (vs TDL-EVID-KS-MS-661-001 v1)

### A.1 PRE_PAUSE_SIGNAL_REUSE

| Prior claim | Correction |
|-------------|------------|
| **YES** — old core motion reused after motor-off | **NOT_PROVEN** for specific sample identity |

**Observed (Production DB):**

| Run (UTC) | `core_points_count` | `result_summary.reason` |
|-----------|--------------------:|-------------------------|
| 19:53:51 | **2** | `motion_detected` |
| 19:54:21 | **1** | `motion_detected` |
| 19:54:38 | **0** | `no_core_data_keep_open` |

**Interpretation:**

- Runs @ 19:53:51 and 19:54:21 **did fetch non-empty core** — not the empty-core branch.
- `motion_detected` only proves `assessActiveContinuity` saw speed/odometer above threshold in **`evalCore`** (`trip-evidence.helpers.ts` §1).
- **Provider timestamps of those core points are not persisted** in `vehicle_trip_tracking_runs`.
- **Cannot** prove a particular pre-motor-off sample was re-read vs a new provider point without raw PEC/core fetch archive.

**Revised classification:** **SUSPECTED** provider lag or in-window stale points; **NOT_PROVEN** sample reuse.

**Separate observed mechanism (code-proven, not sample-proven):** on `ACTIVE` continuity verdict, `lastActivityAt` is set to **`workerNow`**, not provider event time (`trip-detection-orchestration.service.ts` ~2372). That **does** reset the empty-core operational inactivity clock on worker time when continuity stays ACTIVE.

### A.2 “Stale VLS ACTIVE” @ 19:54:38

| Prior wording | Correction |
|---------------|--------------|
| “stale VLS ACTIVE @ 19:53:31” | **Incorrect freshness label** |

**Production forensics @ 19:54:38:**

| Field | Value |
|-------|-------|
| `vlsProviderObservedAt` | `2026-09-08T19:53:31.000Z` |
| `vlsObservationAgeMs` | **67011** (~67 s) |
| `vlsEvidenceState` | **ACTIVE** |
| Freshness rule | `maxObservationAgeMs = TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS` default **120000 ms** (`worker.config.ts`, `trip-empty-core-end-gate.ts`) |
| Age vs rule | **67011 < 120000 → FRESH per implemented rule** |
| ACTIVE reason (inferred) | Speed above `speedMotionKmh` (0.5 ICE) — `vls_speed_above_motion_threshold` |

**Correct taxonomy:**

| Term | Applies @ 19:54:38? |
|------|---------------------|
| Chronologically older sample | **Yes** (~67 s before worker) |
| **Stale per implemented freshness rule** | **No** |
| Fresh per rule but **semantically contradicts** operator motor-off @ 19:53:22 | **Plausible** — not proven without archived VLS speed value |

At **19:55:52**, same VLS timestamp ages to **141466 ms > 120000** → **`vls_stale_provider_observation` → UNKNOWN** (observed in Production).

### A.3 R9 start delay

Unchanged: delayed recognition **observed** (~4m31s to first provider wake). Provider-side dominance remains **hypothesis** — signal generation, delivery, polling, and log gaps **not separately proven**.

---

## §B — Reference decision table (@ 19:54:38.318Z)

| Input | Value | Source | Provider / event time | Worker time | Age @ worker | Freshness rule | Branch executed |
|-------|-------|--------|----------------------|-------------|--------------|----------------|-----------------|
| Core fetch result | **[]** (count 0) | `vehicle_trip_tracking_runs.core_points_count` | n/a | 19:54:38.318 | n/a | n/a | Empty-core branch (`corePoints.length === 0`) |
| Core fetch status | **Successful empty** | Inferred: no error reason logged; empty-core gate reached | n/a | same | n/a | n/a | Not timeout/403 path |
| Route points | 0 | tracking run | n/a | same | n/a | n/a | `routeMotion=false` |
| Perf readings | 0 | tracking run | n/a | same | n/a | n/a | `performanceActivity=false` |
| FSM state | `ACTIVE_TRIP` | tracking run `result_state` | n/a | same | n/a | n/a | Empty-core in active tick |
| `lastActivityAt` / anchor | **19:54:21.115Z** | `operationalAnchorAt` in forensics | n/a | used as anchor input | n/a | `resolveOperationalNoCoreInactivityAnchor` prefers `lastActivityAt` over `lastMeaningfulMovementAt` | Anchor for inactivity ms |
| `operationalInactiveMs` | **16896** | forensics | n/a | same | **16.9 s** (worker anchor @ 19:54:21; **76 s** since operator motor-off @ 19:53:22) | `< minInactivityBeforeCusumMs (120000)` | **`operational_inactivity_below_threshold`** ← **primary inner gate reason** |
| VLS speed / ignition / load | **not in forensics** | `vehicle_latest_states` not snapshotted per run | obs **19:53:31** | read @ worker | **67011 ms** | `< 120000 → FRESH` | **`vls_speed_above_motion_threshold` → ACTIVE** (secondary blocker if inactivity passed) |
| VLS tri-state | **ACTIVE** | forensics | 19:53:31 | 19:54:38 | 67 s | Fresh | Would block after inactivity threshold |
| CH end assist | Not applied | No `clickhouse_end_assist_no_core_stream` reason | n/a | same | n/a | n/a | Fell through to empty-core gate |
| Persisted outer reason | `no_core_data_keep_open` | tracking run | n/a | same | n/a | n/a | Overwrites inner `forensics.reason` in persistence |

**Important persistence bug/limitation:** `result_summary` spreads `emptyCoreGate.forensics` then sets `reason: 'no_core_data_keep_open'`, **overwriting** inner gate reason (`operational_inactivity_below_threshold`). Forensics fields (`operationalInactiveMs`, `vlsEvidenceState`, …) remain authoritative.

### Later-phase blockers (observed, same trip)

| Phase | Dominant inner gate reason | Evidence |
|-------|---------------------------|----------|
| 19:54:38 – ~19:56:21 | `operational_inactivity_below_threshold` | `operationalInactiveMs` < 120000 while anchor @ 19:54:21 |
| ~19:55:52+ | `vls_stale_provider_observation` → UNKNOWN | `vlsObservationAgeMs` > 120000 |
| 20:00:26+ (post-IDLE) | `operational_inactivity_below_threshold` then **`vls_engine_load_active`** | Reconstructed: VLS speed 0, **engineLoad≈42.7**, obs 19:59:22 → ACTIVE (`RECONSTRUCTED` replay) |
| 20:01:58+ | **`vls_engine_load_active` → `vls_stale_provider_observation` → UNKNOWN** with `operationalInactiveMs` ≥ 120000 | **SUPERSEDED label:** forensics said `vls_row_absent`; persisted VLS row @ 19:59:22 — TDL-EVID-KS-MS-661-002 |

**R10 prerequisite:** FSM never entered `POSSIBLE_END` → R10 end-cycle guards **NOT_EXERCISED**.

---

## §C — Call chain (@ `684950419…`)

```
ACTIVE_TICK (trip-tracking.processor)
  → TripDetectionOrchestrationService.handleActiveTick
    → fetchRawTripCoreData / fetchRouteEnrichment / fetchPerformance
    → if corePoints.length === 0:
         → tryApplyClickHouseAssistedEnd (not taken)
         → resolveOperationalNoCoreInactivityAnchor(lastActivityAt || lastMeaningfulMovementAt || …)
         → assessSuccessfulEmptyCoreEndEligibility (trip-empty-core-end-gate.ts)
              1. operationalInactiveMs < minInactivity → KEEP_OPEN
              2. VLS UNKNOWN → KEEP_OPEN
              3. VLS ACTIVE → KEEP_OPEN
              4. perf active → KEEP_OPEN
              5. route motion → KEEP_OPEN
              6. else → POSSIBLE_END eligible
         → scheduleActiveTick (loop continues)
    → else (core present):
         → assessActiveContinuity (trip-evidence.helpers.ts)
              motion → ACTIVE + lastActivityAt=workerNow
```

Parallel path **not reached** for end: `POSSIBLE_END` → R10 guards.

---

## §D — Local reproduction (RECONSTRUCTED/SYNTHETIC)

**Method:** compile helpers @ `684950419…` contract; invoke directly (no Production connection).

**Command (sanitized, re-runnable locally):**

```bash
cd backend && npx tsc -p tsconfig.build.json
node --input-type=module <<'EOF'
import { assessSuccessfulEmptyCoreEndEligibility, classifyEmptyCoreVlsInactivity } from './dist/src/modules/vehicle-intelligence/trips/trip-empty-core-end-gate.js';
# … scenarios per matrix below
EOF
```

### Scenario matrix

| # | Scenario | Key inputs | Result | Allows |
|---|----------|------------|--------|--------|
| 1 | **Reference replay** | worker 19:54:38.318, anchor 19:54:21.115, VLS obs 19:53:31 speed 10 | `gateReason=operational_inactivity_below_threshold`, VLS **ACTIVE** fresh 67318 ms | Matches Production |
| 2 | VLS age expiry | same VLS obs, worker 19:55:52 | VLS **UNKNOWN**, `vls_stale_provider_observation` | Matches Production @ 19:55:52 |
| 3 | Empty core + fresh INACTIVE VLS | worker 20:01:58, idle anchor 19:59:55.895, VLS speed 0 | **`eligible=true`**, `empty_core_corroborated_inactivity` | Shows gate **can** reach POSSIBLE_END when VLS INACTIVE |
| 4 | Empty core + null VLS | telemetry null | `vls_row_absent`, **not eligible** | UNKNOWN safety |
| 5 | Synthetic core motion | one point @ 19:53:50 speed 15 | `motion_detected` → ACTIVE | Mechanism only — **not** historical proof |
| 6 | Anchor preference | lastActivity 19:54:21, lastMovement 19:47:00 | anchor **19:54:21** | Confirms worker-activity anchor |

**Reproduction limits:** proves **gate mechanics**, not that Production used speed=10 exactly @ 19:53:31 (exact VLS fields not snapshotted per run).

### Post-IDLE engine-load block (RECONSTRUCTED)

VLS `{ speedKmh:0, isIgnitionOn:false, engineLoad:42.745, sourceTimestamp:19:59:22 }` @ worker 20:00:26:

- `classifyEmptyCoreVlsInactivity` → **ACTIVE**, reason **`vls_engine_load_active`**
- Gate also blocked by `operational_inactivity_below_threshold` at that instant

This explains sustained **`vlsEvidenceState=ACTIVE`** after operator end despite speed 0.

---

## §E — Why pause/end fail (concise)

1. **Before empty core:** core path keeps trip **ACTIVE** via `motion_detected` while provider still returns core points (timestamps **not proven**).
2. **Empty-core begins @ 19:54:38:** dual block — **operational inactivity timer not met** (16.9 s < 120 s) and **fresh VLS ACTIVE** (67 s < 120 s rule).
3. **During pause/resume:** core returns → motion resumes; mid-gap split not triggered (no sustained silence gap in live path at stop).
4. **After operator end:** FSM → `IDLE_WITHIN_TRIP` via `stopped_perf_active`, **not** `POSSIBLE_END`.
5. **Post-IDLE empty core:** VLS **engine load > 15** keeps ACTIVE; later VLS ages to **UNKNOWN** → intentional “absence ≠ end proof” safety → **no POSSIBLE_END** (persisted VLS row — **not** `telemetry === null`).
6. **R10 never engaged** — requires `POSSIBLE_END` entry first.
7. **Trip terminal:** **`STALE_ONGOING` repair** @ `2026-09-08T21:40:38Z` — **not** successful regular FSM end detection.

---

## §F — Remaining data gaps

| Gap | Blocks |
|-----|--------|
| Raw core/PEC point timestamps @ 19:53:51 / 19:54:21 | Proving sample reuse vs fresh provider lag |
| Per-run VLS field snapshot | Exact ACTIVE reason @ 19:54:38 (speed vs load) |
| Archived webhook payloads | 19:53:24 signal classification |
| BullMQ / Redis historical state | Wake mailbox at start |

---

## §G — Cross-reference

Solution contract (PROPOSED): [TDL-DEC-R11-001](../decisions/DECISION_REGISTER.md#tdl-dec-r11-001) · [KS_MS_661_EMPTY_CORE_SOLUTION_PROPOSAL_2026-09-08.md](KS_MS_661_EMPTY_CORE_SOLUTION_PROPOSAL_2026-09-08.md)

Full temporal flow: [KS_MS_661_TEMPORAL_FLOW_2026-09-08.md](KS_MS_661_TEMPORAL_FLOW_2026-09-08.md) · Scenarios: [KS_MS_661_R11_SCENARIO_MATRIX_2026-09-08.md](KS_MS_661_R11_SCENARIO_MATRIX_2026-09-08.md)

Parent audit: [KS_MS_661_NATURAL_DRIVE_2026-09-08.md](KS_MS_661_NATURAL_DRIVE_2026-09-08.md)
