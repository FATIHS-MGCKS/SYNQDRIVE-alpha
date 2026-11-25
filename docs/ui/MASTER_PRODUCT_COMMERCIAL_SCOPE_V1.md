# Master product commercial scope (V1)

## A — Editable product metadata (platform catalog)

**Current API:** `GET /admin/products`, org assignment `POST /admin/products/assign`, `PATCH .../vehicle-access-mode`, `DELETE .../:productSlug`.

**Gap:** There is **no** approved `PATCH /admin/products/:slug` (or equivalent) for editing canonical catalog metadata (display name, roadmap status, catalog flags) outside assignment flows.

**UI policy:** Product Management shows **read-only** catalog rows and org assignment entry points — **no fake metadata editors**.

## B — Commercial pricebooks & price versions

Owned by **Master Billing → Tarife & Preise** (`BillingPricingTab`). Draft → validate → publish; published versions are not overwritten in place.

## C — Organization subscription contracts

Owned by **Master Billing → Verträge** (`BillingSubscriptionsView`, `BillingOrgDetailDrawer`). Uses `MasterSubscription*` APIs with MFA, lockVersion, idempotency.

## D — Discounts & overrides

Owned by contract drawer **add/end discount** mutations (`MasterSubscriptionAddDiscountDto`). Server billing preview for hypothetical discount amounts is **not** exposed in `previewChanges` today — UI descriptive confirmation only.