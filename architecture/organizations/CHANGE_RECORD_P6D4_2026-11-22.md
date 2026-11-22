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