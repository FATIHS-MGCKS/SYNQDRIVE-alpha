# Phase 3E.9 Owner Report — OCR Quality & Freeze Validation

## Freeze (234 point heuristic from 3E.8)
- Segments with repeated coordinates: **246**
- Classified segment point-mass: {"REAL_OVERLAY_GPS_FREEZE":14,"OCR_STALE_COORD_REPEAT":410,"OCR_SPEED_ONLY_ARTIFACT":9,"LEGIT_LOW_SPEED_STATIC":77,"AMBIGUOUS_MIXED":97}
- Likely real overlay freeze points: **7**
- OCR stale/speed artifacts: **215**

## Stop candidates (speed <2 km/h, valid coords required for OBSERVED)
- OBSERVED: **5** · CONTEXT_SUPPORTED: **0** · INFERRED: **25** · UNKNOWN: **32**

## Frame resample audit (no FRAME_VERIFIED promotion)
- Target samples: **49** · inspected: **49**
- Coord mismatch rate (>25m re-OCR vs checkpoint): **2.0%**

## P95 distance (3E.8 Set A)
- Before gate: P95 **64.33 m** (n=698)
- After quality gate: P95 **33.35 m** (n=334)
- Top outliers documented in `LDI10D_PHASE3E9_OUTLIER_REGISTER.json` (131 rows ≥ P95)

## Pair independence (698 Set A)
- DIMO distance filter used in Set A: **NO** (confirmed)
- Duplicate OCR→DIMO bucket assignments: **22**
- Missing DIMO join (in corridor): **96**

## Algorithm development recommendation
Use quality-gated fully-readable rows without 3E8 freeze-point flag for exploratory speed/spatial work; do not use for road-ID ground truth.

**STOP: WAIT_OWNER_REVIEW** — no merge, deploy, QC, L3, or Viterbi changes.