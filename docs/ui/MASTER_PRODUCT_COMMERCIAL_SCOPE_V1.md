# Master product commercial scope (V1)

## A — Editable product metadata (platform catalog)

**Current API:** `GET /admin/products`, `GET /admin/products/:slug`, **`PATCH /admin/products/:slug`** (P1: `name`, `description` only; MFA `MASTER_ORGANIZATION`; compare-and-swap via `ifCurrentName` / `ifCurrentDescription`; mandatory audit in transaction), org assignment `POST /admin/products/assign`, `PATCH .../vehicle-access-mode`, `DELETE .../:orgId/:productSlug`.

**P1 exclusions:** `slug`, `id`, `catalogStatus`, billing, entitlements, org activation — not editable via this route. TAXI remains retired (metadata patch rejected).

**UI policy:** Product Management exposes a **real** metadata editor (name/description) with read-only slug/catalog status and business-readiness labels.

### Catalog status safety (P1 audit — no behavior change)

| Concern | P1 state |
|--------|-----------|
| `ProductCatalogStatus` (`ACTIVE`/`DISABLED`) | Stored on `Product`; exposed read-only; **not enforced** on `assignProductForMasterAdmin` / legacy `assignProduct` today (retired slug guard only). |
| Business launch readiness | Presentation-only mapping (`RENTAL` existing, `FLEET`/`VYMOD` in preparation); unrelated to `catalogStatus`. |
| `OrganizationProduct.status` | Org subscription lifecycle; unchanged by metadata PATCH. |
| `ProductLicenseGuard` / `core.entitlements.v1` | Unchanged in P1. |
| Vehicle activation / grants | Unchanged; separate admin APIs. |
| Billing product configuration | Master Billing pricebooks; navigation only from editor. |

**Follow-up PR (separate approval):** gated `catalogStatus` transitions with enforcement at assign/grant entrypoints and explicit audit.

## B — Commercial pricebooks & price versions

Owned by **Master Billing → Tarife & Preise** (`BillingPricingTab`). Draft → validate → publish; published versions are not overwritten in place.

## C — Organization subscription contracts

Owned by **Master Billing → Verträge** (`BillingSubscriptionsView`, `BillingOrgDetailDrawer`). Uses `MasterSubscription*` APIs with MFA, lockVersion, idempotency.

## D — Discounts & overrides

Owned by contract drawer **add/end discount** mutations (`MasterSubscriptionAddDiscountDto`). Server billing preview for hypothetical discount amounts is **not** exposed in `previewChanges` today — UI descriptive confirmation only.