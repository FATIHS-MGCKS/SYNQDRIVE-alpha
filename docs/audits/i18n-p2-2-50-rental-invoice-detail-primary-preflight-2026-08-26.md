# P2.2.50 — Rental Invoice Detail Primary (Header + Relations) — Pre-Flight Audit

**Date:** 2026-08-26  
**Mode:** STRICT READ-ONLY PRE-FLIGHT / TARGET VALIDATION  
**Verdict:** **A — GO — P2.2.50 INVOICE DETAIL PRIMARY HEADER + RELATIONS SELECTED**  
**Audit branch:** `cursor/p2250-rental-invoice-detail-primary-preflight-3c10`  
**Authoritative baseline:** `e0aa79d3135866eb9f890c2666165f15a1411c0b`  
**Current main (reference only):** `7c7ed2c1fb3ffffecf125b11232773b6cb4b5fc4`

---

## PART A — P249 merge baseline

### PR #1330 provenance

| Check | Result |
|-------|--------|
| PR | #1330 — P2.2.49 — Rental Invoice Detail Secondary Localization |
| `state` | MERGED |
| `closed` | true |
| `mergedAt` | 2026-08-26T20:41:54Z |
| Merge commit | `e0aa79d3135866eb9f890c2666165f15a1411c0b` |
| `headRefOid` (implementation HEAD) | `55f2d7e2bb1bfd4f30682152d66ad1fc166680f4` |
| Merge strategy | GitHub squash/merge (single merge commit on `main`) |
| Implementation commit count (merge..HEAD) | 2 (`19570a51b` implementation + `55f2d7e2b` doc whitespace) |

### Baseline health (exact checkout `e0aa79d`)

| Metric | Expected | Observed |
|--------|----------|----------|
| EN keys | 8760 | 8760 |
| DE keys | 8760 | 8760 |
| Parity | 100% | 100% |
| Orphans | 0 | 0 |
| P249 enforce-clean | 0 | 0 |
| P248–P216 enforce-clean | 0 | 0 |
| Global enforce-clean remaining | 0 | 0 |
| i18n suite | ≈463 | 463 passed |
| Shim (compat consumers) | ≤29 | 29 (18 prod, 11 test) |
| `npm run check:surface` | pass | pass |

### P249 freeze verification

Frozen paths (P249 = 0 findings):

- `rental/components/invoices/InvoiceDetailSecondary.tsx`
- `rental/components/invoices/InvoiceNotes.tsx`
- `rental/components/invoices/InvoiceTimeline.tsx`
- `rental/components/invoices/invoiceDetailSecondary.mapper.ts`
- `rental/lib/rental-invoice-detail-secondary-i18n.ts`

Visible / hidden / machine-display debt = 0. Dynamic/raw boundaries intact (task status machine, timeline events, notes/description content, copy-internal-id callback).

### Topology classification

| Item | Value |
|------|-------|
| P250 authoritative baseline | `e0aa79d3135866eb9f890c2666165f15a1411c0b` |
| Current main SHA | `7c7ed2c1fb3ffffecf125b11232773b6cb4b5fc4` |
| Classification | **PARALLEL CAMPAIGN BASELINE** |
| P249 merge target branch | `p239-p238-merge-baseline-3c10` (not `main`) |
| Campaign baseline branch HEAD | `e0aa79d3135866eb9f890c2666165f15a1411c0b` (= P249 merge) |
| Commits on `main` not in campaign baseline | 162+ (P1.x vehicle operational cutovers, Battery V2, docs) |
| Commits on campaign baseline not in `main` | P216–P249 i18n campaign stack |
| Relevant Rental drift | None on invoice primary paths (theme-token-only diffs on some TSX) |
| Relevant Invoice drift | `invoice-detail.constants.ts` **deleted on main** — P250 must **not** absorb |
| Shared-i18n drift | `invoice-list-i18n.ts` unchanged between baseline and main |
| Baseline strategy | **DIRECT FROM P249 MERGE BASELINE** (`p239-p238-merge-baseline-3c10` @ `e0aa79d`) |

---

