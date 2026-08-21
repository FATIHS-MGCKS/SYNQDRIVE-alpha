# Platform i18n — Rental Vendor Directory (P2.2.15)

**Version:** V4.9.937  
**Date:** 2026-08-21  
**Baseline:** `6973ec5b` (post–P2.2.14 Invoice List)

## Surface

Bounded Rental Vendor Directory: list (`VendorManagementView`), detail (`VendorDetailView`), card, operational tasks panel, and shared utils/adapter.

## Helper

`rental/lib/vendor-directory-i18n.ts`

- `vdi(locale, key, vars?)` — translate vendor directory keys
- `labelVendorCategory`, `labelVendorScope`, `labelVendorServiceArea`, `labelVendorRelationType`, `labelVendorDetailTab`, `labelVendorSourceType`
- Filter label helpers: `labelVendorCategoryFilter`, `labelVendorServiceAreaFilter`
- `formatVendorDirectoryDate`, `formatVendorDirectoryDateTime`, `formatVendorDirectoryAmount`
- Machine constants: `VENDOR_SCOPE_VALUES`, `VENDOR_RELATION_VALUES`, `VENDOR_DETAIL_TAB_VALUES`, `VENDOR_SOURCE_TYPE_VALUES`
- Blind-spot exports: `VENDOR_CATEGORY_LABEL_KEY_ENTRIES`, `VENDOR_SERVICE_AREA_LABEL_KEY_ENTRIES`

## Machine config

`rental/lib/vendor-directory.utils.ts`

- `VENDOR_CATEGORIES` — `{ value, icon }` only (no labels)
- `VENDOR_SERVICE_AREAS` — English tokens stored in `vendor.serviceAreas[]` (never translated at persistence)
- `filterVendorDirectory()` — unchanged semantics

## Keys

`vendors.directory.{en,de}.ts` — **+178 EN+DE** (7542→7720)

Reused: `tasks.vendor.category.*` (9), `tasks.vendor.allCategories`, `tasks.vendor.allServiceAreas`, `tasks.filter.status.*`, `common.*`

## Guardrails

**P2.2.15 enforce-clean exact (6 paths)** — 0 findings:

```
rental/components/VendorManagementView.tsx
rental/components/VendorDetailView.tsx
rental/components/vendors/VendorOperationalTasks.tsx
rental/components/vendors/VendorDirectoryCard.tsx
rental/lib/vendor-directory.utils.ts
rental/lib/vendor-directory-i18n.ts
```

Blind-spot grep guards in `hardcoded-copy-guard.test.ts` + `rental-vendor-directory-localization.test.tsx`.

## Tests

`rental-vendor-directory-localization.test.tsx` (21 tests)

## Semantics freeze

- Category/scope/service-area/relation/source **machine values** unchanged
- Service area filter compares stored English tokens, displays localized labels
- API `VendorInput` payloads, permissions, routes, link/unlink behavior unchanged
- Invoice tab shows raw `inv.status` machine value; only surrounding labels localized

## Shim

Unchanged (29). No vendor-specific compatibility shim.
