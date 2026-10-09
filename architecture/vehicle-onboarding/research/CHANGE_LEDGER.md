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
| 2026-10-01 | **VO-4.10** — Master Admin provider candidate discovery projection (DIMO + HM); read-only; no VehicleCandidate entity | Adoption HTTP unchanged; no legacy cutover |
| 2026-10-01 | **VO-4.10.1** — provider-aware combined pagination cursor + postgres pagination/multi-holder integrity seal | Raw mirror UUID cursors removed; COMBINED `m/p/i` cursor; no adoption semantic change |
| 2026-10-01 | **VO-5A.1** — integrity seal: semantic outbox replay, assignment close, DIMO scheduler/processor OFFBOARDED gate, provider-link + HM canonical gates, consent revoke, actor in outbox v2 | PR #1874 |
| 2026-10-09 | **VO5C-R2** — VPS security-floor rollback guard (`VO5C_UNSAFE_ROLLBACK_DENIED`); isolated Prisma battery/APDS ordering harness; deploy executor bootstrap notes | Ops scripts only; no production deploy; security floor ref `39775cbb` |
| 2026-10-09 | **VO5C-R2-H1** — Immutable floor pin; fail-closed guard load; S4F7Q uses candidate replica lib; PM2 resurrect disabled; production-faithful migration fixture | Ops/test scripts only; no production deploy |
| 2026-10-09 | **VO5C-R2-H2** — Pinned R2 executor preflight/runner; executor selection simulation; shallow-only ancestry reconstruction; bootstrap + shallow selftests | First VO5C promotion must not use unprotected `/current` executor; no production deploy |
| 2026-10-09 | **VO5C-R2-H3** — Mandatory deploy target admission; executor tree integrity; genuine depth-1 shallow tests; S4F7Q positive preflight | Direct `vps-deploy-release.sh` cannot bypass VO5C target floor before migrations |
| 2026-10-09 | **VO5C-R2-H4** — Legacy `/current` executor warns only; pinned R2 preflight pass | First-deploy production has old current present; execution remains pinned-only |
| 2026-10-01 | **VO-5A** — offboarding audit + internal `VehicleOffboardingService` (ACTIVE→OFFBOARDED + outbox); legacy deregister unchanged | Must deprecate hard-delete deregister before cutover |
| 2026-10-01 | **VO-5B** — Registry `VEHICLE_OFFBOARDED` outbox → Billing quantity bridge; billable policy registry lifecycle; scheduler worker; no public HTTP / no Stripe in consumer | Billing projection idempotent; `VEHICLE_ACTIVATED` bridge deferred |
| 2026-10-02 | **VO-5B.1** — Integrity seal: event-time base item/assignment/ledger authority; outbox claim/CAS; preserve unhandled lifecycle events; VO-5B PostgreSQL CI | PR #1883 |
| 2026-10-02 | **VO-5B.2** — Temporal seal: org status + post-event assignment/exclusion cannot rewrite T1 prestate; quantity ledger primary; `createdAt` boundary | PR #1883 |
| 2026-10-02 | **VO-5B.3** — Base plan temporal seal: subscription/item `createdAt` bounds on `resolveBaseSubscriptionItemAsOf` | PR #1883 |
| 2026-10-07 | **VO5B-AB1** — `VEHICLE_ACTIVATED` registry outbox → `VEHICLE_CONNECTED` billing quantity; event-time `occurredAt`; deterministic idempotency; PostgreSQL proofs; no schema/migration | Activation billing bridge; legacy provision hooks unchanged |
| 2026-10-07 | **VO5C-P1** — Master Admin `POST …/offboard` HTTP; MFA + org scope; operational preflight; idempotent `VehicleOffboardingService`; legacy deregister/DELETE unchanged; no frontend | `AUDIT_IN_PROGRESS`; P2 cutover + `LEGACY_DEREGISTER_SECURITY_GAP` remains open |
| 2026-10-07 | **VO5C-P1.1** — Replay-before-preflight ordering; registry ACTIVE admission gates (booking/handover/trip start); concurrency/replay PostgreSQL proofs | Admission invariant for new operational state; historical finalization unchanged |
| 2026-10-08 | **VO5C-P2A** — Connected Vehicles UI offboard cutover; `api.vehicleOnboarding.offboardVehicle`; MFA + stable idempotency; lifecycle badges; server `registryLifecycle` filter; legacy backend routes unchanged | `AUDIT_IN_PROGRESS`; P2B lockdown + production route verification still required |
| 2026-10-08 | **VO5C-P2B1** — Legacy `POST admin/vehicles/:vehicleId/deregister` fail-closed **409** `LEGACY_VEHICLE_DESTRUCTION_DISABLED`; `MASTER_ADMIN` + `MASTER_INTEGRATIONS` MFA; `VehiclesService.deregister` retired; zero mutation; tenant DELETE + prune unchanged | `AUDIT_IN_PROGRESS`; P2B2–P2B4 + production route verification remain |
| 2026-10-08 | **VO5C-P2B2** — Removed `api.vehicles.deregister` frontend client; repo-wide negative tests; canonical offboard client unchanged; org-scoped delete wrapper retained (P2B3) | `AUDIT_IN_PROGRESS`; P2B3 DELETE lockdown + P2B4 prune review remain |
| 2026-10-08 | **VO5C-P2B3** — Tenant org-scoped and direct `DELETE` vehicle routes fail-closed **409**; `VehiclesService.delete` retired; guards preserved | `AUDIT_IN_PROGRESS`; P2B4 remediation continues |
| 2026-10-08 | **VO5C-P2B4-0** — Emergency containment: HTTP/CLI/service platform prune fail-closed `PLATFORM_PRUNE_DISABLED`; no env override; replacement prune not implemented | `AUDIT_IN_PROGRESS`; `SECURITY_REMEDIATION_IN_PROGRESS` |
| 2026-10-09 | **VO5C-P4A** — Default-OFF server admission guard for canonical offboard HTTP; release SHA + route-verified attestation; requires `IAM_MFA_MASTER_ADMIN_ENABLED`; dual frontend UI gate; HTTP+Postgres security matrix; operator runbook | No production activation; `AUDIT_IN_PROGRESS` |

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
