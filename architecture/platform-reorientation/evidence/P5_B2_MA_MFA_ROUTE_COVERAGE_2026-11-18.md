# P5-B2 — Master Admin MFA route coverage (scoped fix)

**Date:** 2026-11-18 (Europe/Berlin)  
**Base `origin/main`:** `5a45add0df4ea08f3e43c6c7c8e7fb6a8a273606`

## Scope (this PR)

Minimal MFA wiring on **confirmed P5-A gaps** — privileged mutations only:

| Controller | Route | Step-up action |
|------------|-------|----------------|
| `VoiceAssistantAdminController` | `POST …/organizations/:orgId/sync` | `MASTER_INTEGRATIONS` |
| `InternalBusinessInsightsController` | `POST run-all` | `MASTER_PLATFORM_SETTINGS` |
| | `POST run/:orgId`, `POST trigger/:orgId`, `PATCH policy/:orgId` | `MASTER_ORGANIZATION` |

GET/read routes unchanged (no `RequireMasterAdminMfa` metadata → guard no-op for reads).

## Admin controller inventory (35 controller classes)

Legend: **PROTECTED** = `MasterAdminMfaGuard` on class and/or step-up on mutations. **READ_ONLY_NO_STEP_UP** = MA RBAC only, read routes. **DOCUMENTED_EXCEPTION** = explicit deferral comment in code.

| # | Controller | MFA guard | Classification (post-PR) |
|---|------------|-----------|--------------------------|
| 1 | `StripeCatalogMappingController` | Yes | PROTECTED |
| 2 | `MasterSubscriptionController` | Yes | PROTECTED |
| 3 | `InternalBusinessInsightsController` | Yes (this PR) | PROTECTED on 4 mutations |
| 4 | `CommunicationOperationalHealthController` | Yes | PROTECTED |
| 5 | `CoreAppServiceClientAdminController` | Yes | PROTECTED |
| 6 | `DimoController` (admin) | Yes | PROTECTED |
| 7 | `HmCompatibilityController` | Partial | MUTATION_REQUIRES_MFA — future slice |
| 8 | `HighMobilityAdminController` | Yes | PROTECTED |
| 9 | `InsurancesController` (admin) | No | MUTATION_REQUIRES_MFA — future slice |
| 10 | `OneautoOemVinLookupEuSuggestionController` | Yes | PROTECTED |
| 11 | `OneautoProviderController` | Yes | PROTECTED |
| 12 | `OrganizationsController` | Yes | PROTECTED |
| 13 | `PlatformEmailController` | Yes | PROTECTED |
| 14 | `PartsAccessoriesController` (admin) | No | MUTATION_REQUIRES_MFA — future slice |
| 15 | `PdiMasterIntelligenceReadController` | No | DOCUMENTED_EXCEPTION (read-only MA intel) |
| 16 | `PhysicalDeviceInventoryController` | Yes | PROTECTED |
| 17 | `PlatformAdminController` | Yes | PROTECTED |
| 18 | `PlatformIntegrationsController` | Yes | PROTECTED |
| 19 | `SecurityGovernanceController` | Yes | PROTECTED |
| 20 | `ProductsController` | Yes | PROTECTED |
| 21 | `VehicleProductGrantAdminController` | Yes | PROTECTED |
| 22 | `ProspectsController` | No | MUTATION_REQUIRES_MFA — future slice |
| 23 | `TwilioTenantProvisioningController` | No | MUTATION_REQUIRES_MFA (provisioning) |
| 24 | `TireWearV3CalibrationShadowMasterReadController` | No | DOCUMENTED_EXCEPTION (read-only) |
| 25 | `ApdsMasterIntelligenceReadController` | No | DOCUMENTED_EXCEPTION (read-only) |
| 26 | `VsiMasterFsdReadController` | No | DOCUMENTED_EXCEPTION (read-only) |
| 27 | `VsiMasterIntelligenceReadController` | No | DOCUMENTED_EXCEPTION (read-only) |
| 28 | `VehicleOnboardingOffboardController` | Yes | PROTECTED |
| 29 | `VehicleOnboardingProviderCandidateController` | Yes | PROTECTED |
| 30 | `VehicleOnboardingSourceAdoptionController` | Yes | PROTECTED |
| 31 | `VoiceControlPlaneAdminController` | Yes | PROTECTED |
| 32 | `ElevenlabsTwilioImportController` | No | MUTATION_REQUIRES_MFA — future slice |
| 33 | `VoiceAssistantAdminController` | Yes (this PR) | PROTECTED on sync mutation |
| 34 | `VoiceBillingAdminController` | No | MUTATION_REQUIRES_MFA — future slice |
| 35 | `VoiceProtectionController` | No | MUTATION_REQUIRES_MFA — future slice |

**Count post-PR:** 21 PROTECTED (class-level MFA guard), 5 DOCUMENTED_EXCEPTION (read-only intelligence), 9 deferred MUTATION_REQUIRES_MFA (out of scope for P5-B2).

## Tests

- `voice-assistant-admin.mfa.http-security.spec.ts`
- `internal-business-insights.mfa.http-security.spec.ts`
- Updated `voice-assistant.controller.security.characterization.spec.ts`

## Registry

**REGISTRY_REVIEWED:** platform-reorientation evidence only — **UNCHANGED** (no module authority promotion).