# EXP-021 — KS MX 2024 Deep 90s Phase Forensic

**Date:** 2026-09-14  
**Identity:** `EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_2026-09-14`  
**Classification:** `INCOMPLETE_SHORT_AB_PARTIAL_OPERATIONAL_EVIDENCE`  
**Production SHA:** `d1501d171c1cc6dc4b83b2720e3a96549ef24185`  
**Vehicle:** KS MX 2024 · Mercedes-Benz C 63 AMG · token **187336**

| Field | Value |
|-------|-------|
| `RC_SESSION_ID` | `332c1549-622d-4535-afd9-867962003280` |
| `CALIBRATION_SERIES_ID` | `0657d5df-16c3-4768-b37d-d2f21d7c4a62` |
| `SETTLEMENT_EXPERIMENT_ID` | `exp-021-332c1549-2efc9ef2` |
| `TRIP_ID` | `f6809e13-181f-4264-b5e3-341b71a57c82` |
| `PLAN` | `candidate_short_ab_90_60` / `EXP021_CANDIDATE_SHORT_AB_90_60` |

**Companion artifacts:**

- Machine JSON (v1): `EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_2026-09-14.json`
- Machine JSON (v2, 116-min scope): `EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_V2_2026-09-14.json`
- Consistency JSON (v3 derived): `EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_CONSISTENCY_2026-09-14.json`
- Pre-abort snapshot: `EXP_021_KS_MX_2024_INCOMPLETE_SHORT_AB_FORENSIC_FREEZE_2026-09-14.md`
- VPS: `/opt/synqdrive/shared/reference-evidence/exp-021-ks-mx-2024-deep-90s-forensic-v2.json`

**Do not use for:** cadence selection · 90 vs 60 comparison · retrospective 60s evidence

---

## Temporal authority (corrected)

| Timestamp | Value | Authority |
|-----------|-------|-----------|
| `PHYSICAL_T0` | `2026-09-14T11:43:53.000Z` | Persisted |
| `90_NOMINAL_END` | `2026-09-14T11:53:53.000Z` | T0 + 600,000 ms |
| Trip physical end | `2026-09-14T12:04:15.000Z` | Persisted `vehicle_trips.end_time` |
| Pre-abort forensic freeze | `2026-09-14T13:40:26.693Z` | **Timeline authority** |
| `90_ACTUAL_WALL_DURATION_AT_FREEZE` | **6,993,693 ms (~116.6 min)** | Pre-abort freeze |
| Abort `completedPhaseSummary` | **7,158,588 ms (~119.3 min)** | **Artifact only — NOT valid phase seal** |

The 90s phase remained `ACTIVE_UNSEALED` for the **full ~116.6 minutes** from T0 to pre-abort freeze — not ~25.5 minutes. The ~25.5 min figure was an early observer snapshot only. The abort-generated `completedPhaseSummary` must **not** replace the pre-abort forensic timeline.

---

## Window partition (mandatory)

| Window | Start | End | Duration | Movement class |
|--------|-------|-----|----------|----------------|
| **A — Nominal protocol** | `2026-09-14T11:43:53.000Z` | `2026-09-14T11:53:53.000Z` | 600,000 ms (10 min) | CONFIRMED_MOVING |
| **B — Moving overrun** | `2026-09-14T11:53:53.000Z` | `2026-09-14T12:04:15.000Z` | 622,000 ms (~10.4 min) | UNKNOWN_WITH_ACTIVE_TRIP |
| **C — Post-trip active tail** | `2026-09-14T12:04:15.000Z` | `2026-09-14T13:40:26.693Z` | 5,771,693 ms (~96.2 min) | STATIONARY |
| **D — Abort artifact** | `2026-09-14T13:40:26.693Z` | `2026-09-14T13:43:11.614Z` | 164,921 ms (~2.7 min) | STATIONARY |

`CANONICAL_VALID_MOVEMENT_DURATION = null` · `T0_TO_TRIP_END_WALL_DURATION = 1,222,000 ms (~20.4 min)`

Scientific 90s analysis uses **Window A only**. Windows B–D are operational/orphaned-phase evidence, not cadence-comparison evidence.

**RC partition rule:** `synq_received_at` with `[start, end)` for A/B/C; `[freeze, abort]` inclusive for D. Sum **1,423 + 938 + 8,792 + 260 = 11,413** (verified against production DB via v2 recompute).

---

## Phase 0 — Raw-evidence authority map

| Finding | Raw authority |
|---------|---------------|
| Slot ledger (7/7, 5 SUCCESS, 2 ZERO_RESULT) | Pre-abort freeze `phase90.slots` + `phase90.counters` |
| Provider counts (7/5/2) | Freeze `nativeFastLoopProvider*Count` / `allRequestCount` |
| Native HF buckets (25 timestamps) | Freeze `phase90.nativeBuckets.bucketTimestamps` |
| Settlement 114/114 SUCCESS | `reference_capture_settlement_shadow_observations` + v1 `phase10_settlement.matrix` |
| RC observations (11,413 partition) | `reference_capture_observations.synq_received_at` (v2 DB query) |
| Trip FSM RESTING/COMPLETED | Run-monitor jsonl + `vehicle_trips.end_time` |
| T0 timeline | `exp-021-ks-mx-2024-t0-watcher.jsonl` + `T0_ACTIVATED` event |
| Orchestrator not started | Incomplete-short-ab freeze lifecycle section + absence of `exp021AutonomousOrchestrator` in preflight |
| Production SHA | Deploy record `d1501d171c1cc6dc4b83b2720e3a96549ef24185` |

