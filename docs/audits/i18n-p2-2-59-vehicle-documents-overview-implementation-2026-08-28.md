# P2.2.59 — Vehicle Documents Overview Localization (Implementation)

**Date:** 2026-08-28
**Campaign:** RENTAL
**Baseline:** `7871809e94cb6cd9f80c47999878c1fafc22e608` (P2.2.58 merge)
**Branch:** `cursor/p2259-vehicle-documents-overview-i18n-3c10`
**Split:** LIST / OVERVIEW FIRST — Upload Drawer deferred

## Scope

### In scope (production)

| Path | Role |
|------|------|
| `frontend/src/rental/components/DocumentsView.tsx` | Primary read-only vehicle file cockpit |
| `frontend/src/rental/components/documents/DocumentComplianceSummaryCard.tsx` | Compact/full compliance summary |
| `frontend/src/rental/components/documents/vehicle-file.constants.ts` | Icon/tone + sort machines only (presentation stripped) |
| `frontend/src/rental/lib/rental-vehicle-documents-i18n.ts` | Presentation adapter |
| `frontend/src/i18n/translations/rental.vehicleDocuments.{en,de}.ts` | Dictionary slice |

### Out of scope (deferred)

- `VehicleDocumentUploadDrawer.tsx` and upload mutation flow
- Delete/download write paths
- Damages, Users & Roles, Data Analyse, Billing, Tasks, Notifications
- P216–P258 frozen surfaces

## Mount topology

`/rental` → `currentView = documents` + selected vehicle → `DocumentsView.tsx`
Data: `useVehicleFileSummary(vehicleId)` → vehicle file summary API

## Machine inventory (unchanged)

- **Category IDs:** registration, insurance, tax, leasing_financing, tuv_hu, bokraft, service_proof, repair_proof, tire_proof, brake_proof, battery_proof, damage_accident, other
- **UI status:** missing, uploaded, processing, needs_review, verified, applied, expiring_soon, expired, error, archived
- **Timeline kind:** service_event, compliance, document (+ unknown raw fallback)
- **Fixed-cost status:** verified, missing_evidence (+ unknown → spec notProvided fallback)

## Raw ownership (preserved)

| Field | Fixture | Translated |
|-------|---------|------------|
| `item.title` | Provider Document Timeline X7 | NO |
| `item.subtitle` | Provider Document Subtitle X7 | NO |
| `latestFileName` | Fahrzeugschein_X7.pdf | NO |
| `linkedTask.title` | Provider Task Title X7 | NO |
| Load error body | Backend Vehicle Documents Error X7 | NO |
| Spec values | Provider Spec X7 | NO |
| `canonicalStatus.note` | backend raw | NO |
| ISO timestamps | unchanged | display only |

## Adapter responsibilities

`rental-vehicle-documents-i18n.ts` — category/status/timeline-kind/fixed-cost/source/rental-health labels, locale-aware dates, spec fallback only. **No** business logic.

## Same-mount proof

`rental-vehicle-documents-localization.test.tsx` mounts `DocumentsView` once under `LanguageProvider`, switches DE→EN→DE via `setLocale`, `documentsMountCount === 1`, `reload` not called.

## Key accounting

| Metric | Value |
|--------|-------|
| Baseline EN/DE | 8954 |
| Final EN/DE | 9082 |
| New keys | 128 |
| Removed (correction) | 7 (`rentalHealthPrefix`, `rentalHealth.healthy`, `rentalHealth.unknown`, 4 proof `emptyHint`) |
| Added (correction) | 2 (`category.emptyHintProof`, `fixedCostStatus.not_configured`) |
| Reused canonical | `common.retry`, `bookings.detail.rentalHealth`, `vehicle.overview.readiness.ready`, `vehicle.overview.readiness.unknown` |
| Parity | 100% |
| Orphans | 0 |

> Original implementation added 133 keys. Post-reassessment correction reduced to **128** via canonical reuse and proof-category empty-hint template consolidation. Pre-flight ~18–22 counted scanner findings, not dictionary keys; hidden `CATEGORY_UI_META` (39 strings) drove the honest irreducible floor.

### Correction details (2026-08-28)

- **Rental health prefix:** `bookings.detail.rentalHealth` reused (−1)
- **Rental health status:** `healthy`/`unknown` → `vehicle.overview.readiness.*` where exact (−2); `warning` kept (≠ `attention`); `blocked` kept (DE `Gesperrt` ≠ `Blockiert`)
- **UI status taxonomy:** `uiStatusLabel()` now delegates to `vehicleDocuments.status.*` (single display authority)
- **Empty hints:** 4 proof categories (`service_proof`, `tire_proof`, `brake_proof`, `battery_proof`) use `category.emptyHintProof` template (−3 net)
- **Fixed-cost status:** explicit `not_configured` key (+1)
- **Tests:** category/timeline machine-order assertions via `data-category-id` / `data-timeline-id`

## Scanner accounting

| Metric | Baseline | Final |
|--------|----------|-------|
| Global | 1405 | 1382 |
| Rental | 308 | 285 |
| P259 in-scope (DocumentsView + ComplianceCard) | ~23 | 0 |
| Deferred drawer/upload debt | separate | unchanged (drawer not in active findings) |
| Documents module (rental) | ~30 | 7 |

## Category E

All semantic categories = 0 (presentation-only).

## Checks

- `npm run i18n:check` PASS
- `npm run check:surface` PASS
- `npx tsc --noEmit` PASS
- `npm run build` PASS
- P259 enforce-clean = 0
- P258 frozen = 0 semantic diff

## Verdict

**A — P259 KEY MODEL CORRECTED — READY FOR FINAL INDEPENDENT RE-AUDIT**

Correction applied per reassessment PR #1392: canonical reuse, status taxonomy dedup, proof empty-hint template, explicit `not_configured`, order-test hardening. Final key count: **128**.

**VEHICLE DOCUMENTS UPLOAD DRAWER REMAINS DEFERRED.**
