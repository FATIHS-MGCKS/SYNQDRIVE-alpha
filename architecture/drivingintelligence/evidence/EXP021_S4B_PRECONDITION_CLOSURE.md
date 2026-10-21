# EXP-021 — S4B precondition closure (boundary revert + T13 registry)

| Field | Value |
|-------|-------|
| **Evidence ID** | DI-EVID-EXP021-S4B-PRECOND-001 |
| **Date** | 2026-09-28 |
| **Epistemic** | CONFIRMED (authority + contract validator + existing Postgres repro) |
| **Production** | No writes, no deploy, no migration |

## Scope

Authority/design closure only for the two S4B blockers:

1. **BOUNDARY_REVERT** (`DI-GAP-S4A-BOUNDARY-REVERT-SUCCESSOR-001`)
2. **T13_WRITE_REGISTRY** (`DI-CONTRA-S4A-T13-SUCCESSOR-WRITE-BINDING-001`)

## Anchors

| Field | Value |
|-------|-------|
| `CURRENT_MAIN_SHA` | `7f5f8fdf2d158c59e19323efee979aee1a0757e0` (workspace branch base; production matches) |
| `S4A_DORMANT_FOUNDATION_PHASE` | COMPLETE |
| `S4_RUNTIME_ACTIVE` | NO |

## Deliverables

| Artifact | Path |
|----------|------|
| Boundary revert authority | `design/s4a/S4A_BOUNDARY_REVERT_AUTHORITY.md` |
| T13 / write registry authority | `design/s4a/S4A_T13_HOLDER_SUPERSEDE_AUTHORITY.md` |
| Contract amendment C1D.10F | `design/s4a/s4a-contract.v2.json` |
| Validator | `scripts/validate-s4a-contract.mjs` (R24 T13 model, logical key, execution identity V2) |
| TS mirror (transitions + execution identity version) | `backend/.../di-v0-s4a-contract.ts` |

## Implementation follow-up (separate PR)

- Migration: `boundary_occurrence` column + unique index update
- Repository: `successorIdIfEligible` assigns `nextOcc`; T11 insert includes occurrence
- Postgres tests BR01–BR10, T13-01–07
- `DI_V0_S4_EXECUTION_IDENTITY_V2` builder in `di-v0-s4a-identity.ts`

`IMPLEMENTATION_FOLLOWUP_REQUIRED=YES`

## Validation

| Check | Result |
|-------|--------|
| `validate-s4a-contract.sh` | PASS |
| `di-v0-s4a-contract-parity` | PASS |
| Postgres boundary revert repro (pre-fix code) | PASS (documents failure mode) |

## P2 status after closure

| Item | Status |
|------|--------|
| BOUNDARY_REVERT | **CLOSED** (authority); implementation tracked |
| T13_WRITE_REGISTRY | **CLOSED** (authority) |
| Other P2 | Unchanged |