Derived JSON/Markdown in this PR **never outrank** the raw sources above.

---

## Forensic corrections (derived-evidence pass)

| Field | OLD | NEW | RAW authority |
|-------|-----|-----|---------------|
| Inter-bucket max reported as window max | 40,918 ms | **40,918 ms inter-bucket only** | Bucket timestamps |
| Full-window max unobserved gap | (omitted / implied 40.9s) | **159,544 ms** (T0 → first bucket) | T0 + bucket timestamps |
| Provider TOTAL_REQUESTS (v1 JSON slices) | 0 | **7** (5 success, 2 failure) | `phase90.counters` |
| Slot 0/2 durability class | TRANSIENT_PROVIDER | **UNPROVEN** | No probeDetail in freeze |
| `VALUE_REVISIONS` | 0 | **NOT_ASSESSED** | No value-snapshot diff performed |
| `GAP_RECONSTRUCTABILITY` | qualitative "majority" | **NOT_PROVEN** | No identity-level gap mapping |
| `POST_TRIP_FALSE_MOVEMENT` | NO | **NOT_ASSESSED** | `validMovementDurationMs=null` ≠ signal proof |
| Gap list duplicates | YES (v1 JSON) | **NO** (deduped) | Unique timestamp pairs |
| `VALID_90_SCIENTIFIC_EVIDENCE` | (implicit full) | **PARTIAL** | Unsealed phase, no 60s, catch-up, 2/7 ZERO_RESULT |

---

## Phase 1 — Exact timeline reconstruction

Chronological event ledger (millisecond where available):

| Timestamp (UTC) | Event | Notes |
|-----------------|-------|-------|
| `11:34:00.000` | Trip FSM trip start | Trip `f6809e13-…` |
| `11:40:12.440` | RC session created | |
| `11:40:48.624` | RECORDING start | FAST GO |
| `11:43:53.000` | **PHYSICAL_T0** | Reanchored canonical T0 |
| `11:44:08.031` | T0 watcher start | One-shot watcher PID 1980622 |
| `11:46:25.393` | Settlement experiment created | `exp-021-332c1549-2efc9ef2` |
| `11:46:27.198` | T0_ACTIVATED (server) | 90s phase + 7 slots initialized |
| `11:46:32.519` | Slot 0 issued → **FAILURE** | ZERO_RESULT |
| `11:46:38.489` | Slot 1 issued → SUCCESS | |
| `11:46:56.384` | Slot 2 issued → **FAILURE** | ZERO_RESULT |
| `11:48:24.310` | Slot 3 issued → SUCCESS | |
| `11:49:57.205` | Slot 4 issued → SUCCESS | |
| `11:51:26.175` | Slot 5 issued → SUCCESS | |
| `11:52:53.753` | Slot 6 issued → SUCCESS | Last deterministic HF slot |
| `11:52:46.201` | Last native temporal bucket | All HF native data within Window A |
| `11:53:53.000` | Nominal 90s phase end | **Not sealed** — phase stayed active |
| `12:03:46.789` | Trip FSM → IDLE_WITHIN_TRIP | Run monitor |
| `12:04:15.000` | Trip physical end (DB) | `endTime` persisted |
| `12:05:47.469` | Trip FSM → POSSIBLE_END | |
| `12:03:53.325` | Last settlement observation completed | All 114/114 SUCCESS |
| `12:06:47.848` | Trip FSM → RESTING / COMPLETED | |
| `12:04:15`–`13:40:26` | **Post-trip orphaned phase** | ~96 min; RC cycles continue; 8,792 obs |
| `13:40:26.693` | Forensic freeze (pre-abort) | `cycleCount=1215`; phase still RECORDING |
| `13:43:11.614` | Controlled session abort | `ABORTED`; abort summary artifact created |

**Ordering anomalies:** None material. T0 watcher started **before** server T0_ACTIVATED (expected — polls until confirmation). All 7 slots issued in burst after late T0 activation (~2.5 min after canonical T0). Trip FSM completed naturally while RC session remained RECORDING.

---

## Phase 2 — T0 quality forensic (separated timestamps)

**Do not collapse these into a single "T0 creation time".**

