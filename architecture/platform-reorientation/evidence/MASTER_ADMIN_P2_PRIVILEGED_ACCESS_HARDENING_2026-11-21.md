# P2 — Master Admin privileged access hardening

**Date:** 2026-11-21 (Europe/Berlin)  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Base `main`:** `2ca8e7083745113075fe089e72f8a29adaf9bb18`  
**Mode:** read-first, minimal remediation, no deploy, no production writes

## Step 1 — MFA route reconciliation

P5-B2 **35-class** inventory remains **0 deferred `MUTATION_REQUIRES_MFA`** per [`P5_B2_MA_MFA_ROUTE_COVERAGE_2026-11-18.md`](P5_B2_MA_MFA_ROUTE_COVERAGE_2026-11-18.md).

**Out-of-inventory confirmed gap (remediated in this PR):**

| Controller | Route | Guards (before) | Required privilege | Defect | Evidence |
|------------|-------|-----------------|-------------------|--------|----------|
| `BillingEmailDeliveryController` | `POST admin/billing/email-deliveries/:id/replay` | `RolesGuard`, `@Roles('MASTER_ADMIN')` | `MASTER_ADMIN` | Missing `MasterAdminMfaGuard` + `MASTER_BILLING` step-up when MFA flags on | `billing-email-delivery.mfa.http-security.spec.ts` |
| `BillingEmailDeliveryController` | `POST admin/billing/email-deliveries/:id/resend` | same | same | same | same |

**Documented out-of-inventory gaps (not remediated — policy / scope):**

| Surface | Notes |
|---------|--------|
| `SupportController` admin/master ticket mutations | Not in 35-class inventory; support desk operations — **owner decision** on step-up action |
| `VehiclesController` admin HV spec + exterior image mutations | Not in 35-class inventory; content/catalog mutations — align with `MASTER_PLATFORM_SETTINGS` if wired |
| `VsiSignalProfileInspectionController` `POST …/materialize` | Internal certification rematerialization — treat as intel/ops exception unless policy extends MFA |

Intentional **read-only** MA surfaces (integrations admin GETs, P5 `DOCUMENTED_EXCEPTION` intel controllers) are **not** classified as vulnerabilities.

## Step 2 — Billing delegation

| Check | Result |
|-------|--------|
| `MasterBillingGuard` | Allows `MASTER_ADMIN` or JWT `platformPermissions` containing `master-billing` |
| `MasterAdminMfaGuard` | **Passes through** when `platformRole !== MASTER_ADMIN` (lines 61–63) |
| `MasterSubscriptionController` | `MasterBillingGuard` + `MasterAdminMfaGuard` + `MASTER_SUBSCRIPTION` step-up on class |
| Delegate MFA on billing mutations | **By design today:** delegates satisfy billing guard but **do not** receive master-admin MFA step-up |

**OWNER_DECISION_REQUIRED:** Should delegated `master-billing` operators require an independent MFA/step-up policy (e.g. enrollment + step-up for non-`MASTER_ADMIN` principals)? No speculative implementation in this workstream.

## JWT permission provenance

`platformPermissions` are copied from signed JWT claims in `AuthGuard.validateJwt` (`decoded.platformPermissions ?? []`). Delegation is granted only when the token includes `master-billing`; guards do not infer permissions from tenant membership roles.

## Tenant isolation

Master billing routes use path-scoped `orgId` and `MasterBillingGuard` (rejects tenant `ORG_ADMIN` / workers). Characterization: `master-subscription.controller.security.spec.ts`, `billing.permissions.matrix.spec.ts`, `billing.controller.security.characterization.spec.ts`.

## Tests (disposable / unit)

- `billing-email-delivery.mfa.http-security.spec.ts` (new)
- `master-subscription.controller.security.spec.ts` (guard metadata + delegate MFA characterization)
- Existing: `master-admin-mfa.guard.spec.ts`, `master-admin-remaining-mfa.coverage.spec.ts`, `billing.permissions.matrix.spec.ts`

## Registry

**REGISTRY_REVIEWED:** evidence-only update — **UNCHANGED** (no module authority promotion).