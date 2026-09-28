# EXP-021 S4A — Post-merge Production deploy gate (operational)

| Field | Value |
|-------|-------|
| **Evidence ID** | DI-EVID-EXP021-S4A-POST-MERGE-GATE-001 |
| **Activated** | 2026-09-28 (merge of PR #1816 to `main` @ `2c321823a`) |
| **Epistemic** | CONFIRMED |
| **Type** | Operational deployment gate (not a product feature flag) |

## `DO_NOT_DEPLOY_S4A_MIGRATION_TO_PRODUCTION`

**Status: ACTIVE**

Ordinary Production deploy (`vps-deploy-release.sh` → `prisma migrate deploy`) **must not** be executed for the purpose of landing migration `20260927200000_di_v0_s4a_dormant_foundation` until the following closure gate is satisfied:

1. **PostgreSQL CI wiring (DI-GAP-S4A-POSTGRES-CI-WIRING-001):** `npm run test:di:s4a:postgres` (61 tests: migration M01–M08 + real-Postgres races R01–R25 + K01–K18) runs in **required** GitHub CI on every change that touches S4A schema, migration, repository, or race harness — not only via local/ephemeral bootstrap.
2. **Independent deploy-readiness seal** after CI wiring (slice: `S4A_POSTGRES_CI_WIRING_AND_DORMANT_DEPLOY_READINESS`).

This gate does **not** block merging dormant library code to `main`. It blocks **Production migration apply** until concurrency/database correctness is CI-enforced.

## Preserved P2 deadlines (unchanged by merge)

| ID | Deadline |
|----|----------|
| P2-1 POSTGRES_CI_WIRING | Before any Production deploy executing `20260927200000` |
| P2-2 BOUNDARY_REVERT_SUCCESSOR | Before S4B |
| P2-3 CONTROL_ROW_GLOBAL_MUTEX | Before S4C scale-up |
| P2-4 T13_WRITE_REGISTRY_CONTRADICTION | Before S4B authority / implementation |
| P2-5 CONTAINER_VERSION_NAMING | Before next contract version bump |
| P2-6 ON_UPDATE_CASCADE_IMMUTABILITY | Before tiny activation |

## Non-effects

No deploy, no Production write, no S4 runtime activation, no shadow activation, no flag enablement, no allowlisting.
