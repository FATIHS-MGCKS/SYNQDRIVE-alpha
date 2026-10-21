# Ground Truth & Validation

## Ground-truth classes

| Class | Definition | Examples |
|-------|------------|----------|
| **INDEPENDENT_GROUND_TRUTH** | Sensor or survey independent of algorithm under test | Sealed video with verified sync **not yet claimed fleet-wide** |
| **DRIVER_REPORTED** | Human narrative / map review | TC-1..TC-6, B3 maps |
| **VIDEO_TACHO_WITNESS** | Dashboard overlay read | `VIDEO_TACHO_REFERENCE.json` |
| **ALGORITHMIC_REFERENCE** | Another algorithm output | Viterbi vs baseline — not GT |
| **PROVIDER_LABEL** | DIMO native event | LTE_R1 behavior.* |

## Validation rules (VERIFIED policy)

1. Low MAE alignment **rejected** when violating hard temporal bounds (`DI-HYP-003`, RD004).
2. `independentRoadIdAccuracy: NOT_ASSESSABLE` in S4 research contracts.
3. In-sample tachograph MAE **does not** prove P1/P2 QC correctness fleet-wide (`EXP021_P21_R3`).
4. Do not transfer RD002 cadence statistics to RD003 vehicle paths.

## What was validated vs not

| Claim | Validated? | Evidence |
|-------|------------|----------|
| L3 implementation matches golden vectors | YES (unit) | `di-v0-pure-core.spec.ts` |
| L3 vs tacho on 123 points | REPORTED holdout | P2.1 forensic doc |
| Speed QC V2 stationary semantics | YES (unit) | `di-v0-speed-qc-policy-v2.spec.ts` |
| S4 research Tesla replay counts | REPORTED | PR B evidence |
| Road matching accuracy % | **NO** | Explicitly forbidden in contracts |
| Online stop detection accuracy | **NOT_ASSESSABLE** | No independent GT |

## Reproducibility requirements

Pinned snapshots: `DI_V0_S4_EVIDENCE_V1:sha256:…`  
Provider re-query mutability: document **REPLAY_PIN_REQUIRED** (C1G).

See [REPRODUCIBILITY_GUIDE.md](./REPRODUCIBILITY_GUIDE.md).
