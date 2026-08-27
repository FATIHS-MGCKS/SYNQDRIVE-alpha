# P2.2.51 — Rental Invoice Relations — Final Independent Re-Audit

**Date:** 2026-08-27
**Auditor mode:** STRICT READ-ONLY INDEPENDENT RE-AUDIT
**Implementation PR:** #1345
**Implementation HEAD:** `517a9f41f52232a11b535f8d94430a35cf1d65ae`
**Authoritative baseline:** `fb03d921668701168c5eb31c02524c1d9b187fc9`
**Pre-flight (read-only, not merged):** PR #1343

---

## 1. Provenance

| Check | Result |
|-------|--------|
| PR #1345 open | **YES** |
| Draft | **YES** |
| Merged | **NO** |
| Mergeable | **YES** (`MERGEABLE`) |
| Base branch | `p239-p238-merge-baseline-3c10` (contains `fb03d921`) |
| HEAD | `517a9f41f` |
| Commit count | **2** (exact) |
| Commit 1 parent | `fb03d921` ✓ |
| Commit 2 parent | `3b7628115` ✓ |
| #1343 ancestry on impl branch | **NO** — merge-base with preflight = `fb03d921` only |
| #1337 ancestry | **NO** |
| current-main-only ancestry | **NO** — parallel campaign topology |

---

## 2. Two-Commit Forensics

### Commit 1 — `3b7628115`

**Subject:** `feat(i18n): P2.2.51 Rental Invoice Relations localization`

| Path | Classification |
|------|----------------|
| `frontend/src/rental/components/invoices/InvoiceRelations.tsx` | P251 RELATIONS PRODUCTION |
| `frontend/src/rental/components/invoices/invoiceRelations.mapper.ts` | P251 RELATIONS PRODUCTION |
| `frontend/src/rental/lib/rental-invoice-relations-i18n.ts` | P251 RELATIONS PRODUCTION |
| `frontend/src/rental/components/invoices/InvoiceDetail.tsx` | P251 SUPPORT THREADING |
| `frontend/src/i18n/translations/rental.invoice.relations.{en,de}.ts` | P251 DICTIONARY |
| `frontend/src/i18n/translations/{en,de}.ts` | P251 DICTIONARY |
| `frontend/src/i18n/hardcoded-copy-guard.test.ts` | P251 SCANNER |
| `frontend/src/i18n/hardcoded-copy-inventory.json` | P251 SCANNER (regeneration) |
| `frontend/src/rental/components/rental-invoice-relations-localization.test.tsx` | P251 TEST |
| `frontend/src/rental/components/invoices/InvoiceRelations.test.tsx` | P251 TEST |
| `docs/audits/i18n-p2-2-51-rental-invoice-relations-implementation-2026-08-27.md` | P251 DOCUMENTATION |
| `architecture/I18N_RENTAL_INVOICE_RELATIONS_P2_2_51_2026-08-27.md` | P251 DOCUMENTATION |
| `frontend/src/master/components/ArchitekturView.tsx` | MANDATORY ARCHITECTURE BOOKKEEPING |
| `frontend/src/master/components/ChangesView.tsx` | MANDATORY ARCHITECTURE BOOKKEEPING |

**UNKNOWN paths:** 0

### Commit 2 — `517a9f41f`

**Subject:** `fix(i18n): P2.2.51 build hygiene — ArchitekturView dataSource, test consts, doc whitespace`

| Path | Classification |
|------|----------------|
| `frontend/src/master/components/ArchitekturView.tsx` | MANDATORY ARCHITECTURE BOOKKEEPING |
| `frontend/src/rental/components/rental-invoice-relations-localization.test.tsx` | P251 TEST (type narrowing only) |
| `docs/audits/...implementation...md` | P251 DOCUMENTATION (whitespace) |
| `architecture/I18N_RENTAL_INVOICE_RELATIONS...md` | P251 DOCUMENTATION (whitespace) |

**UNKNOWN paths:** 0

---

## 3. ArchitekturView Special Gate

**Verdict:** `ARCHITEKTURVIEW — REQUIRED NON-SEMANTIC BOOKKEEPING — ACCEPTABLE`

### Analysis

