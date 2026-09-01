# P2.2.55B — Tenant Billing Billable Vehicles + Vehicle Changes Pre-Flight

**Date:** 2026-08-28  
**Mode:** STRICT READ-ONLY PRE-FLIGHT  
**Campaign:** RENTAL  
**Authoritative baseline:** `20eb441fdf98596f3a49296c014410bfdbbfe080` (P255A merge commit)  
**Merged implementation HEAD:** `becc8aa806a036f127cd64f97eaa1b4d72e1edad`  
**Current `main` SHA (drift reference):** `61a3578e8db4b6aa99d6b15bde7ad0c8a8a4de8a`  
**Verdict:** **A — GO — P2.2.55B BILLABLE VEHICLES + VEHICLE CHANGES SELECTED**

---

## PART A — P255A Post-Merge Baseline

### A.1 P255A merge provenance hard gate

| Check | Result |
|-------|--------|
| PR #1362 merged | **YES** (`state: MERGED`, `mergedAt: 2026-08-27T23:50:04Z`) |
| PR #1362 closed | **YES** |
| Merge commit SHA | `20eb441fdf98596f3a49296c014410bfdbbfe080` |
| Merged implementation HEAD | `becc8aa806a036f127cd64f97eaa1b4d72e1edad` |
| Merge strategy | **Squash merge** (single parent `314d9c63d176de4a1b30345d7f80ef13ba9b111d`) |
| Implementation commit count (branch) | **3** (`314d9c63..becc8aa80`) |
| Tree identity merge ↔ implementation HEAD | **IDENTICAL** (`git diff --stat becc8aa80 20eb441f` → empty) |
| Campaign baseline vs `main` | **Intentionally separate** — `main` has diverged (see §A.5) |

### A.2 Baseline health (verified at `20eb441f`)

| Metric | Expected | Actual |
|--------|----------|--------|
| EN keys | 8867 | **8867** |
| DE keys | 8867 | **8867** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P255A enforce-clean | 0 | **0** (5 exact paths) |
| P254 enforce-clean | 0 | **0** (8 exact paths) |
| P254–P216 regression | 0 | **0** (guarded by existing tests) |
| Global enforce-clean remaining | 0 | **0** |
| Global scanner | 1430 | **1430** |
| Rental scanner | 333 | **333** |
| Finance/Billing scanner | 51 | **51** |
| `npm run i18n:check` | PASS | **PASS** |
| `npm run check:surface` | PASS | **PASS** |
| P255A localization suite | PASS | **9/9** (`rental-tenant-billing-tariff-vehicles-localization.test.tsx`) |

### A.3 P255A freeze verification

Frozen P255A paths remain scanner-clean and must not be altered by P255B:

- `TenantBillingTariffVehiclesTab.tsx` — intro/error chrome only
- `TenantTariffSummarySection.tsx`
- `TenantPricingBreakdownSection.tsx`
- `BillingPriceTierLadder.tsx`
- `rental-tenant-billing-i18n.ts` — P254/P255A exports only

**P255A scanner debt = 0.** P255B must add adapter exports only; no P255A semantic diff permitted.

### A.4 P255B deferred debt reference

| Surface | Scanner findings |
|---------|------------------|
| `TenantBillableVehiclesTable.tsx` | **5** |
| `TenantVehicleChangesSection.tsx` | **4** |
| `tenant-tariff-vehicles.utils.ts` | **0** (hidden helper debt: 3 German `changeTypeLabel` strings) |
| **Total visible** | **9** |

### A.5 Current `main` drift (P255B candidate paths)

| Path | Drift vs `20eb441f` |
|------|---------------------|
| `TenantBillableVehiclesTable.tsx` | Cosmetic only (`rounded-2xl` → `rounded-lg` on loading skeleton) |
| `TenantVehicleChangesSection.tsx` | Cosmetic only (same) |
| `tenant-tariff-vehicles.utils.ts` | **HIGH** — `main` reintroduced P255A German `pricingBreakdownRows` helpers (pre-P255A state) |
| `rental-tenant-billing-i18n.ts` | **HIGH** — deleted on `main` |
| `useBillingTariffVehicles.ts` | **NONE** |

**Baseline strategy:** **DIRECT FROM P255A MERGE BASELINE** (`20eb441f`). Do not absorb unrelated `main` drift.

---

## PART B — Billable Vehicles Runtime / Domain

### B.1 Production mount trace (proven)

