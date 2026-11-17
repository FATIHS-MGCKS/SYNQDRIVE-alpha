# APDS V3 shadow Postgres concurrency test fix (2026-11-17)

| Field | Value |
|-------|--------|
| Workstream | APDS P25 disposable PostgreSQL certification |
| Failure | `apds-v3-shadow-concurrency.postgres.integration.spec.ts` assumed `NOT_ASSESSABLE` always wins race |
| Root cause | Test ordering bias; repository correctly preserves **first committed** immutable row (either contender) |
| Fix | Test-only — assert 1× `inserted`, 1× `ApdsV3ShadowImmutableConflictError`, stored row matches winning payload |
| Algorithm | **Unchanged** (`apds-v3-shadow.repository.ts`) |
| CI | `backend/scripts/test/p25-apd-shadow-postgres-ci.sh` — **POSTGRES_INTEGRATION=PASS** (40 tests) on disposable PG |
| Progress ledger | Row pending central [`PROGRESS_LEDGER`](../../platform-reorientation/PROGRESS_LEDGER.md) until platform foundation merges (#2416); VDC [`research/CHANGE_LEDGER.md`](../research/CHANGE_LEDGER.md) updated |