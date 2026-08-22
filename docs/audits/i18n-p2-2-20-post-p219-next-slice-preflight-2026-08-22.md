# P2.2.20 — Post-P219 Residual Prioritization & Next Slice Selection — Pre-Flight Audit

**Date:** 2026-08-22  
**Mode:** Strict read-only pre-flight  
**Authoritative baseline SHA:** `9b714458088accf6bf240f3287070d67caab2474` (PR #1155 merge — P2.2.19 Rental Insurances View Localization)

---

## 0. Baseline Verification — PASS

| Check | Independent result |
|-------|-------------------|
| PR #1155 merged | Yes (`mergedAt: 2026-08-22T05:12:54Z`) |
| Merge SHA | `9b714458088accf6bf240f3287070d67caab2474` |
| P218 ancestry (`d645343f`) | Present |
| P219 ancestry (`741d947d`) | Present (via merge) |
| `npm run i18n:check` | **PASS** (217 tests) |
| Canonical keys | **8122 EN / 8122 DE** (100% parity) |
| Global active enforce-clean debt | **0** |
| P219 enforce-clean | **0** |
| P218 / P217 / P216A/B1/B2/C1/C2A/C2B | **0** |
| Shim | **29** (18 prod, 11 test) |
| New compat consumers | **0** |
| P219 orphan correction | Complete (197 live keys, 0 orphans) |

**Methodology:** Fresh `npm run i18n:check` on detached HEAD `9b714458`; inventory regenerated to `hardcoded-copy-inventory.json`; enforce-clean debt read from scanner output and guard tests.

---

## 1. Residual Inventory (Post-P219)

| Metric | P219 pre-flight (d645343f) | Post-P219 (9b714458) | Delta |
|--------|---------------------------|----------------------|-------|
| Global scanner inventory | 1718 | **1665** | −53 |
| Active enforce-clean findings | 0 | **0** | 0 |
| Rental residuals | 487 | **434** | −53 |
| Master residuals | 1049 | **1049** | 0 |
| Operator residuals | 156 | **156** | 0 |
| Shared residuals | 1 | **1** | 0 |
| Shell residuals | 25 | **25** | 0 |

**Important:** Scanner inventory ≠ enforce-clean debt. Global enforce-clean remains **0** by design; residual inventory outside frozen boundaries is expected and not a failure.

### P219 removal verification

| File | Findings |
|------|----------|
| `rental/components/InsurancesView.tsx` | **0** |
| `rental/lib/insurances-i18n.ts` | **0** |

No P219 regression (Category C) detected.

### Fixed-locale production files

| Pattern | Production file count (excl. tests) |
|---------|-------------------------------------|
| `locale === 'de'` | **~80** |
| `de-DE` hardcoded | **~80** (largely overlapping set) |

Concentrated in: rental dashboard runtime builders, fleet-health freshness, brake/tire health UI, booking-payment display, vehicle operational display helpers. **Not selected for P2.2.20** (global cleanup forbidden).

---

## 2. Domain Decomposition

### Master Admin (1049 findings) — decomposed, not monolithic

| Sub-surface | Findings | Active | Notes |
|-------------|----------|--------|-------|
| Health Tracking | 132 | Active | **TOO LARGE** — internal telemetry config |
| Master Billing (components) | 100 | Active | Multi-tab, high API coupling |
| Vehicle Registration Modal | 95 | Active | Workflow modal, DMV semantics |
| High Mobility Data | 65 | Active | Integration diagnostics |
| Insurances Admin | 59 | Active | Master counterpart to rental insurance |
| Performance Logic | 56 | Active | Internal algorithm config |
| Connected Vehicles | 50 | Active | Import/detail flows |
| Security Access | 47 | Active | IAM-sensitive |
| Prospects | 47 | Active | **Bounded single view** — candidate |
| Trip Detection Logic | 38 | Active | Internal config |
| System Monitoring | 37 | Active | Ops tooling |
| Architektur / Changes | 52 | Active | Changelog prose (low user i18n value) |
| Voice Assistant Admin | 25 | Active | Partially localized elsewhere |
| Parts Accessories Admin | 25 | Active | Master mirror of rental parts |

### Rental residuals (434 findings) — post-freeze exclusions

**Frozen (do not reopen):** P216 Task Detail, P217 Vehicle Picker, P218 Data Authorization, P219 Insurances, P212 Fines, P2215 Vendor Directory (0 scanner findings on `VendorManagementView.tsx`).

| Cluster | Findings | Files | Status |
|---------|----------|-------|--------|
| Damages | 91 | 8+ | **SPLIT REQUIRED** — multi-file workflow |
| Billing/Tenant | 74 | 4+ | Finance coupling |
| Users/Roles | 67 | 5+ | IAM coupling |
| Invoices | 53 | 3+ | Monetary API |
| Analytics (DataAnalyse) | 32 | 1 | Active, technical coupling |
| Parts & Accessories | 25 | 1 | **Active, bounded** |
| Documents | 23 | 1 | Legal content risk |
| Insights cockpit | 25 | 2 | Analytics |
| Other | 33 | scattered | — |

### Operator (156 findings)

| Surface | Findings | Active |
|---------|----------|--------|
| OperatorVehicleQuickView | 22 | **High-frequency field ops** |
| OperatorBookingFormSheet | 16 | Active |
| OperatorTodayView | 12 | Active |
| OperatorAiUploadFlow | 11 | Active |
| OperatorTireMeasureFlow | 11 | Active |

### Shared / Shell (26 findings)

Low-volume shared patterns (`format-utils.ts`, `states.tsx`, `pagination.tsx`, MFA dialogs). High leverage but cross-cutting — poor P220 boundary without broad refactor.

### Communication / Notifications

Scanner shows minimal residual in comm surfaces (`SupportView.tsx` master: 1 finding). Dashboard notification copy largely migrated to `dashboard-i18n.ts` but **fixed-locale ternaries remain in dashboard builders** (~40 files) — architectural follow-on, not a single-view slice.

---

## 3. Scanner-Blind Debt Estimate

Estimated hidden presentation literals beyond scanner rows (option maps, badge helpers, wizard step labels, fixed formatters):

| Candidate | Scanner | Est. hidden | Fixed-locale |
|-----------|---------|-------------|--------------|
| PartsAccessoriesView | 25 | ~35–45 | 1 (`de-DE` currency) |
| DataAnalyseView | 32 | ~25–35 | via helper modules |
| CreateInvoiceDialog | 24 | ~20–30 | monetary |
| DocumentsView | 22 | ~20 | legal labels |
| OperatorVehicleQuickView | 22 | ~15–25 | 0 |
| ProspectsView (Master) | 47 | ~30–40 | 0 |
| Damages cluster | 91 | ~60+ | mixed |

---

## 4. Top 10 Candidates (Ranked)

| Rank | Domain | Surface | Files | Scanner | Hidden est. | User impact | Business coupling | Boundedness | Arch leverage | Testability | Est. keys | Risk | Rec? |
|------|--------|---------|-------|---------|-------------|-------------|-------------------|-------------|---------------|-------------|-----------|------|------|
| 1 | Rental | **Parts & Accessories View** | 1 (+adapter) | 25 | ~40 | 4 | 2 | 5 | 4 | 4 | 55–75 | Low | **YES** |
| 2 | Rental | Data Analyse View | 1 (+helpers) | 32 | ~30 | 3 | 4 | 4 | 3 | 3 | 60–90 | Med | Maybe |
| 3 | Operator | Vehicle Quick View | 2 | 22 | ~20 | 5 | 3 | 4 | 3 | 4 | 40–60 | Med | Maybe |
| 4 | Rental | Create Invoice Dialog | 1 | 24 | ~25 | 4 | 4 | 5 | 2 | 3 | 45–65 | Med-High | Maybe |
| 5 | Rental | Documents View | 1 | 22 | ~20 | 4 | 3 | 4 | 2 | 3 | 40–55 | Legal | Caution |
| 6 | Master | Prospects View | 1 | 47 | ~35 | 2 | 3 | 4 | 2 | 3 | 50–70 | Low | Maybe |
| 7 | Master | Insurances Admin View | 1 | 59 | ~40 | 2 | 4 | 3 | 3 | 2 | 70–90 | Med | Later |
| 8 | Rental | Users Create Wizard | 1 | 16 | ~25 | 4 | 4 | 3 | 2 | 3 | 50+ | IAM | Split |
| 9 | Operator | Booking Form Sheet | 1 | 16 | ~15 | 5 | 4 | 4 | 2 | 4 | 40–55 | Med | Later |
| 10 | Rental | Insights Cockpit | 2 | 13 | ~15 | 3 | 2 | 3 | 2 | 2 | 35–50 | Low | Later |

---

## 5. Excluded Major Candidates

| Candidate | Reason |
|-----------|--------|
| Master Admin (whole) | TOO LARGE — 1049 findings |
| HealthTrackingView | TOO LARGE — 132 findings, internal config |
| Rental Damages cluster | SPLIT REQUIRED — 8+ files, 91 findings |
| Dashboard fixed-locale cleanup | Global refactor — ~40 files, forbidden scope |
| Global `locale === 'de'` sweep | ~80 files — hygiene, not product slice |
| ArchitekturView / ChangesView | Low user-facing i18n value (changelog prose) |
| VendorManagementView | Already localized (0 scanner findings) |
| P216–P219 frozen surfaces | Regression-only |

---

## 6. Selected P2.2.20 Target

### **P2.2.20 — Rental Parts & Accessories View Localization**

**Decision:** **ONE SLICE**

**Rationale:**

- **Active production route** (`App.tsx` → `PartsAccessoriesView`) — fleet ops users search/order tires, parts, accessories
- **Highly bounded:** single primary view file (1,141 lines), mirrors P2.2.12 Fines / P2.2.19 Insurances precedent
- **Scanner debt:** 25 visible + ~40 blind (category meta, availability/fitment badges, 6-step wizard labels, sort/filter chrome, fixed `de-DE` currency)
- **Semantic safety:** machine enums (`TIRES`/`PARTS`/`ACCESSORIES`, sort keys, stock/fitment statuses) cleanly separable
- **Category E = 0** expected — presentation-only migration
- **User impact:** meaningful rental operations surface without finance/legal/IAM coupling
- **Architectural leverage:** establishes `partsAccessories.*` namespace + presentation adapter pattern for future Master `PartsAccessoriesAdminView` (deferred)

**Why not DataAnalyseView (#2):** higher telemetry/API diagnostic coupling, depends on `device-connection-ui` / `rpm-webhook-ui` helper expansion (multi-file risk).

**Why not Operator Quick View (#3):** crosses operator surface; better as dedicated operator slice after continued rental momentum.

---

## 7. P2.2.20 Implementation Contract (Pre-Flight — NOT IMPLEMENTED)

**AUTHORITATIVE BASE:** `9b714458088accf6bf240f3287070d67caab2474`

### IN SCOPE

| Path | Role |
|------|------|
| `rental/components/PartsAccessoriesView.tsx` | Primary view — 6-step search wizard, results, detail |
| `rental/lib/parts-accessories-i18n.ts` | Presentation adapter (new) |
| `i18n/translations/partsAccessories.{en,de}.ts` | Dictionary module (new) |
| P220 enforce-clean boundary + blind-spot guards | Scanner/governance |
| `rental-parts-accessories-localization.test.tsx` | EN/DE/runtime tests |

### OUT OF SCOPE

- Master `PartsAccessoriesAdminView.tsx`
- Damages, invoices, billing, users/roles, documents
- Dashboard notification/fixed-locale builders
- Global `locale === 'de'` cleanup
- P216–P219 frozen surfaces
- Business/API/permission changes

### P220_ENFORCE_CLEAN_EXACT (proposed)

```
rental/components/PartsAccessoriesView.tsx
rental/lib/parts-accessories-i18n.ts
```

### Machine values to freeze (Category E = 0)

| Value set | Machine identifiers |
|-----------|---------------------|
| Category | `TIRES`, `PARTS`, `ACCESSORIES` |
| Sort | `relevance`, `price_asc`, `price_desc` |
| Availability | `in_stock`, `limited`, `out_of_stock`, unknown fallback |
| Fitment | `exact_fit`, `likely_fit`, `universal` |
| Wizard step | numeric `0`–`5` (Vehicle → Detail) |
| API | `api.partsAccessories.{providers,disclosure,search,confirmDisclosure,productDetail}` |
| Search params | `category`, `vehicleId`, `providerKey`, `query`, sort keys |
| Dynamic data | product names, SKUs, provider names, VIN/plate, prices (format only) |

### Baseline presentation inventory (PartsAccessoriesView)

| Class | Examples |
|-------|----------|
| Scanner-visible | Page title, search placeholder, wizard chrome, table headers, empty states |
| Scanner-blind | `STEP_LABELS`, `CATEGORY_META` labels/descriptions, `availabilityBadge`/`fitmentBadge` labels |
| Fixed-locale | `Intl.NumberFormat('de-DE', …)` in `formatPrice` |
| Status maps | Category, availability, fitment → TranslationKey maps |
| Wizard steps | 6 steps: Vehicle, Category, Provider, Authorization, Results, Detail |
| Actions | Back, Next, Search, Confirm, View detail |
| Empty/error | No vehicles, no providers, search failed, no results |

### Key reuse strategy

| Classification | Keys |
|----------------|------|
| Exact reuse | `nav.partsAccessories` (page title candidate) |
| Semantic reuse | `common.back`, `common.cancel`, `common.next`, `common.retry`, `common.search` (evaluate at implementation) |
| New namespace | `partsAccessories.*` (~55–75 estimated) |
| Duplicate risk | Category labels vs nav label — use distinct keys |

### Future test plan

- EN/DE overview + wizard step 1 render
- Category/availability/fitment status label maps
- Runtime DE ↔ EN switch
- Machine filter/sort/category values unchanged
- Provider/product/VIN dynamic data raw
- Locale-aware currency formatting
- P220 enforce-clean = 0
- No translation-key leakage

### Acceptance (future)

1. P220 scanner debt = 0  
2. Hidden presentation debt = 0  
3. Fixed-locale presentation debt = 0  
4. EN/DE correct + runtime switch  
5. Category E = 0  
6. Parity 100%, orphans 0  
7. `npm run i18n:check` PASS, global enforce-clean = 0  
8. P219–P216 freezes preserved  
9. Shim ≤ 29, new compat consumers = 0  

---

## 8. Shim Opportunity (document only)

`legal-documents-i18n.ts` and related compat shims (29 total) could eventually retire with targeted slices — **not in P2.2.20 scope**.

---

## 9. Confirmation

| Item | Value |
|------|-------|
| Production code modified | **NO** |
| Dictionaries modified | **NO** |
| Tests modified | **NO** |
| Scanner modified | **NO** |
| P2.2.20 implementation started | **NO** |
| Merged | **NO** |

---

## 10. Final Verdict

### **A — GO — P2.2.20 TARGET SELECTED**

**Selected target:** P2.2.20 — Rental Parts & Accessories View Localization  
**Exact files:** `rental/components/PartsAccessoriesView.tsx`, `rental/lib/parts-accessories-i18n.ts` (proposed)  
**Slice decision:** ONE SLICE  
**Category E expectation:** 0 (achievable)
