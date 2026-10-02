# M3.3G G3 — F5 ↔ Ground Truth correlation + longitudinal segmentation

**Date:** 2026-09-29  
**Base:** `origin/main` @ PR **#1840** merged (G2.2 active replacement per source event)  
**Scope:** Read/report layer only — **no** schema migration, **no** production writes

## Purpose

Connect append-only `BatteryGroundTruthEvent` authority to the bounded read-only F5 natural calibration report so operators can:

- discover admissible **active** Ground Truth under tenant + scope rules,
- correlate GT with organization + vehicle + **LV** longitudinal domain,
- distinguish **WORKSHOP_MEASUREMENT** vs **BATTERY_REPLACEMENT** GT,
- derive deterministic **longitudinal segment epochs** from confirmed replacement boundaries,
- classify revision evidence intervals vs replacement `effectiveAt` as **PRE_EVENT / INTERVENTION_WINDOW / POST_EVENT** without numeric envelopes,
- preserve F5.1 read-only safety (RepeatableRead + `SET TRANSACTION READ ONLY`).

## Report contract decision

```
F5_G3_REPORT_CONTRACT_DECISION=VERSION_BUMP_REQUIRED
F5_REPORT_CONTRACT_VERSION=M3_3F_F5_NATURAL_CALIBRATION_REPORT_V2
```

**Justification:** V1 froze `groundTruth.linkageAvailable=false` and `replacementLabelsAvailable=false` as literal contract semantics. G3 introduces dynamic booleans plus correlation/segmentation metadata, NAT maturity distinction, and CAL-007 non-causal ack — externally observable scientific semantics change. V1 type preserved as `M3_3F_F5_NaturalCalibrationReportV1` for historical reference.

## Longitudinal scope authority

```
F5_LONGITUDINAL_SCOPE_AUTHORITY=LV_REST_SESSION_LONGITUDINAL_PIPELINE_V1
CROSS_SCOPE_SEGMENTATION_POSSIBLE=NO
```

D3/F5 primary cohort uses rest-session longitudinal profiles (LV rest evidence domain). HV GT rows are rejected (`rejectedCrossScopeCount`).

## Active GT eligibility (F5 asOf — G3.1 historical authority)

F5 **`asOf`** reports use **`isGroundTruthActiveAtAsOf`** (revocation/supersession reconstructed from timestamps + `supersedesGroundTruthEventId`). Present-tense **`isActiveGroundTruthEvent`** remains for G1/G2 operational admission.

- bounded lifecycle load: `createdAt <= asOf` (includes successors not yet effective)
- admissible GT facts additionally require `effectiveAt <= asOf` via `isGroundTruthActiveAtAsOf`
- no `revokedAt <= asOf`
- no successor with `createdAt <= asOf` for the same prior id
- `batteryScope=LV` for F5 correlation (HV → `rejectedCrossScopeCount`)

**G3.1.1:** Successor with `createdAt <= asOf` but `effectiveAt > asOf` participates in supersession reconstruction but is not an admissible GT fact until effective ( **G3.1-A6** ).

**G3.1 closure:** Re-running the same **`asOf`** against the same DB snapshot yields the same admissible GT set (unit **G3.1-A5**, postgres **G3.1-A1–A6**). Future revocation/supersession does **not** alter a past **`asOf`** report when lifecycle timestamps are known.

## Temporal classification (no numeric window)

Evidence interval authority: D3 revision `firstIncludedAnchorAt` + `lastIncludedAnchorAt`.

Intervention time authority: GT `effectiveAt` (not `createdAt`, not `materializedAt`).

| Region | Rule |
|--------|------|
| PRE_EVENT | `lastIncludedAnchorAt < effectiveAt` |
| POST_EVENT | `firstIncludedAnchorAt > effectiveAt` |
| INTERVENTION_WINDOW | otherwise (interval crosses/intersects `effectiveAt`) |
| UNKNOWN | missing anchor bounds |

## Segmentation (G3.1 — mechanical continuity block)

```
REPLACEMENT_CREATES_LONGITUDINAL_SEGMENT_BOUNDARY=YES
PRE_POST_REPLACEMENT_POOLING_BLOCKED=SEGMENT_ASSIGNMENT (not metadata-only)
```

Active confirmed **LV** `BATTERY_REPLACEMENT` boundaries per vehicle (`effectiveAt asc`, `id asc`) assign each primary-cohort revision to a deterministic epoch segment, **`INTERVENTION_WINDOW`**, **`unlabeled_no_replacement_boundaries`**, or **`missing_anchor_bounds`**. F5 continuity metrics (**`maxRevisionsPerSegment`**, **`repeatabilityPairCount`**) use **segment keys**, not vehicle-only pooling. Report exposes **`segmentAssignedRevisionCount`**, **`interventionCrossingRevisionCount`**, **`unlabeledRevisionCount`**, **`totalDerivedSegmentCount`**, **`maxSegmentCountPerVehicle`**, **`prePostReplacementPoolingBlockedBySegmentAssignment`**.

Bounded GT load: **`PRIMARY_COHORT_ORG_VEHICLE_PAIRS`** (`OR` org+vehicle), not org-only.

## NAT-008 / NAT-009 (G3.1 semantic separation)

Correlation block fields (not **`F5MaturityStateV1`**):

- **`infrastructureStatus`**: `IMPLEMENTED`
- **`naturalEvidenceStatus`**: `NONE` | `PRESENT` (admissible natural workshop/document GT for NAT-008; admissible confirmed replacement GT for NAT-009)
- **`naturalEvidenceCount`**: number
- **`validationSampleMaturity`**: `NOT_EVALUATED` (G4/F6 own sample maturity)

## Implementation map

| Component | Path |
|-----------|------|
| Correlation policy | `f5-ground-truth-correlation.policy.ts` |
| Bounded GT read | `f5-ground-truth-correlation.queries.ts` |
| Active row util | `ground-truth-active-authority.util.ts` |
| F5 service integration | `f5-natural-calibration-report.service.ts` |
| Unit tests | `f5-ground-truth-correlation.spec.ts` (G3-A…M); `f5-longitudinal-segmentation.spec.ts` (G3.1-S1…S6); `ground-truth-historical-authority.util.spec.ts` (G3.1-A1–A4) |
| Postgres | `f5-ground-truth-historical.postgres.integration.spec.ts` (G3.1-A1–A5) |

## G3.1 correctness seal (PR #1842)

Engineering closure for true segmentation, historical **`asOf`** authority, NAT semantic separation, bounded primary-cohort GT query, temporal pair denominators. **`NEXT_STAGE=G4`** only after G3.1 CI seal passes.

## Explicit non-actions

No production deploy/migration/GT writes; D3/E3 production state unchanged; no customer UI; no CAL thresholds; no F6.

## Next stage

**G4** — first natural validation evidence (NAT maturity beyond infrastructure); blocked until **G3.1 correctness seal** on PR **#1842** is green.
