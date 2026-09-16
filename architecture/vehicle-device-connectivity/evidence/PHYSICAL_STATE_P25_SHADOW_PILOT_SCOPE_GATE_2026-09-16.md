# RB-019 Phase 2 P2.5 — STATEFUL_SHADOW Pilot Scope Gate + Scope-Bound Observability

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-RB019-P25-SHADOW-PILOT-GATE-001 |
| **Date** | 2026-09-16 |
| **Epistemic** | IMPLEMENTATION_PRESENT |
| **Validation** | UNIT_VALIDATED; POSTGRES_INTEGRATION_PENDING_CI |
| **Production impact** | **NONE** — flags OFF; no deploy in this workstream |

## Summary

Fail-closed LEGACY shadow pilot isolation and scope-bound operational evidence for STATEFUL_SHADOW:

- Canonical env `CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON`
- Pilot gate before `ensureAuthorityRow()` and all physical durable writes
- PHYSICAL authority bypasses pilot gate
- Scope-bound structured logs + low-cardinality Prometheus gate metrics
- Durable PostgreSQL shadow observations with dual clocks (`observedAt` comparison/runtime, `evidenceObservedAt` source evidence)
- Operational ≥7-day proof via `getOperationalCoverage()` on comparison timestamps only (PSG-TIME-1/2)
- Leader-owned retention scheduler pruning by comparison/runtime time

## Key artifacts

| Artifact | Path |
|----------|------|
| Pilot config parser | `backend/src/config/connectivity-physical-state-shadow-pilot-scope.config.ts` |
| Pilot gate logic | `backend/src/modules/dimo/device-connection-physical-state/physical-state-shadow-pilot-scope.ts` |
| Evidence writer integration | `backend/src/modules/dimo/device-connection-physical-state/physical-state-evidence-writer.service.ts` |
| Shadow observability | `backend/src/modules/dimo/device-connection-physical-state/physical-state-shadow-observability.service.ts` |
| Durable observations | `backend/src/modules/dimo/device-connection-physical-state/physical-state-shadow-observation.repository.ts` |
| Migration | `backend/prisma/migrations/20260916120000_device_connection_physical_state_shadow_observations/` |
| Audit doc | `docs/audits/vdc-rb019-p25-shadow-pilot-scope-gate-2026-09-16.md` |

## Validation commands

```bash
# Unit
cd backend && npx jest connectivity-physical-state-shadow-pilot-scope physical-state-shadow-pilot-scope physical-state-shadow-observability.service physical-state-authority.state-machine physical-state-cutover-evidence-provenance physical-state-evidence-writer.shadow-orchestration

# PostgreSQL integration (requires DATABASE_URL)
cd backend && npm run test:physical-state:postgres

# Typecheck
cd backend && npx tsc -p tsconfig.json --noEmit

# Architecture validators
bash architecture/scripts/validate-module-registry.sh
bash architecture/vehicle-device-connectivity/scripts/validate-graph.sh
```

## Non-effects

- No Production deploy
- No flag enablement
- No authority cutover execution
- No side-effect execution
- `P2_5_CUTOVER_ACTIVATION_READY` remains **NOT_PROVEN**
