# Organizations & Tenancy — architecture authority (bootstrap, `AUDIT_IN_PROGRESS`)

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` (from `NOT_STARTED`, 2026-11-22 — P6D2 offboarding foundation) |
| **Production baseline** | **NOT_STARTED** |

## Binding owner policies (2026-11-22)

Recorded in [`CHANGE_RECORD_P6D2_2026-11-22.md`](CHANGE_RECORD_P6D2_2026-11-22.md) and [`../platform-reorientation/evidence/P6D_ORGANIZATION_OFFBOARDING_OWNER_POLICIES_2026-11-22.md`](../platform-reorientation/evidence/P6D_ORGANIZATION_OFFBOARDING_OWNER_POLICIES_2026-11-22.md).

## P6D2 scope (merged evidence)

- Contract + read-only org preflight + persistent **PREPARE** job only
- Master Admin HTTP: preflight / prepare / get job
- **P6D3 (this branch):** controlled execution API + phased job progress (no ARCHIVED)
- **Deferred (P6D4):** external provider disconnect, ARCHIVED enforcement on PATCH, DIMO scheduler filter

## Validation

```bash
cd backend && npm test -- --runInBand organization-offboarding
```