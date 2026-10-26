# EXP-021 — S4B precondition implementation evidence

| Field | Value |
|-------|-------|
| **Slice** | boundary_occurrence + execution identity V2 + T13 parity |
| **Migration** | `20260928120000_di_v0_s4b_boundary_occurrence_and_execution_v2` |
| **Runtime** | Dormant (no S4B workers/schedulers) |

## Production dormant schema deploy (2026-09-28)

| Field | Value |
|-------|-------|
| **Gate** | EXP-021 final S4B engineering-start (PR #1822 authorized for bundled release) |
| **REQUESTED_DEPLOY_SHA** | `6952fdf727f236ac7b338e14b85d54af6733fa0f` |
| **Release** | `20260928175908_v4994` |
| **Prior production SHA** | `7f5f8fdf2d158c59e19323efee979aee1a0757e0` |
| **Migrations applied** | 1 — `20260928120000_di_v0_s4b_boundary_occurrence_and_execution_v2` (checksum `3f8579fc…`) |
| **Pre-deploy backup** | `/opt/synqdrive/shared/backups/db-pre-deploy-20260928175908.sql.gz` |
| **Post-deploy S4 row counts** | All 0; no control row (effective KILLED / DISABLED) |
| **S4 runtime** | Not activated |

## Implementation summary

- Column `boundary_occurrence` on `di_v0_s4_work_items`; logical unique key extended.
- Concurrency-safe allocation via `di_v0_s4_trip_primary_boundary_seq` (`INSERT … ON CONFLICT DO UPDATE` per trip).
- `buildDiV0S4ExecutionIdentityV2` + repository T06 writes V2; V1 builder preserved.
- T11 `W_SUCCESSOR_PRIMARY_INSERT` allocates occurrence on revert; T13 remains supersede-only.
- PostgreSQL: BR01–BR10, T13-01–T13-07, S4B migration M01–M14 (lock-timeout + empty-state serialization); CI expected count 92.
- S4B migration uses `lock_timeout` / `statement_timeout` and `LOCK TABLE` on `di_v0_s4_work_items`, `di_v0_shadow_runs`, `di_v0_shadow_intervals` before the empty-state proof (aligned with S4A migration safety).
