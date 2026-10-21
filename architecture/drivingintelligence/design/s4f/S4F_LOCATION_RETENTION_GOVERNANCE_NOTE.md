# S4F location retention governance note (DI-GAP-S4-LOCATION-RETENTION-001)

**Status:** GOVERNANCE_NOTE (technical default only — not legal advice or legal approval)

## Technical default

- 1 Hz location evidence in `di_v0_s4_evidence_snapshots` is personal-data-bearing in a rental context.
- Proposed default at pin time: `retention_until = created_at + 90 days` (see `DI_V0_S4_SNAPSHOT_RETENTION_DAYS` in S4A foundation).
- Future purge would delete snapshots and dependent work items via composite FK cascade; S2 shadow runs/intervals remain but replay without pinned evidence becomes impossible by design.

## Current implementation (repository audit, S4F-1)

- `T05_PIN` sets `retention_until` using `clock_timestamp() + 90 days` when pinning.
- No production purge job or scheduler is registered in S4F-1.
- No destructive purge implementation in this slice.

## Tiny Activation gate

- Contract `activationGates.TINY_ACTIVATION` requires `DI-GAP-S4-LOCATION-RETENTION-001:GOVERNANCE_NOTE`.
- This document satisfies the **governance note** artifact requirement for engineering visibility.
- **Full privacy review and explicit operational approval are still required before scale-up** — this note is not a substitute.

## Approvals required later (out of S4F-1 scope)

- Privacy / DPO review of retention period and purge mechanics.
- Operator authorization for tiny activation (separate human gate).
- Any legal review of cross-border rental data processing.
