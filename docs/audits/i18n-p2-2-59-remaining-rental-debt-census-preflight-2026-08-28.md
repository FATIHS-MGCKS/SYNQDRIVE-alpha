# P2.2.59 — Remaining Rental Debt Census + Target Selection

**Date:** 2026-08-28  
**Mode:** Strict read-only pre-flight  
**Campaign:** RENTAL  
**Frozen:** P216–P258  
**Baseline:** `7871809e94cb6cd9f80c47999878c1fafc22e608` (P2.2.58 merge)

---

## PART A — P258 freeze certification

| Check | Result |
|-------|--------|
| PR #1386 merged | **YES** (`2026-08-28T14:59:37Z`) |
| Merge SHA | `7871809e94cb6cd9f80c47999878c1fafc22e608` |
| Implementation HEAD | `b497eacc250f850c88822d3dcd28123a72f3704e` |
| Final audit #1387 | **B — READY WITH NON-BLOCKING OBSERVATIONS** |
| Same-mount observation | P258 test used **locale remounts**, not true same-mount `setLocale`. Certified **non-blocking** because `TenantBillingAddOnsTab` is stateless and parent `BillingTab` locale stability is proven in P254/P257 tests. |

### Certified dictionary / scanner (P258 merge baseline)

| Metric | Value |
|--------|-------|
| EN | 8954 |
| DE | 8954 |
| Parity | 100% |
| Orphans | 0 |
| Global scanner | 1405 |
| Rental scanner | 308 |
| Finance/Billing scanner | 25 |
| P258 enforce-clean | 0 |
| Active mounted Tenant Billing | **5/5 complete** |

---

## PART B — Selected baseline & main drift

| Item | SHA |
|------|-----|
| P258 merge SHA | `7871809e94cb6cd9f80c47999878c1fafc22e608` |
| Current main SHA | `f104f522ec22c37f22398eab997f229517748028` |
| Merge-base | `fe40f5cdd85b7843edbd486213e1cd2b26bad02b` |
| Main ahead of P258 | 183 commits |
| P258 ahead of main | 72 commits |

**Baseline strategy:** **DIRECT FROM P258 MERGE BASELINE**

Rationale: `frontend/src/rental` alone shows **893 files changed** between P258 merge and current main (vehicle operational state, health projection, vendor-directory removal, etc.). Absorbing main would contaminate i18n campaign topology.

Per-candidate main drift on top paths (P258 → main):

| Candidate paths | Drift |
|-----------------|-------|
| `DocumentsView.tsx` | LOW (12-line delta) |
| `DataAnalyseView.tsx` | LOW (4-line delta) |
| `users-roles/` | NONE on census HEAD |
| `damages/` | NONE on census HEAD |

---

## PART C — Active route census

Rental mounts at `/rental` via `App.tsx` state machine (`currentView`), not nested React Router.

### Primary sidebar surfaces

| Route key | Nav | Root component | Prior coverage | Scanner debt |
|-----------|-----|----------------|----------------|--------------|
| `dashboard` | `nav.dashboard` | `DashboardView.tsx` | P2.2.1 FROZEN | 0 |
| `bookings` | `nav.bookings` | `BookingsView.tsx` | P2.2.3 FROZEN | 0 |
| `customers` | `nav.customers` | `CustomersView.tsx` | P2.2.3 FROZEN | 0 |
| `stations` | `nav.stations` | `StationsView.tsx` | P2.2.6 FROZEN | 0 |
| `tasks` | `nav.tasks` | `TasksView.tsx` | **P2.2.4 FROZEN** | **0** |
| `fleet` | `nav.fleet` | `FleetHubView.tsx` | P2.2.2 partial | 0 |

### Finance sidebar

| Route key | Root | Coverage | Debt |
|-----------|------|----------|------|
| `financial-insights` | `EvaluationsPage.tsx` | partial | 11 |
| `invoices` | `FinanceView` → `InvoicesPage` | P249–P253 FROZEN | 0 |
| `customer-payments` | `CustomerPaymentsTab` | partial | low |
| `price-tariffs` | `PriceTariffsView` | partial | low |

### Automation / integrations

