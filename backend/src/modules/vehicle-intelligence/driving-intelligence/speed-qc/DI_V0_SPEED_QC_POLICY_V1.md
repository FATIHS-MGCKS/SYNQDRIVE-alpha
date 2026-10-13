# DI_V0_SPEED_QC_POLICY_V1

Pure, versioned speed quality overlay for DI V0 shadow intervals. **Does not** modify S1 compute, S2 persistence, or S4C execution.

## Trust semantics (separate from S1 `valueConfidence`)

| `trustLevel` | Meaning |
|--------------|---------|
| `TRUSTED` | May feed trip-level QC max (P2 projector) without extra caveats |
| `TRUSTED_LIMITED` | Usable with explicit limitations (moderate shadow confidence or stationary) |
| `UNTRUSTED` | Must not be used for quality-gated speed claims |

`NUMERIC_HIGH` shadow rows may evaluate to `UNTRUSTED`.

## Rules (Q1–Q10)

| ID | Condition | Outcome |
|----|-----------|---------|
| Q1 | No finite `estimatedSpeedKmh` | `UNTRUSTED` / `NO_NUMERIC` |
| Q2 | `sourceRelation` CONFLICTING or CONFLICT_EXPLAINED | `UNTRUSTED` / `CROSS_SOURCE_CONFLICT` |
| Q3 | Abstention or NONE/ABSTAINED/MOVEMENT_ONLY evidence | `UNTRUSTED` / `SHADOW_ABSTAINED` |
| — | `STATIONARY_BAND` | `TRUSTED_LIMITED`, speed null |
| Q4 | Support compromise flags on shadow row | `UNTRUSTED` / `SUPPORT_WINDOW_COMPROMISED` |
| — | Missing calendar position triple or coords | `UNTRUSTED` / `MISSING_POSITION_EVIDENCE` |
| Q9 | FROZEN/RELEASE in t−1,t,t+1 | `UNTRUSTED` / `FROZEN_OR_RELEASE_IN_SUPPORT` |
| Q7 | `ROW_ABSENT` in post-gap lookback before center | `UNTRUSTED` / `POST_GAP_REACQUIRE` |
| Q6 | Leg implied speed > max leg (corroboration-aware) | `UNTRUSTED` / `GEOMETRY_JUMP` |
| Q5 | \|accel\| between legs > provisional max | `UNTRUSTED` / `KINEMATIC_IMPLAUSIBLE_LEG` |
| Q8 | R1 present and disagrees with L3 | `UNTRUSTED` / `R1_DISAGREEMENT` |
| — | Shadow confidence LOW/UNAVAILABLE | `UNTRUSTED` / `LOW_SHADOW_CONFIDENCE` |
| Q10 | MODERATE + pass | `TRUSTED_LIMITED` / `OK_MODERATE` |
| Q10 | HIGH + pass | `TRUSTED` / `OK` |

**Missing R1 is not corroboration** — uncorroborated leg caps apply.

Kinematic thresholds: `DI_V0_SPEED_QC_CALIBRATION_PROVISIONAL_V1` (**PROVISIONAL**, not fleet-calibrated).

## Snapshot integrity

When `expectedPinnedSnapshotHash` is set on input, it must equal `pinnedSnapshotHash` or evaluation fails closed (`SNAPSHOT_INTEGRITY_FAIL`).

## Validation limits

Golden tests use **synthetic** coordinates (not production traces). No ground-truth precision/recall claims in P1.

## Next step (P2)

Idempotent projector on PRIMARY work-item completion → `di_v0_trip_speed_quality_v1` (internal ops only).