| Concept | Timestamp (UTC) | Source |
|---------|-----------------|--------|
| `T0_EFFECTIVE_AT` | `2026-09-14T11:43:53.000Z` | Reanchored canonical authority |
| `T0_FIRST_OBSERVED_AT` | `2026-09-14T11:44:08.526Z` | Watcher poll i=0 |
| `T0_CONFIRMATION_STARTED_AT` | `2026-09-14T11:44:08.031Z` | Watcher start |
| `T0_CONFIRMED_AT` | `2026-09-14T11:46:25.216Z` | Watcher poll i=13 `confirmed=true` |
| `T0_PERSISTED_AT` / `PHYSICAL_PHASE_ACTIVATED_AT` | `2026-09-14T11:46:27.198Z` | Server `T0_ACTIVATED` |
| `T0_ACTIVATION_LAG_MS` | **154,198** | `T0_PERSISTED_AT − T0_EFFECTIVE_AT` |

**Deployed reanchor rule:** After 4 qualifying movement samples (≥8 km/h, fresh), `firstQualifyingMovementAt` is backdated to `canonicalT0At` and persisted as immutable physical authority. HF slots schedule from canonical T0, but server activation lags by ~154 s — causing catch-up issuance.

**Deployed criteria:** min speed 8 km/h · 4 samples · ≥3 distinct timestamps · freshness ≤120s · confirmation window 180s · parking reset 90s below threshold

| Poll | Observed at | Speed (km/h) | Fresh | Motion | Confirmed |
|------|-------------|--------------|-------|--------|-----------|
| i=0 | `11:44:08.526` | 42 | YES | MOVING | NO |
| i=1 | `11:44:19.012` | 42 | YES | MOVING | NO |
| i=2 | `11:44:29.489` | 43 | YES | MOVING | NO |
| i=3–10 | `11:44:39`–`11:45:53` | 3–6 | YES | UNKNOWN | NO (below threshold) |
| i=11 | `11:46:04.125` | 8 | YES | MOVING | NO |
| i=12 | `11:46:14.813` | 8 | YES | MOVING | NO |
| i=13 | `11:46:25.216` | 11 | YES | MOVING | **YES** |

| Metric | Value |
|--------|-------|
| `T0_SAMPLE_COUNT` | 4 qualifying (≥8 km/h at confirmation) |
| `T0_DISTINCT_TIMESTAMP_COUNT` | ≥3 |
| `T0_MIN_SPEED_OBSERVED` | 8 km/h |
| `T0_CONFIRMATION_DURATION` | ~2m17s from watcher start; reanchored T0 backdated |
| `T0_QUALITY` | **ACCEPTABLE** |

**T0 vs physical movement start:** Reanchored `PHYSICAL_T0` at `11:43:53` predates watcher confirmation (`11:46:27`). Early polls at 42–43 km/h from `11:44:08` indicate movement was already underway — reanchor is credible, not materially lagged.

---

## Phase 3 — Complete 90s slot ledger

**Expected:** 7 deterministic slots (V3 90s semantics, offsets 0/90/180/270/360/450/540 s from T0)

| slot | offset | scheduledAt | issuedAt | issueLagMs | status | root cause |
|------|--------|-------------|----------|------------|--------|------------|
| 0 | 0s | `11:43:53` | `11:46:32.519` | +159,519 | FAILURE | **ZERO_RESULT** (catch-up; interval historical at issue) |
| 1 | 90s | `11:45:23` | `11:46:38.489` | +75,489 | SUCCESS | 5 native buckets |
| 2 | 180s | `11:46:53` | `11:46:56.384` | +3,384 | FAILURE | **ZERO_RESULT** (provider empty; not HTTP/auth/timeout) |
| 3 | 270s | `11:48:23` | `11:48:24.310` | +1,310 | SUCCESS | |
| 4 | 360s | `11:49:53` | `11:49:57.205` | +4,205 | SUCCESS | |
| 5 | 450s | `11:51:23` | `11:51:26.175` | +3,175 | SUCCESS | |
| 6 | 540s | `11:52:23` | `11:52:53.753` | +30,753 | SUCCESS | |

| Aggregate | Value |
|-----------|-------|
| EXPECTED / PERSISTED / ISSUED | 7 / 7 / 7 |
| SUCCESS / FAILURE / SKIPPED | 5 / 2 / 0 |
| `nativeFastLoopProviderZeroResultCount` | 2 |
| `nativeFastLoopProviderErrorCount` | 0 |

**Slot 0 forensics:** Issued **159,519 ms** after `scheduledAt`; entire provider interval was historical relative to server activation (**154,198 ms** after canonical T0). `SLOT_0_ZERO_RESULT_CAUSE=PROVIDER_ZERO_RESULT`; `SLOT_0_CATCHUP_CONTRIBUTION=YES`; `SLOT_0_PROVIDER_TRANSIENT_PROVEN=NO` (no probeDetail in freeze).

**Slot 2 forensics:** Issued **3,384 ms** late (26 s after activation). `SLOT_2_ZERO_RESULT_CAUSE=PROVIDER_ZERO_RESULT`; `SLOT_2_CATCHUP_CONTRIBUTION=MARGINAL`; `SLOT_2_PROVIDER_TRANSIENT_PROVEN=NO`.

**Failure independence:** Slots 0 and 2 are separate ZERO_RESULT events (not HTTP/auth/timeout). Slot 1 succeeded between them — systematic provider failure **not proven**.

---

