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
- **P6D3 (merged):** controlled execution through `READY_FOR_ARCHIVE` (no `ARCHIVED` / job `COMPLETED`)
- **P6D4 (merged on `main`):** archival finalization API, provider disconnect assessment, ARCHIVED PATCH guard, SUSPENDED routine polling policy — [`CHANGE_RECORD_P6D4_2026-11-22.md`](CHANGE_RECORD_P6D4_2026-11-22.md)
- **P6D4 DIMO owner handoff (backend + MA UI, merged):** read-only privilege status, Identity recheck (flag-gated), operator handoff records; MOCK_EVIDENCE drawer tests #2494

## P6E repository audit (2026-11-22)

- **REPOSITORY_AUDIT_PASS** at `b2e87c7e0ae645b1b1cbecfcfdc59106a8ad040b` — [`../platform-reorientation/evidence/P6E_ORGANIZATIONS_REPOSITORY_AUDIT_SEAL_2026-11-22.md`](../platform-reorientation/evidence/P6E_ORGANIZATIONS_REPOSITORY_AUDIT_SEAL_2026-11-22.md)
- **Not** production certification; registry remains **`AUDIT_IN_PROGRESS`** until approved production baseline evidence.

## Validation

```bash
cd backend && npm test -- --runInBand organization-offboarding
```