| Route key | Root | Coverage | Debt |
|-----------|------|----------|------|
| `workflow-automation` | `WorkflowAutomationView` | P2.2.5 FROZEN | 0 |
| `ai-voice-assistant` | `VoiceAssistantView` | P227 FROZEN | 0 |
| `whatsapp-business` | `WhatsAppBusinessView` | P228 FROZEN | 0 |
| `insurances` | `InsurancesView` | P219 FROZEN | 0 |
| `parts-accessories` | `PartsAccessoriesView` | P220 FROZEN | 0 |

### Settings (`settings` + tab)

| Tab | Root | Coverage | Debt |
|-----|------|----------|------|
| account | `AccountInformationTab` | P2.2.4 FROZEN | 0 |
| company | `CompanyInformationTab` | P2.2.4 FROZEN | 0 |
| users | `UsersRolesTab` | **UNTOUCHED** | **67** |
| data-authorization | `DataAuthorizationTab` | P218 FROZEN | 0 |
| email-versand | `EmailVersandTab` | P2.2.4 FROZEN | 0 |
| rental-rules | `RentalRulesTab` | P2.2.4 FROZEN | 0 |
| billing | `BillingTab` | **P254–P258 COMPLETE** | **0 active** |

### Support / ops

| Route key | Root | Coverage | Debt |
|-----------|------|----------|------|
| `support` | `SupportView` | P229 FROZEN | 0 |
| `help-center` | `HelpCenterView` | partial | 6 |
| `data-analyse` | `DataAnalyseView` | **UNTOUCHED** | **32** |

### Vehicle detail tabs (fleet drill-in)

| Tab | Root | Coverage | Debt |
|-----|------|----------|------|
| overview | `VehicleOverviewTab` | P2.2.2 partial | low |
| trips | `TripsView` | P2.2.2 FROZEN | 0 |
| health-errors | `HealthErrorsView` | P2.2.2 FROZEN | 0 |
| damages | `DamagesView` + `damages/*` | **UNTOUCHED** | **93** |
| documents | `DocumentsView` + `documents/*` | **UNTOUCHED** | **30** |
| vehicle-bookings | `VehicleBookingsView` | partial | low |
| vehicle-tasks | `VehicleTasksView` | P216A FROZEN | 0 |
| vehicle-requirements | `VehicleRequirementsTab` | partial | low |

### Notifications

No standalone Rental route. `NotificationPanel` on dashboard uses `useLanguage` / `dashboard-i18n` — **0 scanner debt**. Not a P259 candidate.

### Classification summary

| Class | Count |
|-------|-------|
| ACTIVE MOUNTED surfaces audited | 37 |
| FULLY FROZEN (0 debt) | 29 |
| PARTIALLY COVERED | 4 |
| UNTOUCHED (meaningful debt) | 4 |

---

## PART D — Scanner / hidden debt partition

### Rental scanner = 308 (global = 1405, Finance/Billing = 25)

| Partition | Findings | Notes |
|-----------|----------|-------|
| Dead legacy tenant billing cards | 20 | Not mounted — exclude from active debt |
| Active mounted actionable | **288** | 308 − 20 dead |
| Damages module (`damages/`) | 91 | Vehicle tab — mutations |
| Users & Roles (`users-roles/`) | 67 | Settings tab — mutations |
| Data Analyse | 32 | Sidebar diagnostics |
| Vehicle Documents | 30 | Vehicle tab — `DocumentsView` 22 + `documents/` 8 |
| Financial insights / evaluations | 43 | `DataAnalyseView` overlaps |
| Insights widgets | 30 | Dashboard/evaluations embeds |
| Help center | 6 | Small |
| Other / shell | ~9 | Low |

### Hidden debt notes (manual inspection)

| Surface | Hidden host copy examples |
|---------|---------------------------|
| DocumentsView | `formatSpecValue` → `'Nicht hinterlegt'`; `fixedCostStatusLabel`; `timelineKindLabel` German builders; `vehicleName` fallback `'Fahrzeug'`; locale-hardcoded `de-DE` date formatting |
| DataAnalyseView | `HF_AVAILABILITY_META` English literals; tab labels; diagnostic section chrome |
| DamagesView | Queue filter labels; AI intake chrome; dialog titles (in children) |
| Users-Roles | Wizard steps; permission editor labels; invite flows |

