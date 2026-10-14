# EXP021 P2.1 R3 — GPS / L3 / P1 QC semantics forensic (one real trip)

**Status:** COMPLETE (read-only forensic)  
**Production code SHA at analysis:** `b3107b44831cf10add09c067b2ae738f35a1fde1`  
**Prior preview (R2):** `EXP021_P21_FIRST_REAL_TRIP_R2=COMPLETE` on same SHA  
**Read-only DB role:** `synqdrive_exp021_p21_ro` (SELECT on four DI tables; `transaction_read_only` in preview CLI)  
**No production mutations, no provider calls, no other trips evaluated.**

## Scope identity (verified)

| Field | Value |
|-------|--------|
| Organization | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| Vehicle | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| Trip | `d0af9cc7-ce0d-4e40-9854-2c1341e83bed` |
| Work item | `bcfe842e-a022-4a16-9db9-e9603b712bfb` (`COMPLETED`) |
| Shadow run | `b8b62188-e5f5-4808-9420-ed62d134a4de` |
| Pinned snapshot | `DI_V0_S4_EVIDENCE_V1:sha256:06d5c1200e494bb8432c164c77cb90898a19c4b21a3ab72e54c4926a2fb1bed7` |
| S4D verifier | PASS (in-memory replay on pinned gzip payload) |
| Acquisition window | `2026-10-14T05:37:00.000Z` → `2026-10-14T06:01:40.000Z` (1 480 s) |

Artifact: `/opt/cursor/artifacts/exp021-p21-r3-forensic.json` (aggregates only; no route dump).

## Plain-language summary

On this ~24½‑minute trip, **half of the one-second intervals have no numeric speed in S2** because S1 deliberately leaves speed empty during stops, holds, releases, and uncertain transitions—not mainly because GPS positions are missing. P1 speed QC treats **any null speed as `NO_NUMERIC` before** it can apply the `STATIONARY_BAND` / `TRUSTED_LIMITED` path, so **all 144 stationary intervals count as untrusted for numeric coverage** even when fresh GPS is present. That contract mismatch alone explains **127 of 763** `NO_NUMERIC` rows; the largest block (**628**) is hold/release/transition geometry where S1 abstains (`TRANSITION_UNCERTAIN` + `ABSTAINED`). Only **8** `NO_NUMERIC` rows sit on true `ROW_ABSENT`/`SIGNAL_NULL` tri-state gaps in the t−1/t/t+1 window.

**26** intervals are **`CROSS_SOURCE_CONFLICT`** in P1/P2: S2 already marked R1 vs GPS disagreement while L3 speed is numeric. **12** additional intervals carry conflict metadata but **null L3 speed**, so QC reports `NO_NUMERIC` instead. R1 is sparse on this trip (**124** second-buckets vs **1 480** position buckets) and often reads **0–10 km/h** while GPS L3 shows **~26–52 km/h** during acceleration—consistent with **INTERVAL_ONLY** R1 semantics, not point-wise sync.

Historical tachograph video calibration (**123** points, MAE **3.13 km/h**, P95 **8.41 km/h**, max **15.0 km/h**, bias **−2.10 km/h**) remains valid **holdout evidence for an earlier L3 vs tacho path**; it is **not** automatic proof of P1/P2 policy correctness or fleet-wide behavior.

## R2 baseline reproduction (in-memory)

| Metric | R2 reported | R3 reproduced |
|--------|-------------|---------------|
| Total intervals | 1 480 | 1 480 |
| Trusted numeric | 691 | 691 |
| `NO_NUMERIC` | 763 | 763 |
| `CROSS_SOURCE_CONFLICT` | 26 | 26 |
| Trusted numeric % | 46.7% | 46.7% |
| `shadowRawMaxKmh` / `qcTrustedMaxKmh` | 77.62 | 77.62 |
| `missingEvidenceCount` | 0 | 0 |
| Assessability | PARTIAL (`TRUSTED_COVERAGE_PARTIAL`) | unchanged |

All intervals are **1.0 s** wide (`interval_end − interval_start` min=max=1). Grid matches acquisition length (no padding beyond window).

