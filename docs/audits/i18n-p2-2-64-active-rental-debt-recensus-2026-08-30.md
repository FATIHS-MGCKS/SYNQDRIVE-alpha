# P2.2.64 — Active Rental Debt Re-Census / Next Target Selection

**Date:** 2026-08-30  
**Mode:** STRICT READ-ONLY PRE-FLIGHT  
**Campaign:** RENTAL  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Authoritative baseline:** `6881b9b922fc163e53879b451268eb8d1a87c1b8` (merged PR #1431, P2.2.63)  
**P263 implementation HEAD:** `74a6d9a0cfcf33975606373b56129ad93351d5d3`  
**P263 final audit:** PR #1432 — **B — CERTIFIED WITH NON-BLOCKING OBSERVATIONS — READY TO MERGE**  
**Audit branch:** `cursor/p2264-active-rental-recensus-3c10`  
**Current `origin/main`:** `aafd39d1bc1c768a3cab13454b5f284b2d19fe2a` (does **not** contain P263; unrelated DIMO P1.3 / scheduler P1.7 line)

---

## PART A — P263 freeze

| Check | Result |
|-------|--------|
| PR #1431 merged | **true** (`mergedAt` 2026-08-30T09:21:09Z) |
| PR #1431 closed | **true** |
| Merge commit | `6881b9b922fc163e53879b451268eb8d1a87c1b8` |
| Implementation HEAD | `74a6d9a0cfcf33975606373b56129ad93351d5d3` |
| PR #1432 verdict | **B — CERTIFIED WITH NON-BLOCKING OBSERVATIONS — READY TO MERGE** |
| P216–P263 | **FROZEN** — do not reopen |
| Data Analyse | **DEFERRED — PLANNED REMOVAL** |
| Dead IAM custom-role CRUD | **DEFERRED — PRODUCT WIRING REQUIRED** (45 scanner findings) |

Post-P263 certified metrics (recomputed on baseline):

| Metric | Value |
|--------|------:|
| EN keys | 9661 |
| DE keys | 9661 |
| Parity | 100% |
| Orphans | 0 |
| Global scanner | 1260 |
| Rental scanner | 163 |
| Finance/Billing scanner module | 25 |
| Enforce-clean violations | 0 |

---

## PART B — Baseline / current main drift

### Baseline health (exact checkout `6881b9b92`)

| Command | Result |
|---------|--------|
| `npm run i18n:check` | **PASS** |
| `npm run check:surface` | **PASS** |

No regression. Campaign baseline is healthy.

### Baseline strategy

**Selected: DIRECT FROM P263 CAMPAIGN BASELINE** (`6881b9b922fc163e53879b451268eb8d1a87c1b8`)

Rationale:

- `origin/main` (`aafd39d1`) diverged before P263 merge and carries unrelated DIMO P1.3, scheduler P1.7, trip-route, and telemetry work.
- Global repo drift must **not** be treated as P264 rental-i18n drift.
- Rental UI surfaces unchanged by that line are authoritative on the P263 campaign baseline.

### Path-specific drift vs `origin/main` (P264-relevant paths only)

| Path | Drift | Notes |
|------|-------|-------|
| `rental/components/RentalStressAnalysisCard.tsx` | **NONE** | CSS class-only diff; copy unchanged |
| `rental/components/MisuseCasesPanel.tsx` | **NONE** | CSS class-only diff; copy unchanged |
| `rental/components/HelpCenterView.tsx` | **LOW** | ~28 lines; minor JSX, copy largely identical |
| `rental/components/shared/rental-requirements-ui.tsx` | **LOW** | 2-line diff |
| `rental/components/HomeAwayBadge.tsx` | **LOW** | 4-line diff |
| `rental/components/OrganizationSwitcher.tsx` | **NONE** | No diff |
| `rental/components/AIAssistantView.tsx` | **MEDIUM** | ~90-line refactor; 1 scanner literal still present |
| `rental/App.tsx` | **HIGH** | +154 lines — DIMO/scheduler/routing; **not** P264 collision if branching from campaign baseline |
| `rental/components/LegalDocumentsTab.tsx` | **NONE** | No diff |
| `rental/lib/misuse-case-lifecycle.ui.ts` | **NONE** | Hidden-host companion; no main diff |

**Collision assessment:** Open PRs on `main` (#1429 DIMO, #1430 scheduler) do not overlap P264 candidate paths when implementing from campaign baseline. **No active collision blocks P264.**

---

## PART C — Full Rental scanner classification (163 findings)

Every finding assigned exactly one bucket:

| Bucket | Count |
|--------|------:|
| **ACTIVE ACTIONABLE** | **19** |
| ACTIVE HIDDEN PRESENTATION (not in scanner; see Part E) | (tracked per surface) |
| DEFERRED — PLANNED REMOVAL (Data Analyse) | 32 |
| DEFERRED — PRODUCT WIRING REQUIRED (dead IAM CRUD) | 45 |
| LEGACY DEAD (unmounted superseded UI) | 65 |
| MACHINE / NOT LOCALIZABLE | 1 |
| OTHER JUSTIFIED (scanner false positive) | 1 |
| **Total** | **163** |

### DEFERRED — PLANNED REMOVAL (32)

All in `rental/components/DataAnalyseView.tsx` — mounted via `currentView === 'data-analyse'` but campaign-frozen for removal. Do not localize.

### DEFERRED — PRODUCT WIRING REQUIRED (45)

Unwired IAM custom-role CRUD tabs/drawers never mounted by production `UsersRolesTab` → `TeamTab` / `RolesAccessTab` / `SecurityAuditTab`:

| File | Count |
|------|------:|
| `users-roles/AccessScopesTab.tsx` | 10 |
| `users-roles/UserDetailDrawer.tsx` | 11 |
| `users-roles/UsersTab.tsx` | 8 |
| `users-roles/SecurityActivityTab.tsx` | 7 |
| `users-roles/RolesTab.tsx` | 5 |
| `users-roles/InvitesTab.tsx` | 3 |
| `users-roles/badges.tsx` | 1 |

### LEGACY DEAD (65)

| Group | Files | Count |
|-------|-------|------:|
| Finance billing legacy | `billing/BillingInvoiceSection`, `BillingInvoiceDetailDrawer`, `BillableVehiclesDrawer`, `BillingPaymentMethodCard`, `BillingSubscriptionCard`, `BillingStatusHero` | 25 |
| Finance insights legacy | `FinancialInsightsView`, `insights/InsightsCockpit` | 25 |
| Dashboard legacy widgets | `BusinessInsightsBox`, `ScheduleBox`, `VehicleInsightsCard` | 15 |

Production billing uses `TenantBilling*` tabs (P255–P258 enforce-clean). `financial-insights` route renders localized evaluations stack, not `FinancialInsightsView`. Legacy widgets have **zero** production imports.

### MACHINE / NOT LOCALIZABLE (1)

| Path | Line | Sample |
|------|-----:|--------|
| `rental/components/price-tariffs/PriceTariffsPage.tsx` | 127 | `FORMAT_LOCALE` `en-GB` — intentional locale constant |

### OTHER JUSTIFIED (1)

| Path | Line | Reason |
|------|-----:|--------|
| `rental/components/LegalDocumentsTab.tsx` | 83 | Scanner flags JSX wrapper; title already `t('legalDocuments.page.title')` — enforce-clean adjacent slice P259 |

### ACTIVE ACTIONABLE — complete scanner inventory (19)

| Path | Line | Cat | Sample | Mount | Visible |
|------|-----:|-----|--------|-------|---------|
| `rental/App.tsx` | 1291 | TITLE | Rental view crashed | Root error boundary | On crash only |
| `rental/components/AIAssistantView.tsx` | 363 | TITLE | Clear conversation | `ai-assistant` | Yes |
| `rental/components/HelpCenterView.tsx` | 809 | TEXT | Help Center | `help-center` | Yes |
| `rental/components/HelpCenterView.tsx` | 827 | TEXT | Problem nicht gelöst? Support-Ticket erstellen | `help-center` | Yes |
| `rental/components/HelpCenterView.tsx` | 838 | PLACEHOLDER | Nach Themen, Funktionen oder Fragen suchen... | `help-center` | Yes |
| `rental/components/HelpCenterView.tsx` | 904 | TEXT | Demnächst | `help-center` | Yes |
| `rental/components/HelpCenterView.tsx` | 951 | TEXT | Noch Fragen? | `help-center` | Yes |
| `rental/components/HelpCenterView.tsx` | 953 | TEXT | Wenn Sie hier keine Antwort finden... | `help-center` | Yes |
| `rental/components/HomeAwayBadge.tsx` | 135 | ARIA | Geofence: … | Fleet `StatInlineDetail` | Yes |
| `rental/components/MisuseCasesPanel.tsx` | 395 | TITLE | Prüfhinweise (default prop) | Booking/customer/trip | Yes |
| `rental/components/MisuseCasesPanel.tsx` | 453 | TEXT | Hinweise werden geladen… | Booking/customer/trip | Yes |
| `rental/components/OrganizationSwitcher.tsx` | 59 | ARIA | Switch organization | TopBar multi-org | Yes |
| `rental/components/OrganizationSwitcher.tsx` | 61 | TEXT | Active organization | TopBar multi-org | Yes |
| `rental/components/RentalStressAnalysisCard.tsx` | 28 | TITLE | Fahrbelastung der Miete (default) | Booking/customer stress | Yes |
| `rental/components/RentalStressAnalysisCard.tsx` | 40 | TITLE | Noch keine Fahrbelastungsauswertung | Booking/customer stress | Yes |
| `rental/components/RentalStressAnalysisCard.tsx` | 73 | TEXT | Gesamteinschätzung | Booking/customer stress | Yes |
| `rental/components/RentalStressAnalysisCard.tsx` | 82 | TEXT | Verschleißrelevanz | Booking/customer stress | Yes |
| `rental/components/shared/rental-requirements-ui.tsx` | 146 | TITLE | Rule source: … | Settings/booking/vehicle rules | Yes |
| `rental/components/shared/rental-requirements-ui.tsx` | 471 | ARIA | Loading effective rules | Settings/booking/vehicle rules | Yes |

**TRUE ACTIVE ACTIONABLE RENTAL SCANNER DEBT = 19**

---

## PART D — Active route / mount census

Repository truth from `rental/App.tsx` + `Sidebar.tsx` (baseline `6881b9b92`):

| Surface | `currentView` / mount | Enforce-clean | Scanner actionable |
|---------|----------------------|---------------|-------------------:|
| Dashboard | `dashboard` | Yes (P221) | 0 |
| Vehicles / Fleet | `fleet`, `fleet-condition-detail`, vehicle detail tabs | Yes (P222) | 0 |
| Vehicle Detail | `overview`, `health-errors`, `documents`, `trips`, etc. | Yes (P222/P259) | 0 |
| Bookings | `bookings`, `new-booking` | Yes (P223) | 0 (+ Misuse embed) |
| Customers | `customers`, `customer-detail` | Yes (P223) | 0 (+ Misuse embed) |
| Tasks | `tasks` | Yes (P224) | 0 |
| Notifications | Dashboard widgets / ops | Yes (P221) | 0 |
| Documents | `documents` (vehicle) | Yes (P259) | 0 |
| Users & Roles | `settings` tab `users` → mounted tabs only | Yes (P262/P263) | 0 mounted |
| Billing / Subscription | `settings` tab `billing` → `TenantBilling*` | Yes (P255–P258) | 0 mounted |
| Settings | `settings` (+ sub-tabs) | Yes (P224) | 0 (+ shared requirements embed) |
| Stations | `stations`, `station-detail` | Yes (P224) | 0 |
| Operations / Fleet ops | `fleet`, handover flows | Yes | 0 |
| Finance insights | `financial-insights` | Yes (evaluations) | 0 mounted |
| Invoices | `invoices` | Yes (P2214+) | 0 |
| Support | `support` | Yes (P229) | 0 |
| **Help Center** | `help-center` | **No** | **6** |
| **AI Assistant** | `ai-assistant` | **No** | **1** |
| **Data Analyse** | `data-analyse` | No | 32 (deferred) |
| Workflow / Voice / WhatsApp | respective views | Partial / P228 | 0 |
| App shell | `App.tsx` error boundary | No | 1 |
| TopBar org switch | always when multi-org | No | 2 |
| Geofence badge | `StatInlineDetail` (dashboard/fleet) | Parent clean; badge not | 1 |
| Misuse / stress panels | embedded in bookings/customers/trips | No | 6 |
| Rental requirements shared | settings rules + booking eligibility + vehicle requirements | No | 2 scanner (+ hidden) |

---

## PART E — Debt by surface

| Surface | Visible scanner | Hidden host (est.) | Total actionable | Mounted | Customer visibility | Mutation risk | Shared leverage | Est. keys | Est. size |
|---------|----------------:|-------------------:|-----------------:|---------|--------------------|--------------|-----------------:|----------:|----------|
| **Help Center** | 6 | **~120+** (`SECTIONS` corpus) | **~126** | Yes | High | READ-ONLY | Low | 80–120+ | **Split required** |
| **Misuse + Stress** | 6 | ~18 (`WEAR_LABELS`, lifecycle.ui, severity/confidence maps, empty/error) | ~24 | Yes (4 contexts) | Medium-high | READ-ONLY | Medium | 28–38 | Medium |
| **Rental requirements shared** | 2 | ~40 (`REQUIREMENT_FIELD_LABEL_DE`, value maps) | ~42 | Yes (6+ parents) | Medium | LOW (mostly read) | **High** | 35–50 | Medium |
| **Organization switcher** | 2 | 0 | 2 | Yes | Medium | LOW (switch org) | Low | 3–5 | Small |
| **AI Assistant chrome** | 1 | ~5–10 | ~8 | Yes | Medium | MEDIUM (clear chat) | Low | 6–10 | Small |
| **App crash boundary** | 1 | 1 (description) | 2 | Yes | Low (error only) | READ-ONLY | Low | 2–3 | Small |
| **HomeAwayBadge** | 1 | 2 (title template) | 3 | Yes | Medium | READ-ONLY | Medium (fleet tiles) | 3–4 | Small |
| Dashboard | 0 | 0 | 0 | Yes | — | — | — | 0 | — |
| Tasks | 0 | 0 | 0 | Yes | — | — | — | 0 | — |
| Notifications | 0 | 0 | 0 | Yes | — | — | — | 0 | — |
| Bookings (core) | 0 | 0 | 0 | Yes | — | — | — | 0 | — |
| Customers (core) | 0 | 0 | 0 | Yes | — | — | — | 0 | — |
| Vehicles (core) | 0 | 0 | 0 | Yes | — | — | — | 0 | — |
| Finance/Billing (mounted) | 0 | 0 | 0 | Yes | — | — | — | 0 | — |
| Stations/Settings (core) | 0 | 0 | 0 | Yes | — | — | — | 0 | — |
| Data Analyse | 32 | 0 | 32 | Yes | — | — | — | — | **Deferred** |
| Dead IAM CRUD | 45 | 0 | 45 | **No** | — | — | — | — | **Deferred** |

### Residual audits (sections 11–18)

| Area | Active mounted actionable | Notes |
|------|--------------------------:|-------|
| Finance/Billing residual (25 scanner) | **0** | All 25 are legacy dead files + 1 machine `FORMAT_LOCALE` |
| Tasks residual | **0** | P224 enforce-clean |
| Notifications residual | **0** | P221 enforce-clean |
| Booking residual (core flow) | **0** | P223 enforce-clean; misuse embed is separate |
| Customer residual (core CRM) | **0** | P223 enforce-clean |
| Vehicle residual | **0** | P222/P259 frozen; geofence badge is shared component debt |
| Dashboard residual | **0** | P221 enforce-clean; legacy widgets unmounted |
| Stations/Settings residual | **0** | P224 enforce-clean; requirements shared component is cross-cutting |

---

## PART F — Top-candidate scoring

Scoring dimensions (higher = better candidate): A actionable debt, B visibility, C mount frequency, D hidden debt manageability, E shared leverage, F low mutation risk, G same-mount simplicity, H key budget fit, I low drift.

| Rank | Surface | A | B | C | D | E | F | G | H | I | **Score** |
|------|---------|---|---|---|---|---|---|---|---|---|----------:|
| 1 | Misuse + Rental Stress | 6 | 8 | 8 | 7 | 6 | 10 | 9 | 8 | 10 | **72** |
| 2 | Help Center (shell only) | 6 | 9 | 6 | 8 | 3 | 10 | 9 | 9 | 9 | **69** |
| 3 | Rental requirements shared | 2 | 7 | 9 | 4 | **10** | 8 | 7 | 6 | 10 | **63** |
| 4 | Help Center (full SECTIONS) | 6 | 9 | 6 | 2 | 3 | 10 | 7 | 2 | 9 | **54** |
| 5 | Organization switcher | 2 | 7 | 10 | 10 | 4 | 6 | 9 | 10 | 10 | **68** |
| 6 | AI Assistant chrome | 1 | 7 | 5 | 7 | 3 | 6 | 8 | 9 | 8 | **54** |
| 7 | App crash boundary | 1 | 3 | 10 | 9 | 2 | 10 | 10 | 10 | 9 | **64** |
| 8 | HomeAwayBadge | 1 | 6 | 7 | 8 | 7 | 10 | 9 | 10 | 10 | **68** |
| 9 | Org switcher + shell bundle | 4 | 7 | 10 | 8 | 4 | 8 | 9 | 9 | 10 | **69** |
| 10 | Help Center → P265 full corpus | — | — | — | — | — | — | — | — | — | defer |

### Top 10 ranked recommendation summary

| Rank | Surface | Paths | Vis | Hidden | Total | Keys | Mutation | Same-mount | Leverage | Drift | Recommendation |
|------|---------|-------|----:|-------:|------:|-----:|----------|------------|----------|-------|----------------|
| 1 | **Misuse + Stress** | `MisuseCasesPanel.tsx`, `RentalStressAnalysisCard.tsx`, `misuse-case-lifecycle.ui.ts` | 6 | ~18 | ~24 | 28–38 | READ-ONLY | Feasible | Medium | NONE | **SELECT P264** |
| 2 | Help Center shell | `HelpCenterView.tsx` (chrome only) | 6 | ~8 | ~14 | 10–15 | READ-ONLY | Feasible | Low | LOW | P265 candidate |
| 3 | Rental requirements shared | `shared/rental-requirements-ui.tsx` | 2 | ~40 | ~42 | 35–50 | LOW | Feasible | **High** | LOW | P266 candidate |
| 4 | Org switcher | `OrganizationSwitcher.tsx` | 2 | 0 | 2 | 3–5 | LOW | Feasible | Low | NONE | Polish slice |
| 5 | HomeAwayBadge | `HomeAwayBadge.tsx` | 1 | 2 | 3 | 3–4 | READ-ONLY | Feasible | Medium | LOW | Bundle or P267 |
| 6 | App crash boundary | `rental/App.tsx` | 1 | 1 | 2 | 2–3 | READ-ONLY | N/A | Low | HIGH* | Defer (*main-only drift) |
| 7 | AI Assistant chrome | `AIAssistantView.tsx` | 1 | ~8 | ~9 | 6–10 | MEDIUM | Feasible | Low | MEDIUM | After misuse |
| 8 | Help Center SECTIONS | `HelpCenterView.tsx` constants | 0 | ~120 | ~120 | 80–110+ | READ-ONLY | Feasible | Low | LOW | **Must split** |
| 9 | Shell micro-bundle | Org + App + AI clear | 4 | ~3 | ~7 | 8–12 | Mixed | Mixed | Low | Mixed | Low cohesion |
| 10 | Geofence + requirements | Badge + 2 scanner lines | 3 | ~42 | ~45 | 38–54 | LOW | Feasible | High | LOW | Split by domain |

---

## PART G — Selected P264

### P2.2.64 target

**Vehicle Rental Stress & Misuse Hints Presentation**

Cohesive read-only slice covering driving-stress analysis and misuse-case review hints across booking, customer, and trip contexts.

### Exact paths

| Path | Role |
|------|------|
| `frontend/src/rental/components/MisuseCasesPanel.tsx` | Misuse hints panel (4 mount contexts) |
| `frontend/src/rental/components/RentalStressAnalysisCard.tsx` | Rental driving-stress card |
| `frontend/src/rental/lib/misuse-case-lifecycle.ui.ts` | Status/eligibility presentation maps (hidden host) |
| New adapter (proposed): `frontend/src/rental/lib/rental-misuse-stress-i18n.ts` | machine→display only |
| New dictionary slice (proposed): `rental.misuseStress.{en,de}.ts` | ~28–38 keys |

### Mount contexts

1. `booking-detail/BookingUsageMisuseTab.tsx`
2. `customer-detail/CustomerDrivingTab.tsx`
3. `trips/TripTimelineExpanded.tsx`
4. `BookingsView.tsx` (embedded panel)

### Active debt in scope

- Scanner: **6** (4 stress + 2 misuse)
- Hidden host: **~18** (severity/confidence labels, `WEAR_LABELS`, empty/error copy, lifecycle status map, section headers `Hinweise`, footnote)
- **Total actionable ~24**

### SPLIT decision

**ONE SLICE — COMPLETE**

Rationale: Key budget ≤40, shared components, read-only fetches, no write mutations in scope, same-mount feasible on persistent booking/customer/trip roots.

Help Center deferred because hidden `SECTIONS` corpus exceeds 110 keys — requires **SPLIT — SUB-SURFACE FIRST** as a separate slice.

---

## PART H — Machines / raw / mutations / state

### Machine inventory (P264)

| Machine | Display adapter key (proposed) |
|---------|-------------------------------|
| `wear.impact`: `low`, `medium`, `medium_to_high`, `high` | `misuseStress.wearImpact.*` |
| `MisuseCaseStatus`: `CANDIDATE`, `ACTIVE`, `REVIEW_REQUIRED`, `CONFIRMED`, `DISMISSED`, `RESOLVED`, `SUPERSEDED`, `NOT_ASSESSABLE` | `misuseStress.status.*` |
| `MisuseCaseDecisionEligibility`: `INFORMATIONAL_ONLY`, `REVIEW_ONLY`, `MANUAL_CONFIRMATION_ONLY`, `OPERATIONAL_ELIGIBLE`, `NOT_ELIGIBLE` | `misuseStress.eligibility.*` |
| Misuse severity: `CRITICAL`, `SEVERE`, `WARNING`, `INFO` | `misuseStress.severity.*` |
| Evidence confidence: `HIGH`, `MEDIUM`, `LOW`, `INSUFFICIENT` | `misuseStress.confidence.*` |
| `TripEvidenceLevel` enums | Reuse existing `trips.*` / `behavior-ui` keys where possible |
| `dataConfidence` (stress meta) | Reuse `scoreFormat` / vehicle stress keys if canonical exists |
| `area.area` (wear affected area) | **RAW** — backend-provided area name |

### Raw ownership (must NOT translate)

| Field | Owner |
|-------|-------|
| `payload.overallAssessment.shortSummary` | Backend AI summary |
| `wear.summary`, `stress.summary` | Backend |
| `payload.watchpoints[]` | Backend strings |
| `issue.recommendedAction` (sanitized) | Backend |
| `err.message` on fetch failure | Backend / API |
| `orgName`, vehicle identifiers | RAW |
| `area.area` chip text | Backend domain label |
| Misuse case titles from `resolveEvidenceCardTitle` | Backend-derived |

### Mutation inventory

**None in P264 scope.** Panels are fetch-only:

| Action | Endpoint | In scope? |
|--------|----------|-----------|
| List misuse cases | `api.misuseCases.list` | Read — mount only |
| Load driving analysis | Parent-provided `RentalDrivingAnalysisItem` | Read — mount only |

No create/update/delete, permissions, or eligibility changes in this slice.

### State that must survive same-mount locale switch

- Loaded `cases[]` / `analysis` payload
- `loading` / `error` flags
- Expanded card UI state (if any)
- Filter context (`orgId`, `vehicleId`, `tripId`, `bookingId`, `customerId`) — must **not** refetch on locale change

---

## PART I — Key / reuse / split

### Projected new keys

**28–38** (medium; ≤50)

Categories:

- Panel chrome: ~8
- Stress empty/wear/section labels: ~10
- Misuse severity/confidence/status/eligibility: ~14
- Loading/error/empty calm copy: ~4
- Reuse from `trips.*`, `vehicle.*`, `common.loading` where exact match exists

### Canonical reuse opportunity

| Namespace | Reuse potential |
|-----------|----------------|
| `trips.*` / `behavior-ui` | Evidence level labels (partial — inspect exact match) |
| `vehicle.*` / stress | `getDataConfidenceLabel` may move to adapter |
| `common.*` | Retry patterns N/A (read-only) |
| `bookings.*` | Section title alignment for misuse tab |

Estimated reuse ratio: **~20–30%**

### Adapter strategy

**Pure presentation adapter required:** `rental-misuse-stress-i18n.ts`

Allowed:

- machine→display maps (status, severity, wear impact, eligibility)
- host validation/error message keys
- locale-aware formatting of counts (`bewertete Fahrten`, km suffix)

Forbidden:

- business logic, payload construction, permission checks, filter/sort, eligibility decisions

---

## PART J — Tests / governance

### Enforce-clean boundary (proposed P264)

```
rental/components/MisuseCasesPanel.tsx
rental/components/RentalStressAnalysisCard.tsx
rental/lib/misuse-case-lifecycle.ui.ts
```

Exclude: dead IAM, Data Analyse, legacy billing/insights widgets, `LegalDocumentsTab` false positive.

### Category E feasibility

**FEASIBLE** — localization with zero semantic change. Display-only maps; backend summaries remain raw; no copy meaning changes required.

### Test plan (implementation — not executed in this audit)

| Test | Purpose |
|------|---------|
| Presentation DE/EN | Panel titles, empty, loading, section headers |
| Raw ownership | Backend summary / watchpoint / area strings unchanged across locale |
| Machine mapping | All status/severity/wear enums resolve; unknown → raw fallback |
| Same-mount | `BookingUsageMisuseTab` or `CustomerDrivingTab`: DE→EN→DE, `mountCount === 1`, no refetch |
| Locale-refetch guard | `useEffect` deps must exclude `locale` / `t` |
| Permission parity | N/A (read-only) |
| Regression | P223 booking/customer suites |
| Unknown machine fallback | Unlisted status → raw string |

---

## PART K — Campaign progress / endgame

### Progress denominators

| Metric | Value | Denominator |
|--------|------:|-------------|
| A. Retained-product active mounted coverage | **~97%** | Mounted surfaces with 0 actionable scanner debt / all mounted retained surfaces (~35) |
| B. Literal mounted coverage incl. Data Analyse deferred | **~91%** | (163 − 32 deferred) / 163 scanner rental |
| C. Actionable presentation debt cleared (P216–P263) | **~88%** | Cleared slices vs initial campaign actionable (estimated) |
| D. Active actionable surfaces remaining | **7** | Distinct mount areas with actionable debt |
| E. Rental scanner remaining | **163** | Total |
| F. Attributable to dead/deferred | **142** | 45 + 32 + 65 |
| G. Attributable to active actionable | **19** | Scanner only |

### Hidden active debt (not in scanner)

Estimated **~160+** additional presentation strings, dominated by Help Center `SECTIONS` corpus (~120) and `rental-requirements-ui` label maps (~40).

### Campaign endgame (slices remaining — active retained-product only)

| Case | Slices |
|------|-------:|
| Best case | 6–8 |
| Likely | 9–12 |
| Worst reasonable | 14–16 |

Assumes: P264 misuse/stress, Help Center split (2–3), requirements shared (1–2), shell polish (1–2), AI assistant (1). **Excludes** dead IAM wiring and Data Analyse removal.

### Definition of campaign complete

**Complete when:** all retained-product **active mounted** host presentation strings are localized (enforce-clean per slice), while separately tracking:

- planned-removal (Data Analyse)
- dead/unwired (IAM CRUD)
- legacy unmounted files
- raw/provider/backend fields
- machine enums (via adapters, not literal translation)

Scanner total **need not** reach 0 if remaining findings are justified non-actionable per buckets above.

---

## PART L — P265 forecast

**Likely P2.2.65: Help Center Shell Chrome** (`HelpCenterView.tsx` header, search, footer, nav — **not** `SECTIONS` article corpus)

- ~10–15 keys
- READ-ONLY
- SPLIT — SUB-SURFACE FIRST continuation
- High customer visibility

Alternative if product prioritizes cross-cutting leverage: **Rental Requirements Shared Presentation** (`rental-requirements-ui.tsx`).

---

## Locale-refetch risk (P264 target)

| File | Risk | Notes |
|------|------|-------|
| `MisuseCasesPanel.tsx` | **LOW** | `useEffect` deps: `[orgId, vehicleId, tripId, bookingId, customerId, limit]` — no `locale`/`t` |
| `RentalStressAnalysisCard.tsx` | **NONE** | Props-driven; no fetch effect |

No P262-style refetch regression expected if deps remain unchanged.

---

## Final verdict

**A — GO — P2.2.64 TARGET SELECTED**

```
P2.2.64:
Vehicle Rental Stress & Misuse Hints Presentation

SPLIT:
ONE SLICE — COMPLETE

BASELINE:
6881b9b922fc163e53879b451268eb8d1a87c1b8

P216–P263:
FROZEN

DATA ANALYSE:
DEFERRED — PLANNED REMOVAL

DEAD IAM CUSTOM ROLE CRUD:
DEFERRED — PRODUCT WIRING REQUIRED

TRUE ACTIVE ACTIONABLE RENTAL SCANNER DEBT:
19

PROJECTED NEW KEYS:
28–38

LIKELY P2.2.65:
Help Center Shell Chrome

IMPLEMENTATION NOT STARTED.
```

---

**Changes / Architektur:** Not updated (read-only audit; no architecture or production changes).
