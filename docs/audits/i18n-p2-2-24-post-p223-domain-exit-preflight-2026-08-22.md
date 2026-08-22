# P2.2.24 — Post-P223 Residual Prioritization & Domain-Exit Review

**Date:** 2026-08-22  
**Mode:** STRICT READ-ONLY PRE-FLIGHT  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Authoritative baseline:** `96dadcb3face5e17150893e52006232b3710cd08` (merge commit of PR #1184 — P2.2.23)  
**Previous re-audit:** PR #1185 (verdict B)  
**Auditor branch:** `cursor/p2224-post-p223-domain-exit-preflight-3c10`

---

## 0. Baseline / Topology Hard Gate

| Check | Independent result |
|-------|-------------------|
| PR #1184 merged | ✅ `true` (`mergedAt`: 2026-08-22T19:58:43Z) |
| Exact merge SHA | ✅ `96dadcb3face5e17150893e52006232b3710cd08` |
| Commit exists locally/remotely | ✅ verified |
| P223 ancestry (`08421a4c`) | ✅ in history via merge commit |
| P222 ancestry (`80dbba83`) | ✅ ancestor |
| P221 ancestry (`59b01928`) | ✅ ancestor |
| P220 ancestry (`6413a3dd`) | ✅ ancestor |
| P219 ancestry (`9b714458`) | ✅ ancestor |
| P218 ancestry (`d645343f`) | ✅ ancestor |
| P217 ancestry (`6e578fd9`) | ✅ ancestor |
| P216 ancestry (`1370a384`…`f7095205`) | ✅ ancestors present |
| Working tree clean (pre-artifact) | ✅ |
| Audit branch from exact baseline | ✅ `cursor/p2224-post-p223-domain-exit-preflight-3c10` |
| `git merge-base HEAD 96dadcb3` | ✅ `96dadcb3face5e17150893e52006232b3710cd08` |
| `git rev-list --count 96dadcb3..HEAD` (pre-commit) | ✅ **0** |

**Topology verdict:** ✅ **PASS**

---

## 1. Post-P223 Freeze Verification

```
npm run i18n:check → PASS (275/275 tests)
```

| Metric | Independent result |
|--------|-------------------|
| P223 scoped findings | **0** |
| P222 | **0** |
| P221 | **0** |
| P220 | **0** |
| P219 | **0** |
| P218 | **0** |
| P217 | **0** |
| P216A | **0** |
| P216B1 | **0** |
| P216B2 | **0** |
| P216C1 | **0** |
| P216C2A | **0** |
| P216C2B | **0** |
| CompanySections (P2.2.4 prior-freeze) | **0** |
| **GLOBAL ACTIVE I18N ENFORCE-CLEAN DEBT** | **0** |
| EN keys | **8264** |
| DE keys | **8264** |
| Parity | **100%** |
| Orphans | **0** |
| Shim inventory (`../i18n/`) | **29** (prod 18, test 11) |
| New compatibility consumers | **0** |

**Freeze verdict:** ✅ **PASS** — no baseline regression

---

## 2. Purpose

Select exactly **one** bounded P2.2.24 production localization slice and determine whether the Rental i18n campaign has reached a practical domain-exit point versus Operator, Master, Vehicle/Fleet, and Shared/Shell alternatives.

---

## 3. Fresh Global Inventory

Scanner rerun @ `96dadcb3` (`node scripts/i18n-hardcoded-scan.mjs`):

| Domain | Scanner-visible | Est. hidden presentation | FORMAT_LOCALE | Active enforce-clean |
|--------|----------------:|-------------------------:|--------------:|---------------------:|
| **GLOBAL** | **1603** | ~200–280 (utils/maps) | **8** | **0** |
| Rental | 372 | ~140–180 | 6 | 0 |
| Operator | 156 | ~140–180 | 4 | 0 |
| Master Admin | 1049 | ~80–120 | 1 | 0 |
| Shared | 1 | minimal | 0 | 0 |
| Shell | 25 | minimal | 0 | 0 |
| Communication (`communication-center/`, `whatsapp/`) | **0** | P2.2.8 frozen | 0 | 0 |
| Vehicle/Fleet (non-frozen residual) | ~0 in frozen paths; ~260 rental “other” includes dashboard/settings | dashboard/utils heavy | mixed | 0 |

**Rental module breakdown:** other 260 · Finance/Billing 90 · Tasks 13 · Documents 8 · App shell 1

**Note:** Scanner inventory ≠ enforce-clean debt. Global enforce-clean = **0** ✅

---

## 4. Excluded Frozen Slices

All P216–P223 enforce-clean surfaces excluded from candidate pool, including at minimum:

| Phase | Surface |
|-------|---------|
| P219 | `InsurancesView.tsx` |
| P220 | `PartsAccessoriesView.tsx` |
| P221 | `CreateInvoiceDialog.tsx` + adapter |
| P222 | `SendInvoiceDialog.tsx` + adapter |
| P223 | `InvoiceDocuments.tsx` + adapter + mapper |
| P216A–C2B | Task presentation/timeline/detail/workflow |
| P217 | Booking vehicle picker |
| P218 | `DataAuthorizationTab` |
| P214–P215 | Invoice list, vendor directory |
| P211–P213 | Handover (rental + operator) |
| P2.2.8 | WhatsApp / Communication Center presentation |
| P2.2.10 | Master Support Ops (`support-ops/*`) |

No regressions detected on frozen boundaries.

---

## 5. P223 Residual Sanity Check

| File | Residual findings | Classification |
|------|------------------:|----------------|
| `InvoiceDocuments.tsx` | 0 | — |
| `invoice-documents-i18n.ts` | 0 | — |
| `invoiceDocuments.mapper.ts` | 0 | — |
| `CompanySections.tsx` (P2.2.4 restoration) | 0 | clean |

**Category E (canonical presentation regression) = 0** ✅

---

## 6. Rental Domain-Exit Review — HARD DECISION

**Decision: B — EXIT RENTAL FOR NOW — OPERATOR HAS HIGHER VALUE**

### Evidence

1. **Campaign saturation:** Five consecutive Rental finance/ops slices merged (P219→P223) in 48 hours on the same integration branch.
2. **Remaining Rental high-value work is oversized or blind-spot heavy:** Booking Detail Dossier (~111 scanner-blind German literals, SPLIT REQUIRED); Rental Damages cluster (93 scanner); Invoice Detail residual (16 scanner + ~154 blind).
3. **Diminishing marginal UX per slice:** Recent Rental slices targeted back-office finance staff; field operators on mobile PWA still experience pervasive mixed DE/EN in Operator surfaces (156 scanner + substantial hidden debt).
4. **Operator handover already complete** (P2.2.13, 0 findings) — natural pivot to adjacent field workflows (damage capture, pickup verification, vehicle quick view).
5. **Residual quality shift:** Much remaining Rental debt is settings/billing admin (98), users/roles (72), or dead/legacy paths (`BusinessInsightsBox` 77 findings, not mounted).

Another Rental slice *could* improve UX, but **Operator field workflows beat Rental on practical mixed-language severity** for WORKER roles at this point.

---

## 7. Rental Residual Decomposition

| Surface | Exact files | Render path | Scanner | Hidden est. | Roles | Coupling | Est. keys |
|---------|-------------|-------------|--------:|------------:|-------|----------|----------:|
| Booking Detail Dossier | `booking-detail/*` (16 files) | `BookingsView` → `BookingDossier` | 0 | ~111 | Dispatch, admin | **High** | 90–120 |
| Rental Damages | `DamagesView.tsx`, `damages/*` | Vehicle tab `damages` | 93 | ~25 | Fleet, dispatch | High | 85–110 |
| Invoice Detail residual | `InvoiceDetail*.tsx`, mappers | `FinanceView` → detail | 16 | ~154 | Finance | Med–High | 120–160 |
| Settings Billing | `billing/*` (20 files) | Settings → billing tab | 98 | ~30 | Admin | High (Stripe) | 90–105 |
| Users & Roles | `users-roles/*` | Settings → users | 72 | ~15 | Admin | Med (IAM) | 70–90 |
| Vehicle Documents | `DocumentsView.tsx`, `documents/*` | Vehicle tab documents | 31 | ~10 | Fleet | Med | 35–50 |
| Price & Tariffs | `price-tariffs/*` | Finance → price-tariffs | 8 | ~15 | Pricing admin | Med | 25–40 |
| Data Analyse | `DataAnalyseView.tsx` | Sidebar `data-analyse` | 32 | low | Analyst | Low | 35–45 |

---

## 8. Rental Saturation Analysis

| Class | Est. share | Notes |
|-------|------------|-------|
| A — high-value visible workflow | ~25% | Booking dossier, damages, invoice detail |
| B — secondary/low-frequency | ~35% | Settings billing/users, data analyse |
| C — machine/domain false positives | ~10% | Enum labels in utils |
| D — legacy/dead | ~15% | `BusinessInsightsBox`, `FinancialInsightsView` unmounted |
| E — deeply business-coupled | ~10% | Booking action rules, billing Stripe |
| F — scanner noise | ~5% | Duplicated patterns |

**Answer:** Another Rental slice can produce meaningful UX improvement **only for oversized surfaces** (Booking Detail, Damages). Smaller Rental slices would **mostly optimize residual scanner count** without matching Operator field impact.

---

## 9. Operator — Deep Active Workflow Audit

**Operator inventory:** 156 findings / 32 files. **Handover/return: frozen (0).**

| Surface | Files | Scanner | Hidden | Render path | Impact | Risk | Keys |
|---------|-------|--------:|-------:|-------------|--------|------|-----:|
| Vehicle Quick View | `OperatorVehicleQuickView.tsx`, `operatorVehicleQuickView.utils.ts` | 22 | ~20 | `/operator/vehicles/:id`, scan, today | Critical | 4 | 32–42 |
| Booking lifecycle sheets | `OperatorBookingFormSheet.tsx`, cancel/no-show sheets, utils | 27 | ~22 | Action sheets | Critical | 5 | 40–55 |
| Today dashboard | `OperatorTodayView.tsx`, utils, booking card/detail | 23 | ~16 | `/operator` tab today | Critical | 4 | 24–32 |
| AI Upload flow | `OperatorAiUploadFlow.tsx`, review, config | 21 | ~32 | Sheet `ai-upload` | High | 4 | 22–35 |
| **Damage capture** | `operator/damages/*` (4 steps + payload) | **9** | **~25** | Provider overlay; quick view, scan, handover damages | **High** | **4** | **28–38** |
| Pickup verification | `OperatorPickupCheckSheet.tsx`, payload | 4 | ~15 | Sheet `pickup-verification` | Critical (compliance) | 5 | 16–20 |
| Tire measure | `OperatorTireMeasureFlow.tsx`, utils | 13 | ~14 | Sheet `tire-measure` | Med–High | 3 | 18–24 |
| Shell chrome | Bottom nav, header, access, more | 24 | ~14 | All `/operator/*` | Medium | 2 | 20–28 |

---

## 10. Master Admin — Bounded Decomposition

| Surface | Scanner | Files | Route | Sensitivity | Keys | Notes |
|---------|--------:|-------|-------|-------------|-----:|-------|
| Prospects | 47 | 1 | `?view=prospects` | Low | 45–55 | **Best Master slice** — single file |
| Organizations | 44 (+~20 blind) | 3 + `org.utils.ts` | `?view=organizations` | Med | 50–65 | Core tenant ops |
| Integrations | 40 | 10 | `?view=platform-integrations` | Med | 50–65 | Coherent hub |
| Platform Ops / Monitoring | 67 | 10 + legacy monolith | `?view=platform-ops` | Low–Med | 70–85 | Split legacy `SystemMonitoringView` |
| Connected Vehicles hub | 50 | 8 | `?view=vehicles` | Med–High | 55–65 | Sub-slice only |
| Billing (deferred) | 125 | 26 | `?view=billing` | **Very high** | 110–140 | Stripe/financial risk |

Support Ops: **frozen** (1 shell title residual in `SupportView.tsx` — optional, not P224).

---

## 11. Vehicle / Fleet Domain

P2.2.2 frozen surfaces (fleet, vehicle-detail, health, trips, battery, service-center) report **0** enforce-clean regressions. Residual non-frozen debt lives primarily in **Rental dashboard** runtime builders (`dashboard/*`, ~40+ FORMAT_LOCALE/hardcoded patterns) — large, cross-cutting, poor boundedness.

No standalone Vehicle/Fleet slice beats Operator field workflows for P2.2.24.

---

## 12. Shared / Shell

| Surface | Scanner | Notes |
|---------|--------:|-------|
| Shell (app chrome) | 25 | Login/routing shell — moderate impact |
| Shared cross-surface | 1 | Minimal |

Bounded slices possible (e.g. login shell) but lower user impact than Operator field UI.

---

## 13. Communication Center — Collision Zone

| Open work | Collision with P224 candidates |
|-----------|------------------------------|
| PR #1187 `feature/communication-center-c11-1-write-foundation` | **LOW** — backend write + inbox actions; no `operator/damages/*` overlap |
| PR #1183 Communication attention widget | **NONE** — dashboard widget |
| Frozen P2.2.8 `whatsapp.*` | Vocabulary alignment only for damage/booking terms |

**Operator Damage Capture collision:** **MEDIUM** — align terminology with `whatsapp.context.damages` / `handover.operator.damages.*`; use `operator.damageCapture.*` namespace; **no** `whatsapp.*` keys.

---

## 14. Open Feature PR Collision Audit

| PR / branch | Material P224 overlap |
|-------------|----------------------|
| #1187 Communication write foundation | **NONE** (governance/docs only overlap possible) |
| #1185, #1182, prior audit PRs | Audit docs only |
| `cursor/p227b-voice-telephony-test-center-preflight-3c10` (integration base) | Governance lineage only |

**Selected target (`operator/damages/*`):** production-file overlap **NONE** with active Communication Center branches.

---

## 15. Active / Dead Code Verification

| Candidate | Status |
|-----------|--------|
| Operator Damage Capture | **ACTIVE** — `OperatorDamageCaptureProvider` in `OperatorShell.tsx`; triggered from `OperatorVehicleQuickView`, `OperatorScanVehicleCard`, `OperatorHandoverStepDamages` |
| Rental Booking Detail | **ACTIVE** |
| Rental `BusinessInsightsBox` | **DEAD** (not mounted) |
| Rental `FinancialInsightsView` | **LEGACY** (replaced by `EvaluationsPage`) |
| Master Prospects | **ACTIVE** |
| Operator Handover | **ACTIVE but frozen** |

---

## 16. Fixed-Locale Inventory

Production matches for `de-DE`, `locale === 'de'`, `toLocaleString`, etc.: **~130 files** (many in frozen vehicle/dashboard/test paths).

**Operator damage-relevant:**

| File | Class | Notes |
|------|-------|-------|
| `operator/damages/*` | **B/C** | No hardcoded `de-DE`; German literals in components + payload validation |
| `rental/lib/damage.types.ts` | **B** | `formatDamageSource`/`formatSeverity` English maps — shared, not in P224 boundary |
| `operator/lib/operatorVehicleQuickView.utils.ts` | **B** | Fixed-locale patterns — adjacent, not P224 |

**Global FORMAT_LOCALE scanner category:** 8 findings (unchanged from P223).

---

## 17. Hidden Presentation Debt (selected targets)

| Target | Hidden examples |
|--------|----------------|
| Operator Damage Capture | `STEP_LABELS`, `OPERATOR_DAMAGE_LOCATION_CHIPS[].label`, `validateOperatorDamageStep` messages, submit errors in flow |
| Rental Booking Detail | `bookingActionRules.ts` gate reasons, tab labels, `bookingDetailUtils.ts` |
| Rental Invoice Detail | `invoiceUtils.ts`, `invoice-detail.constants.ts`, gate reason strings |
| Master Organizations | `org.utils.ts` `ATTENTION_LABELS` (~20 DE, 0 scanner) |

---

## 18. Business Coupling Audit

| Candidate | API | State machine | Permissions | Financial | Verdict |
|-----------|-----|---------------|-------------|-----------|---------|
| Operator Damage Capture | `CreateVehicleDamageInput` | Step wizard | Operator roles | None | **Med** — enums fixed, `locationLabel` is content |
| Operator Pickup Verification | `ManualPickupCheckDto` | Checklist | Operator roles | None | **Med–High** — compliance |
| Rental Invoice Detail | Invoice actions API | Panel states | Finance caps | **High** | High |
| Rental Booking Detail | Booking mutations | Action rules | Multi-gate | **High** | Very high |
| Master Prospects | CRM pipeline | Low | Master admin | Low | **Low** |

---

## 19–24. Scoring (0–5)

### Top contenders

| Candidate | User impact | Business risk | Boundedness | Testability | Arch leverage | Collision | Residual quality |
|-----------|------------:|--------------:|------------:|------------:|--------------:|------------:|-----------------:|
| **Operator Damage Capture** | **4** | **4** | **5** | **4** | **4** | **3** | **5** |
| Operator Pickup Verification | 4 | 5 | 5 | 4 | 3 | 4 | 4 |
| Operator Vehicle Quick View | 5 | 4 | 3 | 3 | 4 | 3 | 4 |
| Rental Invoice Detail residual | 3 | 4 | 3 | 3 | 4 | 5 | 4 |
| Rental Booking Detail | 5 | 5 | 1 | 2 | 3 | 4 | 5 |
| Rental Damages (vehicle) | 4 | 4 | 2 | 3 | 3 | 4 | 4 |
| Master Prospects | 2 | 1 | 5 | 5 | 3 | 5 | 4 |
| Master Organizations | 3 | 3 | 4 | 4 | 4 | 3 | 4 |

---

## 26. Top 12 Cross-Domain Candidates

| Rank | Domain | Surface | Exact files | Active? | Visible | Hidden | Fixed | Impact | Risk | Bnd | Test | Arch | Coll | ResQ | Keys | Rec |
|-----:|--------|---------|-------------|---------|--------:|-------:|------:|-------:|-----:|----:|-----:|-----:|-----:|-----:|-----:|-----|
| 1 | Operator | Damage Capture | `operator/damages/*` (4 steps + payload) | YES | 9 | ~25 | 0 | 4 | 4 | 5 | 4 | 4 | 3 | 5 | 28–38 | **SELECT** |
| 2 | Operator | Pickup Verification | `verification/OperatorPickupCheckSheet.tsx` | YES | 4 | ~15 | 0 | 4 | 5 | 5 | 4 | 3 | 4 | 4 | 16–20 | Alt |
| 3 | Operator | Vehicle Quick View | `OperatorVehicleQuickView.tsx`, utils | YES | 22 | ~20 | 1 | 5 | 4 | 3 | 3 | 4 | 3 | 4 | 32–42 | Next |
| 4 | Operator | Today + Booking detail | `OperatorTodayView.tsx`, `OperatorBookingDetailSheet.tsx` | YES | 23 | ~16 | 0 | 5 | 4 | 3 | 4 | 3 | 3 | 4 | 24–32 | Next |
| 5 | Operator | Booking lifecycle sheets | `OperatorBookingFormSheet.tsx`, cancel/no-show | YES | 27 | ~22 | 0 | 5 | 5 | 3 | 4 | 3 | 3 | 4 | 40–55 | Defer |
| 6 | Rental | Booking Detail Dossier | `booking-detail/*` | YES | 0 | ~111 | 2 | 5 | 5 | 1 | 2 | 3 | 4 | 5 | 90–120 | SPLIT |
| 7 | Rental | Invoice Detail residual | `InvoiceDetail*.tsx`, mappers | YES | 16 | ~154 | 2 | 3 | 4 | 3 | 3 | 4 | 5 | 4 | 120–160 | Defer |
| 8 | Rental | Damages (vehicle) | `DamagesView.tsx`, `damages/*` | YES | 93 | ~25 | 0 | 4 | 4 | 2 | 3 | 3 | 4 | 4 | 85–110 | Defer |
| 9 | Rental | Settings Billing | `billing/*` | YES | 98 | ~30 | 2 | 3 | 5 | 2 | 3 | 2 | 4 | 3 | 90–105 | Defer |
| 10 | Master | Prospects | `ProspectsView.tsx` | YES | 47 | low | 2 | 2 | 1 | 5 | 5 | 3 | 5 | 4 | 45–55 | Alt domain |
| 11 | Master | Organizations | `OrganizationsView.tsx`, `org.utils.ts` | YES | 44 | ~20 | 1 | 3 | 3 | 4 | 4 | 4 | 3 | 4 | 50–65 | Alt domain |
| 12 | Operator | Shell chrome | `OperatorBottomNav.tsx`, header, access | YES | 24 | ~14 | 0 | 3 | 2 | 4 | 3 | 3 | 5 | 3 | 20–28 | Polish |

---

## 27. Top Candidate Per Domain

| Domain | Winner | Why | Risk | Debt Δ | Keys |
|--------|--------|-----|------|--------|------|
| Rental | Invoice Detail residual | Finance continuity after P223; frozen list/dialogs/docs | Med–high coupling | ~170 strings | 120–160 |
| **Operator** | **Damage Capture** | Bounded wizard; field-facing; tests exist; high residual quality | Payload enum freeze | ~34 strings | 28–38 |
| Master | Prospects | Single-file; lowest risk; excellent testability | Low admin frequency | 47 scanner | 45–55 |
| Vehicle/Fleet | *(none bounded)* | P2.2.2 frozen; residual is dashboard cross-cut | — | — | — |
| Shared/Shell | Login/shell chrome | 25 scanner; app-wide | Low impact vs Operator | 25 | ~30 |

---

## 28. Rental vs Operator Head-to-Head

**Best Rental:** Invoice Detail residual  
**Best Operator:** Damage Capture

| Metric | Rental (Invoice Detail) | Operator (Damage Capture) |
|--------|------------------------|---------------------------|
| User frequency | 3 (finance desk) | **4 (field daily)** |
| Roles | Rental back-office | **WORKER, SUB_ADMIN mobile** |
| Visible debt | 16 | 9 |
| Hidden debt | ~154 | ~25 |
| Fixed locale | 2 files | 0 |
| Business coupling | High (amounts, gates) | **Med (bounded wizard)** |
| API coupling | Invoice actions | Damage create payload |
| Boundedness | 3 (many files) | **5 (4 steps + adapter)** |
| Testability | 3 | **4 (payload tests exist)** |
| Collision | 5 (low) | 3 (med vocabulary) |
| Key growth | 120–160 | **28–38** |
| Residual quality | 4 | **5** |
| UX benefit (mixed-lang) | 3 | **5** |
| Implementation risk | 4 | **3** |

**Winner: OPERATOR WINS**

---

## 29. Domain Campaign Decision

**START OPERATOR CAMPAIGN**

Rental has delivered five consecutive bounded finance/ops slices (P219–P223). Remaining Rental high-value surfaces are oversized or blind-spot heavy. Operator field workflows offer higher practical mixed-language impact with better boundedness for the next safe slice.

---

## 30. Excluded Candidates

| Candidate | Reason |
|-----------|--------|
| Rental Booking Detail | **SHOULD BE SPLIT** — ~111 blind-spot literals, high coupling |
| Rental Settings Billing | **FINANCIAL RISK** — Stripe/subscription sensitivity |
| Rental Damages (vehicle) | **TOO LARGE** — 93 scanner, 10+ files; defer after Operator campaign start |
| Master Billing | **FINANCIAL RISK** + **TOO LARGE** |
| Master Support Ops | **RECENTLY FROZEN** (P2.2.10) |
| Communication Center | **RECENTLY FROZEN** (P2.2.8) + active PR #1187 |
| `BusinessInsightsBox` | **DEAD/LEGACY** |
| Vehicle/Fleet dashboard residual | **TOO LARGE** + cross-cutting |
| Operator Handover | **RECENTLY FROZEN** (P2.2.13) |
| Global fixed-locale cleanup | **ARCHITECTURAL PREREQUISITE** — out of scope |

---

## 31. Selected P2.2.24 Target

# **P2.2.24 — Operator Damage Capture Localization**

---

## 32. One Slice / Split Decision

**ONE SLICE**

Four-step wizard + payload presentation helpers fit ≤3 substantive production files + 1 adapter within key budget.

---

## 33. Selected Target — Exact Production Scope

| Path | Role | Ownership | Coupling | Required |
|------|------|-----------|----------|----------|
| `frontend/src/operator/damages/OperatorDamageCaptureFlow.tsx` | Wizard shell, step nav, submit | Step chrome, errors, CTA labels | Med — calls API with payload | YES |
| `frontend/src/operator/damages/OperatorDamagePhotoStep.tsx` | Photo capture/upload step | Step copy, empty/loading | Low | YES |
| `frontend/src/operator/damages/OperatorDamageDetailsStep.tsx` | Classification step | Labels, severity/impact selectors | Med — enum display only | YES |
| `frontend/src/operator/damages/OperatorDamageReviewStep.tsx` | Review/submit step | Summary labels | Low | YES |
| `frontend/src/operator/lib/operator-damage-capture-i18n.ts` *(new)* | Presentation adapter | Chip display labels, validation messages | Low | YES |
| `frontend/src/operator/damages/operatorDamagePayload.ts` | Payload builder + validation | Validation message source only | **High** — must not alter machine fields | YES (presentation strings only) |

**Excluded from boundary:** `OperatorDamageCaptureProvider.tsx` (wiring only, no user strings), `operatorDamageImage.utils.ts` (technical).

---

## 34. Selected Target — Presentation Inventory

| Category | Scanner-visible | Hidden | Fixed-locale |
|----------|----------------:|-------:|-------------:|
| Step labels (`Fahrzeug`, `Fotos`, …) | 4 | 0 | 0 |
| Wizard title/body/CTAs | 3 | ~8 | 0 |
| Photo step instructions | 1 | ~4 | 0 |
| Details step labels/options | 2 | ~10 | 0 |
| Review summary rows | 1 | ~6 | 0 |
| Location chips (display) | 0 | 7 | 0 |
| Validation errors | 0 | 4 | 0 |
| Submit/loading errors | 1 | ~4 | 0 |
| **Total est.** | **~9** | **~25** | **0** |

---

## 35. Machine / Domain Freeze

| Value | Used by | Presentation mapping? | Must remain unchanged? |
|-------|---------|----------------------|------------------------|
| `damageType` (`SCRATCH`, `TIRE_DAMAGE`, …) | Payload | Display via localized labels; **machine value unchanged** | **YES** |
| `severity` (`MINOR`, `MODERATE`, …) | Payload | Display map only | **YES** |
| `rentalImpact` (`WATCH`, `BLOCKING`, …) | Payload | Display map only | **YES** |
| `source` (`INSPECTION`, `PICKUP_HANDOVER`, …) | Payload | From `resolveDamageSource` logic | **YES** |
| `locationView` (`FRONT`, `REAR`, …) | Payload | Chip selection | **YES** |
| `locationChipId` | Form state | Internal | **YES** |
| `locationLabel` | Payload (optional text) | User/content field — **do not use as identity** | Content may vary; not an ID |
| `description` | Payload | User free text | User content |
| `vehicleId`, `bookingId`, `customerId` | Context | Not translated | **YES** |
| `OPERATOR_DAMAGE_CAPTURE_STEPS` order | State machine | Step IDs unchanged | **YES** |
| `images[].imageData` | Payload | Binary | **YES** |
| `reportedBy` | Payload | Opaque ID/string | **YES** |
| API `api.vehicleDamages.create` | Submit | Operation unchanged | **YES** |

---

## 36. Semantic Safety Verdict

**PRESENTATION-ONLY SAFE**

### Extra freeze invariants

1. `buildOperatorDamagePayload` output keys and enum machine values **unchanged**.
2. `resolveDamageSource` branching **unchanged**.
3. `validateOperatorDamageStep` returns localized strings but **does not alter** validation predicates.
4. Location chip **`id`**, `locationView`, `suggestDamageType` **unchanged**; localize **`label`** for display only. If `defaultLocationLabel` is written to API, document as user-facing content (not an identity key) or keep stable machine-facing defaults separate from display labels.
5. `DESCRIPTION_MAX_LENGTH` and photo count rules **unchanged**.

---

## 37. Key Reuse Analysis

| Reuse | Keys |
|-------|------|
| Exact | `common.cancel`, `common.back`, `common.next`, `common.save`, `common.close`, `common.loading` |
| Semantic | `handover.operator.damages.*` (terminology alignment, not duplication) |
| Rental `damages.*` | Partial — only 4 generic list keys exist; insufficient for capture wizard |
| New namespace | **`operator.damageCapture.*`** (~28–38 keys) |
| Duplicate risk | Low if `operator.*` namespace used |
| Parallel taxonomy | **Avoid** — do not create second damage type enum taxonomy |

---

## 38. P224 ENFORCE-CLEAN BOUNDARY

```text
P224_ENFORCE_CLEAN_EXACT = {
  'operator/damages/OperatorDamageCaptureFlow.tsx',
  'operator/damages/OperatorDamagePhotoStep.tsx',
  'operator/damages/OperatorDamageDetailsStep.tsx',
  'operator/damages/OperatorDamageReviewStep.tsx',
  'operator/damages/operatorDamagePayload.ts',
  'operator/lib/operator-damage-capture-i18n.ts',
}
```

Exact paths only. No prefix. No ignores/allowlists. No scanner weakening.

---

## 39. Blind-Spot Guard Plan

| Guard | Target |
|-------|--------|
| `STEP_LABELS` map | grep for German literals in flow |
| `OPERATOR_DAMAGE_LOCATION_CHIPS` | chip label/display vs machine `id` |
| `validateOperatorDamageStep` messages | validation string source |
| Submit error strings | flow error handling |
| `aria-label` / `title` on photo capture | step components |
| Severity/impact option labels | details step |
| No raw `TranslationKey` in DOM | render tests |

---

## 40. Future Test Contract

File: `frontend/src/operator/damages/operator-damage-capture-localization.test.tsx`

| Test | Required |
|------|----------|
| EN render — step chrome | YES |
| DE render — step chrome | YES |
| Same-mount DE → EN | YES |
| Same-mount EN → DE | YES |
| `damageType`/`severity`/`rentalImpact` machine values in payload unchanged | YES |
| `locationView` unchanged on chip select | YES |
| `vehicleId`/`bookingId` context unchanged | YES |
| Callback `onSaved` / `onCreated` with damage ID | YES |
| Validation messages localized; rules unchanged | YES |
| No raw TranslationKey in textContent | YES |
| P224 enforce-clean inventory = 0 | YES |
| Payload regression via `buildOperatorDamagePayload` | YES (extend existing test) |

---

## 41. Category E Contract

Baseline: `96dadcb3face5e17150893e52006232b3710cd08`

Required: business/runtime semantic modifications = **0**, Category E = **0**.

---

## 42. Global Freeze Contract

Future implementation must preserve all P216–P223 = 0, CompanySections = 0, global enforce-clean = 0, `npm run i18n:check` PASS. No scanner weakening.

---

## 43. Shim / Compatibility Freeze

Baseline shim: **29**. Future: new compatibility consumers = **0**, shim ≤ **29**.

---

## 44. Implementation Contract

**TITLE:** P2.2.24 — Operator Damage Capture Localization  
**AUTHORITATIVE BASE:** `96dadcb3face5e17150893e52006232b3710cd08`

**IN SCOPE:** 4 step components + `operatorDamagePayload.ts` presentation strings + `operator-damage-capture-i18n.ts` adapter + `operator.damageCapture.*` dictionary module + P224 tests + enforce-clean boundary + docs

**OUT OF SCOPE:** Provider wiring, rental `DamagesView`, vehicle quick view, handover (frozen), Communication Center, API/payload shape changes, global fixed-locale cleanup, shim cleanup

**Acceptance:** 26-point checklist per charter (scoped debt 0, parity 100%, P224=0, global freeze preserved, tests PASS, build PASS, etc.)

---

## 45–46. Audit Artifact & PR Topology

Artifact: this file.

Post-commit PR topology requirements: 1 audit file only, 0 production/dictionary/test/scanner changes, Draft PR.

---

## 47. Final Report

| # | Item | Result |
|---|------|--------|
| 1 | Baseline SHA | `96dadcb3face5e17150893e52006232b3710cd08` |
| 2 | Topology valid | **YES** |
| 3 | `npm run i18n:check` | **PASS** |
| 4 | Global enforce-clean | **0** |
| 5–12 | P223–P216A/B1/B2/C1/C2A/C2B | **all 0** |
| 13 | CompanySections freeze | **0** |
| 14 | EN count | **8264** |
| 15 | DE count | **8264** |
| 16 | Parity | **100%** |
| 17 | Orphans | **0** |
| 18 | Shim | **29** |
| 19 | New compat consumers | **0** |
| 20 | Global scanner | **1603** |
| 21 | Rental residual | **372** |
| 22 | Operator residual | **156** |
| 23 | Master residual | **1049** |
| 24 | Vehicle/Fleet residual | **0** in frozen paths; dashboard cross-cut deferred |
| 25 | Shared/Shell residual | **26** (1+25) |
| 26 | Fixed-locale production count | **8** FORMAT_LOCALE scanner + ~130 file matches (mostly frozen/other) |
| 27 | Rental saturation | **Mixed** — high-value remains but oversized; ~15% legacy/dead |
| 28 | Rental domain-exit | **B — EXIT RENTAL FOR NOW — OPERATOR HAS HIGHER VALUE** |
| 29 | Top 12 | See §26 table |
| 30 | Best Rental | Invoice Detail residual |
| 31 | Best Operator | **Damage Capture** |
| 32 | Best Master | Prospects |
| 33 | Best Vehicle/Fleet | None bounded |
| 34 | Best Shared/Shell | Login/shell chrome |
| 35 | Rental vs Operator | **OPERATOR WINS** |
| 36 | Domain campaign | **START OPERATOR CAMPAIGN** |
| 37 | Selected P224 | **Operator Damage Capture Localization** |
| 38 | Production files | 4 steps + payload + adapter (§33) |
| 39 | Render path | `OperatorShell` → `OperatorDamageCaptureProvider` → overlay flow |
| 40 | Visible findings | **~9** |
| 41 | Hidden findings | **~25** |
| 42 | Fixed-locale | **0** in boundary |
| 43 | User impact | **4** |
| 44 | Business risk | **4** |
| 45 | Boundedness | **5** |
| 46 | Testability | **4** |
| 47 | Architecture leverage | **4** |
| 48 | Collision | **3** |
| 49 | Residual quality | **5** |
| 50 | Expected keys | **28–38** |
| 51 | Semantic safety | **PRESENTATION-ONLY SAFE** |
| 52 | Machine freeze | §35 table |
| 53 | Key strategy | `operator.damageCapture.*` + `common.*` reuse |
| 54 | P224 boundary | §38 |
| 55 | Guard strategy | §39 |
| 56 | Future tests | §40 |
| 57 | Category E expectation | **0** |
| 58 | Global freeze plan | §42 |
| 59 | Audit artifact | `docs/audits/i18n-p2-2-24-post-p223-domain-exit-preflight-2026-08-22.md` |
| 60 | Audit PR | *(created with commit)* |
| 61 | Audit PR topology | *(verified post-create)* |
| 62 | Final verdict | **A — GO — P2.2.24 TARGET SELECTED** |

**Confirmations:**

- production code modified = **NO**
- dictionaries modified = **NO**
- tests modified = **NO**
- scanner modified = **NO**
- P2.2.24 implementation started = **NO**
- merged = **NO**

---

## 48. Final Verdict

### **A — GO — P2.2.24 TARGET SELECTED**

**P2.2.24 — Operator Damage Capture Localization**

Post-P223 freeze verified. Rental domain-exit review favors **Operator** for the next slice. Selected target is bounded, field-facing, testable, and presentation-safe with explicit payload enum freeze invariants. No material Communication Center collision.

---

*Read-only pre-flight. No implementation.*