## PART B — Primary runtime map

### Route / mount

```
/rental → currentView=invoices → InvoicesPage → view=detail → InvoiceDetail
```

| Child | Role | P250 |
|-------|------|------|
| `InvoiceDetailHeader` | Primary header card | **IN** |
| `InvoiceRelations` | Relations card | **IN** |
| `InvoiceLineItems` | Line items table | OUT (future slice) |
| `InvoicePayments` | Payments panel | OUT (P251 candidate) |
| `InvoiceDocuments` | Documents panel | OUT (P223 frozen) |
| `InvoiceDetailSecondary` | Secondary accordion | OUT (P249 frozen) |
| `SendInvoiceDialog` | Send modal | OUT (P222 frozen) |

### Data flow

```
Invoice (API)
  → buildInvoiceDetailDto(invoice, ctx)          [invoiceDetail.mapper.ts]
      → STATUS_MAP / INVOICE_TYPE_MAP labels      [invoiceUtils / constants]
      → formatAmount / formatDate                 [invoiceUtils → de-DE fixed]
      → action gates (allowed + reason strings)   [invoiceDetail.mapper.ts]
      → buildInvoiceRelationsDto(...)             [invoiceRelations.mapper.ts]
  → InvoiceDetailHeader(detail)
  → InvoiceRelations(detail, navigation)
```

### Hooks / permissions (frozen — not localized)

- `useRentalOrg`: `canManageEmail` (ORG_ADMIN | MASTER_ADMIN), `hasPermission('invoices','write')`
- `useInvoiceRelationsPermissions`: `canReadCustomers`, `canReadBookings`, `canReadFleet`
- `useInvoiceRelationsEnrichment`: customer/booking/vehicle fetch states
- `useInvoiceActions` / `useInvoiceDocuments`: mutations — frozen

### Primary target resolution

**PRIMARY TARGET CONFIRMED WITH BOUNDARY CORRECTION**

TSX chrome + presentation mappers + locale threading via **extended** `invoice-list-i18n.ts` (P214 canonical). Shell toasts/back in `InvoiceDetail.tsx` and `useInvoiceActions.ts` explicitly **OUT**.

---

## PART C — Header / Relations boundary

### Header (IN P250)

| Area | Status |
|------|--------|
| Invoice number display (`detail.core.invoiceNumberDisplay`) | DYNAMIC ONLY — no localization |
| Type badge label (`detail.core.typeLabel`) | IN — reuse `invoices.list.type.*` |
| Status chip label (`detail.core.statusLabel`) | IN — reuse `invoices.list.status.*` |
| Status tone/icon | ALREADY FROZEN (`invoiceDetailStatus.util.ts`) |
| Amount summary labels (Gesamtbetrag/Bezahlt/Offen/Fälligkeit) | IN |
| Formatted amounts (`amounts.*Formatted`) | IN — locale formatters only |
| Invoice date label + formatted date | IN |
| Primary PDF button (`PDF ansehen`) | IN |
| More menu trigger + items + disabled reasons | IN |
| Gate reason strings in mapper | IN (presentation only) |

### Relations (IN P250)

| Area | Status |
|------|--------|
| Section heading `Zuordnung` | IN |
| Relation row labels (Kunde/Buchung/Fahrzeug/Lieferant) | IN |
| Fallback chrome (archived/deleted/unavailable/legacy) | IN |
| Permission-blocked navigation reasons | IN |
| Rental period chrome (`Zeitraum unbekannt`, `bis`/`ab`) | IN |
| Template row label `Vorlage` | IN |
| Template **names** from `INVOICE_TEMPLATES` | IN — reuse `invoices.create.template.*` |
| Customer/booking/vehicle **entity values** | DYNAMIC ONLY |
| `customerRef` / `bookingRef` display IDs | DYNAMIC ONLY |
| Booking status tertiary (`bookingStatusLabel`) | IN — already locale-aware via `bookingStatus.tsx` |
| Navigation callbacks | FROZEN |
| `buildInvoiceProvenance` strings | OUT — P249 secondary owns provenance display |

