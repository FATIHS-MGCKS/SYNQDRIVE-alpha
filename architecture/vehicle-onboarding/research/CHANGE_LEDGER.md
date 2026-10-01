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
| 2026-09-30 | **VO-4** — Readiness profile engine, snapshot V2, input fingerprint seal, stale-seal protection, production readiness authority; no public cutover | Internal readiness only |
| 2026-09-30 | **VO-4.5** — Technical baseline draft V2, materializable readiness rules, activation TX materialization (brake + HV reference); tire reference blocked; no public cutover | Onboarding activation + readiness; tire reference gap documented |
| 2026-09-30 | **VO-4.6** — Strict V2 runtime validation, brake readiness/activation parity, battery document scope, VO-3 PG isolation, concurrent baseline proof | Integrity/tests only; no public capture API |
| 2026-09-30 | **VO-4.8** — Authenticated org-scoped capture API, concurrency token mutations, readiness evaluate/seal HTTP boundary; no activation/source-adoption HTTP | `VehicleOnboardingCaptureController`; module remains `AUDIT_IN_PROGRESS` |
| 2026-09-30 | **VO-4.8.1** — Strict capture payload allowlists, explicit concurrency token contract, list-query runtime validation, audit-after-commit, PostgreSQL concurrent race proofs | Capture policy + service hardening only; no schema/migration; module remains `AUDIT_IN_PROGRESS` |
| 2026-09-30 | **VO-4.8.2** — Capture HTTP mapper wraps all request parsing; non-object body guard; readiness body allowlists; strict limit query integers; controller HTTP boundary tests; pre-activation audit `ADMIN_OPERATION` | HTTP contract only; no runtime semantics change |
| 2026-10-01 | **VO-4.9** — Master Admin source adoption HTTP; global advisory source-claim lock; cross-org + canonical suppression; platform-trusted DIMO; attach concurrency/readiness; HM evidence refresh token rotation; no schema migration | `VehicleOnboardingSourceAdoptionController`; legacy registration unchanged |
| 2026-10-01 | **VO-4.9.1** — Primary-only adopt resume; multi-holder integrity conflict; same-mirror attach identity; org validation inside claim tx; activation-time provider revalidation; dedicated attach/capture/seal race proofs | Integrity closure only; no schema migration |
| 2026-10-01 | **VO-4.9.2** — Activation-time DIMO/HM source snapshot identity continuity (VIN/external id/contract drift); no auto-refresh | DB mirror compare only; no schema migration |

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
