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

## P6D4 LIVE PROVIDER DISCONNECT ADAPTERS (append)

- **HM live:** `OrganizationOffboardingHmLiveDisconnectAdapter` — org-scoped `DELETE /v1/fleets/vehicles/{vin}` via existing Health app auth; 409 idempotent; 5xx retry; evidence on `providerEvidence`.
- **DIMO live:** `OrganizationOffboardingDimoLiveDisconnectAdapter` — Identity privileged read + org token compare; **no** fabricated revoke API; `DIMO_PRIVILEGE_STILL_ACTIVE` when developer privilege remains.
- **Disconnect service:** live path when `ORGANIZATION_OFFBOARDING_PROVIDER_DISCONNECT_LIVE=1`; mocks unchanged in test.
- **Evidence:** `architecture/organizations/evidence/P6D4_PROVIDER_LIVE_DISCONNECT_CAPABILITY_2026-11-22.md`.

## P6D4 LIVE PROVIDER SAFETY CLOSEOUT (append)

- DIMO privileged Identity read: full `pageInfo`/`endCursor` pagination; missing `tokenId` / incomplete pages fail-closed; historical-only dependency → `REVIEW_REQUIRED`.
- HM: 409 semantics split (already revoked vs transition conflict); GET confirms terminal `revoked`/`canceled`; cross-tenant VIN gate before DELETE.
- Disconnect service: removed `NO_DEPENDENCY` → `CONFIRMED` upgrade for historical `hadDependency`; `REVIEW_REQUIRED` blocks finalization.

## P6D4 PROVIDER EVIDENCE COMPLETENESS (append)

- DIMO Identity pages require `nodes[]` + `pageInfo.hasNextPage` boolean; broken `dimoVehicle` relation fails-closed.
- HM: `HM_COVERAGE_ASSESSMENT` reconciles active/inactive rows, indirect `synqdriveVehicleId` bindings, and cross-org data-source links; unknown VIN ownership blocks DELETE.

## P6D4 PROVIDER MERGE GATE (append)

- HM mixed direct + indirect + historical coverage → `REVIEW_REQUIRED` (`HM_MIXED_DIRECT_AND_INDIRECT_DEPENDENCY`) before any DELETE.
- Disposable PG evidence: P6D4 finalization 15/15 on `synqdrive_org_offboarding_p6d4`; P6D3 execution 10/10 on `synqdrive_org_offboarding_p6d2`.

## P6D4 DIMO OWNER HANDOFF BACKEND (append)

- **Read-only status:** `GET …/offboarding/dimo-privilege-status` — persisted evidence + org DIMO inventory; no `assessOrganization`, no local quiesce.
- **Privileged recheck:** `POST …/offboarding/dimo-privilege-recheck` — `verifyOrganizationPrivilegedReadOnly` when `ORGANIZATION_OFFBOARDING_DIMO_PRIVILEGE_RECHECK_ENABLED=1` (separate from `ORGANIZATION_OFFBOARDING_PROVIDER_DISCONNECT_LIVE`); failure preserves prior `dimoPrivilegeVerification`.
- **Operator handoff:** `POST …/offboarding/dimo-owner-handoff` — append-only `dimoOwnerHandoffs[]` + transactional `ActivityLog` (`RECORDED` only; not delivery proof).
- **Progress schema:** `dimoPrivilegeVerification`, `dimoOwnerHandoffs` on job `progressJson`.

## P6D4 DIMO HANDOFF PROGRESS CONCURRENCY (append)

- **Merge policy:** `mergeOffboardingProgressPreservingDimoOperatorFields` on execution/finalization lease persists — newer verification + longer handoff list wins.
- **Atomic DIMO writers:** `FOR UPDATE` row lock via `persistDimoPrivilegeVerificationUnderLock` / `persistDimoOwnerHandoffUnderLock`; block when org `ARCHIVED` or job `COMPLETED`.
- **PG evidence:** opt-in `ORGANIZATION_OFFBOARDING_DIMO_PROGRESS_CONCURRENCY_POSTGRES=1` on disposable DBs.