### Explicitly OUT of P250

- P249 secondary files
- P223 documents, P221 create, P222 send
- Line items, payments panels, record-payment dialog
- `InvoiceDetail.tsx` back button + toasts
- `useInvoiceActions` mutation toasts
- Financial calculations (cents, outstanding derivation)
- Tax/VAT derivation
- Invoice status machine predicates
- PDF/document API args

---

## PART D — Financial / tax / status freeze

### Money freeze matrix

| Field | Raw source | Stored unit | Calc owner | Precision | Currency | Formatter | May localize? | Must remain unchanged? |
|-------|------------|-------------|------------|-----------|----------|-----------|-----------------|------------------------|
| totalCents | `invoice.totalCents` | cents | API/backend | integer cents | `invoice.currency` | `formatAmount` → locale Intl | display only | **yes** — raw cents |
| paidCents | `invoice.paidCents` | cents | API | integer cents | same | same | display only | **yes** |
| outstandingCents | `outstandingCents ?? max(0,total-paid)` | cents | `invoiceDetail.mapper` | integer cents | same | same | display only | **yes** — formula frozen |
| subtotal/tax | line items panel | cents | API | integer | same | N/A in primary | OUT | **yes** |

**Future implementation:** thread `locale` into `formatAmount` via `formatInvoiceListAmount` from `invoice-list-i18n.ts`. No change to cent values or arithmetic.

### Tax / VAT freeze

Primary header does **not** render tax rate, net/gross breakdown, or tax ID. Tax semantics = N/A in P250. Labels only on summary amounts.

### Invoice status machine (14 values)

| Machine | Tone (`invoiceDetailStatus.util`) | Existing key (reuse) |
|---------|-----------------------------------|----------------------|
| DRAFT | neutral | `invoices.list.status.DRAFT` |
| ISSUED | info | `invoices.list.status.ISSUED` |
| SENT | info | `invoices.list.status.SENT` |
| PARTIALLY_PAID | watch | `invoices.list.status.PARTIALLY_PAID` |
| PAID | success | `invoices.list.status.PAID` |
| OVERDUE | critical | `invoices.list.status.OVERDUE` |
| CANCELLED | neutral | `invoices.list.status.CANCELLED` |
| CREDITED | neutral | `invoices.list.status.CREDITED` |
| VOID | neutral | `invoices.list.status.VOID` |
| UPLOADED | info | `invoices.list.status.UPLOADED` |
| NEEDS_REVIEW | watch | `invoices.list.status.NEEDS_REVIEW` |
| APPROVED | success | `invoices.list.status.APPROVED` |
| BOOKED | info | `invoices.list.status.BOOKED` |
| REJECTED | critical | `invoices.list.status.REJECTED` |

Payment status: **not rendered in primary header** — N/A.

### Date / overdue freeze

| Field | Raw | TZ | Business predicate | Formatter | Overdue |
|-------|-----|----|--------------------|-----------|---------|
| invoiceDate | ISO date string | UTC date | display | `formatDate` → locale | N/A |
| dueDate | ISO date string | UTC date | display + outstanding emphasis | same | **OVERDUE status from API machine value only** — locale must not derive overdue |

### Fixed-locale audit (P250 adjacency)

| File | Hit | Classification |
|------|-----|----------------|
| `invoiceUtils.ts` | `Intl.NumberFormat('de-DE')` | PRESENTATION-ONLY — migrate to `invoiceListFormattingLocale` |
| `invoiceUtils.ts` | `toLocaleDateString('de-DE')` | PRESENTATION-ONLY |
| `invoiceTimeline.mapper.ts` | de-DE | OUT (P249 deferred / secondary) |
| `lib/money.ts`, `formatVehicleDisplay.ts` | de-DE | OUT (shared, not P250 boundary) |

### Hard freezes (fixtures)

| Entity | Fixture | Requirement |
|--------|---------|-------------|
| Invoice number | `RE-2026-00421` | Same display, copy, route/API args |
| Customer | `Max Mustermann X7` | Raw name preserved EN/DE |
| Booking | `BK-2026-X7` | Raw number preserved |
| Vehicle plate | `KS-FS-1234` | Raw plate/VIN preserved |

