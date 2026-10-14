# EXP021 P2.1 R3B — Diagnostic correctness final

**Status:** COMPLETE (read-only diagnosis; **live DB replay executed**)  
**PR:** #2020  
**Analysis code SHA (executed):** `993f14fb0782bfad3076289b17f9b35494db8f00`  
**Supersedes diagnosis only:** [EXP021_P21_R3A_FORENSIC_CLOSURE.md](./EXP021_P21_R3A_FORENSIC_CLOSURE.md) (R3A figures below are **historical**)  
**Trip / WI:** same as [EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md](./EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md)

## Final replay (this run)

| Field | Value |
|-------|--------|
| **Execution mode** | `LIVE_READONLY_DB` |
| **Role** | `synqdrive_exp021_p21_ro` (password from `/opt/synqdrive/shared/exp021-p21-ro-db.secret` on Production VPS; composed into `DATABASE_URL` for `localhost:5432/synqdrive` — **not** writer credentials, **not** APDS replay URL) |
| **Host** | Production VPS `~/di-r3a-run` + `exp021-p21-r3-forensic.ts` |
| **Artifact** | `/opt/cursor/artifacts/exp021-p21-r3b-forensic.json` (aggregates only) |
| **Observed `transaction_read_only`** | `on` |
| **Observed `transaction_isolation`** | `repeatable read` |
| **Snapshot bound to work item** | yes (`snapshotBoundToWorkItem: true`) |

## Plain language

**Diagnosis corrections (this run confirms):** Position grid is **`[2026-10-14T05:37:00Z, 2026-10-14T06:01:40Z)`** → **1480** expected labels, **1480** present, **0** missing inside window. R3A’s single “missing inside window” label was the **exclusive end** `2026-10-14T06:01:40Z`, not a provider hole.

**Unchanged on replay (P1/P2 V1 on pinned S2):** **1480** intervals, **691** trusted numeric, **763** `NO_NUMERIC`, **26** `CROSS_SOURCE_CONFLICT`, max **77.62 km/h**. Hold/frozen/stationary/conflict narrative unchanged.

## Position buckets (executed)

| Measure | R3A (historical) | R3B (this run) |
|---------|-----------------:|---------------:|
| Expected 1 Hz labels | 1481 | **1480** |
| Labels in pinned POSITION map | 1480 | **1480** |
| Missing inside `[start, end)` | 1 | **0** |
| `ROW_ABSENT` buckets | 4 | **4** |
| `SIGNAL_NULL` buckets | 0 | **0** |
| Valid coordinate buckets | 1476 | **1476** |

### Former false internal gap

| Field | Value |
|-------|--------|
| **Label** | `2026-10-14T06:01:40Z` (snapshot `acquisition_window_end`; **exclusive** bound) |
| **R3A class** | `POS_GAP_MISSING_BUCKET_INSIDE_WINDOW` (1 interval) + bucket-level “missing inside window” |
| **R3B class** | Not in-window; support-window **edge** classification where applicable (`WINDOW_EDGE_OUTSIDE_ACQUISITION`) |

## Interval-level position gaps (executed, disjoint V2 view **A**)

| V2 code | Intervals |
|---------|----------:|
| `POS_GAP_WINDOW_EDGE_OUTSIDE_ACQUISITION` | **2** |
| `POS_GAP_ROW_ABSENT_EXPLICIT` | **6** |
| `POS_GAP_MISSING_BUCKET_INSIDE_WINDOW` | **0** |
| **Pos-gap subtotal** | **8** |

| Aggregated impact (from artifact) | Count |
|-----------------------------------|------:|
| Intervals with **internal** position-gap support (excludes window-edge-only) | **6** |
| Intervals with **acquisition edge** support gap | **2** |

R3A had **1** edge + **1** false internal missing + **6** row-absent; R3B has **2** edge + **0** internal missing + **6** row-absent — **8** pos-gap intervals total **unchanged** after reclassification.

## NO_NUMERIC — view **A** (disjoint V2, sum **763**)

| Code | Intervals |
|------|----------:|
| `HOLD_TRANSITION_CENTER_FROZEN_UNRESOLVED` | 500 |
| `HOLD_TRANSITION_STATIONARY_SUPPORTED_BAND` | 144 |
| `HOLD_TRANSITION_MOVING_SPEED_UNKNOWN` | 33 |
| `HOLD_TRANSITION_TRANSITION_UNCERTAIN_FRESH_L3_SUPPORT` | 42 |
| `HOLD_TRANSITION_NEIGHBOR_HOLD_OR_RELEASE_FRESH_CENTER` | 23 |
| `HOLD_TRANSITION_CENTER_RELEASE` | 13 |
| `POS_GAP_ROW_ABSENT_EXPLICIT` | 6 |
| `POS_GAP_WINDOW_EDGE_OUTSIDE_ACQUISITION` | 2 |

`referenceGroupArithmeticVerified: true`

## NO_NUMERIC — view **B** (overlapping cause features, all 763 rows)

`holdTransitionDetailBreakdown` (each NO_NUMERIC row counted once by **center state detail**, not disjoint with A):

| Detail | Intervals |
|--------|----------:|
| `CENTER_FROZEN_UNRESOLVED` | 501 |
| `STATIONARY_SUPPORTED_BAND` | 144 |
| `MOVING_SPEED_UNKNOWN` | 33 |
| `TRANSITION_UNCERTAIN_FRESH_L3_SUPPORT` | 42 |
| `NEIGHBOR_HOLD_OR_RELEASE_FRESH_CENTER` | 23 |
| `CENTER_RELEASE` | 13 |
| `NO_MOTION_EVIDENCE` | 6 |
| `OTHER_S1_DOCUMENTED` | 1 |

**501 vs 500:** View **B** includes one NO_NUMERIC row that view **A** classifies as `POS_GAP_*` first (disjoint priority); view **C** (755 rows) shows **500** `CENTER_FROZEN_UNRESOLVED`.

Overlapping support strings (e.g. `ROW_ABSENT_EXPLICIT+WINDOW_EDGE_OUTSIDE_ACQUISITION`) appear in `crossTabTop` — use for multi-cause visibility without replacing view **A**.

## P1/P2 baseline (reproduced this run)

| Metric | Value |
|--------|------:|
| Intervals | 1480 |
| Trusted numeric | 691 |
| `NO_NUMERIC` | 763 |
| `CROSS_SOURCE_CONFLICT` | 26 |
| `shadowRawMaxKmh` / `qcTrustedMaxKmh` | 77.62 |

## Engineering

- `di-v0-p21-r3-forensic-classify.ts` — `[start, end)` via `di-v0-position-window.ts`
- `di-v0-p21-r3-forensic-loader.ts` — WI-bound S4D scope; `RepeatableRead` + session metadata
- `di-v0-p21-r3-forensic-analyze.ts` — reference groups A/B/C + sum checks
- Ops: `backend/scripts/ops/exp021-p21-r3-forensic.ts`

## Scoped P1 stationary correction — proposal only (not implemented)

Unchanged from R3B draft — see prior table in git history; next step is **versioned P1 policy** (`DI_V0_SPEED_QC_POLICY_V2`), not further general diagnosis.
