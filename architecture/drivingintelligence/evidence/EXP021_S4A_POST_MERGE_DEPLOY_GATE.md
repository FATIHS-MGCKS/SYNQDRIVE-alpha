# EXP-021 S4A — Post-merge Production deploy gate (operational)

| Field | Value |
|-------|-------|
| **Evidence ID** | DI-EVID-EXP021-S4A-POST-MERGE-GATE-001 |
| **Activated** | 2026-09-28 (merge of PR #1816 to `main` @ `2c321823a`) |
| **Epistemic** | CONFIRMED |
| **Type** | Operational deployment gate (not a product feature flag) |

## Deploy gate status

| Gate | Status |
|------|--------|
| `DO_NOT_DEPLOY_S4A_MIGRATION_TO_PRODUCTION` | **SUPERSEDED** (2026-09-28) by readiness below — historical record only |
| `S4A_DORMANT_MIGRATION_DEPLOY_GATE` | **DORMANT_SCHEMA_APPLIED** (2026-09-28) — see §Production apply record |

PostgreSQL CI wiring and dormant migration re-seal are documented in [EXP021_S4A_POSTGRES_CI_WIRING.md](EXP021_S4A_POSTGRES_CI_WIRING.md) (DI-EVID-EXP021-S4A-POSTGRES-CI-001).

## Production apply record (2026-09-28)

| Field | Value |
|-------|-------|
| **Release** | `20260928095512_v4994` |
| **Deploy SHA** | `7f5f8fdf2d158c59e19323efee979aee1a0757e0` (PR #1819 merge lineage) |
| **Migration** | `20260927200000_di_v0_s4a_dormant_foundation` applied `2026-09-28T10:01:25Z` |
| **Pre-deploy backup** | `/opt/synqdrive/shared/backups/db-pre-deploy-20260928095512.sql.gz` |
| **S2 rows after apply** | 0 runs / 0 intervals |
| **S4A tables** | 4 present; 0 work items / 0 snapshots / 0 control rows / 0 pipeline versions |
| **S4 runtime** | **not authorized** (no callers, flags absent, control empty ⇒ KILLED) |

**This is not deploy authorization.** Ordinary Production deploy still requires an explicit operator decision. S4 runtime, S4B, S4C, shadow activation, flags, and allowlisting remain **unauthorized**.

### Closure criteria met (2026-09-28)

1. **DI-GAP-S4A-POSTGRES-CI-WIRING-001 CLOSED:** GitHub workflow `.github/workflows/s4a-postgres-integration.yml` runs `npm run test:di:s4a:postgres:ci` (61 real-Postgres tests, `DI_V0_S4A_POSTGRES_REQUIRED=1`, fail-closed on missing DB).
2. **Dormant deploy readiness seal:** empty-S2 precondition, bounded locks, no backfill, 0 runtime callers — READY for schema-only migration apply when operator chooses.

**Operator follow-up:** add GitHub required check **S4A PostgreSQL integration** to branch protection so merges cannot bypass the suite.

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