## Why 763 × `NO_NUMERIC` — disjoint primary taxonomy

Priority-ordered classification (each interval counted **once**; sums to **763**):

| Primary group | Count | Share of trip (s) | Segments | Longest run (s) | Mechanism |
|---------------|------:|------------------:|---------:|----------------:|-----------|
| **Transition / release / unresolved hold** | **628** | 42.4% | 29 | **293** | Neighbor `FROZEN_*` / `RELEASE` in L3 window and/or `TRANSITION_UNCERTAIN` + `speedEvidenceState=ABSTAINED`; S1 emits **null** `estimatedSpeedKmh` |
| **Stationary with fresh positions** | **127** | 8.6% | 23 | 22 | `STATIONARY_SUPPORTED` + `STATIONARY_BAND` + present GPS; S1 **null** speed by design |
| **True ROW_ABSENT / SIGNAL_NULL in t−1,t,t+1** | **8** | 0.5% | 3 | 4 | Real tri-state gaps; QC still hits **`NO_NUMERIC` first** (not `MISSING_POSITION_EVIDENCE`) when S1 speed is null |

**Overlapping S2 semantics (not double-counted above):**

| `motionState` (null-speed rows) | Count |
|---------------------------------|------:|
| `TRANSITION_UNCERTAIN` | 580 |
| `STATIONARY_SUPPORTED` | 144 |
| `MOVING_SPEED_UNKNOWN` | 33 |
| `NO_MOTION_EVIDENCE` | 6 |

| `speedEvidenceState` (null-speed rows) | Count |
|--------------------------------------|------:|
| `ABSTAINED` | 580 |
| `STATIONARY_BAND` | 144 |
| `MOVEMENT_ONLY` | 33 |
| `NONE` | 6 |

**Stationary QC contract mismatch:** **144** intervals have stationary band semantics in S2; **127** fall in the “fresh positions” disjoint bucket; **17** are classified as transition/hold because **hold/release geometry in adjacent seconds** takes priority in the forensic taxonomy.

## Coverage metrics (numerators / denominators)

| Quantity | Count | Denominator | Rate |
|----------|------:|-------------|-----:|
| Position buckets in pinned snapshot | 1 480 | 1 480 | 100% grid |
| S2 intervals | 1 480 | 1 480 | — |
| S1 numeric `estimatedSpeedKmh` | 717 | 1 480 | **48.4%** |
| P1 `TRUSTED` numeric | 691 | 1 480 | **46.7%** (`trustedNumericCoveragePercent`) |
| P1 `TRUSTED_LIMITED` (stationary path) | 0 | 1 480 | 0% |
| P1 `NO_NUMERIC` | 763 | 1 480 | 51.6% |
| R1 OBD buckets in snapshot | 124 | 1 480 | 8.4% (sparse; not co-extensive with trip) |
| `missingEvidenceCount` (P2) | 0 | — | Only increments on QC `MISSING_POSITION_EVIDENCE`, not all GPS gaps |

Assessability **PARTIAL** is expected: provisional **70%** gate applies to **trusted numeric** share only; **TRUSTED_LIMITED** does not inflate coverage.

## Why 26 × `CROSS_SOURCE_CONFLICT`

| Layer | Count | Notes |
|-------|------:|-------|
| S2 `sourceRelation` CONFLICTING / CONFLICT_EXPLAINED | **38** | Metadata on shadow row |
| With **numeric** L3 speed | **26** | P1 returns **`CROSS_SOURCE_CONFLICT`** (early branch) |
| With **null** L3 speed | **12** | P1 returns **`NO_NUMERIC`** first; conflict flag not surfaced in reason breakdown |

All **26** numeric conflicts are `MOVING_SPEED_ESTIMATED`. Representative pattern (UTC):

- Clusters around **05:42:33**, **05:44:41–05:45:07**, **05:56:45–05:57:01**
- GPS L3 **~10–52 km/h** vs R1 **0–23 km/h** (often **0** while GPS shows motion)
- `CONFLICT_EXPLAINED` dominates; a few `CONFLICTING` (e.g. 05:56:47, 05:56:53)