## Phase 4 — Native HF buckets vs RC observations (full ~116 min active phase)

### Native HF temporal buckets (25 total — NOT 11,413)

| Metric | Window A | Window B | Window C | Full pre-freeze |
|--------|----------|----------|----------|-----------------|
| **Native HF buckets** | **25** | **0** | **0** | **25** |
| Buckets/min | 2.5 | 0 | 0 | 0.21* |
| First bucket | `11:46:32.544` | — | — | same |
| Last bucket | `11:52:46.201` | — | — | same |
| Inter-bucket P50 / P90 / P95 / max | 15s / 21s / 37.9s / **40.9s** | — | — | same |
| Inter-bucket gaps ≥10s / ≥20s / ≥30s / ≥60s | 17 / 7 / 2 / 0 | 0 | 0 | 17 / 7 / 2 / 0 |
| **Start edge gap** (T0 → first bucket) | **159,544 ms** | — | — | — |
| **End edge gap** (last bucket → T0+10m) | **66,799 ms** | — | — | — |
| **Full-window max unobserved gap** | **159,544 ms** | — | — | — |
| Full-window gaps ≥10s / ≥20s / ≥30s / ≥60s | **19 / 9 / 4 / 2** | — | — | — |
| First→last bucket span | **373,657 ms (62.3% of nominal window)** | — | — | — |
| `GAP_LIST_HAS_DUPLICATES` | **NO** (24 unique inter-bucket intervals) | — | — | — |

\*Full pre-freeze buckets/min diluted by 116 min unsealed phase wall time.

### Reference-capture observations (11,413 total — distinct from native HF buckets)

| Window | RC observations | % of total | Primary kind |
|--------|-----------------|------------|--------------|
| Pre-T0 (recording→T0) | 625 | 5.5% | SIGNAL_POINT |
| **A — Nominal** | **1,423** | 12.5% | SIGNAL_POINT |
| **B — Moving overrun** | **938** | 8.2% | SIGNAL_POINT |
| **C — Post-trip tail** | **8,792** | **77.0%** | SIGNAL_POINT |
| **D — Abort artifact** | 260 | 2.3% | SIGNAL_POINT |
| **Total** | **11,413** | 100% | |

**Reconciliation:** 25 native HF buckets = unique temporal bucket starts from 5 successful HF historical polls. 11,413 RC rows = ~1,215 acquisition cycles × ~9.4 obs/cycle over ~119 min RECORDING. RC runner (~10 cycles/min) continued throughout the entire orphaned phase; HF deterministic slots stopped after slot 6.

**POST_10_MIN_DATA_SOURCE:** `RC_ACQUISITION_RUNNER_CYCLE` (LATEST_LIVE + SIGNAL_POINT per ~3s cycle)  
**POST_10_MIN_REQUEST_MECHANISM:** No additional HF deterministic slots — all 7 terminal by T0+9m  
**POST_10_MIN_NATIVE_BUCKETS:** 0  
**SETTLEMENT_DURING_TAIL:** **NO** — all 114 observations completed by `12:03:53Z` (before trip end)

---

## Phase 5 — Signal-level completeness

Native HF fast-loop buckets carry speed/GPS within provider payloads. Reference capture ingested **11,413** observations total (continuous reference capture path separate from 7 HF slots).

| Assessment | Status |
|------------|--------|
| `CANONICAL_KEY_AVAILABILITY` | **NOT_ASSESSED** |
| `PROVIDER_FIELD_PATH_AVAILABILITY` | **NOT_ASSESSED** |
| `SIGNAL_LEVEL_ASSESSABILITY` | **NOT_ASSESSED** |

Prior canonicalKey lookup returned 0 rows because signals are stored under provider-field paths — **not** proof of physical signal absence.

**Mercedes/DIMO behavior:** Dense buckets during active driving (W2: 19 buckets in 5 min); zero HF acquisition after slot 6 despite continued driving (Window B) — architectural (no slots scheduled), not provider degradation.

---

## Phase 6 — Extended time slices (full ~116 min active phase)

| Slice | Wall | Class | Native HF | RC obs | RC obs/min | Notes |
|-------|------|-------|-----------|--------|------------|-------|
| W1 (0–5m) | 5 min | MOVING | 6 | 487 | 97.4 | HF slots firing |
| W2 (5–10m) | 5 min | MOVING | 19 | 571 | 114.2 | Peak HF + RC density |
| W3 (10–15m) | 5 min | MOVING | 0 | 452 | 90.4 | Overrun; no HF slots |
| W4 (15–20m) | 5 min | MOVING | 0 | 466 | 93.2 | Overrun |
| W5 (20–25m) | 5 min | MIXED | 0 | 442 | 88.4 | Trip ending |
| W6 (25–30m) | 5 min | STATIONARY | 0 | 471 | 94.2 | Post-trip tail begins |
| W7 (30–45m) | 15 min | STATIONARY | 0 | 1,365 | 91.0 | Orphaned phase |
| W8 (45–60m) | 15 min | STATIONARY | 0 | 1,355 | 90.3 | Steady RC capture |
| W9 (60–90m) | 30 min | STATIONARY | 0 | 2,754 | 91.8 | Steady RC capture |
| W10 (90m→freeze) | 26.6 min | STATIONARY | 0 | 2,425 | 91.3 | Until pre-abort freeze |

