# EXP-021 — S4B precondition implementation evidence

| Field | Value |
|-------|-------|
| **Slice** | boundary_occurrence + execution identity V2 + T13 parity |
| **Migration** | `20260928120000_di_v0_s4b_boundary_occurrence_and_execution_v2` |
| **Runtime** | Dormant (no S4B workers/schedulers) |

## Implementation summary

- Column `boundary_occurrence` on `di_v0_s4_work_items`; logical unique key extended.
- Concurrency-safe allocation via `di_v0_s4_trip_primary_boundary_seq` (`INSERT … ON CONFLICT DO UPDATE` per trip).
- `buildDiV0S4ExecutionIdentityV2` + repository T06 writes V2; V1 builder preserved.
- T11 `W_SUCCESSOR_PRIMARY_INSERT` allocates occurrence on revert; T13 remains supersede-only.
- PostgreSQL: BR01–BR10, T13-01–T13-07, S4B migration M01–M10; CI expected count 88.
