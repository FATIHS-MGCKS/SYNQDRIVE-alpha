# Master Admin Billing Blueprint

**Date:** 2026-08-18  
**Phase:** UI-6.3 (implemented)

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

Server-computed `BillingAttentionSummary` via `billing-attention.util.ts` — presentation only.

## Canonical APIs (implemented)

| Domain | API |
|--------|-----|
| Overview ops | `GET /admin/billing/overview/operational` |
| Subscriptions list | `GET /admin/billing/subscriptions/operational` |
| Subscription detail | `GET /admin/billing/subscriptions/operational/:organizationId` |
| Attention queue | `GET /admin/billing/attention-queue` |
| Mutations | `MasterSubscriptionController` |
| Invoices | `GET /admin/billing/invoices` |
| Reconciliation | `GET /admin/billing/reconciliation/drifts/operational` |
| Pricing | `GET/POST /admin/billing/pricebooks/*` |

## Frontend module

`frontend/src/master/billing/` — types, hooks, status chips, overview/subscriptions/detail views.

## Spec & reports

- Blueprint: `docs/ui/master-admin-canonical-billing-blueprint.md`
- Audit: `docs/ui/master-admin-billing-deep-audit.md`
- Post-remediation: `docs/ui/master-admin-billing-post-remediation.md`

## Known follow-ups

- True DB-level pagination for operational subscription filters at scale
- Unified privileged-action reason dialog across all mutations
