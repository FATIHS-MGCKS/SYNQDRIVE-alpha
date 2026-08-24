# P2.2.35 — Operator Vehicle Quick View Documents i18n Architecture

**Date:** 2026-08-24  
**Baseline:** `4116bcdbc6580ac6fb431252c9dc7e711a0fc4d0`

## Scope

Extracted `OperatorVehicleQuickViewDocuments.tsx` from inline parent markup (Documents `SectionCard` block).

## Data flow

```
api.vehicleIntelligence.documentExtractions(vehicleId)
  → useOperatorVehicleQuickViewData (map/sort/limit — unchanged)
  → OperatorVehicleQuickView (visibility wiring only)
  → OperatorVehicleQuickViewDocuments
  → operator-vehicle-quick-view-i18n.ts
  → canonical documentExtraction.type/status TranslationKeys
  → localized UI
```

## Freeze contract

- `doc.id` React keys byte-identical
- Machine `documentType` / `status` unchanged in data
- `sourceFileName` dynamic — never translated
- Sort `createdAt` desc, limit 5 — unchanged in hook
- Visibility `(documentsLoading || documents.length > 0)` — unchanged in parent
- No row actions, routes, sheets, or permissions in QV documents list
- Blockers section untouched

## Enforce-clean boundary

```
operator/components/OperatorVehicleQuickViewDocuments.tsx
operator/lib/operator-vehicle-quick-view-i18n.ts
```

## Keys

+1 `operator.vehicleQuickView.documents.sectionTitle` EN/DE  
+1 canonical gap fill `documentExtraction.status.PARTIALLY_APPLIED` EN/DE  
Reuses existing `documentExtraction.type.*` and `documentExtraction.status.*`  
8489 → 8491

## Quick View campaign state

Operator Vehicle Quick View presentation i18n is complete through P2.2.35. Remaining Blockers/contradiction reason localization is architecturally deferred because those strings remain coupled to business eligibility/readiness derivation.

## Main drift isolation

Implementation branches from `4116bcdb` only. `origin/main` has HIGH drift on QV parent — not absorbed.
