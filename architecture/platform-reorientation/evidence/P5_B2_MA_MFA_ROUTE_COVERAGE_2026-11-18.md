# P5-B2 — Master Admin MFA route coverage (scoped fix)

**Date:** 2026-11-18 (Europe/Berlin)  
**Base `origin/main` (initial slice):** `5a45add0df4ea08f3e43c6c7c8e7fb6a8a273606`  
**Merged initial slice:** PR #2428 @ `57df0449b`  
**Remaining slice (this PR):** eight named controllers — see § Remaining slice

## Scope (PR #2428 — merged)

Minimal MFA wiring on **confirmed P5-A gaps** — privileged mutations only:

| Controller | Route | Step-up action |
|------------|-------|----------------|
| `VoiceAssistantAdminController` | `POST …/organizations/:orgId/sync` | `MASTER_INTEGRATIONS` |
| `InternalBusinessInsightsController` | `POST run-all` | `MASTER_PLATFORM_SETTINGS` |
| | `POST run/:orgId`, `POST trigger/:orgId`, `PATCH policy/:orgId` | `MASTER_ORGANIZATION` |

GET/read routes unchanged (no `RequireMasterAdminMfa` metadata → guard no-op for reads).

## Scope (remaining slice — eight controllers)

**Inventory reconciliation:** P5-B2 evidence previously stated **9 deferred** `MUTATION_REQUIRES_MFA` rows while listing **eight** controller names (HmCompatibility, Insurances admin, PartsAccessories admin, Prospects, Twilio tenant provisioning, ElevenLabs Twilio import, Voice billing admin, Voice protection admin). No ninth controller exists in the 35-class inventory — the **9** was a counting error (8 deferred + 1 partial `HmCompatibility` mis-tagged). This slice closes exactly those **eight** classes.

| Controller | Mutations vs reads | Wiring |
|------------|-------------------|--------|
| `HighMobilityCompatibilityController` | **Read-only** GETs | Class `MasterAdminMfaGuard` only |
| `VoiceBillingAdminController` | **Read-only** GETs | Class `MasterAdminMfaGuard` only |
| `InsurancesAdminController` | POST/PUT/PATCH/DELETE catalog | Class guard + `MASTER_PLATFORM_SETTINGS` |
| `PartsAccessoriesAdminController` | POST/PUT/PATCH/DELETE catalog | Class guard + `MASTER_PLATFORM_SETTINGS` |
| `ProspectsController` | MA prospect mutations | Class guard + `MASTER_PLATFORM_SETTINGS` |
| `TwilioTenantProvisioningController` | Provisioning mutations | Class guard + `MASTER_INTEGRATIONS` |
| `ElevenlabsTwilioImportController` | Import mutations | Class guard + `MASTER_INTEGRATIONS` |
| `VoiceProtectionAdminController` | `POST …/organizations/:orgId/overrides` | Class guard; step-up `MASTER_ORGANIZATION` on override POST only |

Org-scoped rental routes in shared modules (non-MA) unchanged.

## Admin controller inventory (35 controller classes) — reconciled

Legend: **PROTECTED** = `MasterAdminMfaGuard` on class and/or step-up on mutations. **READ_ONLY_NO_STEP_UP** = MA RBAC + class MFA guard, no mutation step-up metadata. **DOCUMENTED_EXCEPTION** = explicit deferral comment in code (read-only MA intelligence).

