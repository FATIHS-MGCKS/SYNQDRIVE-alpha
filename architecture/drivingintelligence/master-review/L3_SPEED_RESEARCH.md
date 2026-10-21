# L3 & Speed Research

## Why L3 exists (REPORTED + VERIFIED design)

| Source | Claim |
|--------|-------|
| `CURRENT_STATE.md` | DI V0 derives speed from explicit evidence; centred-path L3 is default kinematic estimate |
| `l3-eligibility.ts` | **VERIFIED** — three-second calendar window t−1,t,t+1, all positions FRESH |
| RD003 / video | Provider HF spacing ≠ 1 Hz; GPS/coordinate path preferred over naive provider speed |

L3 is the **numeric speed authority for DI V0 shadow kinematics**, not a statement that provider speed is useless globally.

## Speed sources investigated (historical)

| Source | Role | Status |
|--------|------|--------|
| DIMO `currentLocationCoordinates` 1s AVG | S3A input | **VERIFIED** production path for shadow design |
| Provider-exposed speed fields | Compared in Phase 2 audits | Variable availability (2B matrix) |
| R1 OBD speed km/h | S3B INTERVAL_ONLY corroboration | **VERIFIED** — cannot override L3 (FULL-R1-002 tests) |
| Video tachograph witness | `VIDEO_TACHO_REFERENCE.json` | **REPORTED** — witness, not GPS GT |
| iPhone / ad-hoc GPS experiments | Early calibration mentions | **NOT_AVAILABLE** in pinned dossier artifacts |

## R1 OBD temporal containment (VERIFIED)

- **EXP_021_C03_R1_TEMPORAL_CONTAINMENT_2026-09-24.md**
- R1 records lack defensible point-in-time semantics for abuse detectors.
- **Tesla** uses `API_SYNTHETIC` integration family — R1 containment paths do not apply the same gates (**VERIFIED** in containment doc §4).

## S3A / S1 / L3 architecture decision

| Layer | Function |
|-------|----------|
| S3A | Coordinates only, 1s grid, tri-state availability |
| S1 | Hold, release, frozen intervals, stationary band, transition uncertainty |
| L3 | `L3_CENTERED_PATH` speed when eligible |

**REPORTED:** P2.1 forensic trip (`EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md`) — 763/1480 intervals `NO_NUMERIC` largely from S1 abstention, not GPS absence.

## Video / tacho validation (REPORTED metrics — do not fleet-generalize)

| Dataset | n | MAE | P95 | Max | Bias | Source |
|---------|---|-----|-----|-----|------|--------|
| Historical tachograph video calibration | 123 | 3.13 km/h | 8.41 km/h | 15.0 km/h | −2.10 km/h | `EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md` |
| RD003 alignment-fit | 109 matched | ~8.5 km/h MAE | — | — | — | `RD003_RETROSPECTIVE.md` (**in-sample**, not independent GT) |

**VERIFIED policy:** `LESSONS_LEARNED.md` LL-013 — in-sample MAE ≠ independent accuracy.

## L3_CENTERED_PATH and t+1 dependency

```49:56:backend/src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/l3-eligibility.ts
export function evaluateL3AtCenter(
```

**VERIFIED:** Center index requires neighbors at i−1 and i+1 for centred path. Batch replay over full trip uses future second → **online-strict replay requires masking** (EXP021 B7.3 **REPORTED** in cloud artifacts).

## Stationary band & hold/release

| Mechanism | Behavior |
|-----------|----------|
| `STATIONARY_BAND` | S1 may emit null speed with stationary motion state |
| Hold/release | `FROZEN_*`, `RELEASE`, `TRANSITION_UNCERTAIN` → abstained speed |
| Speed QC V2 | Stationary null semantics documented `EXP021_P1_V2_STATIONARY_SEMANTICS.md` |

**VERIFIED mismatch:** P1 evaluates `NO_NUMERIC` before `STATIONARY_BAND` trusted path — 127 intervals on P2.1 trip (`EXP021_P21_R3`).

## Speed QC V1 vs V2

| Version | Default | PR | Notes |
|---------|---------|-----|-------|
| V1 | **VERIFIED** code default | — | Null speed → untrusted |
| V2 | Opt-in `qcPolicyVersion=V2` | #2021 | Stationary null-speed semantics; tests `di-v0-speed-qc-policy-v2.spec.ts` |

Runtime passthrough readiness: #2027. Auto projection after S4: #2028 **dormant**.

## Provider timestamp problems (CONFIRMED family)

- RD004 H vs provider offset
- Late-arriving buckets (RD004-B watermark)
- Settlement shadow ages (EXP-021 design probes)

## Offline accuracy vs online causality

| Mode | Property |
|------|----------|
| Batch L3 over full trip | May use t+1 — **VERIFIED** |
| Strict online mask | Lower stop confirmation — B7.2/B7.3 **REPORTED** |
| Provider speed at sparse waypoints | Not equivalent to L3 calendar grid — B7.4 **REPORTED** |

**Do not conclude L3 is "replaced" because online experiments found limits** — separate batch authority from causal policy design.

## R1 hardware vs Tesla software integration

| Integration | Family | L3 role |
|-------------|--------|---------|
| RUPTELA_R1 serial | `RUPTELA_R1` | OBD speed INTERVAL_ONLY; containment active |
| Tesla DIMO synthetic | `API_SYNTHETIC` | Coordinates + sparse waypoint speed; not R1 OBD path |
