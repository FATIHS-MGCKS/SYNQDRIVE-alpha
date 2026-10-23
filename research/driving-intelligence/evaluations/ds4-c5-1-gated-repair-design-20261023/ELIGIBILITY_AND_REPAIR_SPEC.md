# C5.1 — Eligibility windows and repair specification (post–Fable revision)

**Revision:** Incorporates independent Fable review on PR #2143 (`9283a6e30` → this commit).  
**Production kinematics pin:** `579ee8b2fed06593d7d2aa57cffb6036dbf53a24`  
**Mode:** Offline post-processing on a **frozen C4 replay snapshot** per trip (see §6).

## 0. Parameter roles (do not conflate)

| Symbol | Value | Role |
| --- | --- | --- |
| `a_attr` | 6 m/s² (frozen hypothesis) | LOO **attribution** threshold on chord leg speeds (TIME_SUSPECT vs not) |
| `a_plaus` | Per #2139 event plausibility (e.g. Tesla ACCEL/DECEL 9.0 m/s²; Tiguan DECEL 9.0 m/s²) | **Manoeuvre preservation** pre/post level test; event oracle parity — **not** swapped with `a_attr` |
| Cross-track (chord A→B) | 6 m | TIME_SUSPECT vs POSITION_SUSPECT split (aligned with 8 m chord-midpoint outlier scale) |
| Repair support half-width | **4 s max** (calendar, inclusive) | Theil–Sen support only in `[t−4, t+4]` — **never ±5** |
| Min support | **≥5** present points total, **≥2** on each side of `t` | Replaces prior “3 per side” rule (Theil–Sen contamination: one bad point affects ≤2/n pair slopes; median stable for n≥5) |
| Max neighbour gap | 3 s (calendar) | Path bridging for attribution and slopes |

Video tachometer values are **forbidden** in repair accept/reject logic (§3.3). They appear only in `VALIDATION_GATES.md` after the fact.

## 1. Suspicion signals (inputs only — not sufficient alone)

Per label `t`, from frozen C4 output and position grid (no new DIMO fields):

| Signal ID | Source | Meaning |
| --- | --- | --- |
| `S1` | C4 flag `L3_LEG_TIMING_SUSPECT_FALLBACK_ROBUST` | C4 used C1 because adjacent 1 s legs failed jitter/L3-direct |
| `S2` | C4 flag `TIMING_JITTER_SUSPECT_IN_WINDOW` | C1 window touched jitter-flagged leg |
| `S3` | C4 flag `L3_SUPPORT_MISSING_FALLBACK_ROBUST` | Missing L3 direct support / gap bridging (**context only**, not a seed) |
| `S4` | Leg consistency | Outgoing or incoming leg in jitter suspect set (`detectTimingJitterSuspectLegs`) for center `t` |
| `S5` | Local kinematic inconsistency | ∃ interior present P in `{t−1,t,t+1}` with chord speed ≥ 3 m/s and \|v(A,P)−v(P,B)\| > **`a_plaus`·mean(Δt)** |
| `S6` | Position gap | `ROW_ABSENT` at `t` or absent run affecting `{t−1,t,t+1}` (**context / expansion only**, not a standalone seed) |

**Rule:** Signals explain *why* a region might be reviewed; they do **not** authorize repair without §3.3 reference-free acceptance.

## 2. Window construction (deterministic, locally scoped)

### 2.1 Velocity seeds (only these open intervals)

`S_seed` = labels `t` where:

- **(S1 ∨ S2 ∨ S4)** and C4 `valueKmh ≠ null`, **or**
- **S5** fires on a present triple `(t−1, t, t+1)` with gaps ≤ 3 s

**Explicit exclusions from seeding:**

- **S6 alone** never seeds (prior design: 70–93 % grid eligibility — rejected).
- **S3 alone** never seeds (sparse-support fallback is too broad).

**Exclude from seeds:** `OUTLIER_REJECTED`, `FROZEN_POSITION`, labels with no present coordinate.

### 2.2 Expand, merge, split

For each velocity seed `s` at calendar `t_s`:

1. Start `I = [t_s−1, t_s+1]`.
2. If any label in `I` has **S2 or S4**, expand to `[t_s−3, t_s+3]`.
3. Else if **S5** on `s`, expand to `[t_s−2, t_s+2]`.
4. **S6 context (gap bridge):** for each `ROW_ABSENT` label `g` with `g ∈ [I−1, I+1]` (calendar), if some velocity seed lies within **±2 s** of `g`, extend `I` to include `{g−1, g, g+1}` ∩ grid.  
   - TES16 `03:50:21` absent: `:20` and `:22` remain in one bridged interval when seeds `:22` (S2/S4) and `:23` (S1) are merged — **no split at the absent row**.