### React identity

No `key={locale}` or `key={t(...)}` in target files today. Future implementation: **none**.

### Same-mount state

`InvoiceDetail`: `sendOpen`, `defaultToEmail`, `expandMoreInfoTrigger` — must survive locale switch (no remount).

---

## PART E — Candidate split / ranking

### Manual presentation debt (scanner under-reports mapper TS)

~55–65 host-owned strings across header chrome, action menu, gate reasons, relation labels/fallbacks. Scanner inventory shows **0** file-level hits on primary TSX/mappers (German embedded in mapper logic, not JSX literals).

### Key budget estimate

| Bucket | New keys | Reused keys |
|--------|----------|-------------|
| Header amount/date labels | 5 | 0 |
| Header actions + menu | 8 | 0 |
| Gate/disabled reasons | ~18 | 0 |
| Relations chrome + fallbacks | ~10 | 0 |
| Status labels | 0 | 14 (`invoices.list.status.*`) |
| Type labels | 0 | 5 (`invoices.list.type.*`) |
| Draft display fallback | 0 | 1 (`invoices.list.status.DRAFT`) |
| Template names | 0 | 4 (`invoices.create.template.*`) |
| Common actions | 0 | 2–3 (`common.*` if applicable) |
| **Total** | **~24–28 new** | **~26 reused** |

Production substantive files: **5** (header TSX, more menu TSX, relations TSX, `invoiceDetail.mapper.ts`, `invoiceRelations.mapper.ts`) + adapter + locale threading in `invoiceUtils.ts` via existing `invoice-list-i18n.ts`.

### Split analysis

| Option | Assessment |
|--------|------------|
| A — Header identity + dates + status | Subsumed by combined slice with P214 reuse |
| B — Financial summary labels only | Too thin alone |
| C — Relations only | Leaves header debt; worse campaign leverage |
| D — Actions / PDF / send | Coupled to header gates |
| E — Combined Header + Relations | **SELECTED** |

**Decision: ONE SLICE — HEADER + RELATIONS** (within ≤30 new keys, ≤5 substantive files with P214 reuse).

### Top-10 Rental target ranking (0–5 each, max 50)

| Rank | Target | Vis | Debt | Bound | FinSafe | BusSafe | MachSep | Test | Coll | Lever | **Score** |
|------|--------|-----|------|-------|---------|---------|---------|------|------|-------|-----------|
| 1 | **Invoice Detail Primary** | 5 | 4 | 4 | 3 | 4 | 4 | 5 | 5 | 5 | **39** |
| 2 | Tenant Billing subsection | 4 | 4 | 3 | 2 | 3 | 3 | 4 | 5 | 4 | **32** |
| 3 | Data Analyse | 3 | 5 | 2 | 5 | 5 | 4 | 3 | 5 | 3 | **35** |
| 4 | Damages work queue | 4 | 4 | 2 | 4 | 3 | 3 | 3 | 4 | 4 | **31** |
| 5 | Users & Roles | 3 | 4 | 2 | 5 | 4 | 3 | 3 | 5 | 3 | **32** |
| 6 | Invoice Payments panel | 4 | 3 | 3 | 2 | 3 | 3 | 4 | 5 | 4 | **31** |
| 7 | Help Center | 2 | 2 | 4 | 5 | 5 | 4 | 4 | 5 | 2 | **29** |
| 8 | DocumentsView | 3 | 4 | 2 | 5 | 4 | 3 | 3 | 4 | 3 | **31** |
| 9 | Financial Insights | 3 | 3 | 2 | 2 | 3 | 3 | 3 | 5 | 3 | **27** |
| 10 | Invoice Line Items | 4 | 3 | 3 | 2 | 3 | 3 | 4 | 5 | 3 | **30** |

**Best alternative:** Tenant Billing overview subsection (score 32) — only if Primary split forced.

### Active collision gate

