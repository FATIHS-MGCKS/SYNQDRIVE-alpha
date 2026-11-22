# Production ↔ Repository frontend drift reconciliation

| Field | Value |
|-------|-------|
| **Operation** | `SYNQDRIVE_FEUX_P7_PR2492_FINAL_EVIDENCE_RECONCILIATION` |
| **Reconciled at (UTC)** | `2026-11-22T18:30:00Z` |
| **Method** | Local read-only `git diff --name-only` (full tree, not GitHub compare UI) |

## Baselines

| Label | SHA |
|-------|-----|
| `PRODUCTION_RELEASE_SHA` | `1e6a267c8c7951e2a11633e89ab96714844ea846` |
| `REPOSITORY_UI_AUDIT_SHA` | `413175e8ca72355764a3d47936ad7eff78d415aa` |
| `AUTHORITY_MERGE_SHA` | `874f69e61bbed8465c5e94cd88d91408ee281acc` |

## Executive summary

| Comparison | `frontend/` path changes | Runtime impact |
|------------|--------------------------|----------------|
| Production → UI audit (`1e6a267c` → `413175e8c`) | **91 files** | **NOT_DEPLOYED** — Production bundle built from older commit |
| UI audit → authority merge (`413175e8c` → `874f69e6`) | **0 files** | **None** — #2490 + P7 are documentation-only on `main` |
| Production → `main` (`1e6a267c` → `874f69e6`) | **91 files** (same as first row) | Same **NOT_DEPLOYED** UI delta |

