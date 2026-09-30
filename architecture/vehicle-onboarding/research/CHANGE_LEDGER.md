# Vehicle Onboarding — Change Ledger

| Date | Change | Authority impact |
|------|--------|------------------|
| 2026-09-30 | **VO-0B** — Bootstrap module authority, registry `AUDIT_IN_PROGRESS`, CURRENT_STATE seal, VO-GAP register, authority boundaries, 16 open questions | Documentation only; runtime unchanged |
| 2026-09-30 | **VO-1** — TARGET_ARCHITECTURE, VO-DEC-1-001, resolve VO-Q-001…016, gap disposition, 12 target invariants | Architecture only; runtime unchanged |
| 2026-09-30 | **VO-1.1** — Consistency seal VO-DEC-1-002; pre-activation Vehicle NO; candidate suppression; transfer fail-closed; activation outbox | Architecture only |
| 2026-09-30 | **VO-2** — Persistence foundation migration; compile-only nullable VIN types | Schema + migration; registration paths unchanged |
| 2026-09-30 | **VO-2.1** — Integrity constraints, link history fix, legacy-upgrade harness, VO-2 Postgres CI; nullable VIN display-only compat | Schema migration + tests; VO-3 not started |
| 2026-09-30 | **VO-3** — Provider-neutral orchestrator, adapters, atomic activation TX, readiness authority placeholder, Postgres proofs; **no public cutover** | Runtime module added; legacy registration unchanged |
| 2026-09-30 | **VO-3.1** — Tenant HM isolation, composite VIN fix, readiness fail-closed DI, contract validation, HM consent/history, outbox semantic idempotency | Hardening only; no cutover |
| 2026-09-30 | **VO-3.2** — Secure source attach APIs, private validated attach, Postgres concurrent/wrong-org/rollback proofs, manual idempotency fingerprint, DIMO cutover auth invariant | Hardening only; no cutover |

## VO-0B — REUSE-FIRST components (do not replace without VO-1+ proof)

Count: **14** named reuse targets (plus HM compatibility/signal models as extensions).

1. `Vehicle` — `backend/prisma/schema.prisma`
2. `DimoVehicle` — `backend/prisma/schema.prisma`
3. `HighMobilityVehicle` — `backend/prisma/schema.prisma`
4. `VehicleDataSourceLink` — `backend/prisma/schema.prisma`
5. `VehicleProviderConsent` — `backend/prisma/schema.prisma`
6. `VehicleDrivingCapability` — `backend/prisma/schema.prisma`
7. `VehicleBatteryCapability` — `backend/prisma/schema.prisma`
8. `VehicleTireSetup` — `backend/prisma/schema.prisma`
9. `VehicleBrakeReferenceSpec` — `backend/prisma/schema.prisma`
10. `VehicleBatterySpec` — `backend/prisma/schema.prisma`
11. `VehicleBatteryReferenceCapacity` — `backend/prisma/schema.prisma`
12. `VehicleServiceEvent` — `backend/prisma/schema.prisma`
13. `VehicleStationTransfer` — `backend/prisma/schema.prisma`
14. `HighMobilityCompatibilityRecord` / `HighMobilityCompatibilitySignal` / `HmSignalGroupState` — HM compatibility and signal cache models