| PR | Domain | Overlap | Classification |
|----|--------|---------|----------------|
| #1332 Booking eligibility | Bookings/vehicle ops | No invoice primary paths | **NONE** |
| #1331 Battery V2 | Backend battery | No frontend invoice | **NONE** |
| #1329 Dashboard/Fleet | Fleet/dashboard | No invoice detail | **NONE** |
| #1324 Vehicle detail | Vehicle header | No invoice detail | **NONE** |
| #1333/#1334 P249 audits | Docs only | No production | **NONE** |
| Open i18n audit PRs | Docs | No production | **NONE** |

**Active collision: NONE**

### Current-main drift on P250 paths

| Path | Drift |
|------|-------|
| `InvoiceDetailHeader.tsx` | LOW (import path / theme tokens) |
| `InvoiceHeaderMoreMenu.tsx` | LOW (theme tokens) |
| `InvoiceRelations.tsx` | NONE |
| `InvoiceRelationRow.tsx` | LOW (theme tokens) |
| `invoiceDetail.mapper.ts` | LOW (import path) |
| `invoiceRelations.mapper.ts` | LOW (import path) |
| `invoice-detail.constants.ts` | **HIGH** (deleted on main) |
| `InvoiceDetail.tsx` | NONE |

**Drift classification: LOW** (do not absorb main; constants deletion is unrelated P1.x refactor)

---

## PART F — P250 selection

### Selected target

**P2.2.50 — Rental Invoice Detail Primary (Header + Relations) Localization**

### Exact P250 production boundary

| Path | Responsibility |
|------|----------------|
| `rental/components/invoices/InvoiceDetailHeader.tsx` | Header layout, amount cells, date line, PDF button |
| `rental/components/invoices/InvoiceHeaderMoreMenu.tsx` | More menu labels |
| `rental/components/invoices/InvoiceRelations.tsx` | Section heading, template row label |
| `rental/components/invoices/invoiceDetail.mapper.ts` | Gate **reason** strings + DTO label fields (status/type via adapter) |
| `rental/components/invoices/invoiceRelations.mapper.ts` | Relation labels, fallbacks, permission reasons, period chrome |
| `rental/lib/rental-invoice-detail-primary-i18n.ts` | **NEW** bounded adapter (`ridp`) |
| `rental/components/invoices/invoiceUtils.ts` | Thread locale formatters (delegate to `invoice-list-i18n`) |
| `i18n/translations/rental.invoice.detail.primary.{en,de}.ts` | **NEW** bounded key files |

**Support-only (no new keys):** `InvoiceRelationRow.tsx`, `InvoiceHeaderActionButton.tsx`, `InvoiceDetailRow.tsx` (receive localized props).

### Adapter strategy

**EXTEND EXISTING INVOICE PRESENTATION ADAPTER** — `invoice-list-i18n.ts` for status/type/money/date + **NEW BOUNDED PRIMARY PRESENTATION ADAPTER** `rental-invoice-detail-primary-i18n.ts` for detail-specific chrome and gate reasons.

### Extraction strategy

**EXTRACT PRESENTATION CONFIG ONLY** — no structural refactor; mappers accept `locale` parameter.

### P250_ENFORCE_CLEAN_EXACT (future)

```
rental/components/invoices/InvoiceDetailHeader.tsx
rental/components/invoices/InvoiceHeaderMoreMenu.tsx
rental/components/invoices/InvoiceRelations.tsx
rental/components/invoices/invoiceDetail.mapper.ts
rental/components/invoices/invoiceRelations.mapper.ts
rental/components/invoices/invoiceUtils.ts
rental/lib/rental-invoice-detail-primary-i18n.ts
```

Excludes: P216–P249, P223 documents, P221/P222 dialogs, line items, payments, secondary, shell toasts, tenant billing.

### Future test contract (mandatory)

- EN / DE mount
- Same-mount DE→EN / EN→DE
- Invoice `RE-2026-00421` preservation
- Customer `Max Mustermann X7` raw preservation
- Booking `BK-2026-X7` raw preservation
- Vehicle `KS-FS-1234` raw preservation
- All 14 status machine values: same tone/icon, localized label only
- Money fixtures: 0, positive, decimal, taxed, partial — same raw cents
- Gate allowed/disabled predicates unchanged
- Callbacks: PDF preview/generate, issue, cancel, record payment, navigation
- Permissions / visibility / loading predicates
- No raw-key / raw-machine leakage in visible text
- P248/P249 regressions pass