**Vite / package / root entry:** `git diff --name-only` reports **no** changes between Production and UI audit for `frontend/vite.config.ts`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/index.html`, `frontend/src/App.tsx`, `frontend/src/main.tsx`, or `frontend/src/styles/theme.css` in the counted 91-file set (those paths absent from diff list).

**Epistemic rule:** Repository claims about UI behavior at `413175e8c` / inventories describe **repository intent**, **not** Production-confirmed runtime until deploy proves otherwise.

## Area breakdown (Production → `413175e8c`)

| Area | Files | Notes |
|------|-------|-------|
| `frontend/src/master/**` | 61 | Org IAM, product-management, core-app-service-clients, nav, connected vehicles |
| `frontend/src/i18n/**` | 21 | Locales + master org + rental misuse stress keys |
| `frontend/src/rental/**` | 6 | Misuse/stress UI, invoice relations tests |
| `frontend/src/components/**` | 1 | `MfaStepUpDialog.tsx` |
| `frontend/src/lib/api.ts` | 1 | Shared client surface |
| `frontend/e2e/**` | 1 | Operator fixture |
| **Operator-only paths** | 0 | No operator TS drift in this window |

**Routing-relevant (repository, NOT_DEPLOYED on Production):** `frontend/src/master/App.tsx`, `master/navigation/*` — included in Master count.

## Deployed artifact identity (Production-confirmed)

Independent of source-commit attestation:

| Asset | Identity | Epistemic |
|-------|----------|-----------|
| JS | `index-Cn8n4pFR.js` sha256 `21e7538efc245f75fe69838889702df3134ec8ae164c18186517996aca92c87b` | CONFIRMED (disk + HTTP) |
| CSS | `index-DmctIvoe.css` sha256 `f7cf69a84a9135e4ad3889373f0f1a5d672f5b07d4152819d726c46999d84284` | CONFIRMED |

## Frontend source commit on Production

| Claim | Epistemic |
|-------|-----------|
| Backend release directory git HEAD = `1e6a267c` | **CONFIRMED** (`git -C /opt/synqdrive/current`) |
| Frontend **source** commit equals `1e6a267c` | **INFERRED** — monolith VPS release; `backend/public` co-located; **no** independent build manifest / `SOURCE_COMMIT` file observed |
| Frontend built from `413175e8c` or `874f69e6` | **CONTRADICTED** by release SHA + asset build date `2026-11-11` |

Do **not** upgrade `PRODUCTION_FRONTEND_SOURCE_SHA` to CONFIRMED without deploy-time build attestation (e.g. embedded commit in CI artifact metadata).

## Complete path list (91)

Reproduce:

```bash
git diff --name-only 1e6a267c8c7951e2a11633e89ab96714844ea846..413175e8ca72355764a3d47936ad7eff78d415aa -- frontend/
```

Appendix (frozen at reconciliation):

```
frontend/e2e/operator-fixtures.ts
frontend/src/components/mfa/MfaStepUpDialog.tsx
frontend/src/i18n/translations/cs.ts
frontend/src/i18n/translations/de.ts
frontend/src/i18n/translations/en.ts
frontend/src/i18n/translations/es.ts
frontend/src/i18n/translations/fr.ts
frontend/src/i18n/translations/it.ts
frontend/src/i18n/translations/master.organizations.cs.ts
frontend/src/i18n/translations/master.organizations.de.ts
frontend/src/i18n/translations/master.organizations.en.ts
frontend/src/i18n/translations/master.organizations.es.ts
frontend/src/i18n/translations/master.organizations.fr.ts
frontend/src/i18n/translations/master.organizations.it.ts
frontend/src/i18n/translations/master.organizations.nl.ts
frontend/src/i18n/translations/master.organizations.pl.ts
frontend/src/i18n/translations/master.organizations.tr.ts
frontend/src/i18n/translations/nl.ts
frontend/src/i18n/translations/pl.ts
frontend/src/i18n/translations/rental.misuseStress.de.ts
frontend/src/i18n/translations/rental.misuseStress.en.ts
frontend/src/i18n/translations/rental.misuseStress.stressGate.i18n.ts
frontend/src/i18n/translations/tr.ts
frontend/src/lib/api.ts
frontend/src/master/App.tsx
frontend/src/master/components/OrganizationDetailView.tsx
frontend/src/master/components/OrganizationLifecycleSettings.test.tsx
frontend/src/master/components/OrganizationLifecycleSettings.tsx
frontend/src/master/components/OrganizationsView.tsx
frontend/src/master/components/organization-products/OrganizationProductsTab.grant-stale.test.ts
frontend/src/master/components/organization-products/OrganizationProductsTab.test.tsx
frontend/src/master/components/organization-products/OrganizationProductsTab.tsx
frontend/src/master/components/organization-products/ProductManagementView.test.tsx
frontend/src/master/components/organization-products/ProductManagementView.tsx
frontend/src/master/components/organization-products/ProductRoadmapOverview.tsx
frontend/src/master/components/organization-products/product-management-mutations.test.ts
frontend/src/master/components/organization-products/product-management-mutations.ts
frontend/src/master/components/organization-products/product-management-org-list.test.ts
frontend/src/master/components/organization-products/product-management-org-list.ts
frontend/src/master/components/organization-products/product-management-org-vehicles.test.ts
frontend/src/master/components/organization-products/product-management-org-vehicles.ts
frontend/src/master/components/organization-products/product-management-post-mutation-sync.test.ts
frontend/src/master/components/organization-products/product-management-sync-errors.test.ts
frontend/src/master/components/organization-products/product-management-sync-errors.ts
frontend/src/master/connected-vehicles/ConnectedVehiclesHub.tsx
frontend/src/master/core-app-service-clients/CoreAppServiceClientsHub.test.tsx
frontend/src/master/core-app-service-clients/CoreAppServiceClientsHub.tsx
frontend/src/master/core-app-service-clients/core-app-service-clients-hub.test.ts
frontend/src/master/core-app-service-clients/core-app-service-clients-i18n.ts
frontend/src/master/core-app-service-clients/core-app-service-clients-ui.test.ts
frontend/src/master/core-app-service-clients/known-scopes.ts
frontend/src/master/core-app-service-clients/types.ts
frontend/src/master/core-app-service-clients/useCoreAppServiceClients.refresh.test.ts
frontend/src/master/core-app-service-clients/useCoreAppServiceClients.ts
frontend/src/master/navigation/master-nav-i18n.ts
frontend/src/master/navigation/master-nav-product-management.test.ts
frontend/src/master/navigation/master-nav-url.test.ts
frontend/src/master/navigation/master-nav-url.ts
frontend/src/master/navigation/master-nav.config.ts
frontend/src/master/navigation/master-nav.types.ts
frontend/src/master/oneauto/OneAutoServiceDialog.tsx
frontend/src/master/organizations/MasterOrganizationIamTab.tsx
frontend/src/master/organizations/master-app-create-refresh-flow.test.ts
frontend/src/master/organizations/master-app-mfa-iam-orchestration.test.ts
frontend/src/master/organizations/master-organization-iam-mutation.ts
frontend/src/master/organizations/master-organization-iam.contract.test.ts
frontend/src/master/organizations/master-organization-lifecycle.policy.test.ts
frontend/src/master/organizations/master-organization-lifecycle.policy.ts
frontend/src/master/organizations/master-organization-patch.test.ts
frontend/src/master/organizations/master-organization-patch.ts
frontend/src/master/organizations/organizations-operational-create-outcome.test.ts
frontend/src/master/organizations/organizations-operational-create-outcome.ts
frontend/src/master/organizations/organizations-operational-refresh.test.tsx
frontend/src/master/organizations/organizations-operational-refresh.tsx
frontend/src/master/organizations/product-management.policy.test.ts
frontend/src/master/organizations/product-management.policy.ts
frontend/src/master/organizations/product-management.types.ts
frontend/src/master/organizations/types.ts
frontend/src/master/organizations/useMasterOrganizationIam.ts
frontend/src/master/organizations/useMasterOrganizationIamMutations.test.ts
frontend/src/master/organizations/useMasterOrganizationIamMutations.ts
frontend/src/master/organizations/useMasterOrganizationPatch.test.ts
frontend/src/master/organizations/useMasterOrganizationPatch.ts
frontend/src/master/organizations/useOrganizationsOperational.refresh-strict.test.ts
frontend/src/master/organizations/useOrganizationsOperational.ts
frontend/src/rental/components/RentalStressAnalysisCard.tsx
frontend/src/rental/components/booking-detail/BookingUsageMisuseTab.tsx
frontend/src/rental/components/invoices/InvoiceRelations.test.tsx
frontend/src/rental/components/invoices/invoiceRelations.mapper.test.ts
frontend/src/rental/lib/rental-assessment-score.test.ts
frontend/src/rental/lib/rental-assessment-score.ts
```

Evidence ID: **FEUX-EVID-PROD-DRIFT-2026-11-22**