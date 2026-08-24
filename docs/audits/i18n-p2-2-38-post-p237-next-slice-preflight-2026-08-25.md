# P2.2.38 — Post-P237 Next Operator Slice — Read-Only Pre-Flight / Target Selection

**Date:** 2026-08-25  
**Mode:** read-only analysis only — **no implementation**  
**Authoritative baseline:** `f8495e3fe415ebb3a7b6f4338f7cc534ee41c400` (merged PR #1262 — P2.2.37 Operator Booking Cancel & No-Show Sheets Localization)  
**Audit branch:** `cursor/p2238-post-p237-next-slice-preflight-3c10` @ `f8495e3fe415ebb3a7b6f4338f7cc534ee41c400`  
**Campaign:** OPERATOR (P216–P237 frozen)

---

## 1. Baseline hard gate

| Check | Result |
|-------|--------|
| **Baseline SHA verified** | `f8495e3fe415ebb3a7b6f4338f7cc534ee41c400` |
| **P237 merge ancestry** | **YES** — `f8495e3f feat(i18n): P2.2.37 Operator Booking Cancel & No-Show Sheets localization (#1262)` |
| **Working tree (audit start)** | **clean** (0 modified tracked files after inventory restore) |
| **`npm run i18n:check`** | **PASS** |
| **EN keys** | **8552** |
| **DE keys** | **8552** |
| **EN/DE parity** | **100%** |
| **Orphans** | **0** |
| **P237 enforce-clean debt** | **0** |
| **P236–P216 enforce-clean debt** | **0** |
| **Global enforce-clean debt** | **0** |
| **Test suite** | **355 passed** (25 files) |
| **Compat/shim total** | **29** (prod **18**, test **11**) |
| **New compatibility consumers** | **0** |

**Baseline regression:** **NONE — proceed.**

---

## 2. P237 freeze verification

**Frozen scope:** Operator Booking Cancel Sheet, Operator Booking No-Show Sheet, bounded adapter, owned sheet aria presentation.

| Gate | Result |
|------|--------|
| `P237_ENFORCE_CLEAN_EXACT` paths | 4 paths — debt **0** |
| Visible debt (P237 paths) | **0** |
| Hidden debt (P237 paths) | **0** |
| Fixed-locale debt (P237 paths) | **0** |
| `hardcoded-copy-guard.test.ts` P237 guards | **PASS** |

**P237 paths (frozen — do not reopen):**

- `operator/bookings/OperatorBookingCancelSheet.tsx`
- `operator/bookings/OperatorBookingNoShowSheet.tsx`
- `operator/bookings/operatorBookingSheetShell.tsx`
- `operator/lib/operator-booking-cancel-noshow-i18n.ts`

---

## 3. Current main / campaign topology

| Item | Value |
|------|-------|
| **Authoritative baseline SHA** | `f8495e3fe415ebb3a7b6f4338f7cc534ee41c400` |
| **Authoritative baseline branch** | `p228-authoritative-baseline-3c10` @ `f8495e3f` |
| **Current `main` SHA** | `6af5fc58b9ceb935c74276a70a5ca5d380510f46` (`feat(dashboard): add global context header above card grid (#1259)`) |
| **Baseline vs `main`** | **PARALLEL CAMPAIGN BRANCH** — unrelated histories; i18n campaign branch is **AHEAD OF MAIN** on Operator slices; `main` has dashboard/vehicle-state work not on campaign branch |
| **Baseline vs campaign branch** | **ON MAIN** (identical to `origin/p228-authoritative-baseline-3c10`) |

### Recently merged / active PRs (relevant)

| PR | State | Domain | Relevance |
|----|-------|--------|-----------|
| **#1262** | MERGED | Operator i18n | P237 Cancel/No-Show — baseline |
| **#1261** | OPEN (audit) | Operator i18n | P237 pre-flight |
| **#1264** | OPEN (audit) | Operator i18n | P237 final re-audit |
| **#1256** | MERGED | Operator i18n | P236 Booking Form Sheet |
| **#1259** | MERGED on `main` | Dashboard | Global context header — runtime presentation |
| **#1263** | OPEN on `main` | Vehicle operational state | **EXCLUSION** — connectivity/provenance semantics |
| **#1260** | OPEN on `main` | Vehicle/Fleet audit | **EXCLUSION** — connectivity/availability architecture |

---

## 4. Active workstream exclusion map

| PR | Domain | Changed paths (summary) | Semantic ownership | Collision risk | P238 eligible? |
|----|--------|-------------------------|-------------------|--------------|----------------|
| **#1263** | Vehicle operational state | `backend/modules/dimo/*`, `backend/modules/vehicles/operational/*`, `frontend/src/lib/api.ts`, `frontend/src/rental/lib/fleetVehicleDisplay.ts` | `telemetryFreshness`, `interruptionKnowledge`, episode lifecycle, fleet display fallback | **HIGH** for vehicle list/scan/QV badges | **NO** for vehicle surfaces |
| **#1260** | Vehicle connectivity audit | Audit docs + architecture | Connectivity/availability/readiness canon | **HIGH** | **NO** for vehicle surfaces |
| **#1259** | Dashboard | Dashboard global context header | Runtime sync presentation | **MEDIUM** for dashboard runtime chrome | Dashboard-only slices: caution |
| **#1264** | P237 re-audit | Audit doc only | P237 closure | **NONE** | N/A |
| **#1261** | P237 pre-flight | Audit doc only | P237 selection | **NONE** | N/A |

**#1263 blast radius (defer):** connectivity, telemetry freshness, availability projection, readiness, health state, operational status, interruption knowledge, OBD/device connection, canonical vehicle state projection.

**Safe from #1263:** Operator booking documents panel (no operational-state semantics).

---

## 5. Operator residual audit matrix

Excludes: Vehicle Quick View P227–P235, Booking Form P236, Cancel/No-Show P237, Handover P2213, Damage Capture P2224, Pickup Check P2225, Tire Measure P2226, deferred QV blockers.

| Path | Component | Route/mount | Visible | Hidden | Fixed-locale | Dynamic data | Machine states | Coupling | Est. keys | Testability | Collision |
|------|-----------|-------------|--------:|-------:|-------------:|--------------|----------------|----------|----------:|-------------|-----------|
| `operator/documents/OperatorBookingDocumentsPanel.tsx` + `operatorBookingDocuments.utils.ts` | Documents panel | Detail sheet, handover step | 7+1 | low | `de-DE` meta | customer names, filenames | doc types, availability | booking docs API | **~28** | **HIGH** | **NONE** |
| `operator/views/OperatorMoreView.tsx` | More hub | Tab `more` | 9 | low | none | vehicle labels | sheet types | shell | **~20** | HIGH | LOW |
| `operator/views/OperatorTodayView.tsx` | Today dashboard | Tab `today` | 12 | med | `useOperatorToday('de')` | alerts, names | task buckets | runtime stale | **~45** | MED | MED |
| `operator/components/OperatorBookingDetailSheet.tsx` | Booking detail | Sheet overlay | 8 | med | none | customer/vehicle | matrix gates | frozen sheets | **~32** | MED | LOW |
| `operator/components/OperatorBookingCard.tsx` | Today booking row | Today sections | ~6* | low | none | names, times | status, gates | handover-i18n partial | **~12** | MED | LOW |
| `operator/components/OperatorScanBookingCard.tsx` | Scan booking row | Scan results | ~5* | low | none | names, IDs | status | scan search | **~10** | MED | LOW |
| `operator/views/OperatorScanView.tsx` | Scan hub | Tab `scan` | 6 | low | none | search hits | none | QV + healthMap | **~18** | MED | **MED** |
| `operator/views/OperatorTasksView.tsx` | Task list | Tab `tasks` | 3 | med | `taskStatusLabelDe` | task titles | filters | P216 task core | **~25** | MED | LOW |
| `operator/tasks/OperatorTaskCard.tsx` | Task card | Tasks/Today feed | 4 | med | `taskStatusLabelDe` | titles, assignee | status/priority | P216A/B | **~15** | MED | LOW |
| `operator/ai-upload/OperatorAiUploadFlow.tsx` | AI upload | Sheet | 11 | high | none | extraction | workflow | shared ingestion | **~55** | LOW | MED |
| `operator/views/OperatorVehiclesView.tsx` | Vehicle list | Tab `vehicles` | 4 | low | none | model/plate | filter ids, health badges | **#1263** | **~15** | MED | **HIGH** |
| `operator/components/OperatorHeader.tsx` | Shell chrome | Layout | 2 | low | none | org | tabs | shell | **~8** | HIGH | LOW |

\*Booking row cards report fewer scanner hits because partial strings reuse shared patterns; manual inventory adds ~5–6 each.

---

## 6. Booking list / row audit

**Finding:** Operator has **no dedicated booking list route**. Booking rows are embedded:

| Surface | File | Debt |
|---------|------|-----|
| Today handover sections | `OperatorBookingCard.tsx` + `OperatorTodayView.tsx` section labels | ~18 combined |
| Scan results | `OperatorScanBookingCard.tsx` + `OperatorScanView.tsx` section headers | ~11 combined |

**Column/label inventory (cards):** vehicle/plate (dynamic), customer (dynamic), time label (dynamic), status chip (machine → `bookingStatusLabel` already localized in scan card; today card uses `item.statusLabel` from data), due/overdue badges (hardcoded DE), pickup/return CTAs (hardcoded DE), details button.

**Boundedness:** **NOT one coherent slice** — rows split across Today + Scan with different hosts and unequal scanner coverage.

**P238 suitability:** **Defer as unified slice** — prefer documents panel or More hub for single-surface boundedness.

---

## 7. Booking detail audit

**Host:** `OperatorBookingDetailSheet.tsx` (fullscreen dialog from Today/Scan).

| Area | Status | Notes |
|------|--------|-------|
| Header / close aria | Hardcoded DE | `Buchung`, `Schließen` |
| Status chips | Mixed | `bookingStatusLabel(status)` OK; kind chip hardcoded |
| Customer/vehicle/station/time | Labels hardcoded | Values dynamic |
| Blocked vehicle card | Hardcoded DE | `detail.health.blockingReasons` dynamic |
| **Documents panel** | **Hardcoded DE** | **Clean sub-slice** |
| Document verification CTA | Hardcoded DE | Pickup-only section |
| Manage booking actions | Hardcoded DE | Overlaps frozen P237 sheets |
| Pickup/Return CTAs | Hardcoded DE | Reuses handover gates |

**Boundedness:** Full detail sheet is **medium** (32 keys, matrix coupling). **Documents panel sub-slice is high** (28 keys, 2 files, Category E=0).

---

## 8. Booking filters / search audit

**Finding:** No Operator booking filter page exists.

| Surface | Filters | Coherent slice? |
|---------|---------|-----------------|
| `OperatorTasksView` | today/overdue/vehicle/booking chips, priority, scope | Task-domain, not booking |
| `OperatorScanView` | free-text search only | Part of scan cluster |
| `OperatorVehiclesView` | vehicle filter chips | **#1263 collision** |

**P238 suitability:** **NO** — no standalone booking filter surface.

---

## 9. Handover / return audit

**Status:** **FROZEN** — P2213 Operator Handover Localization closed.

`OperatorHandoverStepDocuments.tsx` embeds `OperatorBookingDocumentsPanel` but handover chrome/acks are already localized via `operator-handover-i18n.ts`. Localizing the documents panel improves handover **without reopening P2213** (host-owned ack strings remain frozen).

**Eligible:** Presentation-only documents panel inside handover mount — same component boundary.

---

## 10. Operator damage flow audit

**Status:** **FROZEN** — P2224 Operator Damage Capture Localization.

**P238 suitability:** **NO** — do not reopen.

---

## 11. Operator task / notification audit

| Surface | Debt | Notes |
|---------|-----:|-------|
| `OperatorTaskCard.tsx` | 4 | Uses `taskStatusLabelDe` — needs locale threading |
| `OperatorTasksView.tsx` | 3 | Filter chips, summary labels |
| `OperatorTodayTaskFeed` | 0 scanner* | Fed by Today view sections |

**Boundedness:** Medium — crosses P216 task presentation adapters. Lower campaign leverage than booking documents follow-on.

---

## 12. Operator focus mode audit

**Finding:** No separate “focus mode” route. Closest: Today stale/offline banner + operational alerts in `OperatorTodayView.tsx`.

| Concern | Risk |
|---------|------|
| `OperatorTodayStaleBanner` | Runtime sync semantics — offline/stale copy tied to data freshness |
| `useOperatorToday('de')` | Fixed locale threading debt |
| Operational alerts | Dynamic `alert.title` / `alert.message` |

**P238 suitability:** **NO** — runtime status semantics coupled; prefer documents panel.

---

## 13. Customer lookup / selector audit

**Status:** **FROZEN in P236** — `OperatorBookingFormSheet` customer/vehicle pickers localized.

No additional standalone Operator customer selector outside booking form.

---

## 14. Vehicle selector audit

| Surface | Operational-state exposure | Verdict |
|---------|---------------------------|---------|
| `OperatorMoreView` vehicle picker | Model/plate only — **no** connectivity badges | **SAFE** |
| `OperatorVehiclesView` | `deriveVehicleOperatorStatuses`, health map | **COLLIDING — defer (#1263)** |
| `OperatorScanView` vehicle cards | `healthMap` passed to `OperatorScanVehicleCard` | **COLLIDING — defer** |

---

## 15. Dashboard challenger

**Strongest bounded candidate on `main`:** post-#1259 dashboard global context header (presentation chrome).

| Factor | Assessment |
|--------|------------|
| Debt density | Moderate on `main`, **0 on campaign baseline** |
| Collision | #1259 runtime header work |
| Campaign leverage | Lower than Operator booking follow-on |
| Baseline | Would require **DIRECT FROM CURRENT MAIN** or merge |

**Does not outrank Operator Booking Documents Panel.**

---

## 16. Rental challenger

**Strongest:** Remaining rental “other areas” (~260 scanner findings) — e.g. finance/billing sub-surfaces.

Too broad for single P238 slice; no single surface beats Operator documents panel on boundedness + campaign continuity.

---

## 17. Customer challenger

No standalone high-value Customer-domain slice identified outside frozen P2.2.3 bookings/customers enforce-clean zones.

---

## 18. Tasks / notifications challenger

**Strongest:** `OperatorTaskCard` + `OperatorTasksView` residual (~19 findings) — viable P239+ slice but crosses P216 adapters and `taskStatusLabelDe` threading.

---

## 19. Vehicle/Fleet challenger

**DEFERRED DUE ACTIVE VEHICLE STATE WORK (#1263, #1260).**

No safe vehicle/fleet i18n slice eligible while operational-state semantics are in flux.

---

## 20. Top-12 global ranking

Scores 0–5 (higher = better). Business risk reported separately.

| Rank | Candidate | Vis | Ops | Debt | Sep | Bnd | Test | Enf | Camp | Coll | **Total** | Biz risk | Keys | Files |
|------|-----------|----:|----:|-----:|----:|----:|-----:|----:|-----:|-----:|----------:|---------:|-----:|------:|
| 1 | **Operator Booking Documents Panel** | 4 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | **43** | 1 | ~28 | 2 |
| 2 | Operator More View | 3 | 3 | 3 | 5 | 5 | 5 | 5 | 4 | 5 | 33 | 1 | ~20 | 1 |
| 3 | Operator Booking Detail Sheet (non-doc) | 5 | 4 | 3 | 3 | 3 | 4 | 4 | 4 | 4 | 30 | 2 | ~32 | 1 |
| 4 | Operator Today View (chrome only) | 5 | 5 | 4 | 2 | 2 | 3 | 4 | 4 | 3 | 28 | 3 | ~45 | 1 |
| 5 | Operator Scan View (search chrome) | 4 | 4 | 3 | 3 | 3 | 4 | 4 | 3 | 2 | 26 | 2 | ~18 | 1 |
| 6 | Operator Booking Card (Today rows) | 4 | 4 | 2 | 4 | 2 | 4 | 3 | 4 | 4 | 25 | 2 | ~12 | 1 |
| 7 | Operator Task Card + filters | 4 | 4 | 2 | 3 | 3 | 4 | 4 | 3 | 4 | 25 | 2 | ~19 | 2 |
| 8 | Operator Scan Booking Card | 3 | 3 | 2 | 4 | 2 | 4 | 3 | 3 | 4 | 24 | 2 | ~10 | 1 |
| 9 | Operator AI Upload Flow | 4 | 4 | 4 | 2 | 2 | 2 | 3 | 3 | 3 | 23 | 3 | ~55 | 2+ |
| 10 | Operator Header / shell chrome | 3 | 2 | 1 | 5 | 4 | 5 | 5 | 3 | 5 | 23 | 1 | ~8 | 2 |
| 11 | Dashboard context header (`main`) | 4 | 3 | 2 | 4 | 4 | 3 | 3 | 1 | 3 | 22 | 2 | ~15 | 1+ |
| 12 | Operator Vehicles View | 4 | 4 | 2 | 2 | 3 | 3 | 3 | 3 | **0** | 19 | 4 | ~15 | 1 |

---

## 21. Top-5 deep comparison

### 1. Operator Booking Documents Panel (SELECTED)

| Field | Value |
|-------|-------|
| **Paths** | `frontend/src/operator/documents/OperatorBookingDocumentsPanel.tsx`, `frontend/src/operator/documents/operatorBookingDocuments.utils.ts` |
| **Component** | `OperatorBookingDocumentsPanel`, label/group helpers in utils |
| **Route/mount** | Embedded in `OperatorBookingDetailSheet`; `OperatorHandoverStepDocuments` |
| **Audience** | Operator (mobile/tablet) |
| **Visible debt** | 7 (panel) + 1 (utils) = **8** |
| **Hidden debt** | ~3 (`formatOperatorDocumentMeta` de-DE, bundle status raw display) |
| **Fixed-locale debt** | `toLocaleDateString('de-DE')` in meta formatter |
| **Machine inputs** | `documentType` codes, `availability` enum, `bundle.status`, customer doc `type` |
| **Dynamic data** | `doc.documentNumber`, `fileName`, `legalVersionLabel`, dates, `bundle.lastError`, customer doc `status` |
| **Callbacks** | `reload`, `api.documents.open`, `onAiUpload`, `window.open` preview |
| **Permissions** | Inherited from parent (`orgId`, `bookingId`, `customerId`) |
| **Ordering** | Group order from `OPERATOR_BOOKING_DOCUMENT_GROUPS`; doc sort by `createdAt` — **frozen** |
| **Dates** | Display-only locale formatting in meta |
| **Numbers/currency** | None |
| **Est. keys** | **24–30** |
| **Testability** | **HIGH** — mount panel with fixture bundle |
| **Collision** | **NONE** |
| **Main drift** | **NONE** (documents paths unchanged `f8495e3` → `main`) |

### 2. Operator More View

| Field | Value |
|-------|-------|
| **Paths** | `frontend/src/operator/views/OperatorMoreView.tsx` |
| **Debt** | 9 |
| **Boundedness** | HIGH (single file) |
| **Collision** | LOW |
| **Main drift** | LOW (4-line diff unrelated to i18n structure) |
| **Why not #1** | Lower operational leverage vs booking documents after P237 |

### 3. Operator Booking Detail Sheet (excluding documents)

| Field | Value |
|-------|-------|
| **Paths** | `frontend/src/operator/components/OperatorBookingDetailSheet.tsx` |
| **Debt** | 8 |
| **Coupling** | Action matrix overlaps P237 frozen sheets; pickup verification section |
| **Why not #1** | Documents panel is cleaner sub-slice with same user value |

### 4. Operator Today View

| Field | Value |
|-------|-------|
| **Paths** | `frontend/src/operator/views/OperatorTodayView.tsx` |
| **Debt** | 12 |
| **Risk** | `useOperatorToday('de')`, stale/offline runtime banner |
| **Main drift** | LOW (2-line diff) |
| **Why not #1** | Runtime sync semantics + larger scope |

### 5. Operator Scan View

| Field | Value |
|-------|-------|
| **Paths** | `frontend/src/operator/views/OperatorScanView.tsx` (+ cards) |
| **Debt** | 6 (+ cards) |
| **Collision** | **MEDIUM** — `healthMap`, `OperatorVehicleQuickView` |
| **Why not #1** | Vehicle operational-state adjacency |

---

## 22. Campaign direction

**A — CONTINUE OPERATOR**

Operator Booking Documents Panel materially outranks all non-Operator challengers on campaign leverage, collision safety, and post-P237 booking continuity. No external candidate outranks it.

---

## 23. Selected P238 target

# **P2.2.38 — Operator Booking Documents Panel Localization**

One coherent bounded surface: booking + customer document presentation for Operator detail and handover mounts.

---

## 24. Split decision

**ONE SLICE**

Documents panel + utils label maps form a single enforce-clean boundary. Handover/detail hosts consume the same component — no split required.

---

## 25. Exact production boundary

### Production paths

| Path | Role |
|------|------|
| `frontend/src/operator/documents/OperatorBookingDocumentsPanel.tsx` | UI component |
| `frontend/src/operator/documents/operatorBookingDocuments.utils.ts` | Label maps, slot builder, meta formatter |

### Component / symbol

- `OperatorBookingDocumentsPanel`
- `DocumentCard` (inner, same file — included)
- `useOperatorCustomerDocuments` (inner hook — error strings in scope)
- `OPERATOR_BOOKING_DOCUMENT_GROUPS`
- `OPERATOR_DOCUMENT_TYPE_LABELS`
- `OPERATOR_DOCUMENT_AVAILABILITY_LABELS`
- `OPERATOR_CUSTOMER_DOCUMENT_LABELS`
- `formatOperatorDocumentMeta`
- `buildOperatorDocumentSlots` (logic frozen; only presentation labels change)

### Route / mount

| Host | Mount context |
|------|---------------|
| `OperatorBookingDetailSheet` | Booking detail fullscreen sheet |
| `OperatorHandoverStepDocuments` | Handover wizard documents step |

### Audience

Operator users (rental org staff on mobile/tablet).

### Presentation inventory (localize)

- Section title: `Buchungsdokumente`
- Reload button: `Ne laden`
- Bundle status prefix: `Paket-Status:`
- Loading: `Dokumente laden…`, `Kundendokumente laden…`
- Empty: `Keine Buchungsdokumente im Bundle.`, `Keine Kundendokumente hinterlegt.`
- Error fallbacks: customer docs load error, panel error display (wrapper only)
- Group labels (4): Vertrag & Bedingungen, Abholung, Rückgabe, Rechnung & Kaution, Weitere
- Document type labels (9+): see machine map
- Availability labels (4): Verfügbar, Fehlt, Wird generiert, Fehlerhaft
- Customer doc type labels (4)
- Open button: `Öffnen`
- AI upload CTA: title + subtitle
- Default damage report label: `Schadensbericht`

### Hidden / aria

- None significant beyond visible strings.

### Fixed-locale

- `formatOperatorDocumentMeta` → thread active locale (replace `de-DE`).

### Out of scope (hosts — frozen)

- `OperatorHandoverStepDocuments` ack toggle strings (P2213)
- `OperatorBookingDetailSheet` outer chrome/actions
- `useOperatorBookingDocuments` hook (unless error string extraction unavoidable — prefer adapter wrapper)

---

## 26. Machine / domain freeze

| Value | Source | Business use | Presentation use | May localize? | Must remain unchanged? |
|-------|--------|--------------|------------------|---------------|------------------------|
| `documentType` | API / bundle | Slot identity, open document | Label map key | Label only | **Code unchanged** |
| `RENTAL_CONTRACT`, `TERMS_AND_CONDITIONS`, etc. | Enum strings | Document routing | Label lookup | **Label map** | **Codes unchanged** |
| `availability` | `deriveDocumentAvailability` | UI tone | Chip label | **Label map** | **Enum values unchanged** |
| `available` / `missing` / `generating` / `failed` | Internal enum | Tone mapping | Chip text | Label only | **Keys unchanged** |
| `bundle.status` | API | Generation state | May display raw or mapped — **do not change comparison logic** | Display only | **Raw value comparisons frozen** |
| `doc.status` | API | VOID filter, failed detect | Not shown directly | No | **Logic unchanged** |
| `customerId` / `bookingId` / `orgId` | Props | API scoping | None | No | **Yes** |
| Customer doc `type` | API | `ID_FRONT`, etc. | Label map | Label only | **Codes unchanged** |
| `doc.id` | API | `documents.open` | None | No | **Yes** |
| `doc.fileKey` | API | Preview URL | None | No | **Yes** |
| Sort `createdAt` | API | `currentDocumentsByType` winner | Meta display | Format only | **Comparator unchanged** |
| Group `types[]` order | `OPERATOR_BOOKING_DOCUMENT_GROUPS` | Render order | Group headers | Labels only | **Order frozen** |

---

## 27. Dynamic data freeze (do not translate)

- `view.bundle.status` (raw server status string)
- `view.bundle.lastError`
- `error` from hooks (API messages — display as-is)
- `doc.documentNumber`, `doc.fileName`
- `doc.legalVersionLabel`
- `doc.generatedAt`, `doc.createdAt` (format only)
- `doc.title` (for extra/damage slots)
- Customer document `status` field shown as meta
- `slot.label` when from `doc.title` (dynamic title)

---

## 28. Callback / navigation freeze

| Callback | Args | Behavior |
|----------|------|----------|
| `reload()` | none | Refetch booking + customer docs |
| `api.documents.open(orgId, doc.id)` | org + doc id | Open generated doc |
| `window.open(url)` | preview URL | Customer doc preview |
| `onAiUpload?.()` | none | Parent opens AI upload sheet |
| `handleReload` | click | Same as reload |

**Sheet/route IDs:** unchanged — parent owns `openSheet({ type: 'ai-upload', ... })`.

**Disabled:** `loading || customerDocs.loading || !bookingId` — frozen.

---

## 29. Order / filter freeze

- `OPERATOR_BOOKING_DOCUMENT_GROUPS` iteration order — frozen
- `currentDocumentsByType` last-wins by `createdAt` — frozen
- `extraSlots` damage detection: `DAMAGE` in type or `schaden` in title — frozen
- Customer docs: API list order — frozen

---

## 30. Date / time freeze

- Raw timestamps: `doc.generatedAt`, `doc.createdAt` — unchanged
- Presentation: `formatOperatorDocumentMeta` may use locale-aware `toLocaleDateString(activeLocale)` — **no timezone/business comparison changes**

---

## 31. Number / unit / currency freeze

Not applicable — no amounts in panel.

---

## 32. Key reuse audit

| Concept | Classification |
|---------|----------------|
| `common.retry` / reload semantics | **SEMANTIC REUSE** (if matching tone) |
| `email.docType.RENTAL_CONTRACT`, `HANDOVER_PICKUP`, etc. | **SEMANTIC REUSE** for document type labels |
| `bookings.documents.preparing` | **SEMANTIC REUSE** candidate for generating state |
| `customers.document.*` | **SEMANTIC REUSE** for upload-ish copy where identical |
| `operator.bookings.form.*` | **NO REUSE** — different module |
| `operator.vehicleQuickView.documents.*` | **NO REUSE** — QV slice is separate (P235) |
| New `operator.bookings.documents.*` keys | **NEW P238 KEY** (~24–30) |
| `documentType` codes | **MACHINE — MAP ONLY** |
| `availability` enum | **MACHINE — MAP ONLY** |
| Customer/vehicle names, errors, filenames | **DYNAMIC — DO NOT TRANSLATE** |

**Estimated new keys:** **24–30** (under 40 threshold).

---

## 33. Adapter strategy

**NEW BOUNDED PRESENTATION ADAPTER**

Proposed: `frontend/src/operator/lib/operator-booking-documents-i18n.ts`

- `resolveOperatorBookingDocumentsLocale(locale)`
- Label maps for groups, types, availability, customer doc types
- Section/CTA/error/loading helpers
- `formatOperatorDocumentMeta(locale, doc)` — locale-threaded date formatting

**No business logic.**

---

## 34. Extraction strategy

**KEEP EXISTING COMPONENT**

Replace hardcoded literals and utils label records with adapter calls. Utils retain slot-building logic; label maps move to adapter or become functions of locale.

---

## 35. P238 enforce-clean

```text
P238_ENFORCE_CLEAN_EXACT = [
  'operator/documents/OperatorBookingDocumentsPanel.tsx',
  'operator/documents/operatorBookingDocuments.utils.ts',
]
```

**Excludes:** P216–P237, QV blockers, vehicle operational state surfaces, hosts (`OperatorBookingDetailSheet`, handover step), `useOperatorBookingDocuments.ts`, API layer.

**No ignores, allowlists, exemptions, or scanner weakening.**

---

## 36. Test contract (future P238)

**File:** `frontend/src/operator/documents/operator-booking-documents-localization.test.tsx`

| Assertion | Required |
|-----------|----------|
| EN + DE render | YES |
| Same-mount locale switch | YES |
| `documentType` codes unchanged in DOM/data | YES |
| `availability` enum keys unchanged | YES |
| Dynamic `bundle.lastError`, filenames | unchanged |
| Group/order stable across locales | YES |
| `api.documents.open` / `onAiUpload` callbacks | unchanged |
| Disabled predicates | unchanged |
| Date meta uses active locale (not hardcoded `de-DE`) | YES |
| No raw translation key leakage | YES |
| No machine-code leakage in visible labels | YES |
| `P238_ENFORCE_CLEAN_EXACT` debt = 0 | YES |

---

## 37. Category E feasibility

**Category E = 0** — feasible.

Panel is presentation-only. No API payloads, permissions, or workflow mutations inside boundary.

---

## 38. Global success contract (future P238)

| Gate | Target |
|------|--------|
| Selected visible/hidden/fixed-locale debt | **0** |
| P238 enforce-clean | **0** |
| P237–P216 | **0** |
| Global enforce-clean | **0** |
| EN = DE, parity 100%, orphans 0 | YES |
| shim ≤ 29, new compat consumers 0 | YES |
| tests / i18n:check / build / diff --check | PASS |

---

## 39. Active collision

| Workstream | vs selected target |
|------------|-------------------|
| #1263 Vehicle operational state | **NONE** |
| #1260 Connectivity audit | **NONE** |
| #1264 P237 re-audit | **NONE** |
| Operator booking PRs | **NONE** |
| Dashboard #1259 | **NONE** |
| i18n infrastructure | **NONE** |

**Classification: NONE**

---

## 40. Main drift

| Path | Drift |
|------|-------|
| `operator/documents/*` | **NONE** |
| Hosts (detail/handover) | LOW on unrelated lines only |

**Classification: NONE** for P238 boundary.

---

## 41. Baseline strategy

**DIRECT FROM P237 MERGE BASELINE**

`f8495e3fe415ebb3a7b6f4338f7cc534ee41c400` on `p228-authoritative-baseline-3c10`.

---

## 42. Campaign forecast (informational only)

| Slice | Likely target |
|-------|---------------|
| **P238** | Operator Booking Documents Panel |
| **P239** | Operator More View **or** Operator Booking Detail Sheet (non-doc chrome) |
| **P240** | Operator Today View chrome (after locale threading plan) **or** Operator Booking Card rows |

Not authorized — forecast only.

---

## 43. Audit artifact

| Item | Value |
|------|-------|
| **File** | `docs/audits/i18n-p2-2-38-post-p237-next-slice-preflight-2026-08-25.md` |
| **Branch** | `cursor/p2238-post-p237-next-slice-preflight-3c10` |
| **Commits** | 1 audit commit |
| **Production/dictionary/test/scanner changes** | **0** |

---

## 44. Final report summary (58-item index)

1. Baseline: `f8495e3f`  
2. Main: `6af5fc58`  
3. Topology: PARALLEL CAMPAIGN BRANCH (baseline ON campaign branch)  
4. Baseline health: PASS  
5–11. EN 8552, DE 8552, parity 100%, orphans 0, P237–P216 0, global enforce-clean 0, shim 29  
12. P237 freeze: PASS  
13. Exclusion map: §4  
14. Operator residual: §5  
15. Best booking list: **defer** (distributed Today/Scan cards)  
16. Best booking detail: **Documents panel sub-slice** (selected)  
17. Best booking filters: **N/A**  
18. Best handover/return: **documents panel only** (handover frozen)  
19. Best damage: **frozen P2224**  
20. Best operator task/notification: Task card + Tasks view  
21. Best operator focus: **defer** (Today runtime banner)  
22. Best customer selector: **frozen P236**  
23. Best safe vehicle selector: More View picker (not #1)  
24. Best dashboard challenger: context header on `main`  
25. Best rental challenger: broad residual — no single slice  
26. Best customer challenger: none ranked above #1  
27. Best tasks/notifications challenger: Operator task surfaces  
28. Best safe vehicle/fleet: **DEFERRED (#1263)**  
29. Top-12: §20  
30. Top-5: §21  
31. Campaign: **A — CONTINUE OPERATOR**  
32. Target: **P2.2.38 — Operator Booking Documents Panel Localization**  
33. Split: **ONE SLICE**  
34–36. Paths/mount/audience: §25  
37. Presentation: §25  
38. Machine freeze: §26  
39. Dynamic freeze: §27  
40. Callback freeze: §28  
41. Order/filter freeze: §29  
42. Date/time freeze: §30  
43. Number/currency: §31 N/A  
44. Key reuse: §32  
45. Est. keys: **24–30**  
46. Adapter: **NEW BOUNDED PRESENTATION ADAPTER**  
47. Extraction: **KEEP EXISTING COMPONENT**  
48. Enforce-clean: §35  
49. Test contract: §36  
50. Category E: **0 — feasible**  
51. #1263 overlap: **NONE**  
52. Active collision: **NONE**  
53. Main drift: **NONE**  
54. Baseline strategy: **DIRECT FROM P237 MERGE BASELINE**  
55. Forecast: §42  
56. Audit artifact: §43  
57. Audit PR: draft (this branch)  
58. Verdict: below  

---

## 45. Final verdict

# **A — GO — P2.2.38 TARGET SELECTED**

**P2.2.38 — Operator Booking Documents Panel Localization**

**CAMPAIGN:** OPERATOR

**IMPLEMENTATION NOT STARTED.**

**STOP.**
