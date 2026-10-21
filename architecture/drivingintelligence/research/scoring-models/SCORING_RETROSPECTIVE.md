# Driving Impact / Score — Complete Retrospective

Separates **current production V1** from **proposed Episode V2** scoring.

---

## Historical confusion discovered (DI-EV-0002)

| Name | Actual semantics | Risk |
|------|------------------|------|
| `drivingStressScore` | Vehicle operational load 0–100 | UI may imply "stress" = driver fault |
| `DriverScoreService` | Distance-weighted aggregate of `drivingStressScore` | **Implies driver quality — MISNAMED** |
| `RentalDrivingAnalysis.drivingScore` | Booking-period aggregate of stress | Rental/insurance misinterpretation |

**Code change:** Semantic documentation only; rename deferred (`DI-DEF-001` OPEN).

---

## DRIVER QUALITY semantics

| Claim | Status |
|-------|--------|
| SynqDrive infers driver skill ranking from DI | **NOT SUPPORTED** |
| `DriverScoreService` measures driver quality | **REJECTED** — aggregates vehicle load |
| Attribution / booking driver linkage | Separate V2 `ATTRIBUTION` stage (flag-gated) |

---

## VEHICLE OPERATIONAL LOAD (production V1)

**Model version:** `v1.2.0`  
**Service:** `DrivingImpactService.computeForTrip()`  
**Scorer:** `driving-impact-scorer.ts`

### Stress dimensions (weighted → composite)

| Dimension | Source | Notes |
|-----------|--------|-------|
| Longitudinal stress | HF accel/braking events | Per-100km rates |
| Braking stress | Braking events + severity | |
| Stop-go stress | Stop/start patterns | |
| High-speed stress | Speed exposure | |
| Thermal brake stress | Thermal proxy | |
| Composite | `computeDrivingStressScore` | `capLinear` normalization → 0–100 |

Weights: `driving-impact.config.ts`  
Rounded to 1 decimal.

### Load components (`driving-impact-load-components.ts`)

| Component | Formula (summary) | Interpretation |
|-----------|-------------------|----------------|
| `brakingLoad` | From `brakingStressScore` + provenance | Operational proxy; may downgrade to LIMITED |
| `tireLoad` | `0.35×braking + 0.35×stopGo + 0.30×longitudinal` when assessable | **NOT measured tread wear** |
| `thermalLoad` | From `thermalBrakeStressScore` | Thermal stress proxy |

**Invariant:** `DI-INV-LOAD-NOT-WEAR-001`

---

## EVENT FREQUENCY / SEVERITY / CONFIDENCE

| Concept | Production | V2 (flag-gated) |
|---------|------------|-----------------|
| Event frequency | Per-100km in impact scorer | Stage inputs |
| Event severity | Detector tier + abuse intensity | Event-context |
| Confidence / assessability | Limited in V1 | `TripAssessability` dimensions |

---

## Proposed V2 Episode scoring (DI-EV-0034F)

| Aspect | Status |
|--------|--------|
| Episode taxonomy | DESIGNED |
| Reconstruction confidence layers | DESIGNED |
| Kinetic energy semantics (F.2) | DESIGNED |
| Production deployment | **NOT IMPLEMENTED** |
| Correlation with V1 on same trips | **NOT TESTED** (`DI-OQ-SCORE-001`) |

Detail: `EPISODE_V2_DESIGN.md`

---

## Health module publication

`DRIVING_HEALTH_IMPACT_PUBLISH` → `BrakeHealthService.recalculate`, `TireHealthService.recalculate`

Uses load proxies with `healthEligibility` gating — not wear measurement.

---

## Links

- `evidence/tire-brake-load/LOAD_FORMULAS.md`
- `evidence/production/API_UI_SEMANTICS.md`
- `decisions/DECISION_REGISTER.md` — DI-DEC-STRESS-NOT-DRIVER-001, DI-DEC-LOAD-PROXY-001
- `research/HYPOTHESIS_REGISTER.md` — DI-HYP-011