**Trend:** Native HF buckets confined to W1–W2 (Window A). RC observation rate remains **~90–115/min** throughout the entire ~96 min post-trip tail — stable, not degrading. The orphaned phase caused continuous RC broad capture, not additional HF slot polls.

---

## Phase 7 — Nominal first 10 min scientific slice

| Metric | Value |
|--------|-------|
| `90_NOMINAL_WALL_DURATION` | 600,000 ms |
| `90_NOMINAL_VALID_MOVEMENT` | null (not computed — movement tracker inactive) |
| `90_NOMINAL_PROVIDER_REQUEST_COUNT` | 7 |
| `90_NOMINAL_PROVIDER_SUCCESS_COUNT` | 5 |
| `90_NOMINAL_PROVIDER_FAILURE_COUNT` | 2 (ZERO_RESULT) |
| `90_NOMINAL_NATIVE_BUCKET_COUNT` | 25 |
| `90_NOMINAL_BUCKETS_PER_MIN` | 2.5 |
| `90_NOMINAL_CONTINUITY` | Moderate — P50 15s, max gap 40.9s |
| `FORENSIC_NOMINAL_10MIN_STATUS` | **DEGRADED** (2/7 ZERO_RESULT; 71% provider success) |
| Persisted `scientificStatus` | NOT_SEALED (phase never closed at 10 min) |

---

## Phase 8 — Moving overrun (NOT cadence evidence)

| Metric | Value |
|--------|-------|
| `OVERRUN_MOVING_DURATION` | 622,000 ms (~10.4 min) |
| `OVERRUN_NATIVE_BUCKET_COUNT` | 0 |
| `OVERRUN_BUCKETS_PER_MIN` | 0 |
| `90_LONG_DURATION_STABILITY` | **INCONCLUSIVE** for telemetry — no HF requests post-slot-6 |

No provider degradation observable; acquisition architecture simply did not schedule additional HF slots after T0+9m.

---

## Phase 9 — Post-trip tail (~96 min orphaned phase)

| Metric | Value |
|--------|-------|
| `TRIP_END_AT` | `2026-09-14T12:04:15.000Z` |
| `PHASE_STILL_ACTIVE_UNTIL` | `2026-09-14T13:40:26.693Z` (pre-abort freeze authority) |
| `POST_TRIP_ACTIVE_DURATION` | 5,771,693 ms (~96.2 min) |
| `POST_TRIP_NATIVE_HF_BUCKETS` | **0** |
| `POST_TRIP_RC_OBSERVATIONS` | **8,792** (77% of all 11,413) |
| `POST_TRIP_RC_RATE` | ~91 obs/min (stable) |
| `POST_TRIP_FALSE_MOVEMENT` | **NOT_ASSESSED** (`validMovementDurationMs` = null; no signal-level false-movement audit) |
| `POST_TRIP_FALSE_TRIP_ACTIVITY` | **NO** |
| `POST_TRIP_SETTLEMENT` | **NONE** — all 114 completed by `12:03:53Z` |
| `POST_TRIP_TELEMETRY_BEHAVIOR` | RC broad capture continues (stationary SIGNAL_POINT); no HF slots |
| `TAIL_INTEGRITY` | **PASS** (no false movement/trip); phase seal **FAIL** (ownership gap) |

---

## Ten critical questions (116-min scope correction)

| # | Question | Answer |
|---|----------|--------|
| 1 | Did RC observations continue during ~96 min post-trip tail? | **YES** — 8,792 rows (77% of total) |
| 2 | Observation partition of 11,413? | A: 1,423 · B: 938 · C: 8,792 · D: 260 (+ 625 pre-T0) |
| 3 | Did `validMovementDuration` stop correctly? | **YES** — remained `null`; no false accumulation |
| 4 | Provider HF requests after 7 slots? | **NO** — last slot ~`11:52:53Z`; RC cycles continued |
| 5 | Settlement during tail? | **NO** — 67 in A + 47 in B = 114; last at `12:03:53Z` |
| 6 | Trip FSM RESTING while EXP-021 active? | **YES** — RESTING from `12:06:47Z`; RC RECORDING until abort |
| 7 | Orphaned phase anomalies? | No dupes/trip reopen/duplicate scheduler work; RC queue grew linearly (~1215 cycles); false movement **NOT_ASSESSED** |
| 8 | Native HF vs RC observations? | **Distinct:** 25 native buckets vs 11,413 RC rows |
| 9 | Why 25 buckets vs 11,413 obs? | HF: 5 successes → 25 starts; RC: ~9.4 obs/cycle × 1215 cycles |
| 10 | Classification preserved? | `VALID_90_VS_60=NO` · `VALID_FOR_CADENCE_SELECTION=NO` |

---

## Phase 10 — Settlement shadow deep audit