- **Commit 1** added a `FRONTEND_FLOWS` registry entry for P2.2.51 (same pattern as P250, P249, P248…) but omitted required `dataSource` field on `FrontendFlowEntry`, causing TypeScript build failure.
- **Commit 2** added `dataSource: 'architecture/I18N_RENTAL_INVOICE_RELATIONS_P2_2_51_2026-08-27.md'` — no content change to the entry itself.
- **Runtime/product impact:** None on Rental Invoice Detail. `ArchitekturView` is Master Admin architecture documentation surface only.
- **Repository mandate:** `.cursor/rules/Architectur-Updates.mdc` requires Architektur updates after meaningful implementation changes.
- **Removal impact:** Would break `tsc` (missing `dataSource`) and violate project governance; would not affect Relations runtime behavior.
- **Classification:** Mandatory architecture registry bookkeeping, not Relations production semantics.

---

## 4. Relations Production Boundary

| Path | Changed | In scope |
|------|---------|----------|
| `InvoiceRelations.tsx` | YES | Section title + template label localized |
| `InvoiceRelationRow.tsx` | NO | Consumes localized DTO fields |
| `invoiceRelations.mapper.ts` | YES | Relation builders only; provenance frozen |
| `rental-invoice-relations-i18n.ts` | NEW | Presentation adapter |
| `InvoiceDetail.tsx` | YES | Mechanical relations locale threading |

No other production semantic changes outside bookkeeping surfaces.

---

## 5. InvoiceDetail.tsx Threading Gate

**Classification:** `MECHANICAL RELATIONS LOCALE THREADING ONLY`

- Rebuilds `detail.relations` via `buildInvoiceRelationsDto(..., locale)` after `buildInvoiceDetailDto`.
- Does not modify Header, Secondary, payments hook, routing, or permission derivation.
- `useMemo` dependency array extended with locale-driven relations rebuild only.

---

## 6. buildInvoiceProvenance Hard Freeze

**Verdict:** `SEMANTIC DIFF = ZERO`

Byte-identical function body confirmed via isolated diff of `buildInvoiceProvenance` symbol between baseline and HEAD. `fallbackLabel()` retained for provenance (P249 Secondary consumer path).

---

## 7–9. Frozen Surface Negative Certification

| Surface | Semantic diff |
|---------|----------------|
| P250 Header (`InvoiceDetailHeader.tsx`, etc.) | **ZERO** |
| P249 Secondary | **ZERO** |
| Payments | **ZERO** |
| Documents | **ZERO** |
| Line Items | **ZERO** |
| Create/Send | **ZERO** |

---

## 10. Relation Raw Data Audit

Distinctive fixtures verified in `rental-invoice-relations-localization.test.tsx`:

| Entity | Fixture | EN/DE preserved |
|--------|---------|-----------------|
| Customer name | Max Mustermann X7 | YES |
| Company | Muster Mobility GmbH X7 | YES (via customerPrimaryLabel) |
| Booking number | BK-2026-X7 | YES |
| Vehicle plate | KS-FS-1234 | YES |
| VIN | WVWZZZTESTX7 | YES (in fixture, not displayed in Relations row) |
| Vendor | Lieferant Sondername X7 | YES |
| Custom template | Sondervorlage X7 | YES (raw when unknown ID) |

---

## 11. Permission Authority Trace

| Permission | Source | Visibility | Clickability | Blocked text |
|------------|--------|------------|--------------|--------------|
| `canReadCustomers` | `useInvoiceRelationsPermissions` → `hasPermission('customers','read')` | Mapper: row returned if `invoice.customerId` | Mapper: `navigable: canNavigate && !archived` | Adapter: `rentalInvoiceRelationsPermissionBlockedReason` |
| `canReadBookings` | `hasPermission('bookings','read')` | Mapper | Mapper: `navigable: canNavigate` | Adapter |
| `canReadFleet` | `hasPermission('fleet','read')` | Mapper | Mapper: `navigable: canNavigate && hasVehicleData` | Adapter |

**Authority remains in hook + mapper.** Adapter receives authoritative `canRead` boolean from mapper.

---

## 12. Permission Adapter Special Gate

### Function under review

```typescript
rentalInvoiceRelationsPermissionBlockedReason(locale, kind, canRead)
```

### Baseline equivalence

Pre-P251, identical logic lived in mapper as `permissionBlockedReason(kind, canRead)` with the same `if (canRead) return null` gate and kind→string switch. P251 only externalized localized string selection.

### Classification of branches

