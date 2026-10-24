# Tires Health — Failed Approaches

Graph nodes `TIRE-FAIL-*` when an approach was implemented and failed. Rejected-before-implementation approaches live in the decision register as `TIRE-REJECT-*`.

## Recorded failed approaches

None in this bootstrap (no implementation attempted).

## Historical context (not a failed approach, kept for learning)

- **July 2026 production-readiness audit — `NOT_READY`**: 6 vehicles, 1350 snapshots, 0 wear data points, km deviation on all 6 vehicles. Addressed by the July 2026 remediation (ledger, odometer anchor, fingerprint dedupe, model versioning, alerts, rental review). Evidence: `TIRE-EVID-AUDIT-READINESS-2026-07-001`. Lesson carried into P1: ground-truth sparsity, not model complexity, is the binding constraint.

## Rejected (see decision register)

- `TIRE-REJECT-IMMEDIATE-V2-REPLACEMENT-001`
- `TIRE-REJECT-DS4-INTO-V2-BEHAVIOR-FACTOR-001`