| Metric | Value |
|--------|-------|
| `SETTLEMENT_WINDOWS` | **19** |
| `SETTLEMENT_AGES` | +30s, +60s, +120s, +180s, +300s, +600s |
| `EXPECTED_TOTAL_OBSERVATIONS` | **114** (19 × 6) |
| `ACTUAL_TOTAL_OBSERVATIONS` | **114** |
| Status breakdown | 114 SUCCESS · 0 ZERO_RESULT · 0 FAILURE |
| Execution window A (nominal) | 67 observations |
| Execution window B (overrun) | 47 observations |
| Execution window C (tail) | **0** — all completed before trip end |
| Last settlement completed | `2026-09-14T12:03:53.325Z` |

**Why 114:** WALL_CLOCK full-phase overlapping tiles — 60s windows every 30s from phase start × 6 mandatory ages. Confirmed independently; not assumed.

| Maturation | Value |
|------------|-------|
| `LATE_IDENTITY_ADDITIONS` | 148 (identity growth across ages — verified from settlement matrix) |
| `VALUE_REVISIONS` | **NOT_ASSESSED** (no value-snapshot comparison performed) |
| Terminal status breakdown | **114 SUCCESS · 0 ZERO_RESULT · 0 FAILURE · 0 SKIPPED · 0 PENDING** |
| Structural acceptance | All 19 windows × 6 ages present and terminal SUCCESS |

Edge probes SP-90-T17/T18 show lower rawRowCount at +30s (25–26 rows) — partial window at phase edge, not failure.

---

## Phase 11 — Gap recovery / reconstructability

`GAP_RECONSTRUCTABILITY = **NOT_PROVEN**`

No identity-level mapping was performed between each native gap ≥10s and settlement observation payloads. Inter-bucket gap count in Window A = **17**; full-window unobserved segments ≥10s = **19** (includes start/end edges). Settlement structural completeness (114/114) is **distinct** from per-gap scientific recovery proof.

Route geometry artifacts: **NOT_AVAILABLE** (no orchestrated physical-end seal).

---

## Phase 12 — Route / movement quality

| Metric | Value |
|--------|-------|
| Moving interval | `11:43:53` → `12:04:15` (~20.4 min) |
| `GEOMETRY_AUTHORITY` | Trip FSM segment (DIMO canonical) |
| GPS jumps / impossible speeds | Not assessed — no matched geometry artifact for this RC session |
| Large gaps vs settlement | Native max gap 40.9s correlates with inter-slot provider windows |

---

## Phase 13 — Trip FSM correlation

| Check | Result |
|-------|--------|
| Trip created before T0 | YES (`11:34:00`) |
| ACTIVE_TRIP during Window A/B | YES |
| Natural completion | YES (`12:04:15` end, RESTING `12:06:47`) |
| `TRIP_FSM_ACCEPTANCE` | **PASS** |
| `TRIP_END_NATURAL` | **YES** |
| `TRIP_BOUNDARY_CREDIBLE` | **YES** |
| `EXP021_INTERFERED_WITH_TRIP_FSM` | **NO** |

Deployed #1617/#1627 semantics: no interference; EXP-021 prolonged active phase did not block or corrupt trip completion.

---

## Phase 14 — Provider reliability

| Metric | Value |
|--------|-------|
| `TOTAL_REQUESTS` | 7 |
| `TOTAL_SUCCESS` | 5 |
| `TOTAL_FAILURE` | 2 |
| `SUCCESS_RATE` | **71.428571%** (5/7) |
| Failure breakdown | 2× ZERO_RESULT · 0× HTTP · 0× timeout · 0× auth |

Failures isolated to slots 0 and 2; slots 1 and 3–6 succeeded — not broad instability.

---

## Phase 15 — Multi-replica / scheduler audit

| Check | Result |
|-------|--------|
| `DUPLICATE_SLOT_EXECUTIONS` | 0 |
| `DUPLICATE_SETTLEMENT_EXECUTIONS` | 0 |
| `SCHEDULER_SPLIT_BRAIN` | NO |
| `MULTI_REPLICA_INTEGRITY` | **PASS** |

---

## Phase 16 — What the active phase proves

| Slice | Valid evidence? |
|-------|-----------------|
| A. First 10 minutes | **YES** (standalone 90s with degradation) |
| B. Moving overrun | **LIMITED** (no additional HF data) |
| C. Post-trip tail | **YES** (runtime integrity — no false movement) |
| D. 90 vs 60 comparison | **NO** (60s never ran) |

---

## Phase 17 — 90s standalone verdict

| # | Question | Answer |
|---|----------|--------|
| 1 | Slot geometry correct? | **YES** (7/7) |
| 2 | Slot execution complete? | **YES** (7/7 issued) |
| 3 | Provider success sufficient? | **MARGINAL** (5/7 = 71%) |
| 4 | Native telemetry density acceptable? | **MARGINAL** (2.5 bkt/min; max gap 41s) |
| 5 | Gap behavior acceptable? | **MARGINAL** (17 gaps ≥10s in 10 min) |
| 6 | Settlement improved reconstructability? | **YES** (114/114 SUCCESS) |
| 7 | Long-duration 90s stable? | **INCONCLUSIVE** (no post-10min HF data) |
| 8 | Excessive provider cost? | **NO** (only 7 requests) |
| 9 | New defect from prolonged phase? | **YES** — ownership gap (no 90→60 seal) |
| 10 | Reject 90s as candidate? | **NO** from this run alone — degraded but structurally valid |