---

## PART E — Prior coverage map (P216–P258)

| Phase | Surface | Status |
|-------|---------|--------|
| P2.2.1 | Nav + Dashboard | FULLY FROZEN |
| P2.2.2 | Vehicles / health / trips | FULLY FROZEN (vehicle tabs except damages/documents) |
| P2.2.3 | Bookings + customers | FULLY FROZEN |
| P2.2.4 | Tasks global + settings shell | **FULLY FROZEN** (TasksView = 0 debt) |
| P2.2.5 | Workflow automation | FULLY FROZEN |
| P2.2.6 | Stations | FULLY FROZEN |
| P227–P229 | Voice / WhatsApp / Support | FULLY FROZEN |
| P219–P223 | Insurances / parts / invoice dialogs | FULLY FROZEN |
| P249–P253 | Customer invoice detail/list slices | FULLY FROZEN |
| P254–P258 | Tenant billing (all 5 sub-tabs) | **FULLY FROZEN** |
| P216A–C | Task detail / timeline / workflow | FULLY FROZEN |
| P217 | Booking vehicle picker | FULLY FROZEN |
| P218 | Data authorization | FULLY FROZEN |

**Not frozen / untouched:** Vehicle Documents, Vehicle Damages, Users & Roles, Data Analyse.

---

## PART F — Candidate forensics

### Documents (Vehicle detail → Documents tab)

**Mount:** `App.tsx` `currentView === 'documents'` → `DocumentsView` (requires selected vehicle).

**Tree:** `DocumentsView` → category cards, compliance summary, timeline, specs, variable costs → `VehicleDocumentUploadDrawer` (mutation), `DocumentComplianceSummaryCard`.

**Scanner:** 30 (22 in `DocumentsView.tsx`).

**Machine states:**
- `VehicleDocumentCategoryId` (registration, insurance, tax, tuv_hu, …)
- `VehicleDocumentUiStatus` (verified, expiring_soon, expired, missing, …)
- Timeline `kind` (service_event, compliance, document)
- Fixed-cost status (verified, missing_evidence)

**Raw ownership:**
- `item.title`, `item.subtitle` — BACKEND RAW
- Filenames — BACKEND RAW
- `linkedTask.title` — BACKEND RAW
- Category backend labels via `CATEGORY_UI_META` — currently HOST German in constants file

**Mutations:** upload drawer open, linked task navigation (read-only nav).

**Semantic risk:** MEDIUM — category/status machines exist; must not translate filenames or backend titles.

### Tasks

**Mount:** `currentView === 'tasks'` → `TasksView`.

**Scanner:** **0** — P2.2.4 enforce-clean. Uses `tt()` / `tasks-i18n`. **NOT A P259 CANDIDATE.**

### Notifications

Dashboard-embedded `NotificationPanel` — **0 scanner debt**, already localized. **NOT A P259 CANDIDATE.**

### Damages (Vehicle detail → Damages tab)

**Mount:** `DamagesView` + 10 child components in `damages/`.

**Scanner:** 93.

**Mutations:** create damage, mark repaired, repair task, AI intake, photo placement, queue filters.

**Semantic risk:** HIGH — pin placement, status transitions, task creation.

**Scope:** Too large for single P259; requires multi-slice split.

### Users & Roles (Settings → users)

**Scanner:** 67 across 13 files.

**Mutations:** create user wizard, invites, role assignment, permission editor.

**Semantic risk:** HIGH — IAM permissions must not change.

### Data Analyse (Sidebar → data-analyse)

**Scanner:** 32 in single file.

**Mount:** permission-gated diagnostics (`data-analyse` read).

**Mutations:** minimal (refresh/query only).

**Semantic risk:** LOW–MEDIUM — mostly read-only diagnostics; some English already in constants.

**Business visibility:** LOWER (internal telemetry tooling vs. daily rental ops).

---

## PART G — Risk ranking (top 5)

