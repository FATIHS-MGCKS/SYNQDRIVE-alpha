# Fleet Health Service — Domain Integration Tests (V4.9.733)

Focused integration coverage for the **Zustand & Service** domain chain. Uses in-memory pipeline stores — no production data, no Postgres e2e.

## Backend

| File | Role |
|------|------|
| `service-cases/__fixtures__/fleet-health-service-pipeline.fixtures.ts` | Deterministic org/vehicle/vendor IDs |
| `service-cases/fleet-health-service-test-store.ts` | Extends booking-task store with cases, observations, vendors |
| `service-cases/fleet-health-service-pipeline.harness.ts` | Wires Tasks, ServiceCases, TechnicalObservations, Vendors |
| `service-cases/fleet-health-service.domain.integration.spec.ts` | 15 scenario tests |

### Scenarios

- Finding → Task (`convertToTask`)
- Finding → Service Case (`linkService` + `createServiceCase`)
- Case → multiple tasks (`serviceCaseId`)
- Vendor waiting (case `WAITING_VENDOR`, task `WAITING` + `vendorId`)
- `scheduledAt`, `expectedReadyAt`, `SCHEDULED` status
- `blocksRental` persistence
- Case `COMPLETED` while observation stays active
- Observation resolved while case stays `OPEN`
- Partial vendor stats failure (cases list still readable)
- Vehicle-scoped pagination/filtering
- Task assignee org membership guard
- Cross-tenant isolation
- Per-vehicle blocking isolation

Run:

```bash
cd backend && npm test -- --testPathPattern=fleet-health-service.domain.integration.spec.ts
```

## Frontend

| File | Role |
|------|------|
| `fleet-health-service.domain.integration.test.ts` | Read-model chain: runtime `rental_blocked`, blocking cases, limited health, vendor waiting, cross-tenant filter |

Run:

```bash
cd frontend && npm test -- src/rental/components/fleet-health-service/fleet-health-service.domain.integration.test.ts
```
