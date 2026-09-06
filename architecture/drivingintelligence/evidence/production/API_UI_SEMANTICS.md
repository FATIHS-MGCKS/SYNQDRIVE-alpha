# API / UI Semantic Audit

Findings from Phase 1 audit + RD003 scoring review. Backend formulas unchanged unless noted.

---

## Backend field semantics

| Field / service | Backend meaning | Common misread |
|-----------------|-----------------|----------------|
| `drivingStressScore` | Vehicle operational load 0–100 | Driver skill / fault |
| `DriverScoreService` | Distance-weighted vehicle stress | Driver quality ranking |
| `tireLoad` / `brakingLoad` | Operational proxies | Measured wear |
| `TripAssessability` | Data dimension quality | Event confidence (related but distinct) |
| `TripBehaviorEvent` | HF-reconstructed behavior | Native provider classification |
| `DrivingEvent` | Native DIMO behavior | HF-derived |

---

## UI surfaces reviewed (code references)

| Surface | Risk |
|---------|------|
| `RentalStressAnalysisCard` | "Stress" without vehicle-load disclaimer |
| `VehicleStressPanel` | Stress terminology |
| `CustomerDrivingTab` | Driving context may imply driver judgment |
| `BookingUsageMisuseTab` | Misuse vs assessability visibility |

**Finding:** No comprehensive UI copy audit with GT — semantic risks documented, not all UI strings corrected.

---

## Event labels / badges

- Native vs HF provenance not always visible in all UI surfaces
- Confidence / insufficient-data states: partial V2 assessability exposure

---

## Mismatches → registers

| Mismatch | Register |
|----------|----------|
| DriverScore naming | `DI-CONTRA-DRIVER-SCORE-NAME-001`, `DI-GAP-DRIVER-SCORE-NAMING-001` |
| Wear vs load wording | `DI-INV-LOAD-NOT-WEAR-001`; UI copy discipline required |
| HF 1 Hz assumption | `DI-CONTRA-HF-1HZ-001` |

---

## unavailable / insufficient data

V2 `TripAssessability` provides structured dimension status. Legacy path uses skip reasons (`CAPABILITY`, `INSUFFICIENT_POINTS`, `NO_HF_DATA`) — not always mirrored in UI.

---

## Links

- `research/scoring-models/SCORING_RETROSPECTIVE.md`
- `research/OPEN_QUESTIONS.md`
- `contradictions/CONTRADICTION_REGISTER.md`
