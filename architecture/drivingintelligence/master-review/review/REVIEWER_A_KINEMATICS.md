# Reviewer A — Kinematics & Stop/Go

## Scope

L3, S1, stationary band, hold/release, speed provenance, Speed QC V1/V2, R1 containment, B7–B7.4 (REPORTED), online causality.

## Read first

1. [../L3_AUTHORITY_DECISION.md](../L3_AUTHORITY_DECISION.md)
2. [../L3_SPEED_RESEARCH.md](../L3_SPEED_RESEARCH.md)
3. [../MOTION_STOP_GO_RESEARCH.md](../MOTION_STOP_GO_RESEARCH.md)
4. [../../evidence/EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md](../../evidence/EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md)
5. Code: `core/kinematics/l3-eligibility.ts`, `compute-trip-intervals.ts`, `speed-qc/evaluate-di-v0-speed-qc-interval.ts`

## Open questions (neutral)

- Is P1 `NO_NUMERIC` ordering correct for stationary intervals with fresh GPS?
- What online policy should replace batch `L3_CENTERED_PATH` for stop confirmation?
- Should provider waypoint speed ever enter S1?

## Deliverable

Structured findings with VERIFIED / REPORTED / NOT_VERIFIED per claim. No product code changes in review pass.