```
Settings (settingsTab=billing)
  → BillingTab.tsx (subTab state + URL sync)
    → billingSubTab=tariff-vehicles
      → TenantBillingTariffVehiclesTab.tsx
        → useBillingTariffVehicles(orgId)  [hook]
        → TenantBillableVehiclesTable.tsx   [P255B]
        → TenantVehicleChangesSection.tsx [P255B]
```

`BillingTab.tsx` line 167–168 mounts `TenantBillingTariffVehiclesTab` when `subTab === 'tariff-vehicles'`. Both P255B components are production-mounted on the same tab surface.

### B.2 DTO domain inventory (`TenantBillableVehicleListItemDto`)

| Field | Classification | Notes |
|-------|----------------|-------|
| `id` | RAW IDENTITY | Row key; order tie-breaker |
| `licensePlate` | RAW IDENTITY | Searchable; displayed raw |
| `make` | RAW IDENTITY | Included in `vehicleLabel`; searchable |
| `model` | RAW IDENTITY | Included in `vehicleLabel`; searchable |
| `vehicleLabel` | RAW IDENTITY | Backend-composed `make + model`; displayed raw |
| `stationName` | RAW IDENTITY / BACKEND TEXT | `currentStation ?? homeStation`; searchable |
| `billableFrom` | DATE (raw ISO) | Locale formats display only |
| `billableUntil` | DATE (raw ISO) | Locale formats display only |
| `billingStatus` | MACHINE VALUE | `BILLABLE` \| `EXCLUDED` — filter + tone CSS |
| `billingStatusLabel` | BACKEND/PROVIDER TEXT | Backend German labels today; display raw |
| `reasonLabel` | BACKEND/PROVIDER TEXT | Backend-resolved exclusion/inclusion reason |

**Not in DTO (frontend-only):** search input, filter machine value, page/pageSize/sort query state.

### B.3 Raw identity hard freeze

Provider fixtures must preserve exact DE/EN strings with no translation:

- `vehicleLabel`: `Mietwagen Sonderfall X7`
- `licensePlate`: `KS-FS-7777`
- VIN: not exposed in list DTO (N/A for table)
- `stationName`: `Station X7`
- `billingStatusLabel`: `Provider Status X7` (if API supplies)
- `reasonLabel`: `Provider Reason X7`

### B.4 Billing status machine

| Machine | Source | Business use | Baseline visible label | Tone |
|---------|--------|--------------|------------------------|------|
| `BILLABLE` | Backend snapshot classification | Filter `status=BILLABLE`; row inclusion | Backend `billingStatusLabel` = `Abrechenbar` | `sq-tone-brand` |
| `EXCLUDED` | Backend snapshot classification | Filter `status=EXCLUDED`; row inclusion | Backend `billingStatusLabel` = `Nicht abrechenbar` | `sq-tone-warning` |

No `PENDING`, `ENDED`, or `UNKNOWN` in repository DTO.

### B.5 `billingStatusLabel` raw precedence

**Current behavior:** UI renders `{vehicle.billingStatusLabel}` directly (line 128). Backend sets German strings in `tenant-billable-vehicles-list.service.ts`:

```typescript
billingStatusLabel: billingStatus === 'BILLABLE' ? 'Abrechenbar' : 'Nicht abrechenbar'
```

**Contract:** Preserve authoritative backend text. Do **not** replace with local status mapping. Tone may continue to key off `billingStatus` machine only.

### B.6 Billability hard freeze

Billability is determined exclusively by backend `BillableVehiclesService` snapshot (`billableVehicles` vs `excludedVehicles` arrays). Frontend filter uses machine `billingStatus` equality only. **No translated string may determine billability, counts, or filter predicates.**

### B.7 Filter machine inventory

| Machine value | URL/query | Visible label (baseline DE) |
|---------------|-----------|----------------------------|
| `''` (undefined) | omitted | `Alle Status` |
| `BILLABLE` | `status=BILLABLE` | `Abrechenbar` |
| `EXCLUDED` | `status=EXCLUDED` | `Nicht abrechenbar` |

Default: all (`''`). Changing filter resets `page` to 1.

### B.8 Search semantics

**Searchable raw fields** (backend `applyFilters`): `licensePlate`, `make`, `model`, `vehicleLabel`, `stationName`. Normalization: `toLowerCase()` substring match. **Do not search translated labels.**

