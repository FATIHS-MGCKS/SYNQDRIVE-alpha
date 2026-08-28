# I18N — Vehicle Documents Overview (P2.2.59)

**Date:** 2026-08-28  
**Version:** V4.9.987

## Locale flow

`useLanguage().locale` + `t()` → `rental-vehicle-documents-i18n.ts` resolvers → `DocumentsView` / `DocumentComplianceSummaryCard`

## Keys

+133 EN+DE `vehicleDocuments.*` (8954→9087); reuses `common.retry`.

Groups: header/overview, section chrome, category metadata (13 IDs × 3 fields), status machine, timeline kind, fixed-cost status, status source, rental health, specs/variable/timeline/compliance.

## Machine values (frozen)

- Category IDs, UI status, timeline kind, fixed-cost status
- Category/timeline sort order (`sortDocumentCategories`, chronological timeline)
- Task navigation callbacks and IDs
- Upload drawer open state (`drawer` local state)
- Raw backend fields (titles, filenames, errors, spec values, notes)

## Guardrails

P259 enforce-clean exact (2 paths): `DocumentsView.tsx`, `DocumentComplianceSummaryCard.tsx` — 0 findings.

## Frozen

P258 Tenant Billing Add-ons, P257 payment method, P216–P257 rental billing/operator slices, vehicle trips/health/tasks frozen surfaces.

## Tests

`rental-vehicle-documents-localization.test.tsx` — true same-mount DE→EN→DE, raw DOM fixtures, machine mappings, unknown fallbacks, category order, React identity.

## Deferred

`VehicleDocumentUploadDrawer` upload/review mutation UI — next candidate P2.2.60A.

## Semantics

Presentation-only; Category E = 0.
