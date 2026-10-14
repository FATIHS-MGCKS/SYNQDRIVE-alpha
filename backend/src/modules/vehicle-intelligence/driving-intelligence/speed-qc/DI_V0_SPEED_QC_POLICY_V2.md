# DI_V0_SPEED_QC_POLICY_V2

**Status:** Implemented (opt-in; default remains V1)  
**Depends on diagnosis:** EXP021 P2.1 R3B (`c18910ae1823bb9ea3991af748abf6c7f1e08063`)

## Intent

Allow **fachliche** evaluation of S1 intervals with `motionState=STATIONARY_SUPPORTED`, `speedEvidenceState=STATIONARY_BAND`, and **intentional** `estimatedSpeedKmh=null` **before** the V1 `NO_NUMERIC` short-circuit.

## Non-goals

- No `null → 0` speed assignment.
- No change to numeric L3 movement evaluation when `estimatedSpeedKmh` is finite.
- No increase to `trustedNumericCount` / `trustedNumericCoveragePercent`.
- No automatic promotion of `FROZEN_UNRESOLVED`, `RELEASE`, or `MOVING_SPEED_UNKNOWN`.
- No S2 schema or historical row mutation.

## Acceptance (null speed stationary)

Returns `TRUSTED_LIMITED` with `OK_STATIONARY_NULL_SPEED` and `qcTrustedSpeedKmh=null` when:

- `STATIONARY_SUPPORTED` + `STATIONARY_BAND`;
- no `CONFLICTING` / `CONFLICT_EXPLAINED` source relation;
- center position present with valid coordinates;
- no support-compromised shadow flags;
- **Fresh center:** complete t−1/t/t+ window, no `ROW_ABSENT`/`SIGNAL_NULL`, no frozen/release in support, leg speeds ≤ stationary band;
- **FROZEN_STOP_SUPPORTED center:** valid center coordinates only (S1 stop-hold semantics).

## Withhold

Falls through to V1-equivalent `NO_NUMERIC` or explicit untrusted reasons (`CROSS_SOURCE_CONFLICT`, `SUPPORT_WINDOW_COMPROMISED`, `MISSING_POSITION_EVIDENCE`, `FROZEN_OR_RELEASE_IN_SUPPORT`, `STATIONARY_INCONSISTENT`, …).

## Selection

Pass `qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2` into `evaluateDiV0SpeedQcInterval` / `buildDiV0TripSpeedQualityProjectionV1`. Omitted version → **V1**. Unknown versions throw `DiV0SpeedQcPolicyVersionError`.

Projection identity and idempotency keys include `qcPolicyVersion` — V1 and V2 never share the same result identity.
