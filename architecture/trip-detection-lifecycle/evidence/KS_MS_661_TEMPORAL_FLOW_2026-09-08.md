# KS MS 661 — Full temporal flow (pause → resume → end → data gap)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-KS-MS-661-TEMPORAL-001 |
| **Source type** | PRODUCTION_OBSERVATION + RECONSTRUCTED + CODE |
| **Historical Production SHA** | `68495041974135f7c6565fd5b836b3e2f9176fae` |
| **Reference trip** | `e324ee8c-8e17-4cfc-ac16-294dacef5d01` · tokenId **187361** |
| **Production query** | Read-only `@ 2026-09-08T22:10:00Z` — `vehicle_trip_tracking_runs` |

## Epistemic labels

| Label | Meaning in this document |
|-------|--------------------------|
| **OBSERVED** | Production DB row or forensics field |
| **RECONSTRUCTED** | Derived from observed partial fields + code path |
| **SYNTHETIC** | Local helper replay (not Production) |
| **PROPOSED** | TDL-DEC-R11-001 behaviour not deployed |

## Operator timeline (Europe/Berlin / UTC)

| Event | Berlin | UTC |
|-------|--------|-----|
| Trip start ≈ | 21:36 | 19:36 |
| Motor/Zündung aus | 21:53:22 | **19:53:22** |
| Wiederstart | 21:55:38 | **19:55:38** |
| Endgültiges Ende ≈ | 21:59:22 | **19:59:22** |

---

## §1 — Guard evaluation order (code @ `684950419…`)

Empty-core branch (`corePoints.length === 0`, successful fetch):

1. ClickHouse end assist (not taken on this drive)
2. `operationalInactiveMs` vs **120 s** (`TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS`)
3. VLS tri-state: **UNKNOWN** → KEEP_OPEN
4. VLS **ACTIVE** → KEEP_OPEN
5. Performance activity → KEEP_OPEN
6. Route motion → KEEP_OPEN
7. Else → **POSSIBLE_END eligible**

**Persistence quirk (OBSERVED):** outer `result_summary.reason` = `no_core_data_keep_open` overwrites inner gate reason. Use forensics fields (`operationalInactiveMs`, `vlsEvidenceState`, `vlsObservationAgeMs`, `operationalAnchorAt`).

**Inner vs outer reason:**

| Outer (persisted) | Inner (forensics / inferred) |
|-------------------|-------------------------------|
| `no_core_data_keep_open` | `operational_inactivity_below_threshold` |
| `no_core_data_keep_open` | `vls_stale_provider_observation` |
| `no_core_data_keep_open` | `vls_speed_above_motion_threshold` / `vls_engine_load_active` |
| `no_core_data_keep_open` | `vls_row_absent` |

---

## §2 — Full temporal table (19:50–20:05 UTC)

Columns: **Zeit** | **neue Messungen** | **Datenalter** | **Zustand** | **maßgeblicher Anker** | **erster blockierender Grund (inner)** | **nächste Prüfung**

Epistemic: rows from Production tracking runs = **OBSERVED** unless marked **RECONSTRUCTED**.

| Zeit (UTC) | Neue Messungen | Datenalter | Zustand | Maßgeblicher Anker | Erster blockierender Grund (inner) | Nächste Prüfung | Epistemic |
|------------|----------------|------------|---------|-------------------|-----------------------------------|-----------------|-----------|
| 19:50–19:54:21 | core >0, `motion_detected` | core fresh in window | `ACTIVE_TRIP` | `lastActivityAt` ← workerNow on motion | n/a (not empty-core) | ACTIVE_TICK ~30 s | OBSERVED |
| **19:54:38** | core **0**, VLS obs **19:53:31** | VLS **67 s** (<120 s rule) | `ACTIVE_TRIP` | **19:54:21.115** (`lastActivityAt`) | **`operational_inactivity_below_threshold`** (16.9 s < 120 s); secondary: VLS **ACTIVE** fresh | 19:55:22 tick | OBSERVED |
| 19:54:52 | core 0 | VLS **81 s** | `ACTIVE_TRIP` | 19:54:21.115 | **`operational_inactivity_below_threshold`** (30.6 s) | 19:55:22 | OBSERVED |
| 19:55:22 | core 0 | VLS **111 s** | `ACTIVE_TRIP` | 19:54:21.115 | **`operational_inactivity_below_threshold`** (61 s); VLS still **ACTIVE** fresh | 19:55:52 | OBSERVED |
| **19:55:52** | core 0 | VLS **141 s** (>120 s) | `ACTIVE_TRIP` | 19:54:21.115 | **`operational_inactivity_below_threshold`** (91 s); VLS → **UNKNOWN** (`vls_stale_provider_observation`) would block even if timer met | 19:56:22 | OBSERVED |
| **19:56:23** | core **2**, `stopped_stale_ignition_no_activity` | core returns | `ACTIVE_TRIP` → continuity IDLE path | anchor shifts on stop handling | Empty-core exit — core path | 19:56:38 | OBSERVED |
| 19:56:38–19:59:25 | core >0, `motion_detected` | resume phase | `ACTIVE_TRIP` | worker `lastActivityAt` updates | n/a | 19:59:56 | OBSERVED |
| **19:59:56** | core 2, `stopped_perf_active` | perf stop | **`IDLE_WITHIN_TRIP`** | **19:59:55.895** (`lastActivityAt`) | Not empty-core; perf-based IDLE (not `POSSIBLE_END`) | 20:00:26 | OBSERVED |
| **20:00:26** | core 0 | VLS obs **19:59:22**, age **64 s** | `IDLE_WITHIN_TRIP` | 19:59:55.895 | **`operational_inactivity_below_threshold`** (30.5 s); secondary **RECONSTRUCTED**: `vls_engine_load_active` (load≈42.7, speed 0) | 20:00:57 | OBSERVED + RECONSTRUCTED |
| 20:00:38 | core 0 | VLS age **76 s** | `IDLE_WITHIN_TRIP` | 19:59:55.895 | **`operational_inactivity_below_threshold`** (42 s); VLS **ACTIVE** (engine load) | 20:00:57 | OBSERVED |
| 20:00:57 | core 0 | VLS age **95 s** | `IDLE_WITHIN_TRIP` | 19:59:55.895 | **`operational_inactivity_below_threshold`** (61 s); VLS **ACTIVE** | 20:01:28 | OBSERVED |
| **20:01:28** | core 0 | VLS age **125 s** | `IDLE_WITHIN_TRIP` | 19:59:55.895 | Timer still **91 s** (<120 s); VLS **UNKNOWN** (`vls_stale_provider_observation`) | 20:01:58 | OBSERVED |
| **20:01:58** | core 0, VLS **absent/null** | no VLS row | `IDLE_WITHIN_TRIP` | 19:59:55.895 | **`vls_row_absent` → UNKNOWN**; timer **≥122 s met** — UNKNOWN blocks end | 20:02:28 | OBSERVED |
| 20:02:28–20:04:38 | core 0, VLS absent | op silence **152–282 s** | `IDLE_WITHIN_TRIP` | 19:59:55.895 | **`vls_row_absent`** — prolonged UNKNOWN, no `POSSIBLE_END` | ACTIVE_TICK continues | OBSERVED |