| Branch | Classification |
|--------|----------------|
| `if (canRead) return null` | **PRESENTATION ONLY** — suppresses blocked-reason copy when caller reports authorized |
| `switch (kind)` → TranslationKey | **PRESENTATION ONLY** — maps relation kind to localized blocked-reason string |

### Gate result

**A — presentation-only rendering selection from an already-authoritative permission boolean**

- Does NOT derive `canRead` (mapper passes `permissions.canRead*` as `canNavigate`)
- Does NOT set `navigable` (mapper owns)
- Does NOT filter row existence (mapper owns null returns per fetch state)
- Does NOT affect navigation callbacks (InvoiceRelations + InvoiceDetail own)

**PERMISSION PREDICATE = 0 | VISIBILITY LOGIC = 0 | NAVIGATION LOGIC = 0**

---

## 13–16. Permission / Navigation / Order / Identity

| Check | Result |
|-------|--------|
| Row visibility unchanged | YES |
| Clickability unchanged | YES |
| Callback availability unchanged | YES |
| Route eligibility unchanged | YES |
| Entity IDs unchanged | YES |
| Row order unchanged | YES (customer → booking → vehicle → vendor → template) |
| React keys unchanged | YES — no `key={locale}` patterns |

---

## 17–19. Booking / Template

- **Dates:** Raw ISO sources unchanged; `formatInvoiceListDate(locale, …)` for locale-aware display only.
- **Period chrome:** 4 bounded keys (`unknown`, `until`, `from`, `range`).
- **Status:** `bookingStatusLabel(status, locale)` — canonical reuse, no duplicate P251 status keys.
- **Template:** Known IDs → `invoices.create.template.*`; custom `Sondervorlage X7` stays raw.

---

## 20. Fallback Machine Audit

| Machine state | Localized | Reachable |
|---------------|-----------|-----------|
| `archived` | YES | YES (customer archived) |
| `deleted` | YES | YES (fetch not_found) |
| `unavailable` | YES | YES (fetch error / missing data) |
| `legacy` | NO (provenance only) | Intentionally excluded from Relations adapter |

---

## 21. +13 Key Audit

Pre-flight estimate: 11–12. Implementation: **13** (within ≤15 gate).

| # | Key | Purpose | Classification |
|---|-----|---------|----------------|
| 1 | `section.title` | Card heading | JUSTIFIED |
| 2 | `label.template` | Template row label | JUSTIFIED |
| 3 | `fallback.archived` | Archived relation | JUSTIFIED |
| 4 | `fallback.deleted` | Deleted relation | JUSTIFIED |
| 5 | `fallback.unavailable` | Unavailable data | JUSTIFIED |
| 6 | `permission.customer` | Customer blocked hint | JUSTIFIED |
| 7 | `permission.booking` | Booking blocked hint | JUSTIFIED |
| 8 | `permission.vehicle` | Vehicle blocked hint | JUSTIFIED |
| 9 | `permission.generic` | Vendor/default blocked hint | JUSTIFIED (+1 vs estimate) |
| 10 | `period.unknown` | Both dates missing | JUSTIFIED |
| 11 | `period.until` | End-only period | JUSTIFIED (+1 vs estimate) |
| 12 | `period.from` | Start-only period | JUSTIFIED |
| 13 | `period.range` | Full range connector | JUSTIFIED |

**Why 13 not 11–12:** Pre-flight bundled period chrome; implementation split into 4 explicit keys for `unknown`/`until`/`from`/`range`. Added `permission.generic` for vendor/default kind parity with baseline `default` branch.

**Unused keys:** 0 | **Harmful duplicates:** 0

---

## 22. Cross-Domain Reuse Quality

| Reused key/API | Quality |
|----------------|---------|
| `bookings.customer` | EXACT |
| `bookings.vehicle` | EXACT |
| `tasks.entity.booking` | ACCEPTABLE |
| `tasks.entity.vendor` | ACCEPTABLE |
| `invoices.create.template.*` | EXACT (known IDs) |
| `bookingStatusLabel(status, locale)` | EXACT |

**INCORRECT reuse:** 0

---

## 23–24. Adapter Classification & Verdict

