# C5.1 — Eligibility windows and repair specification

Frozen **physical** bounds (same hypotheses as Fable C5 PTQ V0 — not tuned on eval drives):

| Parameter | Value |
| --- | --- |
| `a_max` | 6 m/s² |
| Cross-track threshold (chord A→B) | 6 m |
| Repair support window half-width | 2 s initial, expand to **4 s max** |
| Min support points per side | 3 (present, non-quarantined, not POSITION_SUSPECT) |
| Max neighbour gap | 3 s (calendar) |

## 1. Suspicion signals (inputs only — not sufficient alone)

Per label `t`, collect **signals** from existing C4 output and grid (no new DIMO fields):

| Signal ID | Source | Meaning |
| --- | --- | --- |
| `S1` | C4 flag `L3_LEG_TIMING_SUSPECT_FALLBACK_ROBUST` | C4 used C1 because adjacent 1 s legs failed jitter/L3-direct |
| `S2` | C4 flag `TIMING_JITTER_SUSPECT_IN_WINDOW` | C1 window touched jitter-flagged leg |
| `S3` | C4 flag `L3_SUPPORT_MISSING_FALLBACK_ROBUST` | Missing L3 direct support / gap bridging |
| `S4` | Leg consistency | Outgoing or incoming leg in jitter suspect set (`detectTimingJitterSuspectLegs`) for center `t` |
| `S5` | Local kinematic inconsistency | ∃ interior present point P in `{t−1,t,t+1}` with chord speed ≥ 3 m/s and \|v(A,P)−v(P,B)\| > a_max·mean(Δt) |
| `S6` | Position gap | `ROW_ABSENT` at `t` or confirmed absent run affecting `{t−1,t,t+1}` |

**Rule:** `|signals| ≥ 1` opens a **candidate** only; it does **not** authorize repair.

## 2. Window construction (deterministic)

### 2.1 Seed seconds

Seed set `S_seed`:

- All `t` where **(S1 ∨ S2 ∨ S4)** and C4 `valueKmh ≠ null`
- Plus all `t` where **S5** fires on the triple (t−1, t, t+1) with present positions
- Plus **gap neighbourhood:** for each `ROW_ABSENT` label `g`, add labels `{g−1, g, g+1}` ∩ grid (TES16 `:21` absent → seeds `:20`, `:22` via neighbours; `:21` itself not repaired if absent)

**Exclude seeds:** `OUTLIER_REJECTED`, `FROZEN_POSITION`, `NO_POSITION` (C4 null with no present coord).

### 2.2 Expand and merge

For each seed `s`:

- Start interval `I = [s−1, s+1]` (calendar seconds on grid)
- If any label in `I` has S3 or gap S6, expand to `[s−2, s+2]`
- If S4 or S2 on any label in `I`, expand to `[s−3, s+3]` (max extent before merge)

Merge overlapping intervals → windows `W_k = [start_k, end_k]`.

**Cap:** No window wider than **9 s** (labels count); if merge would exceed, split at gap boundaries (first `ROW_ABSENT` or hard quarantine).

### 2.3 TES16 `03:50:17–26` coverage (acceptance target)

Expected single window (development check, not tuning):

- Includes `:20`, `:22`, `:23` (signals S1/S2/S4 on jitter leg `:22→:23`, gap `:20→:22`)
- Does **not** include unrelated trip regions (no seeds outside local cluster)
- `:21` remains `NO_POSITION` / pass-through from C4

### 2.4 Overlap policy

If two windows overlap, they share repair context but **per-label** repair still runs independently (no single merged speed field across the whole window).

## 3. Repair procedure (inside `t ∈ W` only)

### 3.1 Point attribution (unchanged logic from V0, scoped)

On present points in `[t−4, t+4]`:

1. For each interior P, test kinematic inconsistency vs neighbours A, B (gap ≤ 3 s).
2. **Leave-one-out:** attribute to P only if removing P makes chord A→B consistent with outer legs (Am→A, B→Bp) within `a_max`.
3. Classify: `TIME_SUSPECT` if cross-track(P, chord A→B) ≤ 6 m; else `POSITION_SUSPECT`; else `INCONSISTENT_UNATTRIBUTED`.

Do **not** quarantine solely on inconsistency without LOO (V0 lesson).

### 3.2 Speed candidate at center `t`

1. Build support set from present points in `[t−h, t+h]`, `h ∈ {2,3,4}` — choose **largest h ≤ 4** such that ≥3 support points on each side of `t`, excluding hard reject and POSITION_SUSPECT from support; TIME_SUSPECT excluded from support but may be bridged in path length.
2. If no valid h ≤ 4: **REPAIR_REJECTED** → pass-through C4 (fixes coverage loss).
3. Theil–Sen on path-length slopes; skip pairs spanning `INCONSISTENT_UNATTRIBUTED` or POSITION_SUSPECT interiors.
4. **Hard rule:** if `h` would need 5, **stop** — do not use ±5 (QA finding: 67 V0 violations).

### 3.3 Repair vs C4 acceptance (evidence must beat incumbent)

Let `c4` = C4 sample at `t`, `cand` = repair candidate.

| Check | Requirement |
| --- | --- |
| Quarantine | If `c4.quality === OUTLIER_REJECTED` → no repair |
| Plausibility | `cand` must not create new leg > hard quarantine threshold (reuse existing gate) |
| Consistency | After applying `cand` at `t`, local triple (t−1,t,t+1) must not violate `a_max` worse than C4 triple |
| Error proxy (offline eval only) | If video ref readable at `t`: \|cand−ref\| < \|c4−ref\| − ε (ε = 0.5 km/h floor) **or** C4 had S1/S2/S4 and cand removes jitter-flag dependency |
| No ref | Accept only if LOO attributed TIME_SUSPECT at `t` **or** at immediate neighbour driving the error, and chord reconstruction stable |

If checks fail → **REPAIR_REJECTED** (C4 unchanged). If attribution ambiguous → **UNCERTAIN** (C4 unchanged, flag for review).

### 3.4 Strong acceleration and curves

- **True manoeuvre:** sustained monotonic speed change over ≥3 s with consistent heading and no LOO TIME_SUSPECT on interior points → S5 may fire but LOO **fails** → no repair (preserve C4).
- **Curve:** lateral cross-track to local chord remains small; inconsistency from speed change along arc should **not** attribute POSITION_SUSPECT if turn rate is consistent with `a_max` tangential — if heading delta per second exceeds floor, window eligible but repair **rejected** unless TIME_SUSPECT LOO at single label (design: heading rate helper optional phase-2; default reject when >25°/s between 1 s legs).

### 3.5 Missing evidence

- No invented `valueKmh` at `ROW_ABSENT`.
- If C4 null and not in repair window → unchanged null.
- UNCERTAIN and REPAIR_REJECTED both keep C4 numeric when C4 had numeric.

## 4. Output mapping to C4 quality enum (for event parity)

When **REPAIR_ACCEPTED**:

- Map to existing qualities only: `REPAIRED` if TIME_SUSPECT bridged; `JITTER_SUSPECT` if window had S2/S4 but value fixed; else `OK` if all flags cleared on accepted sample.
- Append research flags: `C5_1_REPAIR_ACCEPTED`, `C5_1_ATTRIBUTION=…`, never remove C4 flags from metadata log (append-only trace).

When pass-through / rejected / uncertain: C4 quality unchanged.

**Event detector:** use **identical** `MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities` for both C4-only and C5.1 series so recall/FP comparison is fair (#2142 QA).
