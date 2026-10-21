# Independent Agent Review Brief

## Project overview (1 paragraph)

SynqDrive Driving Intelligence enriches **completed** `VehicleTrip` rows (DIMO Segment boundaries) with behavior events, vehicle operational stress, and—behind flags—a **V0 shadow pipeline** (S3A positions → S1/L3 kinematics → S4 road matching → speed QC). Production today still relies on **legacy whole-trip HF fetch** for detectors; DI V0 libraries are largely **dormant** on `main` with extensive EXP-021 research in `architecture/drivingintelligence/evidence/`.

## Package contents

- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) — pipeline + Mermaid
- [ALGORITHM_COMPARISON_MATRIX.md](./ALGORITHM_COMPARISON_MATRIX.md)
- [DECISION_LEDGER.md](./DECISION_LEDGER.md) + [FAILURE_MODE_CATALOG.md](./FAILURE_MODE_CATALOG.md)
- [REFERENCE_TRIP_REGISTRY.md](./REFERENCE_TRIP_REGISTRY.md)
- [REPRODUCIBILITY_GUIDE.md](./REPRODUCIBILITY_GUIDE.md)

## Code paths (high value)

| Path | Role |
|------|------|
| `backend/.../driving-intelligence/core/` | L3, S1 intervals |
| `backend/.../position-acquisition/` | S3A |
| `backend/.../speed-qc/` | P1 QC |
| `backend/.../s4-research/` | Offline matchers |
| `backend/.../s4a-foundation/` | Dormant orchestration |
| `trip-behavior-enrichment.processor.ts` | Production HF |

## Review questions (neutral)

1. Is **L3 centred-path** still the right numeric speed authority for DI V0 given t+1 batch dependence and online masking experiments?
2. Is **hold/release** semantics correctly separating physical stops from telemetry gaps?
3. Does **forward Viterbi** materially improve plausible paths vs baseline bucket matcher on **comparable decoders**, or only redistribute UNKNOWN?
4. Are **directed routing penalties** in route-aware Viterbi sufficiently justified by evidence, or overfitting frozen fixtures?
5. How should **unknown turn restrictions** be handled without false confidence?
6. What evidence standard is required before labeling a **short stop** as confirmed vs candidate?
7. How can **road matching** be validated without independent road-ID ground truth?
8. Is **Speed QC V1 ordering** (`NO_NUMERIC` before stationary trust) still acceptable for product projections?
9. Which subsystems are **over-engineered** relative to measured fleet value (S4 kill chain vs core L3)?
10. Should **provider-reported speed** be integrated as corroboration only, never override, or never used?
11. Is **PR #2051** metadata reliable for scope review, and how should agents reconcile title/body/commits?
12. Does **merge of s4-research** create operational risk if any flag defaults were mis-set?
13. Are **Tesla TC-3** narratives being over-interpreted from single-timestamp waypoint zeros?
14. What is the minimum **replay pin** policy for all future DI experiments?
15. Should **micro-motion FSM** remain research-only permanently vs merge into S1?

## Known uncertainties

- No independent road GT.
- Cloud B7 artifacts not in git.
- Production S4 activation state requires fresh read-only VPS attestation.

**INDEPENDENT_REVIEW_READY:** YES — sufficient pointers for external agents; live prod verification NOT run in this dossier.