5. Merge overlapping intervals → suspicion windows `W_k = [start_k, end_k]`.

**Cap:** If merged width > **15** calendar labels, split at **calendar midpoint** `(start+end)/2` (deterministic).  
**Forbidden split:** **Never** split solely at `ROW_ABSENT` if both sides carry velocity seeds tied to the same jitter/gap pattern (Fable `WINDOW_SPLIT_SAFETY`).

**Important:** Window width **does not** widen per-label repair support. For repair at label `t`, support is always §3.2 `[t−4, t+4]` only.

### 2.3 Counting (experiment reporting)

Report separately per drive:

| Metric | Definition |
| --- | --- |
| `suspicion_window_labels` | \|⋃W_k\| on motion-core grid |
| `repair_attempted` | Labels in ⋃W_k with C4 numeric and not hard-quarantined |
| `repair_accepted` | §3.3 passed |
| `pass_through` | All other labels (including inside W but rejected) |

**Revised eligibility audit** (pinned replays, script `c51_revised_design_stats.cjs`, log in design PR discussion):

| Drive | Velocity seeds | Suspicion windows | Eligible labels (% grid) |
| --- | --- | --- | --- |
| TES16 | 5 | 2 | 17 (1.5 %) |
| TIG22 | 31 | 8 | 80 (3.8 %) |
| TES21-1 | 17 | 7 | 55 (10.3 %) |
| TES21-2 | 5 | 2 | 18 (3.4 %) |

TES16 critical cluster: one window `03:50:18–03:50:26` covers `:20`, `:22`, `:23` without a TES16-only hand window.

### 2.4 Overlap policy

Overlapping windows share metadata; **per-label** repair and acceptance run independently at each `t`.

## 3. Repair procedure (inside `t ∈ ⋃W_k` only)

### 3.1 Point attribution (frozen C4 snapshot)

On present points in `[t−4, t+4]`:

1. For each interior P, test \|v(A,P)−v(P,B)\| > **`a_attr`·mean(Δt)** with gap ≤ 3 s.
2. **Leave-one-out:** attribute inconsistency to P only if chord A→B (with P removed) is consistent with outer legs (Am→A, B→Bp) within **`a_attr`**.
3. Classify: `TIME_SUSPECT` if cross-track(P, chord A→B) ≤ 6 m; else `POSITION_SUSPECT`; else `INCONSISTENT_UNATTRIBUTED`.

Do not quarantine solely on inconsistency without LOO (V0 lesson).

**TES16 verification (pinned positions, `a_attr=6`):** LOO attributes `03:50:22` as single `TIME_SUSPECT` (v(A,P)=64.5 km/h, v(P,B)=256.0 km/h, cross-track 0.17 m).

### 3.2 Speed candidate at center `t`

1. Sort present support points in `[t−h, t+h]`, `h ∈ {4,3,2}` — choose **largest h ≤ 4** such that:
   - ≥ **5** points total (including `t` if present),
   - ≥ **2** strictly left and ≥ **2** strictly right of `t`,
   - exclude hard quarantine, `POSITION_SUSPECT`, and any label classified `TIME_SUSPECT` **for this repair** (always exclude attributed jitter point P; at `t=P`, P may be center but not in slope support set).
2. If no valid `h`: **REPAIR_REJECTED** → pass-through C4.
3. **Theil–Sen** on **time-ordered** path-length slopes: for each pair (i,j), slope = cumulative haversine along present points i…j divided by Δt; median × 3.6 → km/h. Skip pairs whose interior includes `INCONSISTENT_UNATTRIBUTED` or `POSITION_SUSPECT`.
4. **Hard rule:** if support would require \|Δt\| > 4 from `t`, **stop** — no ±5 (V0: 67 violations).

**TES16 feasibility (verified, no video tuning):**

| Label | h | n | L/R | Theil–Sen km/h | C4 km/h |
| --- | --- | --- | --- | --- | --- |
| 03:50:20 | ±4 | 7 | 4/2 | **129.0** | 113.1 |
| 03:50:22 | ±4 | 8 | 3/4 | **127.9** | 128.2 |
| 03:50:23 | ±4 | 7 | 2/4 | **126.9** | 148.3 |

