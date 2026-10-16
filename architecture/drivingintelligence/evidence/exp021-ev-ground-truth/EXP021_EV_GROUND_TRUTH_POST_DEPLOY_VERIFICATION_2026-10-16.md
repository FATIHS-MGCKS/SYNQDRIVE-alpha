# EXP021 EV Ground Truth — post-deploy verification (read-only)

**Observed at (UTC):** `2026-10-16T16:14:16.947Z` (baseline manifest) / `2026-10-16T16:15:35.100Z` (global CURRENT V2 inventory)  
**Production SHA (verified):** `c1013265bc10af7ac5fe7e86ff372772373acd36`  
**Release dir:** `/opt/synqdrive/releases/20261016154114_v4994`  
**Joint deploy:** PR #2052 merge + owner-authorized deploy (same SHA).

## Reference identities (unchanged vs pre-deploy)

| Field | Value |
|-------|--------|
| Trip | `358d0158-b2a9-47ed-af26-33926c5770b4` |
| Vehicle | `68868291-5478-42cd-b0c4-cc77b2a78e21` |
| Org | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| PRIMARY WI | `99fe9d1b-5cb6-4cbb-ba0c-e5f27a5cd50a` |
| CURRENT V2 | `567c3dc2-d514-447a-97d5-bc294c8c6c12` |
| Pinned snapshot | `DI_V0_S4_EVIDENCE_V1:sha256:c703e9c41e5e65ab643f9416c469818d88a0fbfa93218885d7c5beb6fa284503` |
| Boundary FP (pinned = live) | `DI_V0_S4_BOUNDARY_FP_V1:sha256:59fcdaad8dc96c213cec40cb56fed11ced0cd0c76887a3532259f169658f4020` |
| Content fingerprint V2 | `9219741e48bc78cfadf4385ca1ad77dd82bcf5bbc0f986dd3d664bd2f1fff61f` |

Trip boundaries: `2026-10-16T03:36:00.000Z` → `2026-10-16T03:54:55.989Z`. FSM `RESTING`, no active trip, `0` PROPOSED repairs.

## Admission and product read (deployed code)

- `raw_detection_meta.diV0BoundaryAdmissionV1`: **still absent** (`ADMISSION_RECORD_MISSING`).
- `evaluateTripDiProductReadBoundaryGate`: **fail** `ADMISSION_NOT_SATISFIED` (same as pre-deploy).
- On **`c1013265`**, `readCurrentOpsProjection` **also** calls `evaluateTripDiProductReadBoundaryGate` and returns **`null`** without admission (same gate as product read). **DB CURRENT ≠ ops/product-visible.** See [scoped recovery runbook](./EXP021_EV_GROUND_TRUTH_SCOPED_ADMISSION_RECOVERY_RUNBOOK_2026-10-16.md) §8.
- Authenticated HTTP product GET: **NOT_VERIFIED** (no clerk session in this run).

## Reconciliation scheduler trace (post-deploy)

| Item | Observation |
|------|-------------|
| Config | Fast 15m / 45m window; Warm 4h / 12h; Cold daily 03:00 UTC / 7d (`TripReconciliationScheduler`) |
| Leader | Replica **A** (`PORT=3001`, pid `1420133`); Redis lease holder; log `Scheduler leadership acquired` at `2026-10-16T15:55:47Z` after deploy restart ~`15:55:16Z` |
| Last executed fast tier | **Inferred** first `@Interval(15m)` tick ~`16:10–16:11Z` on leader (no `TripReconciliationScheduler` log line — silent when zero repairs); **not** counted as nominal cron schedule alone |
| Reference in fast window | **no** — `start_time` `03:36Z` &lt; fast `from` ~`15:25Z` at observation |
| Reference in warm window | **no** — `start_time` &lt; warm `from` `04:09Z` at `16:09Z` observation |
| Step-4 scan (`repairIntraTripGapSplits`) | Trip **not selected** (outside `[from, to)` on any tier executed since deploy) |
| `releaseForBoundaryScannedTripIds` | **Not invoked** for this trip (empty `boundaryScannedTripIds` for windows that ran) |
| Release blockers | **N/A** — release never attempted; preconditions would pass if scanned |
| Next natural periodic path | **Cold** `trip_reconciliation_cold` at **`2026-10-17T03:00:00Z`** (7d window includes trip). Warm at ~`19:55Z` still excludes trip (`warm_from` &gt; `03:36Z`). |

