# C5.1 — Gated local repair architecture (design only, post–Fable)

**Status:** Research design gate — **no implementation** in this workstream.  
**Production kinematics pin:** `579ee8b2fed06593d7d2aa57cffb6036dbf53a24`  
**Prior head:** `9283a6e30` (Fable `DESIGN_VERDICT=REVISE`)  
**Supersedes for fleet authority:** C5 PTQ V0 (#2142, `NOT_PROVEN`) — must not ship as-is.

## Problem statement

C4 (`computeC4AdaptiveL3`) is the production-parity speed authority. Root-cause work (#2140) and DIMO probe (#2141) show **isolated timing/label mis-assignment** on otherwise coherent geometry (TES16 `03:50:20–23`), while C5 V0 demonstrated that **global PTQ re-estimation** fixes some tails but **sacrifices coverage** (115 C4-numeric seconds lost), **violates ±4 s lookahead** (67 outputs at ±5 s), and **distorts event comparison** via different `usableQualities`.

C5.1 is a **gated repair layer**: C4 remains default; repair runs only inside **velocity-seeded suspicion windows** and only when a candidate passes **reference-free** acceptance (`ELIGIBILITY_AND_REPAIR_SPEC.md` §3.3).

## Layered pipeline (offline-only v1)

```
Position grid (1 Hz AVG buckets, unchanged acquisition)
        │
        ▼
┌───────────────────────────────────────┐
│  C4 — computeC4AdaptiveL3 (frozen pin) │  full trip replay → snapshot
└───────────────────────────────────────┘
        │  per-label: valueKmh, quality, flags, supportLabels, estimator
        ▼
┌───────────────────────────────────────┐
│  Eligibility — suspicion windows W_k   │  velocity seeds + gap context
└───────────────────────────────────────┘
        │  labels ∉ ⋃W_k → PASS_THROUGH
        ▼
┌───────────────────────────────────────┐
│  Repair engine — scoped PTQ subset     │  per-label support max ±4 s
└───────────────────────────────────────┘
        │  REPAIR_ACCEPTED | REPAIR_REJECTED | UNCERTAIN
        ▼
┌───────────────────────────────────────┐
│  Research output + event replay        │  same guards/oracle as C4 arm
└───────────────────────────────────────┘
```

**Non-goals:** No C4 module replacement, no DIMO/OBD authority, no workers, no production feature flag, **no real-time streaming claim** in v1.

## Pass-through guarantee (by design)

1. Outside ⋃W_k: output **bit-identical** to C4 (value, quality, flags, support, estimator). Research metadata may add `repairState: PASS_THROUGH`.

2. Inside W but **REPAIR_REJECTED** / **UNCERTAIN**: identical to C4 (not null).

3. **REPAIR_ACCEPTED**: only `valueKmh` changes; `quality` → **`REPAIRED`** (never `OK`); C4 provenance retained in metadata.

4. Hard quarantine labels are never repaired.

This addresses V0’s 115 lost seconds without reintroducing global re-estimation.

## Time semantics (three layers — do not merge)

| Layer | Bound | Purpose |
| --- | --- | --- |
| Repair support | **±4 s** inclusive | Theil–Sen neighbourhood per target second |
| C4 data availability | up to **t+6** | Frozen replay finalization (jitter-coupled C4 semantics) |
| Eligibility membership | up to **~t+9** | Velocity seed expansion (±3) + gap bridge on **completed** trip snapshot |

**Offline contract:** C5.1 v1 is **post-processing** on a frozen C4 replay per drive. Eligibility may read flags on labels up to t+9 relative to an early window label; this is valid only because the full trip snapshot exists. No claim of production streaming parity until a separate latency study exists.

**Estimate anchor:** bucket label start UTC (unchanged). No “reconstructed true sub-second time” fields.

## Fable review incorporation (summary)

| Fable finding | Design response |
| --- | --- |
| Video oracle in §3.3 | Removed; acceptance purely GPS/time/geometry |
| 3/side @ ±4 infeasible for TES16 :20/:23 | **n≥5, ≥2/side @ ±4**; verified 129.0 / 126.9 km/h |
| S6 flächendeckend | S6 **not** a seed; ≤10.3 % grid eligibility on eval drives |
| Split at ROW_ABSENT | Forbidden for jitter-gap patterns; gap bridge rule |
| a_max=6 vs #2139 9 m/s² | Split **`a_attr`** (attribution) vs **`a_plaus`** (manoeuvre/oracle) |
| t+9 eligibility | Documented; offline-only |
| REPAIRED → OK | **Forbidden** |

## Relationship to evidence PRs

| Source | Use in C5.1 |
| --- | --- |
| #2139 Video manoeuvre reference | **Post-hoc** validation oracle (T2/T3) only — same pipeline both arms |
| #2140 Root cause | TES16 gap + jitter leg pattern |
| #2141 DIMO probe | 1 Hz effective time; bucket :21 absent → context, not invented speed |
| #2142 C5 V0 + QA | Anti-patterns: global PTQ, ±5 leak, usableQuality drift, ref in acceptance |

## Research package boundary

Future implementation: new scripts under `research/…` only until promotion review. `backend/src/…/c4-adaptive-l3.ts` untouched in design phase.

## Single authoritative metrics (future experiment)

One machine-readable artifact per run: **`c5_1_experiment_summary.json`**, produced by a **single** runner; all markdown/CSV derived from it (fixes #2142 report/JSON drift). Human gates in `VALIDATION_GATES.md` reference this file only.
