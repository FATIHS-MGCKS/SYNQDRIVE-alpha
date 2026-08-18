# Master Admin Billing Blueprint

**Date:** 2026-08-18  
**Phase:** UI-6.2 (specification — not implemented)

## Role

`Master-Abrechnung` is the Master Admin **billing control plane** — contracts, invoices, catalog pricing, and Stripe reconciliation. Not a replacement for Organizations (tenant ops) or tenant billing UI.

Answers: *Is platform billing healthy — and which contract needs attention now?*

## Target surfaces

| Surface | Purpose |
|---------|---------|
| Overview | Ops health, KPIs, attention queue |
| Subscriptions (Verträge) | Canonical list + full-page detail |
| Invoices | Paginated cross-org invoice index + drawer detail |
| Plans & Pricing | Catalog vs contract separation, version safety |
| Reconciliation (Abgleich) | Drifts, platform sync, webhooks |
| Audit | Secondary — contract/pricing/payment/system log |

## Status dimensions (orthogonal)

1. **Subscription lifecycle** — Domain `SubscriptionStatus` only (not Prisma raw)
2. **Payment health** — `billingHealth` composite
3. **Reconciliation health** — drift-prioritized `reconciliationHealth`

## Attention model

Server-computed `BillingAttentionSummary` from canonical signals — presentation only, no new billing truth.

Codes include: `PAST_DUE`, `PAYMENT_FAILED`, `RECONCILIATION_DRIFT`, `TRIAL_EXPIRING`, `STRIPE_MAPPING_MISSING`, etc.

## Canonical APIs (existing + proposed)

| Domain | API |
|--------|-----|
| Overview | `GET /admin/billing/overview` |
| Subscriptions list | `GET /admin/billing/subscriptions` (**proposed** operational) |
| Subscription detail | `GET …/subscription/contract`, `overview`, `history` |
| Mutations | `MasterSubscriptionController` (`POST/PATCH …/subscription/*`) |
| Invoices | `GET /admin/billing/invoices` |
| Reconciliation | `GET/POST /admin/billing/reconciliation/*` |
| Pricing | `GET/POST /admin/billing/pricebooks/*`, catalog-products |

## IA changes (summary)

- MERGE `system-sync` + reconciliation → **Abgleich**
- MOVE payment attempts/refunds/credit notes → invoice detail
- REMOVE payment-methods top tab, client org full-load, Prisma status in UI
- RENAME `organizations` → `subscriptions`

## Spec

`docs/ui/master-admin-canonical-billing-blueprint.md`

## Audit basis

`docs/ui/master-admin-billing-deep-audit.md` (UI-6.1, ~49/100)
