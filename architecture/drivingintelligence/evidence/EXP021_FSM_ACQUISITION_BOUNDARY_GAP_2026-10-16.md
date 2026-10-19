# EXP021 — GPS gap, Trip FSM boundaries, and acquisition denominator

| Field | Value |
| --- | --- |
| PR | [#2046](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2046) |
| Production release SHA (VPS) | `7de8f3ae2040a229f2a9c4b6a663117f1871fe55` |
| Analysis SHA (branch) | `77c0187563` (+ this commit) |
| Provider calls | **0** |
| Production mutations | **NONE** (read-only SQL) |
| Persisted V2 aggregates (20-trip sample) | **2 PASS**, **18 N/A** (unchanged policy) |

## 1. Missing-run counts (reconciled)

| Metric | Value |
| --- | ---: |
| All missing runs on 1 s grid | **61** |
| Missing runs **>10 s** | **13** (**2847** absent seconds) |
| Missing runs **≤10 s** | **48** (**119** absent seconds) |
| Total absent seconds | **2966** (= 2847 + 119) |
| Label gap `14:58:35Z` → `15:21:20Z` | **1365 s** |
| Interior absent buckets | **1364** |

Machine-readable: `exp021-position-timing-analysis.json`.

## 2. Code lineage (release `7de8f3ae…`, not unverified `main`)

| Step | Authority |
| --- | --- |
| Trip boundaries | `vehicle_trips.start_time` / `end_time` (Trip FSM / reconciliation persistence) |
| S4 acquisition window | `deriveSecondAlignedEnclosingWindow(startMs, endMs)` in `di-v0-position-window.ts`, called from `resolveDiV0S4cAcquisitionContext` |
| Pinned storage | `di_v0_s4_evidence_snapshots.acquisition_window_*` |
| Shadow / P2 denominator | One row per acquisition bucket (`di_v0_shadow_intervals` for WI `shadow_run_id`) |
| Quiet period | `DI_V0_S4_LIMITS.settlementQuietPeriodSeconds` = **600**; `eligible_at = settlement_anchor_at + 600s` at WI insert (`di-v0-s4a-work-item.repository.ts`) — **does not extend** acquisition `toUtc` |

Unit proof: `exp021-acquisition-window-lineage.unit.spec.ts`.

## 3. Answers A–F (primary case)

| ID | Question | Finding |
| --- | --- | --- |
| **A** | What supplies **16:05:19Z** as acquisition end? | `acquisition_window_end` on pinned snapshot = `ceil(end_time)` second alignment from **`vehicle_trips.end_time` at S4 execution** (not `completed_at`, not `eligible_at`). Observed anchor `settlement_anchor_at` = **16:05:18.665Z** matches that end. |
| **B** | Fachliches Fahrtende vs Finalisierung? | **Fachliches / FSM trip end** at pin time (~16:05:18), not post-S4 finalization. WI `completed_at` = **16:22:44Z** (after **600 s** quiet eligibility). |
| **C** | Quiet period / padding in window? | **No.** Quiet period only delays eligibility (**600 s** observed on WI). Acquisition span is trip start→end alignment only. |
| **D** | Trip revised after pin? | **Yes.** `trip_repairs` **INTRA_TRIP_GAP_SPLIT** applied **2026-10-14T19:47:21Z** (after S4). `raw_detection_meta.splitGapMs` = **1365000** (1365 s). Pinned `boundary_fingerprint` **≠** recomputed fingerprint from **current** trip row. |
| **E** | Pin vs current trip vs UI? | **Pinned** window **[14:47:05, 16:05:19)** / **4694** buckets. **Current** canonical trip end **14:58:31** → enclosing **[14:47:05, 14:58:32)** / **687** buckets. UI duration ~11.4 min matches **current** trip, not pinned denominator. |
| **F** | Gap in drive vs pause vs tail? | At S4 time the vehicle was treated as **one continuous trip** through the gap (tracking runs **ACTIVE_TRIP** during gap). **After** reconciliation split, gap lies **between** trip `533b2bf8…` and `6bb3ddf2…`. **Post-gap tail** in pin: **1365** POSITION-present buckets before acquisition end — **not** “finalization-only” padding. |

## 4. UTC timeline (stored fields)

| UTC (approx.) | Source | Field / event | Meaning |
| --- | --- | --- | --- |
| 14:47:05 | `vehicle_trips` | `start_time` | Trip start (current + pin share start) |
| 14:58:31 | `vehicle_trips` | `end_time` (**current**) | Post-split first segment end |
| 14:58:35 | Pin POSITION | present label | Last point before 1365 s label gap |
| 15:21:16 | `raw_detection_meta` | `splitSecondStartAt` | Second segment start (repair metadata) |
| 15:21:20 | Pin POSITION | present label | First point after gap |
| 15:21:59 | `vehicle_trips` | `created_at` | Trip row creation (after gap onset) |
| 15:22–16:06 | `vehicle_trip_tracking_runs` | `ACTIVE_TRIP` | FSM still active through gap/tail (no per-transition log) |
| **16:05:18.665** | WI | `settlement_anchor_at` | GREATEST-style anchor at insert ≈ **pre-split trip end** |
| **16:15:18.665** | WI | `eligible_at` | Anchor + **600 s** quiet period |
| 16:22:18 | WI | `created_at` | S4 work item enqueued |
| 16:22:38 | Snapshot | `created_at` | Evidence pin |
| 16:22:44 | WI | `completed_at` | S4 complete |
| 19:47:21 | `trip_repairs` | `INTRA_TRIP_GAP_SPLIT` APPLIED | Canonical boundary repair **after** pin |

FSM transition history: **UNKNOWN** (no durable FSM event table in this extract).

## 5. Telemetry correlation (stored pin only)

See [`EXP021_LARGEST_GAP_SIGNAL_CORRELATION_2026-10-16.md`](EXP021_LARGEST_GAP_SIGNAL_CORRELATION_2026-10-16.md).

| Region | POSITION | R1 speed/RPM | Notes |
| --- | --- | --- | --- |
| Gap interior (1364 buckets) | 0 present | 0 present | Multi-signal absent |
| After gap → acq end (2638 buckets) | **1365** present / **1273** absent | Sparse overall in full window | Movement **after** gap supported by POSITION returns; **inside** gap **UNKNOWN** |

Equal coords at gap boundaries do not prove continuous stop. Missing POSITION does not prove trip end.

## 6. Hypothesis verdicts

| ID | Verdict | Evidence |
| --- | --- | --- |
| **H1** | **PARTIALLY CONFIRMED** | Real multi-minute POSITION (+R1) absence in sealed pin; provider already matched sparsity. |
| **H2** | **REJECTED** for acquisition end | End tracks **trip end at execution**, not quiet-period padding. |
| **H3** | **CONFIRMED (temporal)** | Pre-split **single active trip** across gap; post-split **inter-trip** pause semantics. |
| **H4** | **CONFIRMED** | **INTRA_TRIP_GAP_SPLIT** after pin; fingerprint drift; pin frozen on **long** boundary. |
| **H5** | **OPEN** for upstream POSITION outage root cause | Boundary/denominator effects separable; provider physics not closed. |

## 7. Boundary counterfactual (diagnostic only — post-split canonical trip)

Justification: reconciliation repair defines **independent** canonical trip end **14:58:31** after pin.

| Window | Grid seconds | POSITION present | ROW_ABSENT |
| --- | ---: | ---: | ---: |
| **Pinned (as stored)** | 4694 | 1728 | 2966 |
| **Current trip enclosing** | 687 | 361 | 326 |

Does **not** change production projections (none CURRENT on this WI). Illustrates how **denominator inflation** from pre-split trip end affects coverage-style metrics.

## 8. Defect assessment (no production fix in this PR)

| Topic | Assessment |
| --- | --- |
| **Observed gap** | Not explained by FSM quiet period or acquisition padding. |
| **Coverage denominator** | P2/shadow uses **pinned** acquisition window; **retroactive INTRA_TRIP_GAP_SPLIT** after S4 leaves **stale boundary** on completed PRIMARY WI. |
| **Minimal fix proposal** | On applied `INTRA_TRIP_GAP_SPLIT` (and similar boundary repairs), **supersede or re-enqueue** affected `di_v0_s4_work_items` when `boundary_fingerprint` drifts (S4A boundary drift path). **Not implemented here.** |
| **Repro test** | `exp021-acquisition-window-lineage.unit.spec.ts` (window math); integration would mirror `di-v0-s4a` boundary drift tests. |

## 9. Reference drive

[`EXP021_OWNER_REFERENCE_DRIVE_PROTOCOL_2026-10-16.md`](EXP021_OWNER_REFERENCE_DRIVE_PROTOCOL_2026-10-16.md) — compare **observed trip end**, **FSM finalize**, **settlement_anchor**, and **S4 acquisition end** on a **new** drive.

## Artifacts

- `/opt/cursor/artifacts/exp021-fsm-acquisition-timeline.json`
- `/opt/cursor/artifacts/exp021-largest-gap-pin-correlation.json`
- Script: `backend/scripts/ops/exp021-fsm-acquisition-timeline.ts` (run from `/tmp` overlay on VPS)
