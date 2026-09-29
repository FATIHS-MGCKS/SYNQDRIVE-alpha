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

## Active GT eligibility (reuses G1)

- `verificationStatus=CONFIRMED`
- no revocations (present-tense active authority)
- not superseded
- `batteryScope=LV` for F5 correlation
- `createdAt <= asOf` and `effectiveAt <= asOf` (knowledge + intervention time fence)
- revocations with `revokedAt <= asOf` excluded when present

**Note:** Full historical reconstruction of supersession timing at past `asOf` is **not** attempted; re-running a past `asOf` after later GT lifecycle changes may differ (documented limitation).

## Temporal classification (no numeric window)

Evidence interval authority: D3 revision `firstIncludedAnchorAt` + `lastIncludedAnchorAt`.

Intervention time authority: GT `effectiveAt` (not `createdAt`, not `materializedAt`).

| Region | Rule |
|--------|------|
| PRE_EVENT | `lastIncludedAnchorAt < effectiveAt` |
| POST_EVENT | `firstIncludedAnchorAt > effectiveAt` |
| INTERVENTION_WINDOW | otherwise (interval crosses/intersects `effectiveAt`) |
| UNKNOWN | missing anchor bounds |

## Segmentation

```
REPLACEMENT_CREATES_LONGITUDINAL_SEGMENT_BOUNDARY=YES
```

Active confirmed **LV** `BATTERY_REPLACEMENT` rows per vehicle sorted by `(effectiveAt asc, id asc)` define epoch count `replacements + 1`. Read/report interpretation only — **D3 rows are not rewritten**.

```
PRE_POST_REPLACEMENT_POOLING_BLOCKED=YES (report metadata)
```

## Implementation map

| Component | Path |
|-----------|------|
| Correlation policy | `f5-ground-truth-correlation.policy.ts` |
| Bounded GT read | `f5-ground-truth-correlation.queries.ts` |
| Active row util | `ground-truth-active-authority.util.ts` |
| F5 service integration | `f5-natural-calibration-report.service.ts` |
| Unit tests | `f5-ground-truth-correlation.spec.ts` (G3-A…M) |

## Explicit non-actions

No production deploy/migration/GT writes; D3/E3 production state unchanged; no customer UI; no CAL thresholds; no F6.

## Next stage

**G4** — first natural validation evidence (NAT maturity beyond infrastructure); natural D3/F5 collection continues.
