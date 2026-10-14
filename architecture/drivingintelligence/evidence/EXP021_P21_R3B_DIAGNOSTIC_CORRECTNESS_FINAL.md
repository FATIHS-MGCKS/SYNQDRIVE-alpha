# EXP021 P2.1 R3B — Diagnostic correctness final

**Status:** COMPLETE (read-only diagnosis tooling; no product behavior change)  
**PR:** #2020  
**Supersedes diagnosis only:** [EXP021_P21_R3A_FORENSIC_CLOSURE.md](./EXP021_P21_R3A_FORENSIC_CLOSURE.md) (R3A counts preserved historically below)  
**Trip / WI:** same as [EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md](./EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md)

## Plain language (what changed vs what did not)

**Corrected (diagnosis only):**

- **Acquisition grid:** Forensic bucket math now follows S3A **`[start, end)`** (`validateDiV0PositionWindow` / `buildExpectedBucketLabels`). R3A used an **inclusive end**, which invented a **1481st** expected label on a **1480 s** trip and counted that exclusive-end second as a false “missing inside window” bucket.
- **Snapshot binding:** S4D verify now checks the DB snapshot row against **work-item scope** (`wi.organization_id`, `wi.vehicle_id`, `wi.trip_id`, `wi.boundary_fingerprint`, pinned hash, source family), not self-referential snapshot columns.
- **Loader transaction:** Forensic load uses **`REPEATABLE READ`** + **`transaction_read_only = on`**; report exposes `transaction_read_only` and `transaction_isolation` separately from “snapshot consistency” wording.
- **Report tables:** V2 disjoint totals vs hold-detail breakdown are labeled **A / B / C** with enforced sum checks (R3A “755 intervals” hold table was a **mis-denominator** — hold detail was summed over **763** NO_NUMERIC rows).

**Unchanged (substantive trip findings):**

- P1/P2 replay on pinned shadow intervals: **1480** intervals, **691** trusted numeric, **763** `NO_NUMERIC`, **26** `CROSS_SOURCE_CONFLICT`.
- Dominant story: **~501 s** center **`FROZEN_UNRESOLVED`**, **293 s** opening frozen block, **144** stationary band as `NO_NUMERIC`, **26** numeric cross-source conflicts vs **38** shadow conflict markers.
- No production writes, flags, calibration, or provider calls.

## R3A → R3B diagnosis delta

| Measure | R3A (inclusive end bug) | R3B (`[start, end)`) | Explanation |
|---------|------------------------:|---------------------:|-------------|
| Expected 1 Hz position labels | 1481 | **1480** | Aligns with S2 interval count |
| Missing label “inside window” | 1 | **0** | R3A missing label was the **exclusive end instant** mis-counted as in-window |
| `ROW_ABSENT` / `SIGNAL_NULL` bucket counts | 4 / 0 | **unchanged** | Bucket classification logic unchanged |
| V2 `POS_GAP_*` interval counts | 8 | **unchanged** | Interval taxonomy unchanged |
| Hold / frozen / stationary interval story | 628 / 501 / 144 / 26 | **unchanged** | Shadow replay unchanged |

Production replay with `synqdrive_exp021_p21_ro` was **not re-run in this agent session** (VPS: `DATABASE_URL` for RO role not available to the agent; APDS replay URL lacks `di_v0_s4_work_items`). Re-run locally:

```bash
# read-only role URL required
EXP021_P21_ORG_ID=... EXP021_P21_TRIP_ID=... EXP021_P21_WORK_ITEM_ID=... \
  npx ts-node --transpile-only backend/scripts/ops/exp021-p21-r3-forensic.ts \
  > /opt/cursor/artifacts/exp021-p21-r3b-forensic.json
```

## Reference groups (763 NO_NUMERIC)

| View | Denominator | Meaning |
|------|------------:|---------|
| **A** `noNumericDisjointV2` | 763 | Disjoint primary V2 codes (`POS_GAP_*` vs `HOLD_TRANSITION_*`) |
| **B** `holdTransitionDetailBreakdown` | 763 | State detail on **every** NO_NUMERIC row (not disjoint with A) |
| **C** `holdTransitionDetailBreakdownExcludingPosGapIntervals` | 755 | Hold detail only where V2 is **not** `POS_GAP_*` (8 pos-gap rows excluded) |

**500 vs 501 `FROZEN_UNRESOLVED`:** **501** appears in view **B** (all NO_NUMERIC). View **C** can differ by **1** when a single NO_NUMERIC row is classified as `POS_GAP_*` at the V2 layer but still carries `FROZEN_UNRESOLVED` at center in the parallel hold slice — use the view label when citing counts.

## Engineering

- `di-v0-p21-r3-forensic-classify.ts` — canonical `[start, end)` via `di-v0-position-window.ts`
- `di-v0-p21-r3-forensic-loader.ts` — WI-bound S4D scope; `RepeatableRead` + RO session metadata
- `di-v0-p21-r3-forensic-analyze.ts` — R3B schema, reference groups, sum verification
- Tests: classify (window + gaps), analyze (sums), snapshot-bind (negative scope), composed S1→P1

## Scoped P1 stationary correction — proposal only (not implemented)

**Goal:** Allow **fachliche** stationary assessment when `motionState=STATIONARY_SUPPORTED` and `speedEvidenceState=STATIONARY_BAND` **without** a numeric L3 speed — **without** changing GPS/L3 numeric outputs or inflating trusted-numeric coverage.

| Principle | Proposal |
|-----------|------------|
| Versioning | New **`speedQcPolicyVersion`** (e.g. `DI_V0_SPEED_QC_POLICY_V2`) + shadow/projection **`qcSemanticsVersion`**; R3/R3A/R3B artifacts remain reproducible under **`V1`**. |
| Stationary branch | After existing conflict / evidence / geometry gates, add **`TRUSTED_LIMITED`** (or assessability-only flag) **only** when stationary band predicates pass and **no** disqualifying flags (conflict, invalid evidence, `FROZEN_UNRESOLVED`, cross-gap compromise). |
| No `null→0` | Do not coerce missing speed to zero. |
| No conflict auto-trust | `CROSS_SOURCE_CONFLICT` and explained conflict paths stay **non-trusted**. |
| `FROZEN_UNRESOLVED` | Remains **non-stationary** / non-trusted; not re-labeled as stop. |
| Coverage metric | `trustedNumericCoveragePercent` **definition unchanged** (numeric trusted only). |
| Smallest implementation | (1) Policy version gate in `evaluate-di-v0-speed-qc-interval` stationary section; (2) unit tests mirroring R3 **144** stationary seconds; (3) shadow re-run on pinned WI before any production flag. |
