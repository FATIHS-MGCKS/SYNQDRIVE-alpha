# P2.2.21 — Post-P220 Residual Prioritization & Next Slice Selection — Pre-Flight Audit

**Date:** 2026-08-22  
**Mode:** Strict read-only pre-flight  
**Authoritative baseline SHA:** `6413a3dd68dce6b9d0db6346a2ae9245821d22fb` (PR #1163 merge — P2.2.20 Rental Parts & Accessories View Localization)

---

## 0. Baseline Verification — PASS

| Check | Independent result |
|-------|-------------------|
| PR #1163 merged | Yes (`mergedAt: 2026-08-22T11:19:27Z`) |
| Merge SHA | `6413a3dd68dce6b9d0db6346a2ae9245821d22fb` |
| P220 implementation ancestry (`9ee7d8cb` via merge) | Present (merge commit) |
| P219 ancestry (`9b714458`) | Present |
| P218 ancestry (`d645343f`) | Present |
| P217 ancestry (`6e578fd9`) | Present |
| P216C2B ancestry (`f7095205`) | Present |
| P216A ancestry (`1370a384`) | Present |
| Working tree at audit time | Clean (detached HEAD → audit branch) |
| `npm run i18n:check` | **PASS** (230 tests) |
| Canonical keys | **8190 EN / 8190 DE** (100% parity) |
| Global active enforce-clean debt | **0** |
| P220 / P219 / P218 / P217 / P216A/B1/B2/C1/C2A/C2B | **0** each |
| Shim inventory | **29** (18 prod, 11 test) |
| New compat consumers | **0** |
| Orphan keys (EN/DE structural) | **0** |

**Methodology:** Fresh `npm run i18n:check` on detached HEAD `6413a3dd`; inventory regenerated to `hardcoded-copy-inventory.json`; enforce-clean debt verified via scanner meta (`enforceCleanRemaining: 0`) and guard-test path sets; shim via `node scripts/i18n-shim-inventory.mjs --json`; ancestry via `git merge-base --is-ancestor`.

**Verdict for §0:** Baseline intact — not Category D.

---

## 1. Purpose

P2.2.21 must select the next bounded production localization slice optimizing:

**USER IMPACT × ACTIVE PRODUCTION RELEVANCE × BOUNDEDNESS × SEMANTIC SAFETY × ARCHITECTURAL LEVERAGE × TESTABILITY**

No automatic domain bias (Rental continuation, Master size, Operator field relevance, global `locale === 'de'` cleanup, dictionary hygiene, or test-only cleanup).

---

## 2. Residual Inventory (Post-P220)

| Metric | Pre-P220 reference (P219 post-closure) | Post-P220 (`6413a3dd`) | Delta |
|--------|----------------------------------------|------------------------|-------|
| Global scanner inventory | 1665 | **1640** | −25 |
| Active enforce-clean findings | 0 | **0** | 0 |
| Rental residuals | 434 | **409** | −25 |
| Master residuals | 1049 | **1049** | 0 |
| Operator residuals | 156 | **156** | 0 |
| Shared residuals | 1 | **1** | 0 |
| Shell residuals | 25 | **25** | 0 |
| Other (MFA/shared components) | — | **26** | — |

**Methodology:** `frontend/src/i18n/hardcoded-copy-inventory.json` meta (`total`, `bySurface`) after `npm run i18n:check`; per-file grouping by `finding.file`; domain assignment by path prefix (`rental/`, `master/`, `operator/`, else Shared/Shell).

**Important:** Scanner inventory ≠ enforce-clean debt. Residual inventory outside frozen P216–P220 boundaries is expected debt, not a baseline failure.

### Scanner category breakdown (global)

| Category | Count |
|----------|------:|
| TEXT | 1156 |
| TITLE | 246 |
| LABEL | 91 |
| PLACEHOLDER | 81 |
| ARIA | 58 |
| FORMAT_LOCALE | 8 |

### Rental module breakdown (scanner meta)

| Module | Findings |
|--------|----------:|
| other Rental areas | 260 |
| Finance/Billing | 127 |
| Tasks | 13 |
| Documents | 8 |
| App / routing shell | 1 |

---

## 3. P220 Removal Verification — PASS

| Path | Scanner findings | Classification |
|------|-----------------:|----------------|
| `rental/components/PartsAccessoriesView.tsx` | **0** | Removed from candidate pool |
| `rental/lib/parts-accessories-i18n.ts` | **0** | Removed from candidate pool |

Any residual hits in these paths would be Category **E** (blocking regression). **None found.**

---

## 4. Top Active Production Surfaces (Cross-Domain Sample)

Inventory method: sort `hardcoded-copy-inventory.json` by per-file count; cross-check route/nav imports and `FinanceView` / `App.tsx` routing; classify active vs legacy.

| Domain | Surface | Exact files | Scanner | Hidden est. | Fixed-locale | Active | Role | Notes |
|--------|---------|-------------|--------:|------------:|-------------:|--------|------|-------|
| MASTER | Health Tracking | `master/components/HealthTrackingView.tsx` | 132 | high | low | Active | Master admin | Internal telemetry — **too large** |
| MASTER | Vehicle Registration | `master/components/VehicleRegistrationModal.tsx` | 95 | high | low | Active | Master admin | DMV workflow — high coupling |
| MASTER | HM Data | `master/components/HighMobilityDataView.tsx` | 65 | med | low | Active | Master admin | Integration diagnostics |
| MASTER | Insurances Admin | `master/components/InsurancesAdminView.tsx` | 59 | med | low | Active | Master admin | Large single view |
| MASTER | Parts & Accessories Admin | `master/components/PartsAccessoriesAdminView.tsx` | 25 | med | 1 | Active | Master admin | Mirrors rental P220 |
| MASTER | Vehicle Logbook | `master/components/VehicleLogbookView.tsx` | 20 | med | low | Active | Master admin | Bounded ops view |
| RENTAL | Data Analyse | `rental/components/DataAnalyseView.tsx` | 32 | med | low | Active | Rental admin | Diagnostic / analytics |
| RENTAL | **Create Invoice Dialog** | `rental/components/invoices/CreateInvoiceDialog.tsx` | **24** | **~18** | **0** | **Active** | **Finance** | **3-step create wizard** |
| RENTAL | Documents (vehicle tab) | `rental/components/DocumentsView.tsx` | 22 | ~15 | 2 | Active | Fleet ops | Vehicle detail tab |
| RENTAL | Create User Wizard | `rental/components/users-roles/CreateUserWizard.tsx` | 16 | med | low | Active | Settings | IAM-sensitive |
| RENTAL | Damages cluster | 7 files (~93 total) | 93 | high | med | Active | Fleet ops | **Must split** |
| OPERATOR | Vehicle Quick View | `operator/components/OperatorVehicleQuickView.tsx` | 22 | med | low | Active | Operator | Field workflow |
| OPERATOR | Booking Form Sheet | `operator/bookings/OperatorBookingFormSheet.tsx` | 16 | med | low | Active | Operator | Booking mutations |
| OPERATOR | Today View | `operator/views/OperatorTodayView.tsx` | 12 | med | low | Active | Operator | High-frequency hub |
| SHARED | MFA panels | `components/mfa/MfaEnrollmentPanel.tsx` | 7 | low | low | Active | Auth | Cross-surface, IAM |

---

## 5. Rental — Remaining Decomposition

**Frozen (do not reopen unless Category E regression):** P216 Task Detail cluster, P217 Vehicle Picker, P218 Data Authorization, P219 Insurances, P220 Parts & Accessories.

**Already clean (0 scanner findings on primary views):** bookings list/detail flows, customers, handover (P2.2.11), fines (P2.2.12), invoice **list** shell (P2.2.14), vendor directory (P2.2.15).

### Top remaining Rental surfaces

| Rank | Surface | File(s) | Findings | Workflow |
|------|---------|---------|----------:|----------|
| 1 | Data Analyse | `DataAnalyseView.tsx` | 32 | Admin diagnostic |
| 2 | **Create Invoice** | `CreateInvoiceDialog.tsx` | **24** | Finance → create outgoing/incoming |
| 3 | Vehicle Documents | `DocumentsView.tsx` | 22 | Vehicle detail → documents tab |
| 4 | User onboarding | `CreateUserWizard.tsx` | 16 | Settings → users/roles |
| 5 | Damages (split) | `DamageRentalSections.tsx` + 6 siblings | ~93 | Damage ops — **not one slice** |
| 6 | Insights | `InsightsCockpit.tsx` | 13 | Analytics cockpit |
| 7 | Financial Insights | `FinancialInsightsView.tsx` | 11 | Finance analytics |
| 8 | Invoice documents panel | `InvoiceDocuments.tsx` | 8 | Invoice detail adjunct |
| 9 | Tenant billing tabs | `TenantBillingOverviewTab.tsx` | 8 | Billing settings |
| 10 | User detail drawer | `UserDetailDrawer.tsx` | 10 | IAM admin |

**Best Rental candidate:** `CreateInvoiceDialog.tsx` — active finance workflow, extends P2.2.14 invoice architecture, single-file boundary, no open PR collision.

---

## 6. Master Admin — Fresh Decomposition

Master remains the largest block (**1049** findings) but must be sliced narrowly.

| Sub-surface | Files | Findings | Importance | Risk | Bounded? |
|-------------|-------|----------:|------------|------|----------|
| Health Tracking | 1 | 132 | Internal | Low user | **No** |
| Billing Control Center | 26 | ~169 | High | API/financial | **No** |
| Vehicle Registration Modal | 1 | 95 | Medium | State machine | **No** |
| HM Data / Compatibility | 2+ | 81 | Integration | API | **No** |
| Insurances Admin | 1 | 59 | Medium | Business | Borderline |
| Performance / Trip Logic | 2 | 94 | Internal config | Low UX | **No** |
| Prospects | 1 | 47 | Medium | CRM | Borderline |
| **Parts & Accessories Admin** | **1** | **25** | Medium | Low | **Yes** |
| Vehicle Logbook | 1 | 20 | Medium | Ops | **Yes** |
| Voice Assistant Admin | 1 | 25 | Medium | Config | Yes |
| Architektur / Changes | 2 | 52 | Docs-heavy | Mixed dead/live | **No** |

**Best Master candidate:** `PartsAccessoriesAdminView.tsx` (25 findings) — mirrors completed rental P220 pattern; lower everyday user impact than rental finance flows.

---

## 7. Operator — Fresh Decomposition

| Surface | File | Findings | Field impact | Testability |
|---------|------|----------:|--------------|-------------|
| Vehicle Quick View | `OperatorVehicleQuickView.tsx` | 22 | High | Good |
| Booking Form Sheet | `OperatorBookingFormSheet.tsx` | 16 | High | Good (needs API mocks) |
| Today View | `OperatorTodayView.tsx` | 12 | Very high | Moderate |
| AI Upload Flow | `OperatorAiUploadFlow.tsx` | 11 | Medium | Complex |
| Tire Measure Flow | `OperatorTireMeasureFlow.tsx` | 11 | Medium | Hardware coupling |
| Handover | cluster | **0** | High | Done (P2.2.13) |

**Best Operator candidate:** `OperatorTodayView.tsx` (12 findings) — high field frequency, but smaller presentation debt than rental finance create flow and less canonical adapter reuse than invoice create.

---

## 8. Shared / Shell Analysis

| Surface | File | Findings | Notes |
|---------|------|----------:|-------|
| MFA enrollment | `components/mfa/MfaEnrollmentPanel.tsx` | 7 | Auth — IAM sensitive |
| MFA step-up | `components/mfa/MfaStepUpDialog.tsx` | 3 | Auth |
| Pagination | `components/ui/pagination.tsx` | 3 | Generic chrome |
| Mapbox | `components/MapboxMap.tsx` | 3 | Map labels |
| Pattern states | `components/patterns/states.tsx` | 1 | Reusable empty/error |
| Shell (25 total) | various | 25 | App chrome |

**Recommendation:** Do not select broad shared refactor for P2.2.21. Narrow MFA or pagination possible but lower user impact than rental finance create.

---

## 9. Communication Center Interaction

| Classification | Evidence |
|----------------|----------|
| **A — separate active branches** | PR **#1165** (`feature/communication-center-c8-2-inbox-integration`) adds inbox UI + `rental/i18n/translations/{en,de}.ts` keys under Communication Center |
| **B — baseline debt** | Communication Center shell exists on baseline with partial localization workstreams |
| **C — defer** | **Selected:** Avoid P2.2.21 targets in `rental/components/communication-center/**` or `lib/communication/**` to prevent merge collision with #1165 / C5.2 SMS runtime (#1134) |

Communication-related localization debt on baseline is **not** the highest-impact bounded slice versus finance invoice create.

---

## 10. Parallel-Work Collision Analysis

| Candidate | Open PR overlap | Same files | Dict namespace | Conflict risk |
|-----------|----------------|------------|----------------|---------------|
| Create Invoice Dialog | **None** | **No** | `invoices.*` (extends P214) | **Low (5/5)** |
| DocumentsView | None | No | `documents.*` / vehicle | Low |
| PartsAccessoriesAdminView | None | No | `partsAccessories.*` reuse possible | Low |
| DataAnalyseView | None | No | new namespace | Low |
| OperatorVehicleQuickView | Re-audit #1096 only | No | operator | Low–medium |
| OperatorBookingFormSheet | None found | No | operator bookings | Medium |
| Communication Center | **#1165 active** | N/A | `communication.*` | **High — avoid** |
| Dashboard copy (#1131) | Active | Dashboard only | dashboard | Medium for dashboard slices |

---

## 11. Fixed-Locale Debt (Production)

Counted via `rg` on `src/{rental,master,operator,components,lib}` production `*.ts(x)` (excl. tests):

| Pattern | Approx. file count |
|---------|-------------------:|
| Any of `locale === 'de'`, `language === 'de'`, `de-DE`, `en-US` | **154** |
| Rental `locale/language === 'de'` | **79** |
| Master `locale/language === 'de'` | **1** |
| Operator `locale/language === 'de'` or `de-DE` | **4** |

### Top candidate fixed-locale

| File | Fixed-locale hits |
|------|------------------:|
| `CreateInvoiceDialog.tsx` | **0** |
| `DocumentsView.tsx` | **2** (`de-DE` in `formatFileDate`) |
| `PartsAccessoriesAdminView.tsx` | **1** |

Fixed-locale cleanup alone is **not** a valid P2.2.21 strategy (global forbidden). Create Invoice Dialog still wins on scanner + hidden debt without adding fixed-locale scope creep.

---

## 12. Scanner-Blind Debt (Top Candidates)

| Candidate | Blind-spot examples |
|-----------|---------------------|
| Create Invoice Dialog | `INVOICE_TEMPLATES` name/description in `invoice-detail.constants.ts` (0 scanner hits); toast error string; inline type picker labels; `formatAmount` display (machine cents OK) |
| DocumentsView | `fixedCostStatusLabel` map; `formatSpecValue` fallback; category meta from `vehicle-file.constants` |
| PartsAccessoriesAdminView | Admin table columns, filter maps (mirror rental P220 blind spots) |
| DataAnalyseView | Chart labels, export descriptors |

**Create Invoice hidden estimate:** ~18 literals (templates 8 + toast 1 + step chrome ~9) beyond 24 scanner hits.

---

## 13. Active / Dead Verification (Top 10)

| Candidate | Route / nav | Classification |
|-----------|-------------|----------------|
| Create Invoice Dialog | `FinanceView` → `InvoicesPage` view=`create` | **ACTIVE** |
| DocumentsView | Vehicle detail tab (`App.tsx`) | **ACTIVE** |
| PartsAccessoriesAdminView | Master nav | **ACTIVE** |
| DataAnalyseView | Rental admin route | **ACTIVE** |
| CreateUserWizard | Settings users | **ACTIVE** |
| HealthTrackingView | Master nav | **ACTIVE** (internal) |
| VehicleRegistrationModal | Master workflow | **ACTIVE** |
| OperatorVehicleQuickView | Operator vehicles | **ACTIVE** |
| OperatorBookingFormSheet | Operator bookings | **ACTIVE** |
| ArchitekturView chunks | Master docs | **MIXED** (architecture prose — poor i18n target) |

---

## 14–19. Scoring (0–5, higher = better except Business Coupling where lower = safer)

### Business-coupling (0–5, lower safer)

| Candidate | API | Payload | State | Perm | Financial | Workflow | Total |
|-----------|----:|--------:|------:|-----:|----------:|---------:|------:|
| Create Invoice Dialog | 3 | 3 | 2 | 2 | **4** | 3 | **17** |
| DocumentsView | 2 | 1 | 1 | 1 | 1 | 2 | 8 |
| PartsAccessoriesAdminView | 2 | 2 | 2 | 2 | 2 | 2 | 12 |
| DataAnalyseView | 2 | 1 | 1 | 2 | 1 | 1 | 8 |
| Damages cluster | 3 | 3 | 3 | 2 | 3 | 4 | 18 |
| OperatorBookingFormSheet | 3 | 4 | 3 | 2 | 3 | 4 | 19 |

### User-impact / boundedness / architecture / testability / collision

| Candidate | User | Bounded | Arch leverage | Testability | Collision |
|-----------|-----:|--------:|--------------:|------------:|----------:|
| Create Invoice Dialog | **5** | **5** | **5** | **5** | **5** |
| DocumentsView | 4 | 4 | 3 | 4 | 5 |
| PartsAccessoriesAdminView | 2 | 5 | 4 | 4 | 5 |
| DataAnalyseView | 2 | 4 | 2 | 3 | 5 |
| CreateUserWizard | 3 | 4 | 3 | 3 | 5 |
| OperatorTodayView | 4 | 4 | 3 | 3 | 4 |
| Damages cluster | 5 | 1 | 3 | 3 | 4 |

---

## 20. Top 10 Candidates (Ranked)

| Rank | Domain | Surface | Exact files | Scanner | Hidden | Fixed-locale | User | Coupling | Bounded | Arch | Test | Collision | Est. keys | Risk | Rec? |
|------|--------|---------|-------------|--------:|-------:|-------------:|-----:|---------:|--------:|-----:|-----:|----------:|----------:|------|:----:|
| 1 | RENTAL | Create Invoice Dialog | `CreateInvoiceDialog.tsx` | 24 | ~18 | 0 | 5 | 17 | 5 | 5 | 5 | 5 | ~65 | Med | **YES** |
| 2 | RENTAL | Vehicle Documents tab | `DocumentsView.tsx` | 22 | ~15 | 2 | 4 | 8 | 4 | 3 | 4 | 5 | ~55 | Low | Alt |
| 3 | MASTER | Parts & Accessories Admin | `PartsAccessoriesAdminView.tsx` | 25 | ~12 | 1 | 2 | 12 | 5 | 4 | 4 | 5 | ~60 | Low | Alt |
| 4 | RENTAL | Data Analyse | `DataAnalyseView.tsx` | 32 | ~10 | 0 | 2 | 8 | 4 | 2 | 3 | 5 | ~70 | Low | No |
| 5 | RENTAL | Create User Wizard | `CreateUserWizard.tsx` | 16 | ~10 | 0 | 3 | 14 | 4 | 3 | 3 | 5 | ~50 | Med | No |
| 6 | MASTER | Vehicle Logbook | `VehicleLogbookView.tsx` | 20 | ~8 | 0 | 2 | 10 | 4 | 3 | 3 | 5 | ~45 | Low | No |
| 7 | OPERATOR | Today View | `OperatorTodayView.tsx` | 12 | ~8 | 0 | 4 | 12 | 4 | 3 | 3 | 4 | ~40 | Med | No |
| 8 | OPERATOR | Vehicle Quick View | `OperatorVehicleQuickView.tsx` | 22 | ~10 | 0 | 4 | 14 | 4 | 3 | 3 | 4 | ~50 | Med | No |
| 9 | RENTAL | Insights Cockpit | `InsightsCockpit.tsx` | 13 | ~8 | 0 | 3 | 9 | 4 | 2 | 3 | 5 | ~40 | Low | No |
| 10 | SHARED | MFA Enrollment | `MfaEnrollmentPanel.tsx` | 7 | ~5 | 0 | 3 | 11 | 3 | 2 | 3 | 5 | ~25 | Med | No |

---

## 21. Three-Strategy Comparison

### A — Continue bounded Rental cleanup

| | |
|--|--|
| **Best candidate** | Create Invoice Dialog |
| **Why now** | Completes finance invoice UX after P2.2.14 list; high daily finance usage; 1-file boundary; extends `invoice-list-i18n.ts` / `invoices.list.*` namespace pattern |
| **Why not now** | Financial API payloads — requires strict machine freeze |
| **Risk** | Medium (financial workflow) — mitigated by presentation-only adapter |
| **Payoff** | High — removes mixed-language from primary invoice creation path |

### B — Start bounded Master Admin sub-surface

| | |
|--|--|
| **Best candidate** | Parts & Accessories Admin View |
| **Why now** | Direct mirror of merged P220; reusable keys from `partsAccessories.*` |
| **Why not now** | Lower user impact (master-only); does not advance primary rental ops |
| **Risk** | Low |
| **Payoff** | Medium — admin parity with rental |

### C — Start bounded Operator sub-surface

| | |
|--|--|
| **Best candidate** | Operator Today View |
| **Why now** | High field frequency hub |
| **Why not now** | Smaller debt block; booking/vehicle sheets have higher debt but higher mutation coupling; handover already done |
| **Risk** | Medium (workflow coupling) |
| **Payoff** | Medium — field UX improvement |

**Evidence-based choice:** **Strategy A** — Rental Create Invoice Dialog.

---

## 22. Excluded Candidates

| Candidate | Reason |
|-----------|--------|
| HealthTrackingView (132) | **TOO LARGE** |
| Billing Control Center (~169) | **TOO LARGE** + **TOO BUSINESS-COUPLED** |
| VehicleRegistrationModal (95) | **TOO BUSINESS-COUPLED** |
| Damages cluster (~93) | **SHOULD BE SPLIT** |
| Communication Center inbox | **ACTIVE FEATURE COLLISION** (#1165) |
| ArchitekturView / ChangesView | **DEAD/LEGACY** mix + architecture prose |
| Global `locale === 'de'` cleanup | **TOO LARGE** (forbidden scope) |
| Master Admin Localization (whole) | **TOO LARGE** |
| Invoice detail / payment drawers | **SHOULD BE SPLIT** (separate from create) |
| Test-only files | **TEST-ONLY** |

---

## 23. Selected P2.2.21 Target

### **P2.2.21 — Rental Create Invoice Dialog Localization**

| Criterion | Assessment |
|-----------|------------|
| Active production surface | Yes — `FinanceView` → `InvoicesPage` create view |
| User impact | High — finance operators |
| Substantive production files | **2** (`CreateInvoiceDialog.tsx` + new adapter) |
| Presentation concepts | ~42 (within ≤80) |
| Expected new keys | ~65 (within ≤100) |
| Category E expectation | **0** (realistic) |
| Exact boundary | Yes |
| Runtime locale switch testable | Yes (extend P214 test harness) |
| Parallel collision | None identified |

---

## 24–25. Master/Operator — Not Selected

Master would have been: **P2.2.21 — Master Parts & Accessories Admin Localization** (deferred).  
Operator would have required machine freeze on booking/vehicle IDs, workflow status, callbacks — not needed this slice.

---

## 26. One Slice Decision

**ONE SLICE** — Create Invoice Dialog is sufficiently bounded without split.

---

## 27. Baseline Presentation Inventory (Selected Target)

### `rental/components/invoices/CreateInvoiceDialog.tsx`

| Concern | Present | Examples |
|---------|---------|----------|
| Scanner-visible findings | 24 | Step titles, labels, placeholders, buttons |
| Hidden literals | ~18 | `INVOICE_TEMPLATES` name/description; toast error |
| Fixed-locale | 0 | — |
| Status/type maps | Yes | Outgoing vs incoming type cards (machine: `OUTGOING_MANUAL`, `INCOMING_VENDOR`) |
| Filters/sort | No | — |
| Table chrome | No | Line items editor only |
| Actions | Yes | Back, cancel, create, add line, attach file |
| Dialogs | Yes | Full-page create flow (3 steps: type → details → items) |
| Empty states | Minimal | Optional vehicle select |
| Errors/loading | Yes | Toast on create failure; saving spinner |
| aria/title/tooltips | Low | Icon buttons |
| Date/number formatting | Yes | `formatAmount`, date inputs (values machine) |
| Dynamic presentation | Yes | `isOut` branch labels |

### New adapter (planned)

`rental/lib/create-invoice-i18n.ts` — template label resolver, step labels, field labels, action labels, error messages.

---

## 28. Machine / Domain Freeze Inventory (P221)

**Must remain unchanged:**

| Class | Values |
|-------|--------|
| Invoice types | `OUTGOING_MANUAL`, `INCOMING_VENDOR` |
| Template IDs | `standard`, `booking`, `damage`, `extra` |
| Internal steps | `type`, `details`, `items` |
| Currency | `EUR` |
| Tax rate | `19` (presentation may localize label "MwSt 19%") |
| API operation | `api.invoices.create`, `api.invoices.uploadFile` |
| Payload fields | `type`, `title`, `description`, `vendorId`, `vendorName`, `customerId`, `vehicleId`, `notes`, `templateId`, `invoiceDate`, `dueDate`, `currency`, `lineItems[]`, `totalCents`, `imageUrl` |
| Line item shape | `description`, `quantity`, `unitPriceNetCents`, `taxRate` |
| Permission gate | `invoices` / `write` (parent `InvoicesPage`) |
| Routes | Finance → Invoices (no route change) |
| Business data | Customer names, vendor names, vehicle plates/VIN suffix — **dynamic, not translated** |

---

## 29. Key Reuse Analysis

| Type | Keys / namespace |
|------|------------------|
| **Exact reuse** | `invoices.createInvoice`, `invoices.list.action.create`, `common.cancel` (if exists), `invoices.list.emptyValue` pattern |
| **Semantic reuse** | `invoices.list.status.*` tone patterns; P214 filter label style |
| **New namespace** | `invoices.create.*` (recommended) + `invoices.create.template.{id}.*` |
| **Estimated new keys** | ~65 |
| **Duplicate risk** | Re-defining list labels already in `invoices.list.*`; template names overlapping `INVOICE_TYPE_MAP` (detail scope — out of P221) |

**Strategy:** Extend `invoices.list.en/de.ts` files or add `invoices.create.en/de.ts` spread into root dictionaries; keep machine template IDs stable.

---

## 30. P221 Exact Boundary

```
P221_ENFORCE_CLEAN_EXACT =
  rental/components/invoices/CreateInvoiceDialog.tsx
  rental/lib/create-invoice-i18n.ts
```

**Out of scope (explicit):** `invoice-detail.constants.ts` machine maps for detail view (`INVOICE_TYPE_MAP`, `PAYMENT_METHOD_OPTIONS`), `InvoiceDetail*`, `invoiceRelations.mapper.ts`, list surface (P214 frozen).

**Presentation rule:** Create flow must resolve template **labels** via `create-invoice-i18n.ts` keyed by template ID; do not change template IDs or API templateId values.

---

## 31. Blind-Spot Guard Plan

| Category | Guard |
|----------|-------|
| Table labels | N/A (line item row) |
| Status maps | Type picker outgoing/incoming cards |
| Filters | N/A |
| Actions | Cancel, create, back, add line, attach, remove line |
| Empty states | Optional selects |
| Dialogs | Step chrome strings |
| Tooltips/aria | Attachment/remove controls |
| Fixed locale | None expected post-implementation |
| Dynamic sentences | Template description with category placeholder (if any) |

---

## 32. Future Test Plan

Extend pattern from `rental-invoice-list-localization.test.tsx`:

1. EN render — create flow step 1 type selection
2. DE render — same
3. Runtime DE → EN switch mid-flow
4. Runtime EN → DE switch mid-flow
5. Machine values unchanged — `OUTGOING_MANUAL`, `INCOMING_VENDOR`, template IDs
6. Filters/sort unchanged — N/A
7. Callbacks unchanged — `onCreated`, `onClose` signatures
8. Permissions unchanged — write gate on parent page
9. Routes unchanged
10. API payload unchanged — mock `api.invoices.create` assert deep equal except presentation
11. Dynamic business data unchanged — customer/vendor names in `<option>` text
12. Dates/numbers locale-aware — `formatAmount` follows locale
13. No raw `TranslationKey` in DOM
14. No German leakage under EN
15. No English leakage under DE

---

## 33. Global i18n Freeze (Future P221)

Must preserve:

- `npm run i18n:check` = PASS
- GLOBAL ACTIVE I18N ENFORCE-CLEAN DEBT = 0
- No scanner weakening, ignores, or allowlists

---

## 34. Prior Freezes (Future P221)

Must preserve P220, P219, P218, P217, P216A, P216B1, P216B2, P216C1, P216C2A, P216C2B = **0** each.

---

## 35. Shim Freeze

| Metric | Baseline |
|--------|----------|
| Compat total | 29 |
| Compat production | 18 |
| Compat test | 11 |
| New compat consumers | 0 |

**Future requirement:** shim ≤ 29, new compat consumers = 0.  
**Retirement note:** `BusinessInsightsBox.tsx`, `FinancialInsightsView.tsx` remain shim consumers — safe retirement is out of P221 scope.

---

## 36. Implementation Contract

### P2.2.21 — Rental Create Invoice Dialog Localization

**AUTHORITATIVE BASE:** `6413a3dd68dce6b9d0db6346a2ae9245821d22fb`

**IN SCOPE:**
- `rental/components/invoices/CreateInvoiceDialog.tsx`
- `rental/lib/create-invoice-i18n.ts` (new)
- `invoices.create.*` dictionary entries (EN/DE)
- P221 enforce-clean guards + localization tests
- Architecture + Changes doc entries

**OUT OF SCOPE:**
- Invoice list (P214), detail drawers, payment flows
- `INVOICE_TYPE_MAP` / detail mappers
- Neighboring finance views (`FinancialInsightsView`, billing tabs)
- Communication Center (#1165)
- P216–P220 frozen surfaces
- API / permission / route changes
- Global fixed-locale cleanup

**Acceptance:**
1. Scoped scanner debt = 0  
2. Scoped hidden debt = 0  
3. Scoped fixed-locale presentation debt = 0  
4. EN correct  
5. DE correct  
6. Runtime locale switch correct  
7. Category E = 0  
8. Machine/domain semantics unchanged  
9. API/payload semantics unchanged  
10. Permissions unchanged  
11. Filters/sort/workflow unchanged  
12. Parity = 100%  
13. Orphans = 0  
14. P221 = 0  
15. `npm run i18n:check` PASS  
16. Global active enforce-clean debt = 0  
17. P220–P216 freezes remain 0  
18. New compat consumers = 0  
19. Shim ≤ 29  
20. Meaningful tests PASS  
21. Build PASS  
22. `git diff --check` PASS  

---

## 37. Audit Metadata

| Field | Value |
|-------|-------|
| Artifact | `docs/audits/i18n-p2-2-21-post-p220-next-slice-preflight-2026-08-22.md` |
| Branch | `cursor/p2221-post-p220-next-slice-preflight-3c10` |
| Production code modified | **NO** |
| Dictionaries modified | **NO** |
| Tests modified | **NO** |
| Scanner modified | **NO** |
| P2.2.21 implementation started | **NO** |
| Merged | **NO** |

---

## 38. Final Verdict

### **A — GO — P2.2.21 TARGET SELECTED**

**Selected target:** P2.2.21 — Rental Create Invoice Dialog Localization  
**Primary file:** `frontend/src/rental/components/invoices/CreateInvoiceDialog.tsx`  
**Supporting file:** `frontend/src/rental/lib/create-invoice-i18n.ts` (planned)