Default sort: `licensePlate` asc. Allowed sort fields per backend: `licensePlate`, `make`, `billableFrom`, `billingStatus`.

### B.9 Pagination semantics

| State | Default | Reset on filter/search |
|-------|---------|------------------------|
| `page` | 1 | yes (filter/search change) |
| `pageSize` | 10 (vehicles) | no |
| `sort` | `licensePlate` | no |

Locale switch must not reset page/filter/search/sort. Vehicle row IDs/order frozen across locales.

### B.10 Vehicle table host copy inventory

| Copy | Baseline DE | Reuse candidate |
|------|-------------|-----------------|
| Error title | `Fahrzeugliste konnte nicht geladen werden` | **new** `tenantBilling.tariff.vehicles.loadErrorTitle` |
| Retry | `Erneut versuchen` | **reuse** `common.retry` |
| Section title | `Fahrzeuge in der Abrechnung` | **new** `tenantBilling.tariff.vehicles.title` |
| Search placeholder | `Kennzeichen oder Modell suchen…` | **new** `tenantBilling.tariff.vehicles.searchPlaceholder` |
| Filter all | `Alle Status` | **reuse** `tasks.filter.statusAll` (ACCEPTABLE) |
| Filter billable | `Abrechenbar` | **new** `tenantBilling.tariff.vehicles.filter.billable` |
| Filter excluded | `Nicht abrechenbar` | **new** `tenantBilling.tariff.vehicles.filter.excluded` |
| Empty title | `Keine Fahrzeuge in der Abrechnung` | **new** |
| Empty description | long DE body | **new** |
| Col license plate | `Kennzeichen` | **reuse** `fleet.licensePlate` |
| Col vehicle | `Fahrzeug` | **reuse** `bookings.vehicle` |
| Col station | `Standort` | **reuse** `vehicle.station` |
| Col billable from/until | `Abrechenbar seit/bis` | **new** (2 keys) |
| Col billing status | `Abrechnungsstatus` | **new** |
| Col reason | `Grund` | **new** or search `common.reason` |
| Pagination summary | `{n} von {total} Fahrzeugen` | **new** |
| Back/Next | `Zurück`/`Weiter` | **reuse** `common.back` / `common.next` |
| Page of | `Seite {page} von {totalPages}` | **new** or adapt `invoices.list.pagination.page` (format differs: `/` vs `von`) |

**Vehicle-table new-key estimate: ~12** (after reuse).

---

## PART C — Vehicle Changes Runtime / Domain

### C.1 DTO domain inventory (`TenantVehicleBillingChangeDto`)

| Field | Classification | Notes |
|-------|----------------|-------|
| `id` | RAW IDENTITY | Row key; sort tie-breaker |
| `licensePlate` | RAW IDENTITY | Display + search (backend) |
| `vehicleLabel` | RAW IDENTITY | Fallback display |
| `changeType` | MACHINE VALUE | `ADDED` \| `REMOVED` \| `CHANGED` |
| `eventTypeLabel` | BACKEND/PROVIDER TEXT | `resolveVehicleLicenseEventLabel(eventType)` — raw |
| `effectiveAt` | DATE (raw ISO) | Default sort `-effectiveAt` |
| `prorationAmount` | MONEY (provider formatted) | `formatted` precedence; cents unchanged |
| `reason` | BACKEND/PROVIDER TEXT | Raw when present |

### C.2 Change type machine

| Machine | Backend resolver | Baseline DE label (utils) | EN reuse candidate |
|---------|------------------|---------------------------|-------------------|
| `ADDED` | `VEHICLE_CONNECTED` / `VEHICLE_INCLUDED` / delta>0 | `Hinzugefügt` | `rentalRules.workflow.publish.kindAdded` → **Added** |
| `REMOVED` | `VEHICLE_DISCONNECTED` / `VEHICLE_EXCLUDED` / delta<0 | `Entfernt` | `rentalRules.workflow.publish.kindRemoved` → **Removed** |
| `CHANGED` | default | `Geändert` | `rentalRules.workflow.publish.kindChanged` → **Changed** |

### C.3 Change type reuse quality

| Candidate | Quality | Rationale |
|-----------|---------|-----------|
| `rentalRules.workflow.publish.kindAdded` | **ACCEPTABLE** | Exact EN semantics; cross-domain (workflow publish) but stable host display mapping |
| `rentalRules.workflow.publish.kindRemoved` | **ACCEPTABLE** | Same |
| `rentalRules.workflow.publish.kindChanged` | **ACCEPTABLE** | Same |

