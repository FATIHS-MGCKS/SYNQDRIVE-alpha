# P2.2.23 — Post-P222 Residual Prioritization & Next Slice Selection

**Date:** 2026-08-22  
**Mode:** STRICT READ-ONLY PRE-FLIGHT  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Authoritative baseline:** `80dbba83d8f7d93db1beba695d5b4d4229925cb0` (PR #1172 — P2.2.22 Rental Send Invoice Dialog Localization)

---

## 0. Authoritative Baseline / Topology Hard Gate

| Check | Result |
|-------|--------|
| PR #1172 merged | ✅ verified via `gh pr view 1172` |
| Exact merge SHA | `80dbba83d8f7d93db1beba695d5b4d4229925cb0` |
| Commit exists locally | ✅ `git cat-file -t 80dbba83` → commit |
| Audit branch | `cursor/p2223-post-p222-next-slice-preflight-3c10` |
| Branch created from baseline | ✅ directly from `80dbba83` |
| `git merge-base HEAD 80dbba83` | `80dbba83d8f7d93db1beba695d5b4d4229925cb0` ✅ |
| `git rev-list --count 80dbba83..HEAD` (pre-audit commit) | `0` ✅ |
| Working tree (pre-audit) | clean |

### P216–P222 ancestry (verified on baseline)

| Slice | Merge commit (in ancestry) |
|-------|---------------------------|
| P2.2.16A | `8941158c` Task Timeline Event Taxonomy |
| P2.2.16B.1 | (in chain via 8941158c) |
| P2.2.16B.2 | `3d0dc906` Task Timeline Locale Threading |
| P2.2.16C.1 | `2f47b6a0` Task Detail Chrome |
| P2.2.16C.2A | `718a5e82` Task Workflow Core |
| P2.2.16C.2B | `f7095205` Task Detail Host Residuals |
| P2.2.17 | `6e578fd9` Booking Vehicle Picker |
| P2.2.18 | `d645343f` Data Authorization Global Closure |
| P2.2.19 | `9b714458` Rental Insurances |
| P2.2.20 | `6413a3dd` Rental Parts & Accessories |
| P2.2.21 | `59b01928` Rental Create Invoice Dialog |
| P2.2.22 | `80dbba83` Rental Send Invoice Dialog |

**Topology verdict:** VALID — proceed.

---

## 1. Post-P222 Freeze Verification

Command: `cd frontend && npm run i18n:check` @ `80dbba83`

| Metric | Required | Observed |
|--------|----------|----------|
| `npm run i18n:check` | PASS | **PASS** |
| Global active enforce-clean debt | 0 | **0** |
| P222 | 0 | **0** |
| P221 | 0 | **0** |
| P220 | 0 | **0** |
| P219 | 0 | **0** |
| P218 | 0 | **0** |
| P217 | 0 | **0** |
| P216A | 0 | **0** |
| P216B1 | 0 | **0** |
| P216B2 | 0 | **0** |
| P216C1 | 0 | **0** |
| P216C2A | 0 | **0** |
| P216C2B | 0 | **0** |
| EN keys | ≈8235 | **8235** |
| DE keys | ≈8235 | **8235** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** (structural health passed) |
| Shim inventory | ≈29 | **29** (prod 18, test 11) |
| New compatibility consumers | 0 | **0** |

**Post-P222 baseline verdict:** INTACT — no regression.

### P222 frozen-surface regression check

Scoped paths `SendInvoiceDialog.tsx`, `send-invoice-i18n.ts`: **0 scanner findings**, **0 enforce-clean debt**. No Category E regression.

---

## 2. Purpose

Select exactly **one** bounded production localization slice for P2.2.23 optimizing:

**user impact × active production relevance × boundedness × semantic safety × architectural leverage × testability × low merge-collision risk**

---

## 3. Global Residual Inventory (fresh recompute)

**Methodology:** `node scripts/i18n-hardcoded-scan.mjs` via `npm run i18n:check` regenerates `frontend/src/i18n/hardcoded-copy-inventory.json`. Counts recomputed by surface prefix and enforce-clean slice tags. Scanner inventory ≠ enforce-clean debt (only guarded exact paths count toward slice debt).

| Surface | Scanner findings |
|---------|-----------------:|
| **Global total** | **1611** |
| Master | 1049 |
| Rental | 380 |
| Operator | 156 |
| Shell | 25 |
| Shared | 1 |
| **Global active enforce-clean debt** | **0** |

### Rental module breakdown (scanner grouping)

| Module | Findings |
|--------|--------:|
| Other rental areas | 260 |
| Finance/Billing | 98 |
| Tasks | 13 |
| Documents | 8 |
| App / routing shell | 1 |

**Delta vs reference:** Global 1611 (ref ≈1616 pre-P222); Rental 380 (ref ≈380). Consistent with P222 merge.

---

## 4. Frozen P216–P222 Exclusion

Explicitly excluded from P2.2.23 selection:

- P216A/B1/B2/C1/C2A/C2B (task surfaces)
- P217 Booking Vehicle Picker
- P218 Data Authorization
- P219 Rental Insurances
- P220 Rental Parts & Accessories
- P221 Rental Create Invoice Dialog
- P222 Rental Send Invoice Dialog

All enforce-clean at **0**. No regression demonstrated.

---

## 5. Diminishing-Returns Check — Rental

**Decision:** **YES — RENTAL STILL HAS BEST NEXT SLICE**

**Evidence:**

- Invoice workflow continuity: P214 list → P221 create → P222 send → natural next satellite = documents panel on same `InvoiceDetail` route.
- Highest-value remaining Rental surfaces are **bounded invoice-detail satellites** (8+7+5+4 = 24 findings across 4 files) with daily finance-user impact.
- Operator best single surface (`OperatorVehicleQuickView`, 22 findings) is broader mobile shell, higher workflow coupling.
- Master raw debt (1049) remains dominated by HealthTracking (132) and VehicleRegistration (95) — explicitly out of scope for bounded P223.

Consecutive Rental slices are justified by **workflow adjacency and boundedness**, not domain rotation.

---

## 6. Rental — Fresh Decomposition (post-P219–P222)

### Invoice detail satellites (strongest cluster)

| Surface | Files | Scanner | Hidden | Fixed-locale | Active | Est. keys | Collision |
|---------|-------|--------:|-------:|-------------:|--------|----------:|-----------|
| **Documents panel** | `InvoiceDocuments.tsx` | 8 | formatDateTime in mapper | 1 (`invoiceDocuments.mapper.ts`) | ACTIVE | 30–45 | LOW |
| Detail secondary | `InvoiceDetailSecondary.tsx` | 7 | accordion labels | 0 | ACTIVE | 25–35 | LOW |
| Notes | `InvoiceNotes.tsx` | 5 | textarea placeholders | 0 | ACTIVE | 15–25 | LOW |
| Timeline | `InvoiceTimeline.tsx` + mapper | 4 | event labels | 1 (`invoiceTimeline.mapper.ts`) | ACTIVE | 20–30 | LOW |

### Other Rental candidates (not selected)

| Surface | Files | Scanner | Notes |
|---------|-------|--------:|-------|
| DataAnalyseView | 1 | 32 | TOO LARGE |
| DocumentsView | 1 | 22 | TOO LARGE |
| Damages cluster | 11 | 93+ | SHOULD BE SPLIT |
| Users & roles | 13 | 66 | TOO BUSINESS-COUPLED |
| Tenant billing drawers | 3 | 8+8+7 | FINANCIAL RISK |
| CreateUserWizard | 1 | 16 | permission coupling |

**Payments note:** `RecordPaymentDialog.tsx`, `InvoicePayments.tsx`, `invoicePayments.mapper.ts` are **already localized** (`invoicePayment.*` keys). Not a P223 candidate.

---

## 7. Operator — Fresh Decomposition

| Surface | Files | Scanner | Active | Field impact | Est. keys | Risk |
|---------|-------|--------:|--------|-------------|----------:|------|
| Vehicle quick view | `OperatorVehicleQuickView.tsx` | 22 | ACTIVE | High | 40–60 | workflow coupling |
| Booking form sheet | `OperatorBookingFormSheet.tsx` | 16 | ACTIVE | High | 35–50 | payload coupling |
| Today view | `OperatorTodayView.tsx` | 12 | ACTIVE | High | 30–45 | schedule state |
| AI upload flow | `OperatorAiUploadFlow.tsx` | 11 | ACTIVE | Med | 25–40 | extraction coupling |
| Tire measure | `OperatorTireMeasureFlow.tsx` | 11 | ACTIVE | Med | 25–35 | measurement payloads |
| Handover (operator) | `operator/handover/*` | partial | ACTIVE | High | — | P2.2.13 frozen subset only |

**Best Operator candidate:** `OperatorVehicleQuickView.tsx` (22 findings) — deferred: less bounded than invoice documents panel, higher mobile workflow coupling.

---

## 8. Master Admin — Narrow Decomposition

| Sub-surface | Top file | Scanner | Notes |
|-------------|----------|--------:|-------|
| Health tracking | `HealthTrackingView.tsx` | 132 | TOO LARGE |
| Vehicle registration | `VehicleRegistrationModal.tsx` | 95 | TOO LARGE |
| High Mobility | `HighMobilityDataView.tsx` | 65 | API sensitivity |
| Insurances admin | `InsurancesAdminView.tsx` | 59 | overlaps P219 rental |
| Prospects | `ProspectsView.tsx` | 47 | SHOULD BE SPLIT |
| Performance logic | `PerformanceLogicView.tsx` | 56 | internal tooling |
| System monitoring | `SystemMonitoringView.tsx` | 37 | LOW USER VALUE (rental ops) |

**Best Master narrow candidate:** `ProspectsView.tsx` list chrome only (~15–20 keys) — deferred: admin frequency lower than rental finance invoice detail.

---

## 9. Shared / Shell

| Surface | Files | Scanner | Bounded? |
|---------|-------|--------:|----------|
| MFA enrollment | `MfaEnrollmentPanel.tsx` | 7 | moderate |
| MFA step-up | `MfaStepUpDialog.tsx` | 3 | yes |
| Pagination | `pagination.tsx` | 3 | yes |
| MapboxMap | `MapboxMap.tsx` | 3 | geo coupling |
| Shell total | — | 25 | fragmented |

No shared/shell slice selected — lower user impact than rental invoice documents.

---

## 10. Communication Center Collision Gate

| Open PR | Area | P223 candidate collision |
|---------|------|--------------------------|
| #1134 Communication C5.2 SMS runtime | backend SMS only | **NO COLLISION** |
| #1108 Communication contract v1 | docs only | **NO COLLISION** |
| #1131 Dashboard UI copy refinement | rental dashboard | **NO COLLISION** (invoice detail untouched) |

**Invoice Documents panel classification:** **NO COLLISION**

---

## 11. Other Active Feature Collisions

| Candidate | Open PR overlap | Production files | Dictionary | Tests | Verdict |
|-----------|----------------|------------------|------------|-------|---------|
| Invoice Documents | none material | unique | `invoices.documents.*` (new) | extends existing | **LOW** |
| Invoice Detail Secondary | none | adjacent | `invoices.detail.*` | shared InvoiceDetail tests | LOW |
| Operator quick view | none | unique | new operator namespace | weak | LOW |
| Master Prospects | none | unique | master namespace | weak | LOW |

Governance overlap (scanner script, `i18n:check`) expected and manageable.

---

## 12. Fixed-Locale Inventory (production)

Search: `de-DE`, `toLocaleString`, `Intl.*Format` in production `frontend/src`.

### Invoice-detail cluster (P223-relevant)

| File | Occurrence | Class |
|------|------------|-------|
| `invoiceDocuments.mapper.ts` | `toLocaleString('de-DE', …)` | **C** — presentation formatter debt |
| `invoiceTimeline.mapper.ts` | `Intl.DateTimeFormat('de-DE')` | **C** — adjacent, out of P223 component scope |
| `invoiceUtils.ts` | `Intl.NumberFormat('de-DE')` | **C** — shared invoice formatters, out of P223 scope |

### Global FORMAT_LOCALE scanner category: 8 total (not all P223)

Classification: mostly **C** (formatter debt). P223 should locale-thread `formatDateTime` in `invoiceDocuments.mapper.ts` when localizing documents panel dates.

---

## 13. Scanner-Blind / Hidden Debt

### Selected target — Invoice Documents

| Category | Finding |
|----------|---------|
| `formatDateTime` | Hardcoded `de-DE` in mapper — dates always German under EN |
| `statusLabel` / `channelLabel` / `documentTypeLabel` | Backend-provided strings — **Category B** (dynamic business data, do not translate) |
| `capabilities.*.reason` | Backend gate reasons — **Category B** (display as-is) |
| `errorMessage` | Backend errors — **Category B** |
| `doc.fileName` | Business artifact name — **Category B** |
| `deliveryTone` / `documentStatusTone` | Machine status → tone mapping — preserve IDs |

No hidden column-definition arrays or option maps beyond visible JSX literals.

---

## 14. Active / Dead Verification — Selected Target

| Check | Result |
|-------|--------|
| Production import | `InvoiceDetail.tsx` imports `InvoiceDocuments` |
| Render path | `InvoiceDetail` route → documents section `data-testid="invoice-documents-section"` |
| Navigation | Finance → Invoices → invoice detail |
| Feature flag | none blocking |
| Tests | `InvoiceDocuments.test.tsx`, `invoiceDocuments.mapper.test.ts`, integration via `useInvoiceDocuments` |
| **Classification** | **ACTIVE** |

---

## 15–20. Scoring — Top Candidates

Scoring: User impact / Business risk / Boundedness / Architecture leverage / Testability / Collision (0–5 each; business risk lower is safer).

---

## 21. Top 10 Candidates

| Rank | Domain | Surface | Exact files | Visible | Hidden | Fixed-locale | Active? | UI | Risk | Bnd | Arch | Test | Coll | Keys | Rec |
|-----:|--------|---------|-------------|--------:|-------:|-------------:|---------|---:|-----:|----:|-----:|-----:|-----:|-----:|-----|
| 1 | Rental | Invoice Documents panel | `InvoiceDocuments.tsx` (+ adapter) | 8 | 1 | 1 | ACTIVE | 5 | 2 | 5 | 4 | 4 | 5 | 35 | **SELECT** |
| 2 | Rental | Invoice detail secondary | `InvoiceDetailSecondary.tsx` | 7 | 2 | 0 | ACTIVE | 4 | 2 | 4 | 3 | 3 | 5 | 30 | defer |
| 3 | Rental | Invoice notes | `InvoiceNotes.tsx` | 5 | 1 | 0 | ACTIVE | 3 | 2 | 5 | 3 | 3 | 5 | 20 | defer |
| 4 | Rental | Invoice timeline | `InvoiceTimeline.tsx` | 4 | 2 | 1 | ACTIVE | 3 | 2 | 4 | 3 | 3 | 5 | 25 | defer |
| 5 | Operator | Vehicle quick view | `OperatorVehicleQuickView.tsx` | 22 | 3 | 0 | ACTIVE | 5 | 3 | 2 | 2 | 2 | 4 | 50 | alt strategy |
| 6 | Operator | Booking form sheet | `OperatorBookingFormSheet.tsx` | 16 | 2 | 0 | ACTIVE | 5 | 4 | 2 | 2 | 2 | 4 | 45 | defer |
| 7 | Operator | Today view | `OperatorTodayView.tsx` | 12 | 2 | 0 | ACTIVE | 5 | 3 | 3 | 2 | 2 | 4 | 35 | defer |
| 8 | Rental | Tenant billing overview | `TenantBillingOverviewTab.tsx` | 8 | 1 | 0 | ACTIVE | 3 | 4 | 3 | 2 | 2 | 4 | 30 | FIN RISK |
| 9 | Shared | MFA enrollment | `MfaEnrollmentPanel.tsx` | 7 | 1 | 0 | ACTIVE | 2 | 3 | 4 | 2 | 3 | 5 | 20 | LOW VALUE |
| 10 | Master | Prospects list chrome | `ProspectsView.tsx` (partial) | 47 | 5 | 0 | ACTIVE | 2 | 3 | 2 | 2 | 2 | 5 | 60 | TOO LARGE |

---

## 22. Three-Strategy Comparison

### A — Continue bounded Rental closure

- **Best candidate:** Invoice Documents panel
- **Why now:** Completes invoice-detail workflow after P221/P222; single primary file; existing tests; high finance-user visibility
- **Why defer others:** Secondary/notes/timeline are natural P224+ follow-ons
- **Benefit:** −8 scanner findings + formatter fix; invoice UX coherence
- **Risk:** Low — presentation-only; callbacks unchanged
- **Debt reduction:** ~35 keys, 8 visible findings
- **Complexity:** Low–medium

### B — Begin bounded Operator closure

- **Best candidate:** Operator vehicle quick view
- **Why now:** High field-user impact
- **Why defer:** 22 findings, broader mobile shell, weaker test harness
- **Benefit:** −22 findings
- **Risk:** Medium workflow coupling
- **Debt reduction:** ~50 keys
- **Complexity:** Medium–high

### C — Begin bounded Master closure

- **Best candidate:** Prospects list chrome (partial)
- **Why now:** Large raw debt
- **Why defer:** Admin-only, 47-finding file, split required
- **Benefit:** Small % of master debt
- **Risk:** Permission sensitivity
- **Debt reduction:** uncertain without split
- **Complexity:** High

**Strongest strategy:** **A — Continue bounded Rental closure**

---

## 23. Excluded Candidates

| Candidate | Reason |
|-----------|--------|
| DataAnalyseView (32) | TOO LARGE |
| DocumentsView (22) | TOO LARGE |
| Damages cluster (93+) | SHOULD BE SPLIT |
| Users & roles (66) | TOO BUSINESS-COUPLED |
| Tenant billing drawers | FINANCIAL RISK |
| HealthTrackingView (132) | TOO LARGE |
| VehicleRegistrationModal (95) | TOO LARGE |
| Communication Center UI | ACTIVE FEATURE COLLISION (future) |
| P216–P222 frozen surfaces | frozen |
| Global fixed-locale sweep | ARCHITECTURAL PREREQUISITE |
| RecordPaymentDialog | already localized |

---

## 24. Selected P2.2.23 Target

**TITLE:** **P2.2.23 — Rental Invoice Documents Panel Localization**

**Primary file:** `frontend/src/rental/components/invoices/InvoiceDocuments.tsx`  
**Supporting adapter (recommended):** `frontend/src/rental/lib/invoice-documents-i18n.ts`  
**Formatter threading:** `frontend/src/rental/components/invoices/invoiceDocuments.mapper.ts` (`formatDateTime` only)

---

## 25. One Slice / Split Decision

**ONE SLICE**

Single component with cohesive panel states (EMPTY, GENERATING, FAILED, ACTIVE, delivery history). No split required.

---

## 26. Selected Target — Presentation Inventory

### Scanner-visible literals (InvoiceDocuments.tsx)

| Category | German literals (representative) |
|----------|----------------------------------|
| Section title | `Dokumente` |
| Loading | `Dokumente werden geladen…` |
| Generating | `PDF wird erzeugt…`, `Bitte warten — eine erneute Generierung ist derzeit nicht möglich.` |
| Failed | `PDF-Erzeugung fehlgeschlagen`, `Unbekannter Fehler`, `Letzter Versuch:`, `Erneut versuchen` |
| Empty | `Für diese Rechnung wurde noch kein PDF erzeugt.`, `PDF erzeugen` |
| Active card | `Aktive Version`, `Dokumenttyp`, `Version`, `Erstellt am`, `Ersteller`, `Dateigröße` |
| Actions | `Vorschau`, `Download`, `Per E-Mail senden`, `Neue Version erzeugen` |
| Version history | `Frühere Versionen ({n})`, `Version {n}` |
| Incoming attachment | `Eingangsbeleg als Anhang vorhanden…`, `Anhang öffnen` |
| Delivery history | `Versandhistorie`, `Noch keine Versände…`, `Kanal`, `Dokumentversion`, `Datum/Uhrzeit`, `Ausgelöst von`, `Erneut senden` |
| Aria | `aria-expanded`, `role="status"`, `role="alert"`, `role="note"` (attributes OK; associated text must localize) |

### Hidden / formatter

- `formatDateTime` in `invoiceDocuments.mapper.ts` — hardcoded `de-DE`

### Dynamic (Category B — do not translate)

- `doc.statusLabel`, `row.statusLabel`, `row.channelLabel`, `doc.documentTypeLabel`
- `panel.generation.errorMessage`, `row.errorMessage`
- `capabilities.*.reason` gate messages from backend
- `doc.fileName`, `row.recipient`, `doc.createdByName`, `row.triggeredByName`

---

## 27. Selected Target — Machine / Domain Inventory

| Machine/domain value | Used by | Presentation mapping? | Must remain unchanged? |
|---------------------|---------|----------------------|------------------------|
| `panelState`: `EMPTY`, `GENERATING`, `FAILED`, `ACTIVE` | panel render switch | yes (section visibility) | **yes** — API contract |
| `doc.status`: `GENERATED`, `SENT`, `FAILED`, `DRAFT`, … | `documentStatusTone` | map to `invoices.list.documentStatus.*` reuse | **yes** — status codes |
| `row.status`: `SENT`, `DELIVERED`, `FAILED`, `BOUNCED`, `PENDING`, `QUEUED`, `SENDING` | `deliveryTone` | map to `invoices.list.sendStatus.*` reuse | **yes** |
| `documentId`, `emailId` | callbacks `onPreview`, `onRetryDelivery` | no | **yes** |
| `panel.capabilities.*.allowed` | action gates | no | **yes** |
| `regenerate` boolean | `onGenerate(true/false)` | no | **yes** |
| ISO timestamps | `formatDateTime` | locale-aware display | values unchanged |
| `SendInvoiceEmailPayload` | out of scope (P222) | — | **yes** |

---

## 28. Semantic Safety

**PRESENTATION-ONLY SAFE**

No API, permission, payload, or workflow-state changes required. Backend labels (Category B) remain as dynamic display. Extra freeze: preserve all callback signatures and capability gate semantics.

---

## 29. Key Reuse Analysis

### Exact reusable keys

- `invoices.list.documentStatus.*` — document status chips
- `invoices.list.sendStatus.*` — delivery status chips
- `invoices.send.title` — semantic neighbor for send action (evaluate `Per E-Mail senden` vs reuse)
- `common.cancel` — if any cancel surfaces added
- `email.send.modal.*` — partial reuse for send-adjacent copy

### Recommended namespace

`invoices.documents.*` (new module files: `invoices.documents.en.ts`, `invoices.documents.de.ts`)

### Estimated new keys

**30–45** genuinely new concepts (section chrome, panel states, meta labels, actions, empty/loading/error)

### Duplicate-risk concepts

- "Vorschau" / "Download" — may overlap `common.*` or invoice list; verify before duplicating
- "Erneut senden" vs send dialog — distinct context (delivery retry vs initial send)

---

## 30. P223 Exact Boundary

```text
P223_ENFORCE_CLEAN_EXACT =
  rental/components/invoices/InvoiceDocuments.tsx
  rental/lib/invoice-documents-i18n.ts
  rental/components/invoices/invoiceDocuments.mapper.ts   // formatDateTime only
```

No broad `invoices/**` prefix. No ignores. No exemptions.

---

## 31. Blind-Spot Guard Plan

Future guards for P223 scope:

- labels (meta rows, section headings)
- action button labels
- panel state messages (EMPTY, GENERATING, FAILED)
- delivery history empty state
- aria-associated visible text
- `formatDateTime` — no hardcoded locale in scoped mapper
- no raw `TranslationKey` in JSX
- preserve dynamic backend strings unmodified

---

## 32. Future Test Contract

**File:** `rental-invoice-documents-localization.test.tsx`

| Test | Requirement |
|------|-------------|
| EN render | All scoped labels English |
| DE render | All scoped labels German |
| Same-mount DE → EN | Labels update; edited state N/A (no form fields) |
| Same-mount EN → DE | Labels update |
| Machine IDs | `panelState`, status codes in callbacks unchanged |
| Callbacks | `onGenerate`, `onSendEmail`, `onRetryDelivery` signatures unchanged |
| API/payload | no changes |
| Dynamic data | `statusLabel`, `errorMessage` from fixtures unchanged |
| Dates | locale-aware formatting under EN vs DE |
| No DE leakage under EN | grep body text |
| No EN leakage under DE | grep body text |
| Panel states | EMPTY, GENERATING, FAILED, ACTIVE fixtures |

Extend `InvoiceDocuments.test.tsx` or add dedicated localization suite mirroring P222 pattern.

---

## 33. Category E Contract

Compare implementation diff against `80dbba83`.

**Required:** business/runtime semantic modifications = **0**; Category E = **0**

Unavoidable semantic changes → do not implement.

---

## 34. Global I18N Freeze Contract

Future P223 must preserve:

- `npm run i18n:check` = PASS
- Global active enforce-clean debt = 0
- P222–P216 = 0
- No scanner weakening

---

## 35. Shim / Compatibility Freeze

| Metric | Baseline |
|--------|----------|
| Shim total | 29 |
| New compatibility consumers | 0 |

Future: shim ≤ 29, new consumers = 0.

---

## 36. Implementation Contract

**TITLE:** P2.2.23 — Rental Invoice Documents Panel Localization

**AUTHORITATIVE BASE:** `80dbba83d8f7d93db1beba695d5b4d4229925cb0`

### IN SCOPE

- `InvoiceDocuments.tsx` presentation literals
- `invoice-documents-i18n.ts` adapter
- `invoiceDocuments.mapper.ts` `formatDateTime` locale threading
- `invoices.documents.*` dictionary keys
- P223 enforce-clean boundary + guards
- Localization tests
- Architecture/Changes docs

### OUT OF SCOPE

- `InvoiceDetailSecondary`, `InvoiceNotes`, `InvoiceTimeline` (P224+ candidates)
- `useInvoiceDocuments` host toasts (German — separate slice)
- `SendInvoiceDialog` (P222 frozen)
- `CreateInvoiceDialog` (P221 frozen)
- Communication Center
- Global fixed-locale cleanup
- Business/API/permission changes

### Acceptance (25 points)

1. Scoped visible debt = 0  
2. Scoped hidden debt = 0  
3. Scoped fixed-locale presentation debt = 0  
4. EN correct  
5. DE correct  
6. Runtime switch correct  
7. Machine/domain semantics unchanged  
8. Business semantics unchanged  
9. API/payload unchanged  
10. Callbacks unchanged  
11. Permissions unchanged  
12. Dynamic business data unchanged  
13. Category E = 0  
14. Parity = 100%  
15. Orphans = 0  
16. P223 = 0  
17. `npm run i18n:check` PASS  
18. Global active enforce-clean debt = 0  
19. P222–P216 remain 0  
20. New compatibility consumers = 0  
21. Shim ≤ 29  
22. Meaningful tests PASS  
23. Build PASS  
24. `git diff --check` PASS  
25. P223-caused CI failures = 0  

---

## 37. Audit Artifact

This document: `docs/audits/i18n-p2-2-23-post-p222-next-slice-preflight-2026-08-22.md`

---

## 38. Audit PR Topology

*(Populated after commit/push — see final report)*

---

## 39. Final Report Summary

| # | Item | Value |
|---|------|-------|
| 1 | Authoritative baseline SHA | `80dbba83d8f7d93db1beba695d5b4d4229925cb0` |
| 2 | Topology valid | **YES** |
| 3 | `npm run i18n:check` | **PASS** |
| 4 | Global active enforce-clean debt | **0** |
| 5–16 | P222–P216A/B1/B2/C1/C2A/C2B | **0** each |
| 12 | EN count | **8235** |
| 13 | DE count | **8235** |
| 14 | Parity | **100%** |
| 15 | Orphans | **0** |
| 16 | Shim inventory | **29** |
| 17 | Global scanner inventory | **1611** |
| 18 | Rental residual | **380** |
| 19 | Operator residual | **156** |
| 20 | Master residual | **1049** |
| 21 | Shared/Shell residual | **26** (25+1) |
| 22 | Fixed-locale production (FORMAT_LOCALE category) | **8** |
| 23 | Top 10 candidates | see §21 |
| 24 | Best Rental candidate | Invoice Documents panel |
| 25 | Best Operator candidate | Operator vehicle quick view |
| 26 | Best Master candidate | Prospects list chrome (partial) |
| 27 | Diminishing-returns | **YES — RENTAL STILL HAS BEST NEXT SLICE** |
| 28 | Collision summary | NO/LOW for selected target |
| 29 | Selected P223 target | Rental Invoice Documents Panel |
| 30 | Exact files | `InvoiceDocuments.tsx`, `invoice-documents-i18n.ts`, `invoiceDocuments.mapper.ts` |
| 31 | Visible findings | 8 |
| 32 | Hidden findings | 1 (formatDateTime) |
| 33 | Fixed-locale findings | 1 in scope |
| 34 | Expected new keys | 30–45 |
| 35 | Business risk | Low (2/5) |
| 36 | Semantic freeze | PRESENTATION-ONLY SAFE |
| 37 | Category E expectation | 0 |
| 38 | One-slice decision | **ONE SLICE** |
| 39 | P223 boundary | see §30 |
| 40 | Key reuse | `invoices.list.documentStatus.*`, `invoices.list.sendStatus.*` + new `invoices.documents.*` |
| 41 | Future test plan | see §32 |
| 42 | Global freeze plan | see §34 |
| 43 | Shim target | ≤ 29, 0 new consumers |
| 44 | Audit artifact | this file |
| 45–46 | Audit PR | see §38 after push |
| 47 | Final verdict | **A — GO — P2.2.23 TARGET SELECTED** |

### Confirmations

| Check | Value |
|-------|-------|
| Production code modified | **NO** |
| Dictionaries modified | **NO** |
| Tests modified | **NO** |
| Scanner modified | **NO** |
| P2.2.23 implementation started | **NO** |
| Merged | **NO** |

---

## 40. Final Verdict

# A — GO — P2.2.23 TARGET SELECTED

**P2.2.23 — Rental Invoice Documents Panel Localization**