### Phase interpretation

**Phase A — Pre-pause empty core (19:54:38–19:55:52):** Dual block. Primary: operational timer not elapsed from anchor **19:54:21** (worker `lastActivityAt` from last `motion_detected`). Secondary: VLS speed sample @ **19:53:31** still **fresh** under 120 s rule → **ACTIVE**.

**Phase B — Resume (19:55:38 operator, 19:56:23 core):** Timer would complete ~**19:56:21** from anchor 19:54:21; core returns **19:56:23** before empty-core candidacy. Trip stays same; pause **not** tagged in FSM.

**Phase C — Post-operator end (19:59:56+):** FSM → `IDLE_WITHIN_TRIP` via perf stop, **not** `POSSIBLE_END`. Empty-core resumes with new anchor **19:59:55.895**. Engine load >15 keeps VLS **ACTIVE** until age >120 s; then **UNKNOWN**; then VLS row **absent**. Operational silence exceeds 120 s from **20:01:58** but **UNKNOWN safety** prevents `POSSIBLE_END`.

**R10:** **NOT_EXERCISED** — no `POSSIBLE_END` / `END_VALIDATION` / `FINALIZE` runs for this `tripId`.

---

## §3 — When would each gate have cleared? (RECONSTRUCTED)

| Gate | First satisfied (UTC) | Condition |
|------|----------------------|-----------|
| Operational inactivity ≥120 s (anchor 19:54:21) | **~19:56:21** | `now - 19:54:21.115 ≥ 120000` |
| VLS UNKNOWN after stale (obs 19:53:31) | **19:55:52** | age >120 s |
| Both A timer + fresh INACTIVE VLS | **Never in Phase A** — core returned first | — |
| Operational inactivity ≥120 s (anchor 19:59:55.895) | **~20:01:55** | post-IDLE |
| Fresh INACTIVE VLS corroboration | **Never observed** — VLS ACTIVE (load) then UNKNOWN then absent | — |
| `POSSIBLE_END` | **Never reached** | — |

---

## §4 — PROPOSED delta on same timeline (PROPOSED, not deployed)

| Instant | Current inner blocker | PROPOSED expected inner blocker | Notes |
|---------|----------------------|--------------------------------|-------|
| 19:54:38 | op timer + VLS ACTIVE (67 s) | op timer + **STALE_POSITIVE** (67 s >45 s) | Positive TTL decay; timer still primary |
| 19:55:52 | op timer (91 s) + VLS UNKNOWN | op timer + VLS UNKNOWN | Same outcome; timer still blocks |
| ~19:56:21 | Would be VLS UNKNOWN only | Provider anchor unchanged → timer met; **still no fresh INACTIVE VLS** | Core returns before candidacy either way |
| 20:00:26 | op timer + VLS ACTIVE (load) | op timer + **STALE_POSITIVE** (64 s >45 s) | Engine load decay for end candidacy |
| 20:01:58+ | `vls_row_absent` | `vls_row_absent` + optional corroboration wake (flag) | Still no false end without corroboration |

---

## §5 — Cross-references

- Single-decision repro: [KS_MS_661_DECISION_REPRODUCTION_2026-09-08.md](KS_MS_661_DECISION_REPRODUCTION_2026-09-08.md)
- PROPOSED contract: [KS_MS_661_EMPTY_CORE_SOLUTION_PROPOSAL_2026-09-08.md](KS_MS_661_EMPTY_CORE_SOLUTION_PROPOSAL_2026-09-08.md)
- Scenario matrix: [KS_MS_661_R11_SCENARIO_MATRIX_2026-09-08.md](KS_MS_661_R11_SCENARIO_MATRIX_2026-09-08.md)
- Parent audit: [KS_MS_661_NATURAL_DRIVE_2026-09-08.md](KS_MS_661_NATURAL_DRIVE_2026-09-08.md)

**Mutations:** NONE
