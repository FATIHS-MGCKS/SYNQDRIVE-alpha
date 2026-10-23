# DS4 C5.1 gated repair — offline experiment (2026-10-23)

Isolated research implementation of **C5.1** per design PR #2143 (`30b3f29b8`). No production code changes.

## Versions

| Version | Estimator id | Algorithm pin | Outputs | Status |
| --- | --- | --- | --- | --- |
| V1.1 | `MOTION_CORE_SPEED_C5_1_GATED_REPAIR_V1_1_SAFETY_HARDENED` | `53f5acebc` | `outputs/v1_1/` (sealed, historical) | Fable signoff: `APPROVED_AS_SAFE_OFFLINE_CANDIDATE`, **no** shadow/production release; conditions C1–C3 |
| V1.2 | `MOTION_CORE_SPEED_C5_1_GATED_REPAIR_V1_2_NULL_NEIGHBOR_FAIL_CLOSED` | this PR head | `outputs/v1_2/` | Safety patch C1–C3; awaiting Fable re-signoff |

V1.2 changes **only** the Q5/Q6 evidence model (C1). Acceleration limits, `FROZEN` parameters, Q1–Q4, the heading veto and support rules are unchanged.

## Fable safety-audit finding (V1.1) and the C1 fix

Fable's independent read-only review of V1.1 found that `tripleAccelViolation()` returned `0` when a
neighbour speed was `null` (e.g. `OUTLIER_REJECTED`). Q5 and Q6 then passed **without evidence**.

Evidence case **TIG22 19:04:38** (video ground truth **unknown** — the reference ends 19:03:02, 19:04 is
`UNSCORED_VIDEO_GAP`):

| Version | C4 km/h (quality) | C5.1 km/h | repairState | Q5 / Q6 |
| --- | --- | --- | --- | --- |
| V1.1 | 100.11 (`SPARSE_SUPPORT`) | **74.45** | `REPAIR_ACCEPTED` | passed on null → 0 m/s² |
| V1.2 | 100.11 (`SPARSE_SUPPORT`) | **100.11** (C4 kept) | `REPAIR_REJECTED` | `INSUFFICIENT_EVIDENCE` / `INSUFFICIENT_EVIDENCE` |

Neighbours examined by V1.2: `19:04:37` present, `OUTLIER_REJECTED`, speed `null`, **not usable**;
`19:04:39` present, `OK`, 98.16 km/h, usable.

What this does and does not claim:

- V1.1 accepted this repair **without** video ground truth.
- C4 already carried a conspicuous estimate here (54.06 km/h at 19:04:36 → outlier at :37 → 100.11 km/h at :38).
- V1.1 **moved** at least one local plausibility violation (74.45 → 98.16 km/h in 1 s ≈ 6.6 m/s²) rather than proving its resolution.
- V1.2 fails closed; the true speed at 19:04 remains **unknown**. This is **not** a confirmed false alarm.

C1 implementation (`scripts/c5-1-gated-repair.cjs`): `tripleAccelEvidence()` returns `VALID`,
`VIOLATION` or `INSUFFICIENT_EVIDENCE` with the examined neighbours (label, offset, presence, C4 quality,
speed, usability). A missing neighbour or a present neighbour with `null` speed is `INSUFFICIENT_EVIDENCE`
and is never interpreted as 0 m/s². On `INSUFFICIENT_EVIDENCE` the repair is rejected and the C4 value kept.
No later numeric neighbour is substituted and the evidence horizon (`maxNeighborGapS = 3`) is not widened.

## Layout

| Path | Role |
| --- | --- |
| `scripts/c5-1-gated-repair.cjs` | Repair engine on frozen C4 replay (V1.2) |
| `scripts/run_c5_1_experiment.cjs` | Four-drive regression + gates → `outputs/v1_2/c5_1_experiment_summary.json` |
| `scripts/c5-1.synthetic.test.cjs` | 13 synthetic scenarios; 10–13 exercise the **active** repair path (C3) |
| `scripts/c5-1.synthetic.helpers.cjs` | Physical profile generators, jitter/outlier models, repair-path activity proof |
| `scripts/c5-1.support.test.cjs` | Support counting boundary tests (4–7 points) |
| `outputs/v1_1/` | Sealed V1.1 artefacts (historical, unchanged) |
| `outputs/v1_2/` | V1.2 artefacts (this version) |
| `outputs/baselines/` | V1.1 fingerprint (`53f5acebc`) and V1.2 fingerprint |
| `REPRO.md` | Commands and pins |

## C3 — manoeuvre tests with an active repair path

Scenarios 10–13 assert `eligible > 0`, `candidates > 0` and Q4/Q5/Q6 evaluated for every candidate, so none
of them is green because the repair window stayed empty. Physical truth is the clean-profile C4 of the same
label; accepted repairs must match it within 0.5 km/h and must not raise above it.

| Scenario | Profile | Fault | Result |
| --- | --- | --- | --- |
| 10 | acceleration 3.0 m/s² | one lagging fix (−5 m) | 1 TIME_SUSPECT, 3 repairs = truth, ACCELERATION event preserved |
| 11 | braking −3.0 m/s² | one suspicious fix (+5 m) | 1 TIME_SUSPECT, 3 repairs = truth, series keeps falling, DECELERATION preserved |
| 12 | start from standstill 2.0 m/s² | one lagging fix (−5 m) | 1 TIME_SUSPECT, 3 repairs = truth, standstill untouched |
| 13 | cruise + jitter | single-fix outlier next to a centre (TIG22 19:04:37/38 analogue) | Q1–Q4 + heading pass, Q5/Q6 `INSUFFICIENT_EVIDENCE`, `REPAIR_REJECTED`, C4 kept; control run without outlier has `VALID` evidence |

`PRODUCT_CODE_CHANGED=NO` · `PRODUCTION_MUTATIONS=NO` · shadow/production activation **not** approved.