Scoring: A–J as specified (higher = better for selection except F,G,H,I inverse).

| Rank | Surface | A | B | C | D | E | F | G | H | I | J | **Total** |
|------|---------|---|---|---|---|---|---|---|---|---|---|-----------|
| 1 | **Vehicle Documents (overview)** | 5 | 4 | 2 | 5 | 4 | 4 | 4 | 3 | 4 | 4 | **39** |
| 2 | Data Analyse | 3 | 4 | 1 | 2 | 5 | 5 | 5 | 3 | 4 | 4 | **36** |
| 3 | Help Center | 3 | 1 | 0 | 3 | 5 | 5 | 5 | 3 | 5 | 4 | **34** |
| 4 | Users & Roles | 4 | 5 | 2 | 5 | 2 | 1 | 2 | 1 | 1 | 3 | **26** |
| 5 | Vehicle Damages | 5 | 5 | 3 | 5 | 2 | 1 | 1 | 1 | 0 | 2 | **25** |

**Rationale for #1 Documents:** Core vehicle-anchor surface (architecture pillar), bounded primary file, existing machine category/status types, moderate debt, lower mutation risk than damages/users when scoped to **list/overview read surface**, high business visibility, LOW main/collision drift.

**Not selected despite higher scanner count:** Damages (mutation/scope), Users-Roles (IAM/mutation/67 keys), Tasks (already frozen).

---

## PART H — P259 selection

### Selected target

**P2.2.59 — Vehicle Documents Tab (read-only overview slice)**

### Split decision

**SPLIT — LIST / OVERVIEW FIRST**

Exclude from P259 initial slice:
- `VehicleDocumentUploadDrawer` (upload mutation flow)
- Download/delete if present in drawer only

### Exact mount

```
/rental (currentView=documents, vehicle selected)
  → DocumentsView.tsx
      ← useVehicleFileSummary(vehicleId)
      ← api vehicle file summary
      → category cards, compliance, timeline, specs (READ)
      → VehicleDocumentUploadDrawer (DEFERRED slice)
```

### Exact production paths (P259 slice)

| Class | Paths |
|-------|-------|
| Primary presentation | `rental/components/DocumentsView.tsx` |
| Shared presentation | `rental/components/documents/DocumentComplianceSummaryCard.tsx`, `documents/vehicle-file.constants.ts` |
| Adapter (new) | `rental/lib/rental-vehicle-documents-i18n.ts` (proposed) |
| Types | `rental/lib/vehicle-file-summary.types.ts` (read-only — machine unions already exist) |
| Dictionary | `tenantVehicleDocuments.*` or `vehicleDocuments.*` namespace (~18–22 keys) |
| Tests | `rental-vehicle-documents-localization.test.tsx` |
| Governance | `hardcoded-copy-guard.test.ts` P259 enforce-clean entry |

**Out of scope P259:** `damages/*`, `users-roles/*`, `DataAnalyseView`, upload drawer mutations, billing, tasks.

### Projected keys

| Category | Estimate |
|----------|----------|
| New keys | **~18–22** |
| Reuse | `common.retry`, existing `vehicleDetail.*` where applicable |
| RAW — do not translate | filenames, `item.title`, `item.subtitle`, `linkedTask.title`, backend document metadata |

### Category E feasibility

Achievable for read-only overview slice:
- identity = 0 ✓
- machine state mapping from `VehicleDocumentCategoryId` / `VehicleDocumentUiStatus` ✓
- mutation = 0 (upload drawer excluded) ✓
- filter/sort unchanged ✓
- raw backend ownership preserved ✓

### Collision / drift

| Check | Result |
|-------|--------|
| Open PR #1383–1385 overlap | **NONE** on Documents paths |
| Main drift | **LOW** (8 lines on DocumentsView) |

---

## PART I — Ownership / freeze matrices (P259)