**`90_STANDALONE` = DEGRADED**  
**`DO_NOT_SELECT_PRODUCTION_CADENCE` = YES**

---

## Phase 18 — Comparison vs KS MS 661 V3 defective 90s (PR #1618, read-only)

| Metric | KS MS 661 (pre-#1621) | KS MX 2024 (post-#1621) |
|--------|----------------------|-------------------------|
| Expected slots | 7 | 7 |
| Persisted slots | **4** | **7** |
| Native buckets (90s) | **10** | **25** |
| Settlement windows | **9/19** | **19/19** |
| Settlement rows | 54 (9×6) | **114** (19×6) |

| Acceptance | Result |
|------------|--------|
| `1621_SLOT_FIX_PHYSICAL_ACCEPTANCE` | **PASS** |
| `1621_SETTLEMENT_GEOMETRY_PHYSICAL_ACCEPTANCE` | **PASS** |

Code/execution improvement proven; vehicle/provider variation remains uncontrolled.

---

## Phase 17 — Recorder ownership chain (deployed code `d1501d17`)

| Lifecycle step | Owner this run | Expected owner (orchestrator path) |
|----------------|----------------|-------------------------------------|
| PRE-ARM | MANUAL_OPERATOR | Orchestrator PREP (or manual prearm if runbook requires) |
| FAST GO | MANUAL_OPERATOR | Orchestrator session start |
| T0 | MANUAL_ONE_SHOT_WATCHER | Orchestrator `activatePhysicalPhaseAtT0` |
| 90s slot execution | RC_ACQUISITION_SERVICE | RC_ACQUISITION_SERVICE (under orchestrator-owned session) |
| 90s wall seal | **NONE** | Orchestrator `phaseTracker.shouldAdvancePhase` → `switchHfCalibrationPhase` |
| 90 → 60 | **NONE** | Orchestrator (same) |
| 60s init / execution | **NONE** | Orchestrator + acquisition |
| 60s wall seal | **NONE** | Orchestrator |
| PHYSICAL_END | **NONE** | Orchestrator `PhysicalEndDetector` |
| Session terminalization | MANUAL_ABORT | Orchestrator DONE / terminalize |

`RECORDER_FAILURE_CLASS = **OWNERSHIP_GAP**` · `90_TO_60_BLOCKED_BY_TELEMETRY = **NO**`

Mixed manual FAST GO + detached T0 watcher left no owner for wall-clock phase transitions. Orchestrator `isOrchestratorOwnedRecordingSession` requires `exp021AutonomousOrchestrator.runId` — manual path does not stamp this.

---

## Phase 18 — Autonomous orchestrator authority (next run design)

| Question | Answer |
|----------|--------|
| `SUPPORTED_COMPLETE_LIFECYCLE_OWNER` | `reference-capture-exp-021-autonomous-orchestrator.ts` |
| `AUTONOMOUS_ORCHESTRATOR_CAN_OWN_FROM_START` | **YES** (deployed at physical-run SHA) |
| `MANUAL_FAST_GO_REQUIRED` | **NO** when orchestrator is sole entry path |
| `MANUAL_T0_WATCHER_REQUIRED` | **NO** when orchestrator is sole entry path |
| `MANUAL_PHASE_TRANSITION_REQUIRED` | **NO** |
| Mixed manual + orchestrator safe? | **NO** — orchestrator refuses attach without ownership stamp |

---

## Phase 19 — Recorder repair requirement (spec only — NOT implemented)

`RECORDER_CODE_CHANGE_REQUIRED = **NO**`

Deployed orchestrator already implements the full lifecycle when started as **sole owner**. Today's failure was operator runbook: manual PRE-ARM + FAST GO + detached T0 watcher without starting the orchestrator.

**Canonical next-run procedure:**

1. PRE-ARM if required by deploy gate (orchestrator PREP may subsume).
2. Start `reference-capture-exp-021-autonomous-orchestrator.ts` as **only** lifecycle owner.
3. Do **not** run manual FAST GO or detached T0 watcher on the same session.
4. Let orchestrator own: movement confirmation → durable T0 → 90s (7 slots) → 10m wall seal → 90→60 → 60s (10 slots) → 10m wall seal → PHYSICAL_END → terminalization.

**Optional future hardening (not blocking if runbook enforced):** reject manual FAST GO when EXP-021 plan active without orchestrator ownership.

---

## Phase 20 — Required regression spec (before next physical drive)

| Field | Value |
|-------|-------|
| `REQUIRED_REGRESSION_NAME` | `candidate_short_ab_90_60 autonomous wall-clock phase seal without operator` |
| `REQUIRED_REGRESSION_SCOPE` | At T0: plan persists, 90 phase + 7 slots init. Advance wall clock 10m → 90 seals exactly once, 60 inits exactly once (no operator command). Advance 10m more → 60 seals, PHYSICAL_END persists, RC session + calibration series terminalize, settlement coherent, no duplicate slot jobs / stale cycle jobs / stale Redis locks. |
| `RESTART_RECOVERY_COVERED` | **PARTIAL** — existing specs cover plan/T0 recovery; full restart matrix at T0, pre-90→60, post-90→60 not yet complete |

---

## Phase 21 — Three data layers (no conflation)

| Layer | Count | Producer | Persistence | Continues after HF slots? |
|-------|-------|----------|-------------|-------------------------|
| **Native HF buckets** | 25 | HF deterministic slot historical polls (5 successes) | `acquisitionState` temporal bucket starts | **NO** (stopped after slot 6) |
| **Settlement shadow rows** | 114 | Settlement scheduler (19 windows × 6 ages) | `reference_capture_settlement_shadow_observations` | Completed before trip end |
| **RC observations** | 11,413 | RC acquisition runner (~3s cycles) | `reference_capture_observations` | **YES** (~91 obs/min through tail) |

---

## Phase 22 — Scientific classification

| Field | Value |
|-------|-------|
| `VALID_T0_EVIDENCE` | **YES** |
| `VALID_90_OPERATIONAL_EVIDENCE` | **YES** |
| `VALID_90_SCIENTIFIC_EVIDENCE` | **PARTIAL** (unsealed phase, no 60s, catch-up geometry, 2/7 ZERO_RESULT, `validMovementDuration` not computed) |
| `VALID_90_VS_60_COMPARISON` | **NO** |
| `VALID_FOR_PRODUCTION_CADENCE_SELECTION` | **NO** |
| `1621_SLOT_FIX_PHYSICAL_ACCEPTANCE` | **PASS** |
| `1621_SETTLEMENT_GEOMETRY_PHYSICAL_ACCEPTANCE` | **PASS** |
| `RUN_CLASSIFICATION` | `INCOMPLETE_SHORT_AB_PARTIAL_OPERATIONAL_EVIDENCE` |
| `ANOTHER_PHYSICAL_RUN_REQUIRED` | **YES** |

---

## Final report summary

```
RC_SESSION_ID = 332c1549-622d-4535-afd9-867962003280
PHYSICAL_T0 = 2026-09-14T11:43:53.000Z
TRIP_PHYSICAL_END = 2026-09-14T12:04:15.000Z
FORENSIC_FREEZE_AT = 2026-09-14T13:40:26.693Z
90_PHASE_ACTIVE_DURATION_AT_FREEZE = 6,993,693 ms (~116.6 min)  [AUTHORITY]
ABORT_SUMMARY_DURATION = 7,158,588 ms (~119.3 min)  [ARTIFACT ONLY]
ACTUAL_MOVING_DURATION = 1,222,000 ms (~20.4 min)
POST_TRIP_ACTIVE_TAIL_DURATION = 5,771,693 ms (~96.2 min)

NATIVE_HF_BUCKETS = 25 (all Window A)
RC_OBSERVATIONS = 11,413 (A:1423, B:938, C:8792, D:260)
NOMINAL_0_10_MIN: native=25, provider 5/7, STATUS=DEGRADED
SLOTS: 7/7 issued, 5 SUCCESS, 2 FAILURE (ZERO_RESULT)
SETTLEMENT: 114/114 SUCCESS (completed before trip end)
1621_SLOT_FIX = PASS | 1621_SETTLEMENT_GEOMETRY = PASS
PHASE_OVERRUN_ROOT_CAUSE = OWNERSHIP_GAP
90_TO_60_BLOCKED_BY_BAD_TELEMETRY = NO
```

### Top findings

1. **90s phase active ~116.6 min** (not ~25.5 min) — pre-abort freeze is timeline authority; abort summary is artifact only.
2. **#1621 corrections validated** — 7/7 slots, 19/19 settlement windows vs KS MS 661's 4/7 and 9/19.
3. **25 native HF buckets ≠ 11,413 RC observations** — HF slots stopped at T0+9m; RC runner continued ~91 obs/min for entire orphaned tail (8,792 stationary rows).
4. **Settlement completed before trip end** — all 114 by `12:03:53Z`; no settlement during 96 min post-trip tail.
5. **Post-trip tail integrity PASS** for scheduler/trip boundaries — no new HF slots, no trip reopen, no duplicate experiment work; false movement **NOT_ASSESSED**.
6. **Full-window max unobserved gap = 159,544 ms** (start-edge), not 40.9 s inter-bucket max.
7. **Recorder repair:** code change **not required** — orchestrator path exists; next run must use it as sole owner.

`PROVIDER_COUNTS_CONSISTENT = YES` · `FORENSIC_EVIDENCE_CONSISTENT = YES` · `READY_TO_FINALIZE_PR1645 = YES`

**NO CADENCE DECISION. NO RETROSPECTIVE 60s DATA. NO SCIENTIFIC NUMBER MUTATION. DO NOT MERGE.**