### Category E feasibility

| Semantic class | Modifications |
|----------------|---------------|
| Business | 0 |
| Financial | 0 |
| Tax | 0 |
| Payment | 0 |
| Routing | 0 |
| **Category E** | **0** |

**Feasible.**

---

## PART G — Rental / global progress

### Rental residuals (post-P249)

| Metric | Pre-P249 ref | Post-P249 |
|--------|--------------|-----------|
| Rental scanner findings | 372 | **356** |
| P249 cluster closed | 16 | 16 |
| Invoice+billing cluster (non-enforced) | — | **74** |
| Invoice primary manual debt | — | **~55–65** (mapper-hidden) |

### Campaign completion

- P216–P249: **CLOSED / FROZEN**
- P250: **authorized by this pre-flight** (implementation not started)
- Projected remaining Rental slices after P250: ~8–12 (payments, line items, shell toasts, tenant billing, damages, users, data analyse, help, documents)

### Global i18n progress

| Metric | Value |
|--------|-------|
| EN/DE keys | 8760 / 8760 |
| Global scanner total | 1453 findings |
| Global enforce-clean remaining | 0 |
| P249 closed actionable units | 16 |
| Estimated remaining global actionable | **~1437** |
| Updated global completion | **~93.1%** (methodology: closed enforce-clean units / scanner baseline ≈ 16/1453 + prior ~92.9%) |
| Fixed-locale debt (global) | 8 FORMAT_LOCALE hits |
| Hidden debt | mapper-embedded German (primary cluster) |
| Confidence | **HIGH** for P250 bounded implementation |

### P251 forecast (planning only — not authorized)

**Likely P251:** Invoice Payments panel + `invoicePayments.mapper.ts` (financial-adjacent; separate gate review required).

Alternate: Tenant Billing overview tab (if invoice detail queue paused).

---

## Action matrix (header)

| Control | Callback | Mutation/API | Permission |
|---------|----------|--------------|------------|
| PDF ansehen | `onViewPdf` → `documents.previewActiveDocument` | read | `viewPdf.allowed` |
| Ausstellen | `onIssue` → `actions.handleIssue` | `api.invoices.issue` | `issue.allowed` |
| PDF neu erzeugen | `onRegeneratePdf` | `documents.generatePdf(true)` | `regenerate_pdf.allowed` |
| Externer Versand | `onMarkSentExternally` | `actions.handleMarkSent` | `mark_sent_externally.allowed` |
| Zahlung erfassen | `onRecordPayment` | opens record dialog | `record_payment.allowed` |
| Bearbeiten | `onEdit` | expands secondary | `edit.allowed` |
| Stornieren | `onCancel` | `actions.handleCancel` | `cancel.allowed` |

## Relation navigation matrix

| Entity | ID source | Route/callback | Frozen |
|--------|-----------|----------------|--------|
| Customer | `relation.entityId` | `navigation.onOpenCustomer(id)` | yes |
| Booking | `relation.entityId` | `navigation.onOpenBooking(id)` | yes |
| Vehicle | `relation.entityId` | `navigation.onOpenVehicle(id)` | yes |
| Vendor | display only | non-navigable | yes |

---

## Final verdict

**A — GO — P2.2.50 INVOICE DETAIL PRIMARY HEADER + RELATIONS SELECTED**

```
P2.2.50:
Rental Invoice Detail Primary (Header + Relations) Localization

CAMPAIGN:
RENTAL

P249 STATUS:
FROZEN

GLOBAL I18N COMPLETION:
~93.1%

REMAINING ACTIONABLE DEBT:
~1437 (global scanner); Rental 356

IMPLEMENTATION NOT STARTED.
```

**Changes / Architektur:** Not updated (read-only pre-flight; audit artifact only).
