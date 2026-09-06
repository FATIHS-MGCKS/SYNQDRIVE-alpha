# Tire / Brake / Longitudinal Load — Formula Record

**Canonical invariant:** OPERATIONAL LOAD PROXY ≠ MEASURED WEAR (`DI-INV-LOAD-NOT-WEAR-001`)

**Implementation:** `driving-impact-load-components.ts`, `driving-impact-scorer.ts`

---

## brakingLoad

| Field | Value |
|-------|-------|
| Purpose | Brake system operational stress input for health module |
| Derivation | From `brakingStressScore` + event provenance |
| Assumptions | HF braking events approximate deceleration stress |
| sourceQuality | May downgrade to `LIMITED` when proxy kinematics dominate |
| Physical interpretation | Thermal/mechanical stress **proxy** — not pad thickness |
| Adequacy | Heuristic/provisional; not scientifically validated against pad sensors |

---

## thermalLoad / thermalBrakeStressScore

| Field | Value |
|-------|-------|
| Purpose | Thermal braking stress dimension in composite score |
| Derivation | From braking patterns + thermal model in scorer |
| Limitations | No direct brake temperature sensor in standard LTE_R1 set |

---

## tireLoad

| Field | Value |
|-------|-------|
| Formula (assessable) | `0.35×braking + 0.35×stopGo + 0.30×longitudinal` |
| Purpose | Tire operational load proxy for `TireHealthService` |
| Assumptions | Cornering not fully modeled; longitudinal dominant |
| Limitations | **NOT tread depth**; no tire pressure/temp in standard formula |
| Adequacy | Heuristic composite; fleet calibration UNKNOWN |

---

## stopGoLoad / longitudinalLoad

Components of composite stress and tire load weighting. Derived from per-100km event rates normalized in impact scorer.

---

## Composite drivingStressScore

Weighted sum of stress dimensions → `capLinear` → 0–100. See `SCORING_RETROSPECTIVE.md`.

---

## Health publication path

```
TripDrivingImpact.loadComponentsJson
  → DRIVING_HEALTH_IMPACT_PUBLISH (V2 stage)
  → BrakeHealthService.recalculate / TireHealthService.recalculate
```

Gated by `healthEligibility` and assessability.

---

## Workstream findings

| Finding | Source |
|---------|--------|
| Naming "load" risks wear interpretation | Phase 1 audit + UI review |
| brakingLoad downgrade paths exist | Code CONFIRMED |
| No ground-truth wear validation performed | No pad/tread sensors in RD003 |

---

## Links

- `research/scoring-models/SCORING_RETROSPECTIVE.md`
- `evidence/production/API_UI_SEMANTICS.md`
- `research/LESSONS_LEARNED.md`
