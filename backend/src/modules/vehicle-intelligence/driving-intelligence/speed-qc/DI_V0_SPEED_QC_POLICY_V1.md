# DI_V0_SPEED_QC_POLICY_V1

Pure, versioned speed quality overlay for DI V0 shadow intervals. **Does not** modify S1 compute, S2 persistence, or S4C execution.

## Trust semantics (separate from S1 `valueConfidence`)

| `trustLevel` | Meaning |
|--------------|---------|
| `TRUSTED` | May feed trip-level QC max (P2 projector) without extra caveats |
| `TRUSTED_LIMITED` | Moderate shadow confidence or consistent stationary band — **not** a full numeric speed claim |
| `UNTRUSTED` | Must not be used for quality-gated speed claims |

`NUMERIC_HIGH` shadow rows may evaluate to `UNTRUSTED`.

## Snapshot identity boundary

`inputEvidenceIdentity.pinnedSnapshotHash` (and optional `expectedPinnedSnapshotHash`) are **opaque reference strings** for projector binding. QC performs **string equality only** — it does **not** verify gzip payload bytes or channel manifests. Cryptographic attestation remains upstream at S4 evidence pin time.

## Center label contract

`centerBucketLabel` must normalize to the same calendar second as `shadow.referenceTime` or QC returns `REFERENCE_TIME_MISMATCH` (fail closed). Unparseable `referenceTime` values use the same path (no thrown `RangeError`).

Conflicting duplicate `r1Obd` rows for one `bucketLabel` → `DUPLICATE_R1_BUCKET_LABEL` before any R1 witness logic.

`STATIONARY_BAND` → `TRUSTED_LIMITED` only when center calendar position is `PRESENT` with valid coordinates; otherwise `MISSING_POSITION_EVIDENCE`.

## R1 temporal authority

R1 samples are **bucket-aligned**. `R1_INTERVAL_ONLY` on the shadow row prevents treating R1 as an independent point witness even when speeds numerically agree. Missing R1 never upgrades trust.

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
| Q7 | `ROW_ABSENT` in lookback **and** (geometry/accel spike or `L3_SUPPORT_CROSSES_GAP`) | `UNTRUSTED` / `POST_GAP_REACQUIRE` |
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

## P2 projector (internal)

`DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1` in `trip-speed-quality/` persists to `di_v0_trip_speed_quality_projections_v1` via `DiV0TripSpeedQualityProjectionService` (ops-only; **not** wired to S4 T06 completion or schedulers in P2).
