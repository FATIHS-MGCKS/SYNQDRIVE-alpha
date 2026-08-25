# P2.2.36 — Post-Quick-View Global Next-Slice Pre-Flight

**Date:** 2026-08-24  
**Mode:** Strict read-only global residual audit / target selection  
**Authoritative baseline:** `177347f73fb15bfaa1a9ffff9523f51d97c24192`  
**Baseline origin:** Merged PR #1251 — P2.2.35 Operator Vehicle Quick View Documents Localization

---

## 1. Verdict

**A — GO — P2.2.36 TARGET SELECTED**

**P2.2.36 — Operator Booking Form Sheet Localization**

**CAMPAIGN:** OPERATOR

**IMPLEMENTATION NOT STARTED.**

---

## 2. Baseline Hard Gate

| Metric | Expected | Independent | PASS |
|--------|----------|-------------|------|
| Baseline SHA | `177347f7` | `177347f73fb15bfaa1a9ffff9523f51d97c24192` | YES |
| P235 present | YES | Commit message: P2.2.35 (#1251) | YES |
| Working tree | clean | clean | YES |
| `npm run i18n:check` | PASS | PASS | YES |
| EN keys | 8491 | 8491 | YES |
| DE keys | 8491 | 8491 | YES |
| Parity | 100% | 100% | YES |
| Orphans | 0 | 0 | YES |
| Global enforce-clean | 0 | 0 | YES |
| P235–P216 | 0 | 0 (guard tests) | YES |
| i18n suite count | — | 338 | — |
| Shim | ~29 | 29 | YES |
| Compatibility consumers | 0 new | 0 new | YES |

---

## 3. Quick View Freeze Verification

Complete QV re-scan (`OperatorVehicleQuickView*` paths):

| Finding | Classification |
|---------|----------------|
| `Blocker & Hinweise` (parent line 121) | **A — architecturally deferred Blockers** |

E (safe presentation debt) = **0**  
F (frozen-slice regression) = **0**

Quick View is **not** selected for P236.

---

## 4. Blockers Deferral Freeze

Remaining Blockers presentation is still coupled to:

- `data.health?.blocking_reasons` (dynamic business strings)
- `snapshot?.contradictions` (derived in `operatorVehicleQuickView.utils.ts`)
- `deriveOperatorVehicleStatusSnapshot` / `detectOperatorStatusContradictions`
- Eligibility predicates (`rental_blocked`, health error gates)

**Classification:** **DEFERRAL STILL JUSTIFIED**

Blockers are **NOT** eligible for P236.

---

## 5. Global Audit Universe

Production domains inspected (outside frozen QV):

| Domain | Primary paths | Inventory debt |
|--------|---------------|----------------|
| Operator (excl. QV) | `operator/views/`, `operator/bookings/`, `operator/documents/`, `operator/ai-upload/` | 110 |
| Rental | `rental/components/` (damages, documents, users-roles, insights, billing) | 372 |
| Master Admin | `master/components/`, `master/billing/`, `master/connected-vehicles/` | 1049 |
| App Shell | `components/mfa/`, `pages/` | 25 |
| Shared lib | `lib/formatVehicleDisplay.ts` | 1 |

**Enforce-clean (0 debt):** Rental dashboard, fleet, bookings list, customers, tasks, settings, WhatsApp, voice assistant, workflow automation, support center, operator handover/damage/pickup/tire-measure (P2223–P2226), QV P227–P235.

---

## 6. Route / Reachability Summary

| Surface | Route / mount | Reachable | Workflow |
|---------|---------------|-----------|----------|
| Operator Booking Form | `OperatorActionSheets` → `booking-create` / `booking-edit` sheet | YES | Create/edit booking |
| Operator Today View | `/operator` tab `today` | YES | Daily ops overview |
| Operator Booking Detail | Today view → booking sheet | YES | Booking actions hub |
| Operator Booking Documents | Embedded in detail sheet | YES | Customer docs review |
| Rental Documents View | Rental `documents` vehicle tab | YES | Vehicle file/compliance |
| Rental Create Repair Task | Damage detail dialog | YES | Damage → task |
| Rental Create User Wizard | Settings users | YES | User onboarding |
| Master Dashboard | `/master?view=dashboard` | YES | Platform admin |

---

## 7–8. Scan Summary

**Global inventory:** 1558 findings (enforce-clean remaining: 0 on frozen scopes)

**By surface:** MASTER 1049 (66.5%), RENTAL 372 (23.9%), OPERATOR 111 (7.1%), SHELL 25 (1.6%)

**Fixed-locale scan:** Most `de-DE`/`en-US` hits are in enforce-clean or locale infrastructure. Candidate surfaces show minimal fixed-locale debt; dates use `datetime-local` inputs (browser locale) and `formatMoneyCents` for pricing (presentation formatter — freeze raw cents).

---

## 9. Domain Top Candidates

### Operator (outside QV) — Top 5

| # | Surface | Path | Debt | Keys est. | Coupling | Collision |
|---|---------|------|------|-----------|----------|-----------|
| 1 | Booking Form Sheet | `operator/bookings/OperatorBookingFormSheet.tsx` | 16 scan / ~28 total | 22–28 | CLEAN/MINOR | NONE |
| 2 | Today View | `operator/views/OperatorTodayView.tsx` | 12 | 14–18 | CLEAN | NONE |
| 3 | Booking Detail Sheet | `operator/components/OperatorBookingDetailSheet.tsx` | 8 | 10–12 | MINOR | LOW |
| 4 | Booking Documents Panel | `operator/documents/OperatorBookingDocumentsPanel.tsx` | 7 | 8–10 | MINOR | LOW |
| 5 | AI Upload Flow | `operator/ai-upload/OperatorAiUploadFlow.tsx` | 11 | 15–20 | MODERATE | LOW |

### Vehicle / Fleet — Top 5

| # | Surface | Path | Debt | Coupling |
|---|---------|------|------|----------|
| 1 | Documents View | `rental/components/DocumentsView.tsx` | 22 | MODERATE (compliance/costs) |
| 2 | Damage Rental Sections | `rental/components/damages/DamageRentalSections.tsx` | 15 | MODERATE |
| 3 | Damage Work Queue | `rental/components/damages/DamageWorkQueue.tsx` | 14 | MODERATE |
| 4 | Create Repair Task Dialog | `rental/components/damages/CreateRepairTaskDialog.tsx` | 13 | MINOR |
| 5 | Damage Detail Drawer | `rental/components/damages/DamageDetailDrawer.tsx` | 10 | MODERATE |

### Rental / Booking — Top 5

| # | Surface | Path | Debt | Coupling |
|---|---------|------|------|----------|
| 1 | Data Analyse View | `rental/components/DataAnalyseView.tsx` | 32 | HIGH (broad analytics) |
| 2 | Create User Wizard | `rental/components/users-roles/CreateUserWizard.tsx` | 16 | MODERATE (roles) |
| 3 | Financial Insights | `rental/components/FinancialInsightsView.tsx` | 11 | MODERATE |
| 4 | User Detail Drawer | `rental/components/users-roles/UserDetailDrawer.tsx` | 10 | MODERATE |
| 5 | Access Scopes Tab | `rental/components/users-roles/AccessScopesTab.tsx` | 10 | HIGH (permissions) |

### Dashboard — Top candidates

Rental `DashboardView` is enforce-clean (P21). Residual: `DataAnalyseView` (32), `FinancialInsightsView` (11), `InsightsCockpit` (13), `BusinessInsightsBox` (77 in rental root). **No single bounded dashboard slice** ranks above operator booking form.

### Notifications / Tasks / Communication

- Notifications: enforce-clean in rental; master has scattered debt
- Tasks: rental tasks enforce-clean; operator `OperatorTaskCard` (4 findings)
- Communication: WhatsApp/voice/support enforce-clean; `HelpCenterView` (6 findings)

### Master Admin — Top 3

1. `HealthTrackingView.tsx` (132) — internal engineering tool, low tenant value
2. `VehicleRegistrationModal.tsx` (95) — admin modal, moderate
3. `MasterDashboardView.tsx` (21) — platform admin, lower priority than operator ops

---

## 10. Top-15 Global Ranking

| Rank | Candidate | Domain | Score /50 | Keys | Risk | Main drift |
|------|-----------|--------|-----------|------|------|------------|
| 1 | **Operator Booking Form Sheet** | OPERATOR | **46** | 22–28 | 2 | NONE |
| 2 | Operator Booking Detail Sheet | OPERATOR | 44 | 10–12 | 3 | LOW |
| 3 | Operator Today View | OPERATOR | 42 | 14–18 | 2 | NONE |
| 4 | Rental Create Repair Task Dialog | DAMAGES | 41 | 14–16 | 2 | LOW |
| 5 | Operator Booking Documents Panel | OPERATOR | 39 | 8–10 | 3 | LOW |
| 6 | Operator Scan View | OPERATOR | 38 | 8–10 | 2 | NONE |
| 7 | Operator More View | OPERATOR | 37 | 12–14 | 2 | NONE |
| 8 | Operator AI Upload Flow | OPERATOR | 36 | 15–20 | 3 | LOW |
| 9 | Rental Damage Work Queue | DAMAGES | 36 | 16–18 | 3 | MEDIUM |
| 10 | Rental Help Center View | COMMUNICATION | 35 | 6–8 | 2 | NONE |
| 11 | Rental Documents View | VEHICLE/FLEET | 33 | 25–30 | 3 | LOW |
| 12 | Rental Create User Wizard | ORG/TEAM | 32 | 18–22 | 4 | LOW |
| 13 | Master Dashboard View | MASTER ADMIN | 31 | 20–24 | 2 | LOW |
| 14 | Rental Financial Insights | DASHBOARD | 30 | 14–18 | 3 | LOW |
| 15 | Rental Data Analyse View | DASHBOARD | 29 | 35–45 | 4 | LOW |

**Best score:** 46 | **Runner-up:** 44 | **Delta:** 2

---

## 11. Top-5 Deep Comparison (selected highlights)

### #1 Operator Booking Form Sheet (SELECTED)

| Attribute | Detail |
|-----------|--------|
| Path | `frontend/src/operator/bookings/OperatorBookingFormSheet.tsx` |
| Symbol | `OperatorBookingFormSheet` |
| Route | `OperatorActionSheets` sheet actions `booking-create`, `booking-edit` |
| Audience | Field operator / rental desk |
| Visible debt | Section titles, labels, placeholders, validation errors, status options, pricing states, CTA |
| Hidden debt | Minimal (shell aria in shared `operatorBookingSheetShell` — out of scope) |
| Machine inputs | `PENDING`/`CONFIRMED` status, `bookingId`, `vehicleId`, `customerId`, station IDs |
| Dynamic data | Customer name/email/phone, vehicle label, booking number, price cents, API errors |
| Callbacks | `createBooking`, `updateBooking`, `closeSheet` — unchanged |
| Permissions | Org-scoped via `useRentalOrg` — unchanged |
| Main drift | **NONE** (0 diff lines vs main) |
| Collision | **NONE** |

### #2 Operator Booking Detail Sheet

- 8 inventory findings; action button labels
- Already uses `bookingStatusLabel`, `getBookingActionMatrix`, handover i18n
- 48-line main drift on path — reconciliation risk
- Complements form; logical P237 target

### #3 Operator Today View

- 12 findings; operational day overview
- Clean main drift; good P237/P238 follow-on
- Mixed section types (handovers, blockers title, empty states)

### #4 Rental Create Repair Task Dialog

- English leak (`Create repair task`, `Additional note`)
- Bounded dialog; damages domain
- Good alternative if operator campaign deferred

### #5 Operator Booking Documents Panel

- 7 findings; document list in booking context
- Overlaps document extraction domain; AI upload coupling

---

## 12. Active PR / Collision

Open PRs are audit/pre-flight/re-audit artifacts (P227–P235) plus communication authority re-signoff (#1223). **No open PR modifies `OperatorBookingFormSheet.tsx`.**

PR #1250 (merged token migration) does not touch operator booking paths.

**Selected candidate collision:** **NONE**

---

## 13. Current Main SHA & Path Drift

| Reference | SHA |
|-----------|-----|
| Authoritative baseline | `177347f73fb15bfaa1a9ffff9523f51d97c24192` |
| Current main | `95072d3f3eac83144e7ea8508bfda074a1884c5a` |

| Candidate path | Drift vs main |
|----------------|---------------|
| `OperatorBookingFormSheet.tsx` | **NONE** |
| `OperatorTodayView.tsx` | **NONE** |
| `OperatorBookingDetailSheet.tsx` | **LOW** (48 diff lines) |
| `OperatorBookingDocumentsPanel.tsx` | **NONE** |

**Implementation baseline strategy:** **DIRECT FROM AUTHORITATIVE BASELINE**

---

## 14. Selected P236 Target

### P2.2.36 — Operator Booking Form Sheet Localization

**Split decision:** **ONE SLICE**

**Campaign family:** **OPERATOR**

### Exact production boundary

| Item | Value |
|------|-------|
| Primary path | `frontend/src/operator/bookings/OperatorBookingFormSheet.tsx` |
| Symbol | `OperatorBookingFormSheet`, `SectionTitle` |
| Mount | `OperatorActionSheets` → sheet type `booking-create` / `booking-edit` |
| Audience | Operator field staff |

### Presentation inventory (host-owned)

- Sheet titles: `Buchung bearbeiten`, `Buchung aufnehmen`
- Section titles: Kunde, Fahrzeug, Zeitraum, Stationen, Status, Preis, Notizen
- Field labels: Kunde *, Fahrzeug *, Abholung *, Rückgabe *, Status, Km inklusive, Notizen, Suchen
- Placeholders: customer/vehicle search, notes, km example
- Status options: Ausstehend, Bestätigt (+ helper text)
- Pricing states: calculating, error retry, quote pending, formatted price
- Validation errors: ~12 `setFormError` messages
- CTA: Speichern…, Änderungen speichern, Buchung anlegen
- Loading: detail spinner (no text)

### Out of scope (explicit)

- `operatorBooking.utils.ts` API error mapping (`mapOperatorBookingError`) — business-coupled string matching
- `operatorBookingSheetShell.tsx` shared aria — used by cancel/no-show sheets (separate slice)
- `StationSelectFields`, pricing simulation logic, mutation hooks

### Machine / domain freeze matrix

| Value | Source | Machine? | May localize label? | Byte-identical? |
|-------|--------|----------|----------------------|-----------------|
| `bookingId` | API | YES | NO | YES |
| `bookingNumber` | API subtitle | YES | NO (display raw) | YES |
| `customerId` | form state | YES | NO | YES |
| `vehicleId` | form state | YES | NO | YES |
| `status` PENDING/CONFIRMED | form enum | YES | Label only | Machine value YES |
| `pickupStationId` / `returnStationId` | form | YES | NO | YES |
| `startLocal` / `endLocal` | datetime-local | YES | Format only | Raw ISO unchanged |
| Price cents | `formatMoneyCents` | YES | Presentation only | Raw cents YES |
| Customer name/email/phone | API | Dynamic | NO | YES |
| Vehicle label | `vehicleDisplayLabel` | Dynamic | NO | YES |
| Station names | API | Dynamic | NO | YES |
| Notes field value | user input | Dynamic | NO | YES |

### Dynamic data freeze (do not translate)

- Customer full name, email, phone
- Vehicle display label (plate/model)
- Booking number subtitle
- Price amount (locale format OK; raw cents frozen)
- User-entered notes
- API error message bodies (when shown raw from backend)

### Callback / navigation freeze

- `createBooking`, `updateBooking`, `closeSheet` — unchanged
- Sheet types `booking-create`, `booking-edit` — unchanged
- Payload shapes via `buildBookingCreatePayload` / `OperatorBookingUpdatePayload` — unchanged

### Order / visibility freeze

- Section order: Kunde → Fahrzeug → Zeitraum/Stationen → Status/Preis → Notizen
- Customer search section hidden in edit mode — unchanged
- Status section hidden in create mode — unchanged
- Vehicle/customer filter by search — unchanged

### Key strategy

| Concept | Strategy |
|---------|----------|
| Edit title | SEMANTIC REUSE → `bookings.edit.title` |
| Save changes CTA | SEMANTIC REUSE → `bookings.edit.saveChanges` |
| Notes placeholder | SEMANTIC REUSE → `bookings.edit.notesPlaceholder` (adapt punctuation) |
| Pending status | SEMANTIC REUSE → `bookings.planner.pending` |
| Operator-specific labels/errors | NEW → `operator.bookings.form.*` |
| Customer/vehicle names | DYNAMIC — DO NOT TRANSLATE |
| Status machine values | MACHINE — MAP ONLY |

**Estimated new keys:** 18–26 (total growth ~18–26 after reuse)

### Adapter strategy

**NEW BOUNDED PRESENTATION ADAPTER** — `operator/lib/operator-booking-form-i18n.ts` (proposed)

Maps form labels, validation messages, section titles, status option labels. No business logic.

### Extraction strategy

**KEEP EXISTING COMPONENT** — localize in place

### Proposed P236_ENFORCE_CLEAN_EXACT

```
operator/bookings/OperatorBookingFormSheet.tsx
operator/lib/operator-booking-form-i18n.ts
```

### Test contract

- `operator-booking-form-localization.test.tsx`
- EN/DE render of create and edit modes
- Same-mount locale switch
- Status machine values unchanged (PENDING/CONFIRMED)
- Dynamic customer/vehicle/booking number preserved
- Validation error presentation localized
- Raw key / machine code leakage guards
- Callback identity unchanged (mock mutations)

### Frozen regression contract

- `npm run i18n:check` (338 tests)
- P235–P216 enforce-clean guards
- Operator booking utils tests (unchanged)
- No QV regression suite required (no shared dependencies)

### Category E feasibility

**YES** — presentation-only label/error mapping; no booking business logic changes.

---

## 15. Campaign Forecast (OPERATOR family)

| Phase | Likely target |
|-------|---------------|
| P236 | Operator Booking Form Sheet (selected) |
| P237 | Operator Booking Detail Sheet actions |
| P238 | Operator Today View operational chrome |

Not pre-authorized.

---

## 16. Selection Rationale

Operator Booking Form Sheet is selected because it:

1. Scores highest (46/50) on independent ranking
2. Is a single coherent, production-reachable operator workflow
3. Has **zero main drift** on its primary path
4. Has **no active PR collision**
5. Offers strong semantic reuse with existing `bookings.edit.*` / `bookings.planner.*` keys
6. Separates cleanly from machine/booking semantics (status enum, IDs, pricing raw values)
7. Has clear enforce-clean boundary (2 paths)
8. Is testable with established operator sheet patterns (P2225, P2224, etc.)
9. Delivers high operational leverage (create/edit booking — core field workflow)
10. Does not reopen QV, Blockers, or frozen P216–P235 scopes

Runner-up Booking Detail Sheet (44) has main drift and is better sequenced as P237 after form sheet.

---

## 17. Topology

- Audit branch: `cursor/p2236-post-qv-global-next-slice-preflight-3c10`
- `merge-base(HEAD, 177347f7) = 177347f7`
- `rev-list --count 177347f7..HEAD` before audit commit = 0
- Audit commit: documentation only
