# P6C — Product entitlement & commercial policy record (repository behavior)

**Date:** 2026-11-22  
**Operation:** `SYNQDRIVE_ORGANIZATIONS_P6C2_EVIDENCE_GOVERNANCE_SEAL`  
**Base SHA:** `5206075419ed597790914b405fc8b0b0b9c9531b`  
**Status:** Factual runtime record — **not** owner approval of future migrations

## Binding runtime facts (today)

| Concern | Authority | Code anchor |
|---------|-----------|-------------|
| Route / operational product license | `OrganizationProduct.status` (ACTIVE for guards) | `entitlements-policy.ts`, `ProductLicenseGuard` |
| Declared entitlements API | Same status model + factual `expiresAt` | `entitlements-query.service.ts` |
| Commercial subscription / limits / dates | `BillingSubscription` + catalog price books | `backend/src/modules/billing/` |
| Core app M2M | **OFF** by default | `CORE_APP_M2M_ENABLED=false`, entitlements `m2mProductionReady: false` |

## `expiresAt`

- Policy constant: `NOT_ENFORCED_STATUS_ONLY_PARITY`
- License term may be reported; **no** runtime enforcement at guards (accepted tech debt until owner-mandated slice).

## Future direction (not runtime today)

- `BillingEntitlementResolver` listed in `entitlement-migration.registry.ts` for future module migration
- `OrganizationProduct` documented as **projection target** from billing — not yet the read path replaced for feature gates

## Owner proposals (explicitly not binding)

| Proposal | Record |
|----------|--------|
| Keep `OrganizationProduct` as runtime gate until explicit migration | Aligns with current code |
| Billing owns commercial terms without competing independent feature gate | **Target policy**; dual read paths remain until migration |
| Basic Fleet permanent free tier | **PROPOSAL ONLY** — not an approved binding owner decision |
| Enforce `expiresAt` at runtime | **Deferred** — requires consumer audit + legacy impact |
| Core M2M enabled in production | **Rejected** for P6C — defaults remain fail-closed |

## Confirmed product defects (P6C scope)

**NONE** on audited SHA.