Implement via `resolveVehicleChangeTypeLabel(changeType, t)` in `rental-tenant-billing-i18n.ts` — machine→display only.

### C.4 Raw event / reason / proration / timestamp freeze

- `eventTypeLabel`: display raw (`Provider Event X7`)
- `reason`: display raw (`Provider Reason X7`)
- `prorationAmount.formatted`: display raw (`123,45 € PROVIDER-X7`); fallback locale money only when `formatted` absent
- `effectiveAt`: same ISO; locale date formatting only
- Order: backend `-effectiveAt` default; same event IDs/order across locales

### C.5 Changes pagination

| State | Default |
|-------|---------|
| `page` | 1 |
| `pageSize` | 5 |
| `sort` | `-effectiveAt` |

Locale switch must not reset changes page/sort.

### C.6 Changes host copy inventory

| Copy | Baseline DE | Plan |
|------|-------------|------|
| Error title | `Änderungen konnten nicht geladen werden` | **new** |
| Retry | `Erneut versuchen` | **reuse** `common.retry` |
| Title | `Änderungen an der Fahrzeugmenge` | **new** |
| Subtitle | proration period hint | **new** |
| Empty | `Noch keine Fahrzeugänderungen` | **new** |
| Vehicle fallback | `Fahrzeug` | **reuse** `bookings.vehicle` |
| Proration label | `Anteilige Berechnung` | **new** |
| Pagination | `Zurück`/`Weiter`/`Seite X von Y` | reuse back/next + shared page key |

**Changes-section new-key estimate: ~6** (after reuse).

---

## PART D — Filter / Pagination / Metering / Proration Freeze

### D.1 Vehicle billing freeze matrix

| Field | Source | Business use | Display use | May localize? | Must remain unchanged? |
|-------|--------|--------------|-------------|---------------|------------------------|
| `billingStatus` | Backend snapshot | Filter predicate, tone | — | No (machine) | **Yes** |
| `billingStatusLabel` | Backend mapper | — | Badge text | No (raw) | **Yes** (exact string) |
| `billableFrom` | Assignment DB | Metering window | Date display | Format only | **Yes** (ISO value) |
| `billableUntil` | Assignment DB | Metering window | Date display | Format only | **Yes** (ISO value) |
| `reasonLabel` | Backend mapper | Exclusion explanation | Cell text | No (raw) | **Yes** |
| `licensePlate` | Vehicle DB | Search, identity | Cell text | No | **Yes** |
| `vehicleLabel` | Backend compose | Search, identity | Cell text | No | **Yes** |
| `stationName` | Station DB | Search, identity | Cell text | No | **Yes** |

### D.2 Change event freeze matrix

| Field | Machine/raw | Display mapping | May localize? | Must remain unchanged? |
|-------|-------------|-----------------|---------------|------------------------|
| `changeType` | `ADDED`/`REMOVED`/`CHANGED` | Adapter label | Host label only | **Yes** (machine) |
| `eventTypeLabel` | Backend event label | Raw text | No | **Yes** |
| `reason` | Backend reason | Raw text | No | **Yes** |
| `effectiveAt` | ISO timestamp | Locale date | Format only | **Yes** (instant) |
| `prorationAmount` | cents + formatted | Raw formatted | Fallback format only | **Yes** (cents/currency) |

### D.3 Filter / pagination state freeze matrix

| State | Vehicles default | Changes default | Locale switch |
|-------|------------------|-----------------|---------------|
| `page` | 1 | 1 | preserve |
| `pageSize` | 10 | 5 | preserve |
| `sort` | `licensePlate` | `-effectiveAt` | preserve |
| `search` | undefined | undefined (UI has no search chrome today) | preserve |
| `status` filter | undefined (all) | N/A | preserve |
| `billingSubTab` | `tariff-vehicles` | same | preserve |
| Row/event order | backend sort | backend sort | preserve |

### D.4 Money / proration precedence

1. If `prorationAmount.formatted` present → render exact raw string.
2. If absent → `formatRentalTenantBillingMoney(locale, cents, currency)` fallback only.
3. No frontend recalculation of proration cents.

### D.5 Same-mount combined contract