**Classification:** `NOT_IN_SCAN_WINDOW` (not “scan failed”, not “release blocked”, not “awaiting first scheduler tick” after bounded post-deploy observation).

## CURRENT V2 global inventory (Production snapshot)

See [post-deploy/CURRENT_V2_READABILITY_INVENTORY_2026-10-16.json](./post-deploy/CURRENT_V2_READABILITY_INVENTORY_2026-10-16.json):

- **13** CURRENT V2 rows; **13** missing admission; **0** product-read gate pass; **0** revision mismatch; **0** WI/live boundary FP mismatch.

## Pre vs post deploy metrics (reference trip)

Unchanged (same projection row and boundaries):

| Metric | Pre-deploy | Post-deploy |
|--------|------------|-------------|
| qcTrustedMaxKmh | 129.7885665128692 | 129.7885665128692 |
| qcTrustedMeanKmh | 66.09 | 66.09 |
| trustedNumericCoveragePercent | 68.2 | 68.2 |
| assessabilityLevel | PARTIAL | PARTIAL |

## Artifacts

| Artifact | Repo path | Production copy (full replay) |
|----------|-----------|-------------------------------|
| POST_DEPLOY manifest | [post-deploy/POST_DEPLOY_BASELINE_MANIFEST.json](./post-deploy/POST_DEPLOY_BASELINE_MANIFEST.json) sha256 `11a991414ef57790815261094711adbf5ddc15e4d56fac9922baeae901b500e1` | — |
| Per-second replay | — (not in git; size ~532 KiB) | `/opt/synqdrive/shared/reference-evidence/exp021-ev-gt/post-deploy-20261016T1615Z/POST_DEPLOY_PER_SECOND_REPLAY.json` sha256 `68bff4d695ee1a922be1c980a1a9d441dcc1145e1dee57e8c17fe73ed0864157` |
| PROVENANCE / SHA256SUMS | [post-deploy/](./post-deploy/) | same VPS directory |

`pre-deploy/` tree **unchanged**.

## Scoped follow-up (prepared, **not executed**)

**Goal:** Admit reference trip only after step-4 boundary scan.

**Call (leader process only):**

`TripReconciliationService.reconcileWindow(vehicleId='68868291-5478-42cd-b0c4-cc77b2a78e21', from='2026-10-16T03:30:00.000Z', to='2026-10-16T04:00:00.000Z', tier='cold', { useDimoSegmentFallback: true })`

**Prerequisites:** Scheduler leader replica; deployed SHA includes #2047 admission writer; trip remains COMPLETED + RESTING + no PROPOSED repairs.

**Expected effects:** Step 4 adds trip to `boundaryScannedTripIds`; `tryReleaseForTripTransactional` jsonb_sets `diV0BoundaryAdmissionV1` with revision = live boundary FP; no manual admission write.

**Provider risk:** Step 2 missing-trip path may call DIMO when `useDimoSegmentFallback: true` and token present — for this window/trip, expect **no** missing-trip repair (trip already exists). Owner may set `useDimoSegmentFallback: false` for minimal provider surface.

**Out of scope:** blanket cold backlog, outbox reset, reprojection, operator HTTP without auth.

## CI note (Trip FSM run 38919698025)

Push to `main` after merge: job **Backend trip finalize PostgreSQL integration** failed at **Initialize containers** — `docker pull postgres:16-alpine` → `toomanyrequests: Data limit exceeded`. **Infrastructure / registry quota**, not application runtime. Do **not** treat as successful Trip FSM test evidence.

## Production mutations / provider calls

`NONE` / `0` for this verification pass.
