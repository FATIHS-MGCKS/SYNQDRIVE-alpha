# Episode V2 — Proposed Architecture (NOT PRODUCTION)

**DI-EV:** 0034F  
**Status:** DESIGN ONLY — `DEPLOYED: NO`  
**Authority:** `docs/audits/driving-intelligence-v2-canonical-design-2026-09.md`

---

## Why point-pair logic became questionable

| Evidence | Finding |
|----------|---------|
| RD002/003 | `interval:"1s"` → ~2s median observed buckets |
| RD003 signal quality | Derived jerk WEAK; accel USEFUL_WITH_GATING |
| RD004-B | Late buckets + watermark gaps lose events permanently |
| Production code | `HF_WINDOW_EXPECTED_INTERVAL_MS = 1000` contradicts runtime |

Point-pair detectors count adjacent samples; sparse cadence → missed episodes, fragmented events, timing uncertainty.

---

## Episode concept

| Element | Design |
|---------|--------|
| Episode start | Threshold crossing + minimum evidence |
| Continuation | Hysteresis band; gap tolerance (provisional 2.0s max-gap from RD003) |
| Episode end | Below exit threshold sustained |
| Taxonomy | Maps to driving behavior categories with provenance |

---

## Confidence layers (F.1 orthogonal states)

| Layer | Meaning |
|-------|---------|
| Reconstruction confidence | How well HF supports episode shape |
| Attribution confidence | Whether event can be tied to driver/conditions |
| Assessability | Per-dimension data quality (links to V2 stage) |

**Never conflate** with `drivingStressScore` (vehicle load).

---

## Interpolation / reconstruction policy

- Gap threshold assumptions derived from RD003 (provisional, not production authority)
- Interpolation only inside declared gap policy
- Provider timestamp authority (`DI-DEC-PROVIDER-TS-001`)

---

## Validation contract (designed, not executed)

Requirements before cutover:

1. RD004-class alignment evidence on target vehicles
2. Holdout evaluation separate from alignment-fit MAE
3. Episode detector comparison vs V1 impact on same trips
4. Assessability reporting for sparse HF dimensions

`READY_FOR_RD004=YES` was met; RD004 completed; **production cutover NOT authorized**.

---

## Reasons NOT deployed

| Reason | Detail |
|--------|--------|
| Scope | Large implementation vs surgical threshold tweak |
| Risk | No GT-validated episode detector set at fleet scale |
| Parallel path | V1 impact + legacy detectors still production authority |
| Flag discipline | `DRIVING_INTELLIGENCE_V2_ENABLED=false` default |

---

## Relationship to July UX doc

`docs/architecture/driving-intelligence-v2.md` (13-layer UX/API contract) and Sep 0034F (reconstruction) are **layered, not contradictory** (`DI-CONTRA-V2-DOCS-001`).

---

## Links

- `evidence/driving-events/DETECTOR_AUDIT.md`
- `decisions/DECISION_REGISTER.md` — DI-DEC-EPISODE-V2-001
- `research/HYPOTHESIS_REGISTER.md` — DI-HYP-012
- `research/OPEN_QUESTIONS.md` — DI-OQ-SCORE-001