Single `BillingTab` mount at `billingSubTab=tariff-vehicles`. After vehicle search (`KS-FS-7777`), filter selection, vehicle page change, and changes page change: **DE → EN → DE** must preserve subTab URL, search input, filter machine value, vehicle page/pageSize/sort, vehicle IDs/order, all raw provider fields, changes page/pageSize/sort, change IDs/order, callbacks, and React identity. Only host chrome strings change.

### D.6 Category E feasibility

P255B is presentation-only. Required zeros:

- financial semantic modifications = **0**
- metering semantic modifications = **0**
- billability semantic modifications = **0**
- proration semantic modifications = **0**
- filter semantic modifications = **0**
- pagination semantic modifications = **0**
- vehicle identity modifications = **0**
- provider semantic modifications = **0**
- mutation semantic modifications = **0**
- permission semantic modifications = **0**

**Category E = 0 — FEASIBLE.**

---

## PART E — Key / Reuse / Split Decision

### E.1 Vehicle table key reuse audit

| Candidate | Verdict |
|-----------|---------|
| `common.retry` | **EXACT reuse** |
| `common.back` / `common.next` | **EXACT reuse** |
| `fleet.licensePlate` | **EXACT reuse** (column) |
| `bookings.vehicle` | **EXACT reuse** (column + fallback) |
| `vehicle.station` | **EXACT reuse** (column) |
| `tasks.filter.statusAll` | **ACCEPTABLE** (`All statuses` ≈ filter-all) |
| `invoices.list.pagination.page` | **WEAK** (uses `/` not `von`) — prefer dedicated key |

### E.2 Total key budget (combined P255B)

| Group | New keys |
|-------|----------|
| `tenantBilling.tariff.vehicles.*` (title, error, search, filters×2, empty×2, cols×4, pagination×2) | **12** |
| `tenantBilling.tariff.changes.*` (title, subtitle, error, empty, proration, pagination×1 shared) | **6** |
| Shared `tenantBilling.tariff.pagination.pageOf` (vehicles + changes) | **1** (counted once) |
| Change types via `rentalRules.workflow.publish.kind*` | **0 new** (reuse) |
| Adapter-only exports | **0 new** |

**Total projected new EN+DE keys: 22** (central estimate; range 20–24).

| Gate | Status |
|------|--------|
| ≤24 ideal | **PASS** (22) |
| 25–28 justify | N/A |
| >32 split | N/A |

### E.3 Split analysis

| Option | Assessment |
|--------|------------|
| A — Billable Vehicles only | Unnecessary — shared mount/hook/pagination patterns |
| B — Vehicle Changes only | Unnecessary — only 6 new keys isolated |
| **C — Combined P255B** | **SELECTED** — 22 keys, single tab, single hook, 9 scanner findings |

**Decision: ONE SLICE — BILLABLE VEHICLES + VEHICLE CHANGES**

### E.4 Adapter extension strategy (`rental-tenant-billing-i18n.ts`)

**Allowed P255B additions:**

- `resolveVehicleChangeTypeLabel(changeType, t)` — machine→display via `rentalRules.workflow.publish.kind*`
- `formatRentalTenantBillingDate` reuse for vehicle/change dates (replace `formatDateDe` in components)
- Static `TranslationKeys` for vehicles/changes host chrome
- Optional stable billing-status fallback labels **only if** baseline already had host fallback (it does not — raw backend label only)

**Forbidden:**

- Billability logic, filtering, sorting, pagination, proration calculation, provider text transform, state mutation

### E.5 `tenant-tariff-vehicles.utils.ts` boundary

At P255A baseline, utils contains **only**:

- `changeTypeLabel` — **P255B** (move to adapter; deprecate German switch)
- `changeTypeTone` — **business presentation** (CSS machine mapping; keep in utils, no i18n)

No P255A pricing breakdown helpers remain at baseline (those live in adapter). **Do not** re-import German `pricingBreakdownRows` from `main`.

### E.6 `useBillingTariffVehicles.ts`

**No changes required** unless locale threading for dates — prefer threading `locale` into components + adapter `formatRentalTenantBillingDate` without hook mutation.

---

## PART F — P255B Implementation Boundary

### F.1 Exact paths / symbols