| # | Controller | MFA guard | Classification (post–remaining slice) |
|---|------------|-----------|--------------------------------------|
| 1 | `StripeCatalogMappingController` | Yes | PROTECTED |
| 2 | `MasterSubscriptionController` | Yes | PROTECTED |
| 3 | `InternalBusinessInsightsController` | Yes | PROTECTED on 4 mutations |
| 4 | `CommunicationOperationalHealthController` | Yes | PROTECTED |
| 5 | `CoreAppServiceClientAdminController` | Yes | PROTECTED |
| 6 | `DimoController` (admin) | Yes | PROTECTED |
| 7 | `HighMobilityCompatibilityController` | Yes | READ_ONLY_NO_STEP_UP |
| 8 | `HighMobilityAdminController` | Yes | PROTECTED |
| 9 | `InsurancesAdminController` | Yes | PROTECTED (`MASTER_PLATFORM_SETTINGS`) |
| 10 | `OneautoOemVinLookupEuSuggestionController` | Yes | PROTECTED |
| 11 | `OneautoProviderController` | Yes | PROTECTED |
| 12 | `OrganizationsController` | Yes | PROTECTED |
| 13 | `PlatformEmailController` | Yes | PROTECTED |
| 14 | `PartsAccessoriesAdminController` | Yes | PROTECTED (`MASTER_PLATFORM_SETTINGS`) |
| 15 | `PdiMasterIntelligenceReadController` | No | DOCUMENTED_EXCEPTION (read-only MA intel) |
| 16 | `PhysicalDeviceInventoryController` | Yes | PROTECTED |
| 17 | `PlatformAdminController` | Yes | PROTECTED |
| 18 | `PlatformIntegrationsController` | Yes | PROTECTED |
| 19 | `SecurityGovernanceController` | Yes | PROTECTED |
| 20 | `ProductsController` | Yes | PROTECTED |
| 21 | `VehicleProductGrantAdminController` | Yes | PROTECTED |
| 22 | `ProspectsController` | Yes | PROTECTED (`MASTER_PLATFORM_SETTINGS`) |
| 23 | `TwilioTenantProvisioningController` | Yes | PROTECTED (`MASTER_INTEGRATIONS`) |
| 24 | `TireWearV3CalibrationShadowMasterReadController` | No | DOCUMENTED_EXCEPTION (read-only) |
| 25 | `ApdsMasterIntelligenceReadController` | No | DOCUMENTED_EXCEPTION (read-only) |
| 26 | `VsiMasterFsdReadController` | No | DOCUMENTED_EXCEPTION (read-only) |
| 27 | `VsiMasterIntelligenceReadController` | No | DOCUMENTED_EXCEPTION (read-only) |
| 28 | `VehicleOnboardingOffboardController` | Yes | PROTECTED |
| 29 | `VehicleOnboardingProviderCandidateController` | Yes | PROTECTED |
| 30 | `VehicleOnboardingSourceAdoptionController` | Yes | PROTECTED |
| 31 | `VoiceControlPlaneAdminController` | Yes | PROTECTED |
| 32 | `ElevenlabsTwilioImportController` | Yes | PROTECTED (`MASTER_INTEGRATIONS`) |
| 33 | `VoiceAssistantAdminController` | Yes | PROTECTED on sync mutation |
| 34 | `VoiceBillingAdminController` | Yes | READ_ONLY_NO_STEP_UP |
| 35 | `VoiceProtectionAdminController` | Yes | PROTECTED (`MASTER_ORGANIZATION` on override POST) |

**Count post–remaining slice:** 28 PROTECTED (mutation step-up and/or full class guard coverage), 2 READ_ONLY_NO_STEP_UP (class guard, no step-up metadata), 5 DOCUMENTED_EXCEPTION (read-only intelligence), **0** deferred `MUTATION_REQUIRES_MFA` in the 35-class MA admin inventory.

**Remaining exceptions (by design):** Five read-only MA intelligence controllers keep DOCUMENTED_EXCEPTION comments (no MFA framework change). Runtime MFA still gated by existing feature flags — this work is route metadata/guard wiring only (`NO_MFA_ACTIVATION`).

## Tests

- PR #2428: `voice-assistant-admin.mfa.http-security.spec.ts`, `internal-business-insights.mfa.http-security.spec.ts`
- Remaining slice: `master-admin-remaining-mfa.coverage.spec.ts` (metadata + HTTP regression for Prospects, Twilio preview, VoiceProtection override)

## Registry

**REGISTRY_REVIEWED:** platform-reorientation evidence only — **UNCHANGED** (no module authority promotion).