**Correlated segments:** consecutive legs share edges; Theil–Sen pairs are not i.i.d. Robustness check (leave-one-out on :20 support): estimates stay **129.0–129.4 km/h** (max Δ 0.4 km/h). With n=7, a single mislabeled point contaminates at most **2/7** of pair slopes; median remains stable (Fable criterion).

### 3.3 Reference-free repair acceptance (replaces video / jitter-flag rules)

Let `c4` = C4 sample at `t`, `cand` = repair candidate. **Video reference and \|cand−ref\| are not used here.**

| Step | Requirement |
| --- | --- |
| Q1 Quarantine | `c4.quality === OUTLIER_REJECTED` → no repair |
| Q2 Unique attribution | Exactly **one** `TIME_SUSPECT` label P in `[t−4,t+4]` on the LOO pass (0 or >1 → **REPAIR_REJECTED** or **UNCERTAIN**) |
| Q3 Contamination link | `c4.supportLabels` contains **P** (ties repair to C4’s contaminated C1 window — covers TES16 `:20` with P=`:22` at +2 s, not only ±1 neighbour) |
| Q4 Manoeuvre guard | **Pre/post level agreement:** with outer legs Am→A and B→Bp (first present within 3 s), \|v(Am→A) − v(B→Bp)\| ≤ **`a_plaus`·1 s** and \|v_AB − mean(v_pre, v_post)\| ≤ **`a_plaus`·1 s**. If failed → **real manoeuvre** → **REPAIR_REJECTED** (do not smooth accel/brake/curve as TIME_SUSPECT) |
| Q5 Plausibility | `cand` must not create new hard-teleport quarantine legs (reuse C4 gate machinery) |
| Q6 Local consistency | Applying `cand` at `t` must not worsen the `(t−1,t,t+1)` **`a_plaus`** triple vs C4 |

If any mandatory step fails → **REPAIR_REJECTED** (C4 unchanged). Ambiguous attribution → **UNCERTAIN** (C4 unchanged, documented).

**Removed (Fable):** error proxy \|cand−ref\| < \|c4−ref\| − ε; “removes jitter-flag dependency” as acceptance.

### 3.4 Curves and heading

If heading change between consecutive 1 s legs > **25°/s** and Q4 manoeuvre guard passes → **REPAIR_REJECTED** unless Q2 attributes a **single** TIME_SUSPECT interior point (phase-1). No reference heading from video.

### 3.5 Missing evidence

- No invented `valueKmh` at `ROW_ABSENT`.
- REPAIR_REJECTED / UNCERTAIN keep C4 numeric when C4 had numeric (fixes V0 coverage loss).

## 4. Output mapping (event parity)

When **REPAIR_ACCEPTED**:

- `quality` = **`REPAIRED` only** — **never** promote to `OK` (Fable: avoids `eventQuality` inflation).
- Append research flags: `C5_1_REPAIR_ACCEPTED`, `C5_1_ATTRIBUTION=…`, `C5_1_ORIGINAL_C4_QUALITY=…`, `C5_1_ORIGINAL_C4_FLAGS=…` (append-only; original C4 flags preserved in metadata).

When pass-through / rejected / uncertain: **bit-identical** C4 `valueKmh`, `quality`, `flags`, `supportLabels`, `estimator`.

**Event detector:** identical `MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities` and **#2139 oracle pipeline** for both arms (#2142 QA).

## 5. Pass-through and V0 coverage lesson

C5 V0 lost **115** C4-numeric seconds via global `PTQ_INSUFFICIENT_SUPPORT`. C5.1 **REPAIR_REJECTED** and out-of-window labels must remain C4-numeric.

**Residual risk (unchanged by design):** On those 115 seconds, C4 replay errors include **13** seconds with \|error\| > 8 km/h vs video (TIG22: 5, TES21-1: 5, TES21-2: 3; TES16 lost set: 0). Pass-through **preserves** them by design — not claimed as accuracy wins.

## 6. Time semantics (three layers)

| Layer | Horizon | Notes |
| --- | --- | --- |
| **A. Repair support** | `[t−4, t+4]` | Hard cap; gate F3 audits 0 violations |
| **B. C4 finalization** | up to **t+6** | Production C4 jitter-coupled semantics on frozen snapshot |
| **C. Eligibility** | seeds up to **±3** expansion + gap bridge + merge; membership of `t` in W can depend on labels up to **~t+9** | **Offline only** — no streaming / real-time claim |

C5.1 runs after full-trip C4 replay is materialized; eligibility reads final C4 flags per label.