| Path | Role | Touch scope |
|------|------|-------------|
| `TenantBillableVehiclesTable.tsx` | Primary UI | Presentation debt only |
| `TenantVehicleChangesSection.tsx` | Primary UI | Presentation debt only |
| `tenant-tariff-vehicles.utils.ts` | Helper | Remove/migrate `changeTypeLabel` only |
| `rental-tenant-billing-i18n.ts` | Adapter | Add P255B exports only |
| `rental-tenant-billing-tariff-vehicles-localization.test.tsx` | Tests | Extend P255B assertions (future) |
| `en.ts` / `de.ts` | Dictionary | +~22 keys |
| `hardcoded-copy-inventory.json` | Scanner | Auto-refresh post-implementation |

**Out of scope:** P255A components, invoices/payment/add-ons tabs, `BillableVehiclesDrawer`, backend APIs, Stripe services.

### F.2 P255B enforce-clean exact boundary (future)

```
TenantBillableVehiclesTable.tsx
TenantVehicleChangesSection.tsx
tenant-tariff-vehicles.utils.ts        # presentation remainder only
rental-tenant-billing-i18n.ts          # P255B exports only
```

No ignores, allowlists, exemptions, or scanner weakening.

### F.3 Scanner expectation

| Metric | Baseline | Post-P255B (projected) |
|--------|----------|------------------------|
| Global | 1430 | **1421** (−9) |
| Rental | 333 | **324** (−9) |
| Finance/Billing | 51 | **42** (−9) |
| P255B paths | 9 | **0** |
| Hidden utils strings | 3 | **0** (via adapter migration) |

### F.4 Negative certifications (future implementation must prove)

- P255A semantic diff = **ZERO**
- P254 semantic diff = **ZERO**
- P253–P249 semantic diff = **ZERO**
- Deferred billing (invoices/payment/add-ons) = **ZERO**

### F.5 Active collision map

| Area | Collision |
|------|-----------|
| Billing / tenant tariff | **NONE** — P255A merged and frozen |
| Vehicles / metering backend | **LOW** — read-only list APIs; no concurrent frontend work |
| Subscription / pricing | **LOW** — P255A closed |
| Open PRs on P255B exact paths | **NONE** detected |

### F.6 Test plan (future P255B implementation)

1. DE/EN host chrome for vehicles table + changes section
2. Same-mount DE↔EN: preserve subTab, search `KS-FS-7777`, filter machine, vehicle page, changes page
3. Raw fixtures: vehicle identity, `billingStatusLabel`, `eventTypeLabel`, `reason`, proration formatted
4. Billability: filter `BILLABLE`/`EXCLUDED` predicate unchanged
5. Change type machine labels via adapter reuse
6. Row/event order stable across locale switch
7. P255A regression suite still green
8. P255B enforce-clean = 0 on exact boundary
9. `npm run i18n:check` + `check:surface` + build

---

## PART G — Progress + P256 Forecast

### G.1 Remaining debt

| Scope | Count |
|-------|-------|
| Global scanner (actionable) | **1430** |
| Rental scanner | **333** |
| Finance/Billing scanner | **51** |
| Tenant Billing active (post-P255B projection) | **42** |
| P255B deferred (this slice) | **9** |

### G.2 Global i18n completion (methodology: scanner-closure vs campaign budget)

| Estimate | % |
|----------|---|
| Conservative | **~85.5%** |
| Central | **~85.7%** |
| Optimistic | **~85.9%** |
| Confidence | **HIGH** (baseline metrics match post-P255A reference exactly) |

Do not credit P255B before implementation.

### G.3 P256 forecast — Tenant Billing Invoices

After P255B merge, next bounded slice:

**P2.2.56 — Tenant Billing Invoices**

| Path | Finance/Billing findings |
|------|--------------------------|
| `TenantInvoiceDetailDrawer.tsx` | 9 |
| `BillingInvoiceSection.tsx` | 7 |
| `BillingInvoiceDetailDrawer.tsx` | 5 |
| `TenantInvoicesSection.tsx` | (mounted via `TenantBillingInvoicesTab`) |

Revalidate mount boundary after P255B merge. Do not begin P256 in this audit.

---

## Final Verdict

**A — GO — P2.2.55B BILLABLE VEHICLES + VEHICLE CHANGES SELECTED**

```
P2.2.55B: Billable Vehicles Table + Vehicle Changes Section (combined)
CAMPAIGN: RENTAL
P255A STATUS: FROZEN
GLOBAL I18N COMPLETION: ~85.5% – ~85.9% (central ~85.7%)
REMAINING ACTIONABLE DEBT: 1430
IMPLEMENTATION NOT STARTED.
```

**Changes / Architektur updated:** NO (audit-only pre-flight; no production or architecture changes).