GPS L3 remains the **numeric** speed on the shadow row; QC does **not** replace it with R1. Conflicts are **not** re-timed or calibrated on this trip.

## S1 → P1 → P2 contract (code anchors)

1. **S1** (`compute-trip-intervals.ts`): `estimatedSpeedKmh` only for `MOVING_SPEED_ESTIMATED` with eligible L3; `STATIONARY_SUPPORTED` → `estimatedSpeedKmh=null`, `speedEvidenceState=STATIONARY_BAND`.
2. **P1** (`evaluate-di-v0-speed-qc-interval.ts`): **lines 196–198** — null/non-finite speed → `NO_NUMERIC` **before** `STATIONARY_BAND` handling (~210–229).
3. **P2** (`build-di-v0-trip-speed-quality-projection.v1.ts`): `missingEvidenceCount` only when verdict includes `MISSING_POSITION_EVIDENCE`; `CROSS_SOURCE_CONFLICT` counted when present in verdict reason list.

Blob SHAs for the three files were **unchanged** between R2 production SHA and `origin/main` at `a4c3b1fc1de0480d7caab5897242b67bb3f7044e` (pre-task GitHub comparison).

## POST_GAP_REACQUIRE diagnostic

On this trip, **0** numeric intervals returned `POST_GAP_REACQUIRE` when evaluated through full P1 logic. Post-gap rejection requires lookback `ROW_ABSENT` **and** implausible legs / gap flags; spikes are typically rejected earlier as **`GEOMETRY_JUMP`** / **`SUPPORT_WINDOW_COMPROMISED`**. **Not** claimed as driver of the 763 `NO_NUMERIC` rows.

## Composed regression (repository)

New suite `di-v0-speed-qc-s1-p1-composed.spec.ts` pipes **real S1 output** into P1 (stop null → `NO_NUMERIC`, motion → `TRUSTED`, shadow `CONFLICTING` → `CROSS_SOURCE_CONFLICT`, `ROW_ABSENT` + null → `NO_NUMERIC` not `MISSING_POSITION_EVIDENCE`). Existing hardening tests cover POST_GAP synthetic spike.

Ops helper: `backend/scripts/ops/exp021-p21-r3-forensic.ts` (read-only aggregate replay; not wired to AppModule).

## Smallest fachlich saubere correction (proposal only — not implemented)

1. **Reorder or branch P1** so `STATIONARY_SUPPORTED` + `STATIONARY_BAND` + valid center position can reach **`TRUSTED_LIMITED`** without requiring a numeric `estimatedSpeedKmh` (or introduce a distinct non-numeric trusted reason—**not** `null→0` km/h).
2. **Split reporting**: stationary / hold diagnostics vs **numeric trusted coverage**; rename or extend `missingEvidenceCount` to reflect true position gaps vs QC reason codes.
3. **Preserve** GPS L3 as numeric authority; keep R1 **INTERVAL_ONLY**; do not auto-promote conflict rows.

**Replay / idempotency:** Any P1 ordering change alters P2 aggregates and assessability; S2 rows unchanged; re-preview only.

## R3A closure (2026-10-14)

See [EXP021_P21_R3A_FORENSIC_CLOSURE.md](./EXP021_P21_R3A_FORENSIC_CLOSURE.md) for V2 diagnosis, 628 hold breakdown, 293 s segment analysis, read-only loader parity, and POST_GAP control-flow verdict.  
See [EXP021_P21_R3B_DIAGNOSTIC_CORRECTNESS_FINAL.md](./EXP021_P21_R3B_DIAGNOSTIC_CORRECTNESS_FINAL.md) for acquisition-window correction, snapshot/work-item binding, transaction isolation reporting, and reference-group sum hygiene.

## Remaining uncertainty

- Forensic taxonomy priority for hold vs stationary is **diagnostic**, not an S2 enum.
- R1 sparsity and bucket alignment were not re-queried from DIMO; taken from pinned snapshot only.
- Segment-level speed error vs historical tacho **not** recomputed on this trip.
