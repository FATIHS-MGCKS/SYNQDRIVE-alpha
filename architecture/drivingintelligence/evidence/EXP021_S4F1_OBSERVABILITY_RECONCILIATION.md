# EXP-021 S4F-1 — Dormant observability, reconciliation, activation-readiness foundation

**Slice:** S4F-1  
**Base main:** `c5cc0da85c2efe0d7fffbc124791645493f3a705`  
**Status:** Engineering complete (dormant — no AppModule, no activation)

## Scope

| Concept | Implementation |
|---------|----------------|
| Bounded read-only reconciliation | `s4f-observability/di-v0-s4f-reconciliation.service.ts` |
| Observability snapshot contract | `DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1` |
| Activation-readiness evaluator | `di-v0-s4f-activation-readiness.ts` (fail-closed) |
| Beyond 10d drift horizon | `di-v0-s4f-beyond-horizon.ts` — report only, no T11 |
| Provider backpressure audit | `di-v0-s4f-provider-backpressure-audit.ts` → **OPEN_CONFIRMED** |
| Location retention governance | `design/s4f/S4F_LOCATION_RETENTION_GOVERNANCE_NOTE.md` |
| Executor liveness | Replica-local registry signal; gap `DI-GAP-S4F-GLOBAL-EXECUTOR-LIVENESS-001` |

## Hard boundaries preserved

- No deploy, no S4 activation, no AppModule registration, no provider calls, no canonical trip writes.
- No `s4a-contract.v2.json` amendment.

## Tests

- Unit: `di-v0-s4f.unit.spec.ts`, `di-v0-s4f-dormant-audit.spec.ts`
- PostgreSQL: `di-v0-s4f.postgres.integration.spec.ts` (F01–F14)
- CI: `npm run test:di:s4f` / `test:di:s4f:postgres` wired in `s4a-postgres-integration.yml`

## Activation gates (evaluator defaults)

| Gate | S4F-1 result |
|------|----------------|
| Replay deserializer | SATISFIED (gap closed in S4D) |
| Snapshot rehash | SATISFIED |
| Provider backpressure | NOT_SATISFIED (gap OPEN) |
| Location retention governance note | Artifact present; operator/privacy scale-up still required |
| Explicit operator authorization | NOT_SATISFIED (human gate) |
| **TINY_ACTIVATION_READY** | **NO** |
