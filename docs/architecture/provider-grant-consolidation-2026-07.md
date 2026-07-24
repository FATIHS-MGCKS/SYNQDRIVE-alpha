# Provider Access Grant Consolidation (Prompt 26)

**Date:** 2026-07-24  
**Version:** V4.9.809  
**Migration:** `20260724070000_provider_grant_webhook_idempotency`

## Goal Hierarchy

```
ProviderAccessGrant (technical prerequisite)
  → ProcessingActivity
  → LegalBasisAssessment
  → EnforcementPolicy
```

Provider grants are **not** legal basis. Token status is **never** interpreted as authorization.

## Source of Truth

| Layer | Model | Role |
|-------|-------|------|
| Technical provider access | `ProviderAccessGrant` + `ProviderAccessGrantScope` | Canonical grant for enforcement |
| Legacy mirror | `VehicleProviderConsent` | Controlled migration bridge via `legacyVehicleProviderConsentId` |
| Legal processing | `ProcessingActivity` + `LegalBasisAssessment` | Juridical stack |
| Enforcement | `EnforcementPolicy` | Operational gate |
| Immediate deny | `DataAuthorizationDenySwitch` | Fail-closed on revoke/suspend |
| Revocation | `DataAuthorizationRevocationWorkflow` | Provider revoke step visible in orchestrator |

**Rule:** No two contradictory truths. Provider ACTIVE + Policy REVOKED → DENY. Provider REVOKED + Policy ACTIVE → DENY.

## Provider Status

| Status | Meaning |
|--------|---------|
| `PENDING` | Created, not yet technically verified |
| `ACTIVE` | Provider access confirmed for linked vehicle(s) |
| `REVOKED` | Access withdrawn (webhook, orchestrator, or manual revoke) |
| `EXPIRED` | Grant `expiresAt` reached (distinct from token expiry) |

`tokenExpiresAt` is informational only — stored on grant but never used as legal basis.

## Verknüpfungen (Links)

- `ProviderAccessGrant.vehicleId` — required for runtime provisioning (DIMO/HM)
- `ProviderAccessGrant.processingActivityId` — optional link to processing stack
- `ProviderAccessGrant.legacyVehicleProviderConsentId` — 1:1 bridge to VPC
- `ProviderAccessGrant.webhookIdempotencyKey` — idempotent webhook processing
- DIMO and HIGH_MOBILITY are separate provider keys — never merged

## Write Paths (Only)

Grants are created/activated **only** in:

1. DIMO vehicle registration (`ProviderGrantProvisioningService.provisionAndActivate`, mechanism `SYSTEM_SYNC`)
2. HM fleet clearance webhook (`mechanism WEBHOOK`)
3. Manual API POST (onboarding/admin, mechanism `MANUAL` / `OAUTH`)
4. Legacy VPC link (`linkFromLegacyVpc`)

**GET endpoints are read-only** — no auto-activation.

## Module Layout

```
backend/src/modules/data-authorizations/provider-grant-consolidation/
  provider-grant-consolidation.constants.ts   # provider keys, reason codes
  provider-grant-consolidation.evaluator.ts   # pure cross-ledger consistency
  provider-grant-consolidation.service.ts     # injectable wrapper
  provider-grant-provisioning.service.ts      # single write path (PAG + VPC)
  provider-grant-verification.service.ts      # periodic lastVerifiedAt refresh
  provider-grant-consolidation.integration.spec.ts
```

## Policy Resolver Fix

`evaluateProviderGrant` now resolves provider key from `sourceSystem` (DIMO / HIGH_MOBILITY), not worker `processorId` (e.g. `synqdrive-dimo-snapshot-worker`).

## Migrationspfad

1. **Existing VPC rows:** Use `POST .../provider-access-grants/legacy-vpc/:id/link` or batch `migrate-data-authorization-legacy.ts`
2. **New runtime events:** `ProviderGrantProvisioningService` writes PAG + VPC atomically
3. **Revocation orchestrator:** `DefaultRevocationProviderRevoker` revokes both PAG and VPC
4. **Verification:** `ProviderGrantVerificationService.verifyStaleGrants()` refreshes `lastVerifiedAt`, marks expired grants

## Test Results

Run:

```bash
cd backend && npm run test:data-auth:provider-grant
```

| Scenario | Expected |
|----------|----------|
| Consistent ACTIVE | ALLOW |
| Provider ACTIVE + Policy REVOKED | DENY (contradiction) |
| Provider REVOKED + Policy ACTIVE | DENY |
| Grant expired | DENY |
| Token invalid | ALLOW (warning only) |
| Duplicate webhook | Idempotent replay |
| Foreign vehicle | NotFoundException |
| GET without side effect | No create/update |

## Provider Errors ≠ Compliance Success

Provider API failures during verification do not auto-grant or auto-activate. Webhook provisioning catches errors and logs — never treats provider errors as compliance success.

## Secrets

No secrets in grant records. `sanitizeMetadata()` strips token/secret/password keys before persistence.
