# CHANGE_RECORD — P6D4 Organization offboarding archival finalization

**Operation:** `SYNQDRIVE_ORGANIZATIONS_P6D4_FINAL_OFFBOARDING_ARCHIVAL`  
**Base SHA:** `86e76a6ee69ca74bbda62726bc704b2d1a041043`

## CHANGE

- **ARCHIVED guard** — generic admin org status PATCH cannot set `ARCHIVED` or reactivate archived orgs
- **Routine polling** — shared `organization-routine-polling.policy`; DIMO snapshot scheduler/processor, DTC fan-out/processor, HM health scheduler revalidate org eligibility (SUSPENDED blocks routine; in-flight trip detection allowed)
- **Provider disconnect** — `OrganizationOffboardingProviderDisconnectService` with mock/env external outcomes; local quiesce ≠ external confirmation
- **Finalization** — `OrganizationOffboardingFinalizationService` + `POST …/offboarding/finalize` (MASTER_ADMIN + MFA); job `COMPLETED`, org `ARCHIVED`; production fail-closed via `ORGANIZATION_OFFBOARDING_FINALIZATION_ENABLED=1`
- **Provider admission** — `LOCAL_QUIESCE_CONFIRMED` removed from archive-ready gate

## NON-EFFECTS

- No hard delete; no Stripe cancellation; no production provider live calls (mock/disabled by default); no `OFFBOARDED` org status

## EVIDENCE (repository)

- Unit: `organization-*-p6d4*.spec.ts`, provider disconnect, admin status, routine polling
- PG (opt-in): `organization-offboarding-finalization.postgres.integration.spec.ts` (`ORGANIZATION_OFFBOARDING_FINALIZATION_POSTGRES=1`)

## PRODUCTION ACTIVATION

Not certified from mocked provider tests. Separate owner approval required for `ORGANIZATION_OFFBOARDING_FINALIZATION_ENABLED` and live `ORGANIZATION_OFFBOARDING_PROVIDER_DISCONNECT_LIVE`.

## P6D4 FINALIZATION SAFETY CLOSEOUT (append)

- Provider mocks gated: `NODE_ENV=test` or `ORGANIZATION_OFFBOARDING_PROVIDER_MOCK_ALLOWED=1` only; production ignores `ORGANIZATION_OFFBOARDING_MOCK_*`
- HM dependency: historical `VehicleDataSourceLink` + `HighMobilityVehicle` rows
- DimoVehicle disconnect org-exclusive (no cross-tenant connection mutation)
- Finalize lease/fencing + crash recovery via expired lease release; final commit revalidation
- PG scenarios A–H on disposable DB (`synqdrive_org_offboarding_p6d2` / `p6d4`)

## P6D4 FINAL COMMIT INTEGRITY CLOSEOUT (append)

- **Org-wide trip safety:** `organizationWideOngoingTrips` preflight option; finalize assess counts ONGOING trips on all org vehicles (incl. OFFBOARDED); execution SUSPEND keeps `suspendAdmissionOnly`.
- **Final commit atomicity:** `assertArchivalCommitHardBlockers` inside archival transaction (advisory lock + row lock); no out-of-tx preflight snapshot at commit.
- **Durable audit:** `ActivityLog` row created in same transaction as ARCHIVED/COMPLETED; `archived.auditActivityLogId` on job progress; post-commit `MasterAdminAuditService.record` best-effort only.
- **PG Integrity A–D** appended to `organization-offboarding-finalization.postgres.integration.spec.ts` (12/12 incl. legacy A–H).

## P6D4 CONCURRENCY CERT (append)

**Booking admission:** Tenant HTTP already denied via `OrgScopingGuard` + `assertOrganizationAllowsTenantSurface` (`ORGANIZATION_LIFECYCLE_DENIED` on SUSPENDED/ARCHIVED). Service-layer create now shares `organizationOffboardingFinalizeLockKey` through `fenceOrganizationOperationalAdmission` (serializes with archival commit).

**Trip admission:** New `ONGOING` trips only via `TripDecisionEngine.createTrip` (registry ACTIVE + org fence). SUSPENDED allows in-flight trip *completion* polling only (`organization-routine-polling.policy`).

**Archival commit:** `assertArchivalCommitHardBlockers` runs before durable audit and again immediately before `ARCHIVED` update inside the same transaction.

**PG Concurrency Cert:** three disposable scenarios (fence, finalize vs bypass booking, trip start on SUSPENDED).