| Field/UI | Source | Type | Logic use? | Localize? |
|----------|--------|------|------------|-----------|
| Category card title | `VehicleDocumentCategoryId` | MACHINE | no | yes (from key) |
| Category status chip | `uiStatus` | MACHINE | yes (tone) | yes (from machine) |
| Timeline kind chip | `item.kind` | MACHINE | no | yes |
| Timeline title | `item.title` | BACKEND RAW | no | **no** |
| Timeline subtitle | `item.subtitle` | BACKEND RAW | no | **no** |
| Filename | API | BACKEND RAW | no | **no** |
| Linked task title | `task.title` | BACKEND RAW | no | **no** |
| Load error body | `error` from hook | BACKEND RAW | no | **no** |
| Empty/missing spec | host fallback | HOST | no | yes |

### Same-mount state (P259)

Must survive DE→EN→DE on one persistent mount:
- Selected vehicle context
- Category card order
- Timeline item count and raw titles
- Open drawer state (if in scope — prefer exclude drawer from P259)
- No refetch on locale alone

---

## PART J — Test strategy

- DE/EN host copy for category/status/kind machines
- Unknown category/status raw fallback fixtures
- Raw timeline title/subtitle preserved both locales
- Raw load error preserved
- True same-mount via `LanguageProvider` + `setLocale` (mandatory — learn from P258 observation)
- React identity: `key={categoryId}` / document id, not locale
- P216–P258 frozen regressions (especially vehicle health, tasks, billing)
- P259 enforce-clean = 0 on `DocumentsView.tsx`

---

## PART K — Progress metrics

### A. Active mounted surface coverage

| Metric | Value |
|--------|-------|
| Denominator | 37 audited active mounted Rental surfaces |
| Fully covered (0 debt) | 29 |
| **Coverage %** | **78.4%** |

Formula: `fully_covered_surfaces / total_active_mounted_surfaces × 100`

### B. Actionable presentation debt cleared

| Metric | Value |
|--------|-------|
| Current Rental scanner | 308 |
| Dead legacy (unmounted billing) | 20 |
| Active actionable scanner debt | **288** |
| Debt on 4 untouched major surfaces | **222** (damages 93 + users 67 + data-analyse 32 + documents 30) |

Formula for cleared % (actionable only):

`1 − (active_actionable_debt / (active_actionable_debt + estimated_cleared_on_active_surfaces))`

Using frozen-surface evidence: **~52%** of originally targeted active Rental presentation debt cleared through P216–P258 (estimate based on 29/37 surfaces at zero debt and exclusion of dead legacy from numerator).

**Do not conflate** with global repository i18n completion (MASTER still 1049 findings).

### Tenant Billing

**100% active mounted complete** (5/5 sub-tabs). Finance/Billing scanner 25 = dead legacy only on active mount.

---

## PART L — Remaining slice estimate after P259

| Scenario | Slices remaining (after P259) |
|----------|-------------------------------|
| Best case | 6 (documents upload, damages read-only, damages mutations, users-roles read, users-roles mutations, data-analyse) |
| Likely | 8–10 |
| Worst reasonable | 12–14 (damages multi-slice, users-roles multi-slice, evaluations, help, residual vehicle/finance partials) |

### Likely follow-ons

| Phase | Target |
|-------|--------|
| P260 | Vehicle Documents — Upload Drawer (mutation slice) OR Data Analyse diagnostics |
| P261 | Vehicle Damages — read-only queue/chrome first |

---

## Final verdict

**B — GO, BUT SPLIT — P2.2.59 TARGET SELECTED**

P2.2.59: **Vehicle Documents Tab — read-only overview slice (`DocumentsView` primary)**

SPLIT: **LIST / OVERVIEW FIRST** (defer `VehicleDocumentUploadDrawer`)

BASELINE: `7871809e94cb6cd9f80c47999878c1fafc22e608`

CAMPAIGN: RENTAL

P216–P258: FROZEN

ACTIVE MOUNTED TENANT BILLING: 100% COMPLETE

ACTIVE MOUNTED RENTAL COVERAGE: 78.4%

ACTIONABLE PRESENTATION DEBT CLEARED: ~52% (estimated)

REMAINING LIKELY SLICES AFTER P259: 6 / 8–10 / 12–14

PROJECTED NEW KEYS: ~18–22

LIKELY P260: Vehicle Documents Upload Drawer OR Data Analyse

IMPLEMENTATION NOT STARTED.