| Export | Classification |
|--------|----------------|
| `resolveRentalInvoiceRelationsLocale` | STATIC KEY helper |
| `rir` | STATIC KEY helper |
| `rentalInvoiceRelationsSectionTitle` | STATIC KEY |
| `rentalInvoiceRelationsTemplateLabel` | STATIC KEY |
| `rentalInvoiceRelationsEntityLabel` | STATIC KEY |
| `rentalInvoiceRelationsFallbackLabel` | FALLBACK MAPPING |
| `rentalInvoiceRelationsPermissionBlockedReason` | A11Y/PRESENTATION (blocked copy) |
| `formatRentalInvoiceRelationsPeriod` | FORMATTER PRESENTATION |
| `rentalInvoiceRelationsTemplateDisplayName` | FORMATTER PRESENTATION |
| `rentalInvoiceRelationsRowAriaLabel` | A11Y PRESENTATION (exported, not yet wired) |

**Permission/visibility/navigation/ordering/entity-transform/business logic:** 0

**Adapter verdict:** `CANONICAL`

**Non-blocking note:** `rentalInvoiceRelationsRowAriaLabel` is exported but not consumed by `InvoiceRelationRow` (inline aria-label remains). Not an unused translation key; minor future-a11y hygiene only.

---

## 25–26. Test Quality

| Test area | Grade |
|-----------|-------|
| Same-mount DE→EN→DE | **STRONG** — single root, locale buttons, raw value + permission + navigation assertions |
| Commit 2 `as const` fixes | **TEST TYPE-NARROWING ONLY** — no weakened expectations |

---

## 27–28. Scanner / Inventory

- `P251_ENFORCE_CLEAN_EXACT` covers all 4 production paths.
- No ignores, allowlists, exemptions, or scanner weakening.
- **P251 enforce-clean:** 0 findings
- Inventory JSON diff: scanner regeneration only; no hidden debt removal.

---

## 29. Dictionary Accounting

| Metric | Baseline | Final |
|--------|----------|-------|
| EN | 8786 | **8799** |
| DE | 8786 | **8799** |
| New keys | — | **13** |
| Removed | 0 | 0 |
| Changed existing | 0 | 0 |
| Orphans | 0 | 0 |
| Parity | 100% | **100%** |

---

## 30. Category E

| Category | Count |
|----------|-------|
| Business semantic modifications | 0 |
| Permission semantic modifications | 0 |
| Navigation semantic modifications | 0 |
| Financial semantic modifications | 0 |
| Vehicle operational semantic modifications | 0 |
| **Category E total** | **0** |

---

## 31. Test Execution (independent re-run)

| Command | Result |
|---------|--------|
| P251 focused (6 tests) | PASS |
| P250 regression (17 tests) | PASS |
| P249 regression (11 tests) | PASS |
| Mapper + InvoiceRelations tests | PASS |
| hardcoded-copy-guard (122 tests) | PASS |
| `npm run i18n:check` | PASS — 8799/8799 |
| `npm run check:surface` | PASS |
| `npm run build` | PASS |
| `git diff --check baseline...HEAD` | PASS |

**i18n suite file count:** 483 test files in full frontend run; P251 adds 6 focused tests.

---

## 32. Current Main Collision

- **origin/main:** `b053bcc00` (#1344 dashboard/fleet fixture repair atop #1339)
- **Relations path overlap with main since baseline:** None on `InvoiceRelations.tsx`; trivial import-path drift on `invoiceRelations.mapper.ts` on main (`invoice-detail.constants` → `invoiceConstants`) unrelated to P251 semantics.
- **HIGH/DIRECT collision:** **NONE**

---

## 33–35. Commit Count & Correction Threshold

Two commits acceptable:
1. Bounded P251 implementation
2. Bounded build/test/doc hygiene (no unacceptable production semantic change)

**Corrections required:** **NONE**

---

## P252 Forecast

**P2.2.52 — Rental Invoice Payments Localization**

Likely paths: `InvoicePayments.tsx`, `invoicePayments.mapper.ts`, presentation adapter.

---

## Final Verdict

# A — READY FOR P2.2.51 FREEZE / MERGE

PR #1345 may be marked ready and merged.

**RENTAL CAMPAIGN STATUS:** CONTINUES.

**NEXT CANDIDATE:**
P2.2.52 — Rental Invoice Payments Localization.

---

## Special Risk Resolutions

| Risk | Resolution |
|------|------------|
| RISK 1 — ArchitekturView | **A** — mandatory architecture bookkeeping only |
| RISK 2 — Permission adapter | **A** — presentation-only; mirrors baseline `permissionBlockedReason` |
