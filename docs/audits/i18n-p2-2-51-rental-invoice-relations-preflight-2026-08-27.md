# P2.2.51 — Rental Invoice Relations — Read-Only Pre-Flight

**Date:** 2026-08-27  
**Mode:** STRICT READ-ONLY — no production, dictionary, test, scanner, or architecture changes  
**Campaign:** RENTAL  
**Authoritative baseline:** `fb03d921668701168c5eb31c02524c1d9b187fc9` (merged PR #1340 — P2.2.50 Header)  
**Merged implementation HEAD (PR branch tip):** `2fc783b4dd6952641da11e2be3d5d18b6330aec9`  
**Current `origin/main`:** `c4043ab72a5f75a5342e0ff88325769a7d35dfd6`  
**Audit branch:** `cursor/p2251-rental-invoice-relations-preflight-3c10`  
**Expected next slice (reference only):** P2.2.52 — Invoice Payments  

---

## PART A — P250 merge baseline

### A.1 PR #1340 provenance hard gate

| Check | Result |
|-------|--------|
| PR #1340 merged | **YES** (`mergedAt`: 2026-08-27T15:13:24Z) |
| PR #1340 closed | **YES** (`state`: MERGED) |
| Merge commit SHA | **`fb03d921668701168c5eb31c02524c1d9b187fc9`** |
| Merged implementation HEAD | **`2fc783b4dd6952641da11e2be3d5d18b6330aec9`** (2 commits on PR branch) |
| Merge strategy | **Squash merge** (merge commit has single parent `e0aa79d3135866eb9f890c2666165f15a1411c0b`) |
| Implementation commit count (PR branch) | **2** (`3a0e327` implementation + `2fc783b4` menu same-mount test) |
| Merge target branch | `p239-p238-merge-baseline-3c10` (not `main`) |

### A.2 Baseline health (recomputed at `fb03d921`)

| Metric | Expected | Actual | Gate |
|--------|----------|--------|------|
| EN keys | 8786 | **8786** | PASS |
| DE keys | 8786 | **8786** | PASS |
| Parity | 100% | **100%** | PASS |
| Orphans | 0 | **0** (EN/DE key sets equal; structural health passed) | PASS |
| P250 enforce-clean | 0 | **0** | PASS |
| P249–P216 enforce-clean | 0 | **0** (global enforce-clean **0**) | PASS |
| Global enforce-clean | 0 | **0** | PASS |
| i18n suite | ≈481 | **482** (+1 menu-state test from P250) | PASS (non-regression) |
| `check:surface` | pass | **pass** | PASS |
| Shim | ≤29 | **1** compatibility shim (`rental/i18n/LanguageContext.tsx` re-export) | PASS |
| Working tree at baseline | clean | **clean** | PASS |

Commands run: `npm run i18n:check`, `npm run check:surface` on detached `fb03d921`.

### A.3 P250 freeze verification

P250 enforce-clean exact scope (zero findings):

- `InvoiceDetailHeader.tsx`
- `InvoiceHeaderMoreMenu.tsx`
- `invoiceDetail.mapper.ts`
- `invoiceUtils.ts`
- `rental-invoice-detail-header-i18n.ts`

`InvoiceDetail.tsx` locale threading into header mapper is frozen behavior; P251 must not reopen header surfaces.

### A.4 Topology classification

| Item | Value |
|------|-------|
| P251 authoritative baseline | **`fb03d921668701168c5eb31c02524c1d9b187fc9`** on `origin/p239-p238-merge-baseline-3c10` |
| Current main SHA | **`c4043ab72`** (#1339 P1 FINAL vehicle operational state) |
| P250 on main | **NO** — campaign baseline and `main` are divergent parallel lines |
| Recent main merges after #1340 | #1339 (vehicle operational state), #1336, #1331, #1332, #1329, … |
| Invoice/Relations drift vs baseline | **LOW** — cosmetic import-path + hover class on main; main lacks entire P216–P250 i18n campaign |
| shared-i18n drift | **NONE** on relations paths between baseline and main |

**Classification:** **PARALLEL CAMPAIGN BASELINE** (valid authoritative baseline; do not silently rebase onto `main`).

**Baseline strategy:** **DIRECT FROM P250 MERGE BASELINE** (`fb03d921`).

---

## PART B — Relations runtime map

### B.1 Target verdict

**RELATIONS TARGET CONFIRMED EXACTLY**

Repository truth matches #1338 split: Relations card only (not Header, not Secondary provenance panel, not Payments).

### B.2 Exact production paths

| Path | Role |
|------|------|
| `frontend/src/rental/components/invoices/InvoiceRelations.tsx` | Section shell, entity list, template row, navigation dispatch |
| `frontend/src/rental/components/invoices/InvoiceRelationRow.tsx` | Row chrome, aria, click/keyboard activation |
| `frontend/src/rental/components/invoices/invoiceRelations.mapper.ts` | DTO builders, fallbacks, permissions, period formatting |
| `frontend/src/rental/components/invoices/hooks/useInvoiceRelationsEnrichment.ts` | Data fetch + permission predicates (read-only for P251) |

**Out of P251 UI scope (same mapper file, different consumer):**

- `buildInvoiceProvenance()` — values rendered in **P249 Secondary** (`InvoiceDetailSecondary.tsx`), not in Relations card. **P251 must not modify provenance strings** (P249 separation).

### B.3 Mount / route

```
FinanceView / InvoicesPage → InvoiceDetail → InvoiceRelations
```

- Route: Rental `invoices` finance tab (`App.tsx` → `FinanceView` with `invoiceNavigation`)
- `data-testid="invoice-relations-primary"`
- Returns `null` when no entity relations and no template

### B.4 Relation types inventory

| Type | Shown | Navigable | Permission gate |
|------|-------|-----------|-----------------|
| **Customer** | Yes | Yes (if not archived) | `customers.read` → `canReadCustomers` |
| **Booking** | Yes | Yes | `bookings.read` → `canReadBookings` |
| **Vehicle** | Yes | Yes (if has vehicle data) | `fleet.read` → `canReadFleet` |
| **Vendor/Supplier** | Yes | **No** (display only) | None |
| **Template** | Yes (via `InvoiceDetailRow`) | No | None |
| Station / Organization / Contract | **Not rendered** | — | — |

**Not in Relations card:** provenance block (`erstelltVon`, `erstelltUeber`, `quelle`) — Secondary only.

### B.5 Customer trace

| Field | Source | Raw preservation |
|-------|--------|------------------|
| ID | `invoice.customerId` / `customer.id` | UUID unchanged |
| Display name | `customerPrimaryLabel(customer)` — company or person name | **Raw** (e.g. `Max Mustermann X7`, `Muster Mobility GmbH X7`) |
| Ref | `customerRef(id)` → `KD-{suffix}` | **Raw** |
| Email | `customer.email` | **Raw** tertiary line |
| Navigation | `onOpenCustomer(entityId)` | `App.tsx` → `setDetailCustomer({ id })` → `customer-detail` |
| Archived | `customer.archivedAt` or `status === 'ARCHIVED'` | Machine → `fallback: 'archived'`; primary becomes localized fallback label |

### B.6 Booking trace

| Field | Source | Raw preservation |
|-------|--------|------------------|
| ID | `invoice.bookingId` / `booking.core.bookingId` | UUID unchanged |
| Number | `booking.core.bookingNumber` or `bookingRef(bookingId)` | **Raw** (e.g. `BK-2026-X7`) |
| Period | `formatRentalPeriod(startDate, endDate)` | Raw ISO dates formatted; connector chrome localizable |
| Status | `bookingStatusLabel(normalizeBookingStatus(...))` | Machine status → existing `bookings.*` keys (thread `locale`) |
| Navigation | `onOpenBooking(entityId)` | `App.tsx` → `setPendingBookingDetailId` → `bookings` view |

### B.7 Vehicle trace

| Field | Source | Raw preservation |
|-------|--------|------------------|
| ID | `invoice.vehicleId` | UUID unchanged |
| Plate | booking vehicle or fleet lookup | **Raw** (e.g. `KS-FS-1234`) |
| Make/model | resolved fields | **Raw** |
| VIN | Not shown in Relations row | N/A in this surface |
| Fleet name | `displayName` / `vehicleName` when distinct | **Raw** |
| Navigation | `onOpenVehicle(entityId)` | Fleet lookup → `setSelectedVehicle` → `overview` |
| Operational state | **Not used** in Relations | P1 #1339 does not touch invoice relation paths |

### B.8 Vendor trace

| Field | Source | Raw preservation |
|-------|--------|------------------|
| ID | `invoice.vendorId` | Raw (not displayed as primary) |
| Name | `invoice.vendorName` | **Raw** (e.g. `Lieferant Sondername X7`) |
| Navigation | None | `navigable: false` always |

### B.9 Template strategy

- Templates are **predefined machine IDs** in `INVOICE_TEMPLATES` (`standard`, `booking`, `damage`, `extra`).
- Resolution: `INVOICE_TEMPLATES.find(id)?.name || templateId`.
- **Reuse:** `invoices.create.template.{id}.name` via `labelCreateInvoiceTemplateName()` pattern (**EXACT** for known IDs).
- Custom/unknown `templateId` string: remain **raw** (no translation wrapper).

### B.10 Relation row structure (`InvoiceRelationRow`)

| Element | Host-owned | Dynamic |
|---------|------------|---------|
| Icon | No (kind-based) | — |
| Label (`relation.label`) | **Yes** — localize | — |
| Primary | Mixed — entity names raw; fallback labels host-owned | Customer name, booking #, vehicle description |
| Secondary/tertiary | Period chrome host-owned; values raw | Email, plate, status label |
| Chevron | Chrome | — |
| `aria-label` | Template uses `${label}: ${primary}` | Values stay raw |
| Permission hint | `navigationBlockedReason` | Host-owned copy |

### B.11 Callback matrix

| Control | Callback | Args | Permission | Navigable when |
|---------|----------|------|------------|----------------|
| Customer row | `onOpenCustomer` | `customerId` | `canReadCustomers` + not archived | true |
| Booking row | `onOpenBooking` | `bookingId` | `canReadBookings` | true |
| Vehicle row | `onOpenVehicle` | `vehicleId` | `canReadFleet` + hasVehicleData | true |
| Vendor row | — | — | — | false |
| Template row | — | — | — | false |

### B.12 React identity audit

- `InvoiceRelations`: `key={relation.kind}` — **safe** (not locale-based).
- No `key={locale}`, `key={t(...)}`, or `key={localizedLabel}` in relation scope.
- **Risk:** None identified.

### B.13 Same-mount state

**NONE** — `InvoiceRelations` / `InvoiceRelationRow` are stateless. Locale switch must not remount `InvoiceDetail` parent.

---

## PART C — Dynamic-data / permission / navigation freeze

### C.1 Dynamic-data freeze matrix

| Field | Source | Raw example | May localize? | Must remain unchanged? |
|-------|--------|-------------|---------------|------------------------|
| Customer name | API customer | `Max Mustermann X7` | No | **Yes** |
| Company name | API customer | `Muster Mobility GmbH X7` | No | **Yes** |
| Customer ref | `customerRef` | `KD-XXXXXX` | No | **Yes** |
| Customer email | API | `max@example.com` | No | **Yes** |
| Booking number | API / `bookingRef` | `BK-2026-X7` | No | **Yes** |
| Booking dates | API ISO | `2026-07-10`… | Format only | **Yes** (business instants) |
| Booking status ID | `normalizeBookingStatus` | `confirmed` | Map only | **Yes** |
| Vehicle plate | API | `KS-FS-1234` | No | **Yes** |
| Vehicle make/model | API | `VW Golf` | No | **Yes** |
| VIN | API (not shown) | `WVWZZZTESTX7` | No | **Yes** |
| Vendor name | Invoice | `Lieferant Sondername X7` | No | **Yes** |
| Template name (known ID) | Machine ID | `standard` → localized label | Label only | ID unchanged |
| Template name (unknown) | Backend | `Sondervorlage X7` | No | **Yes** |

### C.2 Permission freeze matrix

| Permission | Source | Predicate | Visibility | Navigation | May localize? |
|------------|--------|-----------|------------|------------|---------------|
| `customers.read` | `useInvoiceRelationsPermissions` | `hasPermission('customers','read')` | Row visible; blocked reason if !canNavigate | `onOpenCustomer` only when allowed | Blocked **message** only |
| `bookings.read` | same | `hasPermission('bookings','read')` | Row visible | `onOpenBooking` when allowed | Blocked message only |
| `fleet.read` | same | `hasPermission('fleet','read')` | Row visible | `onOpenVehicle` when allowed | Blocked message only |

**Hard freeze:** Same permission IDs, predicates, visibility, navigation eligibility.

### C.3 Navigation freeze matrix

| Relation | ID source | Callback | Route effect | May localize? |
|----------|-----------|----------|--------------|---------------|
| Customer | `relation.entityId` | `onOpenCustomer` | `customer-detail` | No |
| Booking | `relation.entityId` | `onOpenBooking` | `bookings` + pending ID | No |
| Vehicle | `relation.entityId` | `onOpenVehicle` | `overview` if vehicle in fleet cache | No |

Wired in `App.tsx` lines 1108–1124.

### C.4 Fallback / machine freeze matrix

| Machine `fallback` | Baseline DE primary/secondary | Future direction |
|--------------------|------------------------------|------------------|
| `archived` | `Relation archiviert` | `fallback` → TranslationKey → localized |
| `deleted` | `Relation gelöscht` | same |
| `unavailable` | `Daten nicht verfügbar` | same |
| `legacy` | `Legacy-Herkunft` | **Not used in relation row builders** — do not add dead key |

**Forbidden:** localized fallback string → navigation or permission decision.

### C.5 Date / period freeze matrix

| Case | Baseline DE | Localize |
|------|-------------|----------|
| Both dates missing | `Zeitraum unbekannt` | Yes (chrome) |
| Start missing | `bis {end}` | Connector + formatted end |
| End missing | `ab {start}` | Connector + formatted start |
| Both present | `{start} – {end}` | Formatted dates raw; connector/em dash chrome |

`formatDate` from `invoiceFormatters` — P251 should use locale-aware formatting consistent with header adapter pattern.

### C.6 Booking status strategy

- Use existing `bookingStatusLabel(status, locale)` — **SEMANTIC REUSE** of `bookings.*` keys.
- Do **not** create relation-specific status duplicate keys.

### C.7 Header / P249 / financial separation

| Contract | Requirement |
|----------|-------------|
| P250 Header diff | **ZERO** |
| P249 Secondary diff | **ZERO** |
| Financial diff | **ZERO** (Relations slice has no money fields) |
| Tax diff | **ZERO** |
| Payment diff | **ZERO** |
| `buildInvoiceProvenance` | **ZERO diff** in P251 |

---

## PART D — Key budget / reuse

### D.1 Host-owned German inventory (Relations scope)

**InvoiceRelations.tsx:** `Zuordnung`, `Vorlage`  
**invoiceRelations.mapper.ts (relation builders):** entity labels ×4, fallbacks ×3, permission strings ×4, period chrome ×4  
**InvoiceRelationRow.tsx:** aria template (uses localized label + raw primary)

**Not in scanner inventory** (hidden debt) — files not yet in hardcoded-copy inventory for invoice detail sub-panels.

### D.2 Key reuse audit

| Concept | Classification | Key |
|---------|----------------|-----|
| Customer label | **EXACT REUSE** | `bookings.customer` |
| Vehicle label | **EXACT REUSE** | `bookings.vehicle` |
| Booking label | **EXACT REUSE** | `tasks.entity.booking` |
| Vendor label | **EXACT REUSE** | `tasks.entity.vendor` |
| Template names (known IDs) | **EXACT REUSE** | `invoices.create.template.*.name` |
| Booking status | **MACHINE — MAP ONLY** | `bookings.*` via `bookingStatusLabel` |
| Customer/booking/vehicle names | **DYNAMIC — DO NOT TRANSLATE** | — |
| Section title `Zuordnung` | **NEW P251** | `rental.invoice.detail.relations.section.title` |
| Template row label `Vorlage` | **NEW P251** | `rental.invoice.detail.relations.label.template` |
| Fallback archived/deleted/unavailable | **NEW P251** | `rental.invoice.detail.relations.fallback.*` |
| Permission blocked copy | **NEW P251** | `rental.invoice.detail.relations.permission.*` |
| Period chrome | **NEW P251** | `rental.invoice.detail.relations.period.*` |
| `fallback.legacy` | **DO NOT CREATE** | Not used by relation row builders |

### D.3 Template reuse result

**EXACT** — reuse `invoices.create.template.{standard,booking,damage,extra}.name` for known template IDs; unknown IDs stay raw.

### D.4 Fallback reuse result

No exact generic key for `Relation archiviert` / `Relation gelöscht`. `fleetHealthService.kpi.unavailable` is semantically weaker. **NEW bounded keys preferred** under `rental.invoice.detail.relations.fallback.*`.

### D.5 Independent key budget

| Bucket | New keys |
|--------|----------|
| Section title | 1 |
| Template label | 1 |
| Fallbacks (archived, deleted, unavailable) | 3 |
| Permission blocked (customer, booking, vehicle, generic) | 3–4 |
| Period chrome (unknown, until, from, range connector) | 3–4 |
| **Total new EN+DE** | **11–12** (ideal ≤12) |

| | Count |
|---|------|
| Reused keys | ~8–12 (entity labels, template names, booking status) |
| Production files (substantive) | **4** (`InvoiceRelations`, `InvoiceRelationRow`, `invoiceRelations.mapper`, new adapter) |
| Mechanical threading | `InvoiceDetail.tsx` (rebuild relations DTO with locale — **avoids** `invoiceDetail.mapper.ts` diff) |
| Test files (future) | 1 (`rental-invoice-relations-localization.test.tsx`) |

**Dead-key risk:** Low — omit `fallback.legacy` unless call site added.

### D.6 Boundedness gate

| Criterion | Result |
|-----------|--------|
| ≤4 substantive production files | **PASS** (4) |
| ≤15 new keys | **PASS** (11–12) |
| No business/permission/navigation semantic change | **PASS** |
| Category E feasible | **PASS** |
| Collision | **LOW** |

### D.7 Split decision

**ONE SLICE — RELATIONS**

Provenance strings in `buildInvoiceProvenance` remain for Secondary (P249); splitting Relations further is unnecessary.

---

## PART E — Candidate decision

### E.1 Active workstream collision map

| PR | Domain | Overlap | Class |
|----|--------|---------|-------|
| #1342, #1341 | P250 audits | Docs only | **NONE** |
| #1339 (merged main) | Vehicle operational state | Does not touch invoice relation files | **NONE** |
| #1337 (rejected combined) | Header+Relations | **Do not reuse** | **DIRECT** (closed/rejected) |
| Open battery/BullMQ PRs | Backend/infra | No invoice paths | **NONE** |

**Active collision:** **LOW**  
**Current-main drift on relations paths:** **LOW** (cosmetic only; campaign baseline authoritative)

### E.2 Top-5 Rental candidate ranking (0–5)

| Candidate | Vis | Debt | Bounded | Safety | Machine sep | Test | Collision | Leverage | Total |
|-----------|-----|------|---------|--------|-------------|------|-----------|----------|-------|
| **Relations (P251)** | 4 | 4 | 5 | 5 | 5 | 4 | 5 | 5 | **37** |
| Payments (P252) | 4 | 4 | 4 | 4 | 4 | 4 | 5 | 4 | **33** |
| Tenant Billing | 3 | 5 | 2 | 3 | 3 | 3 | 4 | 3 | **26** |
| Invoice Documents residual | 3 | 3 | 3 | 4 | 4 | 3 | 5 | 3 | **28** |
| Data Analyse | 2 | 4 | 2 | 3 | 3 | 2 | 4 | 2 | **22** |

### E.3 P251 target decision

**P2.2.51 — Rental Invoice Relations Localization**

### E.4 Exact P251 production boundary

| Path | Responsibility |
|------|----------------|
| `InvoiceRelations.tsx` | Section title, template label, mount relations list |
| `InvoiceRelationRow.tsx` | Row presentation, aria, interactive chrome |
| `invoiceRelations.mapper.ts` | Relation DTO builders, fallback machine, permission reasons, period formatting (**exclude `buildInvoiceProvenance`**) |
| `rental-invoice-relations-i18n.ts` | **NEW** — static keys, fallback machine→key, period helpers |
| `InvoiceDetail.tsx` | Mechanical locale threading: rebuild `relations` via `buildInvoiceRelationsDto(..., locale)` in `useMemo` (**zero `invoiceDetail.mapper.ts` diff**) |

### E.5 Adapter strategy

**NEW BOUNDED RELATIONS PRESENTATION ADAPTER** (`rental-invoice-relations-i18n.ts`)

Adapter owns: static relation keys, fallback machine mapping, period chrome, a11y label helpers.  
Adapter must **not** own: permissions, navigation, entity derivation, operational state, dynamic names, callbacks.

### E.6 Extraction strategy

**KEEP EXISTING COMPONENTS** + **DIRECT PRESENTATION REPLACEMENT** via adapter (no structural refactor).

### E.7 P251_ENFORCE_CLEAN_EXACT (future)

```
rental/components/invoices/InvoiceRelations.tsx
rental/components/invoices/InvoiceRelationRow.tsx
rental/components/invoices/invoiceRelations.mapper.ts
rental/lib/rental-invoice-relations-i18n.ts
```

Exclude: P250 header files, P249 secondary, Payments, Documents, Line Items, Create/Send, `buildInvoiceProvenance`, vehicle operational state.

### E.8 Future test contracts (summary)

- Same-mount DE↔EN: entity IDs, raw names, booking #, plate, permissions, callbacks, routes, order, fallback machine, dates, React identity preserved.
- Fixtures: `Max Mustermann X7`, `BK-2026-X7`, `KS-FS-1234`, `Lieferant Sondername X7`, `Sondervorlage X7`.
- Header/P249/Financial negative certification: zero diff outside enforce-clean boundary.

### E.9 P252 forecast

**P2.2.52 — Rental Invoice Payments Localization**

Likely boundary: `InvoicePayments.tsx`, `InvoicePaymentDetailDialog.tsx`, `RecordPaymentDialog.tsx`, `invoicePayments.mapper.ts`, new payments adapter. `InvoicePayments` already imports `useLanguage` — partial pattern exists.

---

## PART F — Rental / global progress

### F.1 Remaining debt (inventory-based at baseline)

| Scope | Findings |
|-------|----------|
| Global hardcoded-copy inventory | **1453** |
| Global enforce-clean | **0** |
| Rental inventory | **356** |
| Rental invoice inventory | **0** (detail sub-panels not yet in scanner — **hidden debt**) |
| Relations hidden host-owned strings | **~18** across 3 files |

### F.2 Campaign completion (Rental Invoice)

| Slice | Status |
|-------|--------|
| P214 List | Closed (enforce-clean) |
| P221 Create dialog | Closed |
| P222 Send dialog | Closed |
| P223 Documents panel | Closed |
| P249 Secondary | Closed |
| P250 Header | Closed |
| **P251 Relations** | **Next** |
| P252 Payments | Queued |
| Line items / provenance values / tenant billing | Remaining |

### F.3 Global i18n progress

| Metric | Value |
|--------|-------|
| Canonical keys EN/DE | 8786 / 8786 |
| Parity | 100% |
| P250 closed | +26 keys (header) |
| Remaining global actionable units (inventory) | **1453** |
| Estimated global completion (enforce-clean phases P216–P250) | **High** for closed slices; **~83–85%** campaign trajectory (inventory-based estimate) |
| Confidence | **HIGH** for baseline & target; **HIGH** for key budget |

---

## Final verdict

### **A — GO — P2.2.51 RENTAL INVOICE RELATIONS SELECTED**

**P2.2.51:** Rental Invoice Relations Localization (`InvoiceRelations` card — customer, booking, vehicle, vendor, template)

**CAMPAIGN:** RENTAL

**P250 STATUS:** FROZEN

**EXPECTED NEW KEYS:** 11–12

**GLOBAL I18N COMPLETION:** ~83–85% (inventory trajectory; 8786 canonical keys, 1453 remaining findings)

**REMAINING ACTIONABLE DEBT:** 1453 global inventory findings; Relations hidden debt ~18 strings

**IMPLEMENTATION NOT STARTED.**
