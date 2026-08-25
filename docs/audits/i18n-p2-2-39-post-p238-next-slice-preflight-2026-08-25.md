# P2.2.39 — Post-P238 Next-Slice Pre-Flight / Target Selection

**Date:** 2026-08-25  
**Mode:** STRICT READ-ONLY TARGET SELECTION  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Authoritative baseline:** `0e01cd12cd888f4df20aad0c398c99823cc3286b` (merged PR #1266 — P2.2.38 Operator Booking Documents Panel Localization)  
**Auditor branch:** `cursor/p2239-post-p238-next-slice-preflight-3c10`

---

## 1. Baseline hard gate

| Check | Independent result |
|-------|-------------------|
| Baseline SHA | ✅ `0e01cd12cd888f4df20aad0c398c99823cc3286b` |
| Baseline commit message | `P2.2.38 — Operator Booking Documents Panel Localization (#1266)` |
| P238 merge ancestry | ✅ verified |
| Working tree (pre-audit) | ✅ clean (inventory refresh from `i18n:check` reverted) |
| `npm run i18n:check` | ✅ **PASS** |
| EN keys | **8578** |
| DE keys | **8578** |
| Parity | **100%** |
| Orphans | **0** |
| P238 debt (frozen paths) | **0** |
| P237 debt | **0** |
| P236 debt | **0** |
| P235–P216 frozen debt | **0** |
| Global enforce-clean (frozen surfaces) | **0** |
| i18n suite count | **364 tests** (26 compat files) |
| Shim | rental `LanguageContext` compatibility re-export (unchanged) |
| New compatibility consumers | **0** |

**Baseline regression:** ❌ **NONE** — gate **PASS**

---

## 2. P238 freeze verification

| Surface | Visible debt | Hidden debt | Fixed-locale debt | P238 |
|---------|-------------|-------------|-------------------|------|
| `OperatorBookingDocumentsPanel.tsx` | 0 | 0 | 0 | 0 |
| `operatorBookingDocuments.utils.ts` | 0 | 0 | 0 | 0 |
| `operator-booking-documents-i18n.ts` | 0 | 0 | 0 | 0 |

P238 frozen. **Do not reopen.**

---

## 3. Current main / topology

| Item | Value |
|------|-------|
| Current `origin/main` SHA | `13c7b150` (`test(connectivity): pre-P0.2 hardening… #1269`) |
| Authoritative baseline | `0e01cd12` (on `main` lineage) |
| Relationship | **BEHIND MAIN** — baseline is direct ancestor; main is **~120 commits ahead** |
| Classification | **PARALLEL CAMPAIGN BASELINE** (i18n Operator campaign pinned to P238 merge; main absorbed connectivity/theme/dashboard work) |

**Recent merges after P238 on main (selected):**

| SHA | PR | Domain |
|-----|-----|--------|
| `13c7b150` | #1269 | Connectivity test hardening |
| `6acd45cc` | #1267 | Connectivity production processing gate |
| `ff03c4b7` | #1263 | Vehicle operational state provenance |
| `6af5fc58` | #1259 | Dashboard global context header |
| `cf55badc` | #1257 | V4.9.200 card radius cutover |

---

## 4. Active workstream collision map

### Mandatory exclusions (#1263, #1267)

| PR | State | Domain | Changed paths (summary) | Semantic ownership | Production impact | Collision radius | P239 eligible |
|----|-------|--------|-------------------------|-------------------|-------------------|------------------|---------------|
| **#1263** | **MERGED** | Vehicle operational state / DIMO connectivity provenance | Backend DIMO/connectivity domain, `fleetVehicleDisplay.ts`, e2e fleet fixtures, `vehicle-operational-provenance` types | Episode lifecycle, connectivity runtime, fleet display semantics | Fleet list labels, vehicle detail e2e, API DTO extensions | **HIGH** on vehicle/fleet surfaces | **NO** |
| **#1267** | **MERGED** | Connectivity webhook inbox / BullMQ / episode lifecycle | Backend webhook inbox services, lifecycle policy, ops scripts | Webhook processing, connectivity recovery | Indirect frontend (no operator booking paths) | **MEDIUM** on connectivity banner / fleet | **NO** for vehicle-state surfaces |
| **#1269** | **MERGED** | Connectivity pre-P0.2 hardening | Backend DI/tests | Connectivity runtime | Backend only | **LOW** for P239 target | N/A |

### Additional active PRs (collision relevance)

| PR | Title | vs P239 target | Classification |
|----|-------|----------------|----------------|
| #1268 | P2.2.38 final re-audit | Audit-only | **NONE** |
| #1265 | P2.2.38 preflight | Audit-only | **NONE** |
| #915 | Operator Connectivity Banner | Overlaps connectivity semantics | **HIGH** — excluded from P239 |
| #906 | Operator Today work queue | Overlaps Today view | **MEDIUM** — defer Today |
| #918 | Operator data minimization documents | Overlaps documents/customer | **MEDIUM** — frozen P238 |
| #926 | Operator accessibility audit | Cross-cutting | **LOW** |
| Dashboard PRs (#1075–#1259) | Fleet readiness, attention, utilization | Unstable health/availability semantics | **HIGH** — dashboard deferred |

### Explicit exclusion map

**DO NOT select i18n touching:**

- `OperatorConnectivityBanner`, connectivity/offline runtime copy tied to sync semantics
- `OperatorVehiclesView` fleet cards / operational badges / connectivity-derived labels
- `OperatorVehicleQuickView*` (frozen P228–P235 + blockers)
- Dashboard fleet readiness, utilization heatmap, attention widgets with health/connectivity derivation
- `fleetVehicleDisplay.ts`, `vehicle-operational-provenance`, DIMO connectivity read models
- Any surface where labels depend on episode lifecycle / telemetry freshness / readiness projection

---

## 5. Global eligible domain set

| Domain | Eligible? | Notes |
|--------|-----------|-------|
| **Operator** (non-frozen, non-connectivity) | ✅ **PRIMARY** | 77 residual scanner findings |
| Rental / Booking (non-handover) | ✅ | 372 findings; higher collision on main |
| Dashboard | ⚠️ **PARTIAL** | Chrome-only; fleet/health widgets excluded |
| Customer | ✅ | Lower debt density in operator-adjacent flows |
| Tasks | ✅ | P216A/B frozen; operator task cards remain |
| Notifications | ✅ | Shell chrome only |
| Maintenance presentation | ⚠️ | Outside unstable health logic only |
| Documents (non-P238) | ⚠️ | Handover docs frozen P221 |
| Communication UI chrome | ⚠️ | Heavy main activity; bodies excluded |
| Automation / Integrations / Billing | ✅ | Lower campaign leverage |
| Organization / Team / Master | ⚠️ | Master 921 findings — out of Operator campaign |
| Vehicle/Fleet | ❌ **DEFERRED** | Active #1263/#1267 blast radius |

---

## 6. Operator residual audit

**Excluded:** Quick View (P228–P235), P236 form, P237 cancel/no-show, P238 documents, QV blockers, handover (P221), damage (P224), pickup check (P225), tire measure (P226).

| Path | Component | Route/mount | Visible | Hidden | Fixed-locale | Machine states | Dynamic data | Coupling | Est. keys | Test | Collision |
|------|-----------|-------------|--------:|-------:|-------------:|----------------|--------------|----------|----------:|------|-----------|
| `operator/views/OperatorTodayView.tsx` | Today dashboard | Tab `today` | 12 | med | `useOperatorToday('de')` | task buckets | names, alerts | stale/offline runtime | ~45 | MED | **MED** (#906) |
| `operator/ai-upload/OperatorAiUploadFlow.tsx` | AI upload flow | Sheet | 11 | med | none | doc types | filenames | upload queue | ~55 | MED | MED |
| `operator/views/OperatorMoreView.tsx` | More hub | Tab `more` | 9 | low | `themePreferenceLabel` DE | sheet types, theme pref | vehicle labels | minimal | **~18** | **HIGH** | **NONE** |
| `operator/components/OperatorBookingDetailSheet.tsx` | Booking detail | Fullscreen sheet | 8 | med | none | status, gates, matrix | customer/vehicle, blocking reasons | P236–P238 hosts | ~28 | MED | **LOW** |
| `operator/views/OperatorScanView.tsx` | Scan/search | Tab `scan` | 6 | low | none | search | plate/query | scan routing | ~18 | MED | LOW |
| `operator/views/OperatorVehiclesView.tsx` | Fleet list | Tab `vehicles` | 4 | med | none | connectivity/ops badges | vehicle names | **#1263 display** | ~15 | MED | **HIGH** |
| `operator/tasks/OperatorTaskCard.tsx` | Task card | Tasks/Today | 4 | med | `de-DE` in utils | status/priority | titles, assignee | P216 frozen detail | ~15 | MED | LOW |
| `operator/components/OperatorHeader.tsx` | Shell header | All tabs | 2 | low | none | tab labels | org name | shell | ~8 | HIGH | LOW |
| `operator/components/OperatorConnectivityBanner.tsx` | Connectivity | Shell | 1 | high | runtime sync | connectivity state | — | **#1263/#1267** | ~6 | LOW | **HIGH** |

**Operator residual total (post-exclusions):** **77** findings / **21** files.

---

## 7. Operator booking list audit

No standalone `OperatorBookingList` component. Booking rows distributed across:

| Surface | Role | Bounded? |
|---------|------|----------|
| `OperatorBookingCard.tsx` | Today pickup/return rows | Partial — shares Today view debt |
| `OperatorScanView.tsx` | Scan results cards | Separate host |
| `operatorTodayView.utils.ts` | Bucket section metadata (German titles) | Coupled to Today view |

**Verdict:** **NOT one coherent slice** — defer dedicated “booking list” target; rows split across Today + Scan.

---

## 8. Operator booking detail audit

**Host:** `OperatorBookingDetailSheet.tsx` — fullscreen dialog from Today/Scan.

| Area | Status | Notes |
|------|--------|-------|
| Header chrome (`Buchung`, close aria) | **Hardcoded DE** | Presentation |
| Metadata dl (Kunde, Station, Zeit) | **Hardcoded DE labels** | Dynamic values raw |
| Status chips | Uses `bookingStatusLabel` (rental) | Machine status frozen |
| Health blocked card | `detail.health.blockingReasons` | **Dynamic API text — raw** |
| Documents panel | **Frozen P238** | Out of scope |
| Pickup verification CTA | Hardcoded DE | Links frozen P225 sheet |
| Manage booking actions | Hardcoded DE | Overlaps P237 semantics |
| Pickup/Return CTAs | Hardcoded DE | Uses `resolveHandoverGateReason` |

**Boundedness:** **MEDIUM** — single file but business coupling (matrix, health block, frozen child panels).  
**Estimated keys:** ~28 (non-doc chrome only).

---

## 9. Operator booking filters audit

No dedicated Operator booking filter panel. Filters live in Rental booking planner (out of Operator campaign) or implicit Today bucket segmentation (`operatorTodayView.utils.ts`).

**Verdict:** **NOT a standalone bounded slice** in Operator app.

---

## 10. Handover / return audit

**Frozen P221** (`operator/handover/*`, `operator-handover-i18n.ts`, enforce-clean = 0).  
**Not eligible for P239.**

---

## 11. Damage flow audit

**Frozen P224** (`operator/damages/*`, `operator-damage-capture-i18n.ts`).  
**Not eligible for P239.**

---

## 12. Operator tasks audit

| File | Debt | Notes |
|------|------|-------|
| `OperatorTaskCard.tsx` | 4 | Canonical status/priority labels + dynamic title |
| `OperatorTaskCreateForm.tsx` | 1 | Form labels |
| `operatorTask.utils.ts` | fixed `de-DE` date format | Fixed-locale debt |

P216A/B task detail/timeline frozen. Card slice possible but lower score than More View.

---

## 13. Operator notifications audit

No dedicated Operator notification inbox. Alerts embedded in `OperatorTodayView` via `useOperatorOperationalAlerts` — **runtime/coupled**.

**Verdict:** **Defer** — not a bounded presentation slice.

---

## 14. Operator focus / workspace audit

No separate focus-mode route. Closest: Today stale/offline banner (`OperatorTodayStaleBanner`) — **runtime sync semantics**.  
**Not eligible.**

---

## 15. Customer selector / lookup audit

Customer pickers embedded in P236 booking form (frozen). Standalone Operator customer lookup: **not present** as isolated surface.

---

## 16–25. Challenger summaries

| Challenger | Best candidate | Score est. | Eligible? | Blocker |
|------------|----------------|------------|-----------|---------|
| **Dashboard** | Global context header (#1259 on main) | ~22 | ⚠️ Partial | Fleet/readiness widgets on main |
| **Rental/Booking** | Booking planner filters | ~20 | ✅ | Lower Operator campaign leverage |
| **Customer** | Rental customer directory | ~18 | ✅ | Out of Operator continuity |
| **Tasks/Notifications** | `OperatorTaskCard` | ~25 | ✅ | Smaller than More View |
| **Communication** | Inbox chrome | ~18 | ⚠️ | Message bodies forbidden; heavy main churn |
| **Automation** | Workflow builder labels | ~15 | ✅ | Low visibility |
| **Integrations** | Settings integration cards | ~14 | ✅ | Provider names raw |
| **Billing** | Invoice list (rental) | ~20 | ✅ | 108 billing findings; wide scope |
| **Organization/Team** | Team settings | ~16 | ✅ | Master-adjacent |
| **Safe Vehicle/Fleet** | — | — | ❌ | **VEHICLE/FLEET DEFERRED — ACTIVE OPERATIONAL-STATE WORK** |

---

## 26. Route / reachability gate

| Candidate | Route | Entry | Audience | Reachable |
|-----------|-------|-------|----------|-----------|
| **Operator More View** | `/operator?tab=more` (default tab via bottom nav) | `OperatorShell` → `OperatorMoreView` | Operator mobile/tablet | ✅ **YES** |
| Operator Booking Detail Sheet | Sheet overlay (no URL) | Today/Scan card → details | Operator | ✅ YES |
| Operator Today View | `/operator?tab=today` | Default tab | Operator | ✅ YES |
| Operator Vehicles View | `/operator?tab=vehicles` | Bottom nav | Operator | ✅ YES (excluded collision) |

---

## 27–28. Raw string & fixed-locale scan (selected candidates)

### Operator More View — presentation inventory

| String (DE baseline) | Class |
|----------------------|-------|
| `Aktionen` | Section heading |
| `Buchung aufnehmen` / `Neue Mietbuchung anlegen` | CTA — **reuse** `operator.bookings.form.createTitle` + new subtitle |
| `AI Upload` / `Dokumente am Fahrzeug erfassen` | CTA — partial reuse `operator.bookings.documents.aiUpload.*` |
| `Reifenprofil messen` / `Profiltiefe manuell erfassen` | CTA — tire measure domain (frozen flow, labels only here) |
| `Fahrzeug wählen` | Picker heading |
| Vehicle `label` in picker | **DYNAMIC — raw** (`model · license`) |
| `In Fahrzeuge suchen →` | Navigation helper |
| `Navigation` | Section heading |
| `Fahrzeug suchen / Scan` | Nav CTA |
| `Darstellung` / `Design` | Theme section |
| `themePreferenceLabel(preference)` | **FIXED-LOCALE DEBT** (`lib/theme.ts` hardcoded DE) |
| `SynqDrive` / `Zur Web-App` | External link |
| Info footer paragraph | Host-owned copy |

**Fixed-locale in scope:** `themePreferenceLabel` — address in adapter via `ThemePreference` enum → TranslationKey (do not modify theme business logic).

---

## 29. Top-15 global ranking

Scores 0–5 (max 50). Business risk separate.

| Rank | Candidate | Vis | Ops | Debt | Sep | Bnd | Test | Enf | Camp | Coll | **Total** | Risk | Keys | Files |
|------|-----------|----:|----:|-----:|----:|----:|-----:|----:|-----:|-----:|----------:|-----:|-----:|------:|
| **1** | **Operator More View** | 3 | 3 | 3 | 5 | 5 | 5 | 5 | 4 | 5 | **38** | 1 | ~18 | 1 |
| 2 | Operator Booking Detail Sheet (non-doc) | 5 | 4 | 3 | 3 | 3 | 4 | 4 | 4 | 4 | 34 | 2 | ~28 | 1 |
| 3 | Operator Today View (chrome only) | 5 | 5 | 4 | 2 | 2 | 3 | 4 | 4 | 3 | 32 | 3 | ~45 | 1 |
| 4 | Operator Scan View (search chrome) | 4 | 4 | 3 | 3 | 3 | 4 | 4 | 3 | 2 | 30 | 2 | ~18 | 1 |
| 5 | Operator Booking Card (Today rows) | 4 | 4 | 2 | 4 | 2 | 4 | 3 | 4 | 4 | 31 | 2 | ~12 | 1 |
| 6 | Operator Task Card + create form | 4 | 4 | 2 | 3 | 3 | 4 | 4 | 3 | 4 | 31 | 2 | ~15 | 2 |
| 7 | Operator Header / bottom nav chrome | 3 | 2 | 1 | 5 | 4 | 5 | 5 | 3 | 5 | 28 | 1 | ~8 | 2 |
| 8 | Operator AI Upload Flow | 4 | 4 | 4 | 2 | 2 | 2 | 3 | 3 | 3 | 27 | 3 | ~55 | 2+ |
| 9 | Dashboard context header | 4 | 3 | 2 | 4 | 4 | 3 | 3 | 1 | 3 | 27 | 3 | ~15 | 1+ |
| 10 | Rental booking planner chrome | 4 | 4 | 3 | 2 | 2 | 3 | 3 | 1 | 3 | 25 | 2 | ~40 | 3+ |
| 11 | Operator DesktopOnlyNotice + AccessDenied | 2 | 2 | 1 | 5 | 5 | 5 | 5 | 3 | 5 | 25 | 1 | ~6 | 2 |
| 12 | Billing invoice list (rental) | 3 | 3 | 3 | 2 | 2 | 3 | 3 | 1 | 4 | 24 | 3 | ~35 | 2+ |
| 13 | Communication inbox chrome | 3 | 3 | 2 | 3 | 3 | 2 | 3 | 1 | 3 | 23 | 3 | ~25 | 2+ |
| 14 | Operator Vehicles View | 4 | 4 | 2 | 2 | 2 | 3 | 3 | 3 | **0** | 19 | **5** | ~15 | 1 |
| 15 | Master support ops (frozen P2210) | 2 | 2 | 2 | 3 | 3 | 3 | 3 | 0 | 5 | 23 | 2 | ~20 | 2+ |

---

## 30. Top-5 deep comparison

### 1. Operator More View (SELECTED)

| Field | Value |
|-------|-------|
| **Paths** | `frontend/src/operator/views/OperatorMoreView.tsx` |
| **Component** | `OperatorMoreView` |
| **Route/mount** | Operator tab `more` via `OperatorShell` |
| **Audience** | Operator (mobile/tablet) |
| **Visible debt** | **9** scanner findings |
| **Hidden debt** | 1 (`themePreferenceLabel` external) |
| **Fixed-locale debt** | `themePreferenceLabel` in `lib/theme.ts` — adapter bypass |
| **Machine inputs** | `OperatorSheetAction.type`, `ThemePreference`, `OperatorTab` |
| **Dynamic data** | Vehicle `model`, `license`, composed `vehicleLabel` |
| **Callbacks** | `openSheet({ type })`, `setActiveTab`, `setScanQuery`, `cycleThemePreference` |
| **Permissions** | Inherited Operator shell access |
| **Ordering/filtering** | Action card order static — **frozen** |
| **Dates/numbers/currency** | None |
| **Est. keys** | **16–20** (after reuse) |
| **Test strategy** | Mount `OperatorMoreView` with mocked shell + vehicle list; EN/DE; same-mount; assert `openSheet` args unchanged |
| **Collision** | **NONE** |
| **Main drift** | **LOW** — cosmetic card-radius class diff only (`0e01cd12` → `main`) |

### 2. Operator Booking Detail Sheet (non-doc)

| Field | Value |
|-------|-------|
| **Paths** | `frontend/src/operator/components/OperatorBookingDetailSheet.tsx` |
| **Visible debt** | 8 |
| **Risk** | Health `blockingReasons` dynamic; action matrix overlaps P237; hosts frozen P238 panel |
| **Collision** | LOW |
| **Why not #1** | Lower boundedness (3) and higher business risk (2) vs More View |

### 3. Operator Today View (chrome only)

| Field | Value |
|-------|-------|
| **Paths** | `frontend/src/operator/views/OperatorTodayView.tsx` |
| **Visible debt** | 12 |
| **Risk** | `useOperatorToday('de')` fixed locale; stale/offline banner = runtime sync semantics |
| **Collision** | MEDIUM (#906 Today work queue) |

### 4. Operator Scan View

| Field | Value |
|-------|-------|
| **Paths** | `frontend/src/operator/views/OperatorScanView.tsx` |
| **Visible debt** | 6 |
| **Risk** | Booking card duplication with Today |
| **Score** | 30 |

### 5. Operator Booking Card

| Field | Value |
|-------|-------|
| **Paths** | `frontend/src/operator/components/OperatorBookingCard.tsx` |
| **Visible debt** | ~6 (embedded in Today) |
| **Risk** | Not isolatable without Today host; partial handover-i18n reuse already present |
| **Score** | 31 (high separation penalty for extraction) |

---

## 31. Campaign direction

**A — CONTINUE OPERATOR**

Operator More View outranks all non-Operator challengers on collision safety (5/5), boundedness (5/5), and enforce-clean suitability (5/5) while maintaining Operator campaign momentum after P238. No external candidate materially outranks it on combined score + risk.

---

## 32. Selected P239 target

# **P2.2.39 — Operator More View Localization**

One coherent bounded surface: the Operator **More** tab hub (actions, navigation, appearance, external link, info footer).

---

## 33. Split decision

**ONE SLICE**

Single production view file + bounded adapter. No architectural prerequisite.

---

## 34. Exact production boundary

| Item | Value |
|------|-------|
| **Production paths** | `frontend/src/operator/views/OperatorMoreView.tsx`, `frontend/src/operator/lib/operator-more-i18n.ts` (new) |
| **Component/symbol** | `OperatorMoreView` |
| **Route/mount** | `/operator` → tab `more` → `OperatorTabContent` case `'more'` |
| **Audience** | Operator role, mobile/tablet-first |
| **Visible presentation** | Section headings, action card titles/subtitles, vehicle picker chrome, nav CTA, theme labels, web-app link, info footer |
| **Hidden presentation** | `aria-label` if added; sheet type strings not shown |
| **Fixed-locale presentation** | Replace `themePreferenceLabel()` with adapter mapping |
| **Machine/domain values** | `OperatorSheetAction.type`, `ThemePreference`, `OperatorTab`, vehicle `id` |
| **Dynamic data** | `${v.model} · ${v.license}` vehicle labels — **raw** |
| **Callbacks** | `openSheet`, `setActiveTab`, `setScanQuery`, `setPickerOpen`, `cycleThemePreference` — **unchanged** |
| **Callback args** | `type: 'booking-create' \| 'ai-upload' \| 'tire-measure'`, `vehicleId`, `vehicleLabel`, `contextMode` — **frozen** |
| **Sheets opened** | booking-create (P236 frozen), ai-upload, tire-measure (P226 frozen) — **no sheet changes** |
| **Permissions** | Operator shell guard — unchanged |
| **Visibility/disabled** | Single-vehicle auto-pick logic — unchanged |
| **Ordering** | Static action card order — unchanged |
| **Icons/tones** | Lucide icons, brand/muted classes — unchanged |

**Out of scope:** `OperatorActionSheets`, frozen flows (form, AI upload internals, tire measure), `lib/theme.ts` business logic, bottom nav labels (separate slice).

---

## 35. Machine / domain freeze

| Value | Source | Business use | Presentation | Localize? | Unchanged? |
|-------|--------|--------------|--------------|-----------|------------|
| `booking-create` | `OperatorSheetAction.type` | Open P236 sheet | — | NO | ✅ |
| `ai-upload` / `tire-measure` | sheet type | Open frozen flows | — | NO | ✅ |
| `general` contextMode | AI upload | Upload context | — | NO | ✅ |
| `vehicles` / `scan` tab | `OperatorTab` | Navigation | — | NO | ✅ |
| `vehicleId` | fleet API | Sheet/API arg | — | NO | ✅ |
| `vehicleLabel` | composed string | Sheet display arg | shown raw | NO translate | ✅ |
| `system`/`light`/`dark` | `ThemePreference` | Theme cycle | label only | YES | machine ✅ |
| Theme cycle order | `cycleThemePreference` | UX behavior | — | NO | ✅ |
| `allVehicles.length === 1` | picker logic | Auto-open sheet | — | NO | ✅ |
| `/rental` link target | React Router | Exit to web app | — | NO | ✅ |

---

## 36. Dynamic data freeze

| Field | Treatment |
|-------|-----------|
| Vehicle model name | **RAW** |
| License plate | **RAW** |
| Composed `vehicleLabel` | **RAW** (concatenation unchanged) |
| Organization name | N/A on this surface |

---

## 37. Callback / navigation / permission freeze

| Callback | Baseline behavior | Must remain |
|----------|-------------------|-------------|
| `openSheet({ type: 'booking-create' })` | Opens P236 form | ✅ identical |
| `openSheet({ type: 'ai-upload', vehicleId, vehicleLabel, contextMode })` | Opens AI upload | ✅ identical args |
| `openSheet({ type: 'tire-measure', vehicleId, vehicleLabel })` | Opens tire measure | ✅ identical args |
| `setActiveTab('vehicles')` + `setScanQuery('')` | Nav to scan tab | ✅ identical |
| `cycleThemePreference()` | Cycles theme | ✅ identical |
| `Link to="/rental"` | Web app navigation | ✅ identical |

---

## 38. Order / filter freeze

- Action cards: booking-create → ai-upload → tire-measure — **static order**
- Vehicle picker list: `allVehicles` API order — **unchanged**
- Locale must not affect ordering

---

## 39–40. Date/time & number freeze

**N/A** — no dates, numbers, or currency on this surface.

---

## 41. Key reuse audit

| Concept | Classification | Key / approach |
|---------|---------------|----------------|
| Create booking title | **SEMANTIC REUSE** | `operator.bookings.form.createTitle` |
| Create booking subtitle | **NEW P239 KEY** | `operator.more.action.createBooking.subtitle` |
| AI Upload title | **SEMANTIC REUSE** | `operator.bookings.documents.aiUpload.title` (or dedicated more key if wording differs) |
| AI Upload subtitle | **SEMANTIC REUSE** | adapt from documents aiUpload subtitle |
| Tire measure | **NEW P239 KEY** | `operator.more.action.tireMeasure.*` |
| Section headings | **NEW P239 KEY** | `operator.more.section.*` |
| Theme preference labels | **NEW P239 KEY** | `operator.more.theme.system/light/dark` |
| Web app link | **NEW P239 KEY** | `operator.more.link.webApp` |
| Info footer | **NEW P239 KEY** | `operator.more.info.*` |
| Vehicle labels in list | **DYNAMIC — DO NOT TRANSLATE** | — |

**Estimated new keys:** **16–20** (under 40 threshold ✅)

---

## 42. Adapter strategy

**NEW BOUNDED PRESENTATION ADAPTER**

`frontend/src/operator/lib/operator-more-i18n.ts` — pattern-aligned with `operator-booking-documents-i18n.ts`.

---

## 43. Extraction strategy

**NO STRUCTURAL CHANGE REQUIRED**

Wire `OperatorMoreView` to adapter helpers; no component extraction needed.

---

## 44. P239 enforce-clean boundary

```
P239_ENFORCE_CLEAN_EXACT:
  - operator/views/OperatorMoreView.tsx
  - operator/lib/operator-more-i18n.ts
```

**Excludes:** P216–P238, Quick View blockers, connectivity banner, vehicles view, frozen sheets/flows, `lib/theme.ts`, bottom nav, shell header.

No ignores. No allowlists. No scanner weakening.

---

## 45. Test contract

Future file: `frontend/src/operator/views/operator-more-localization.test.tsx`

| Test | Required |
|------|----------|
| P239 enforce-clean = 0 | ✅ |
| EN section headings + action labels | ✅ |
| DE section headings + action labels | ✅ |
| Same-mount locale switch preserves vehicle labels | ✅ |
| `openSheet` called with identical `type` + IDs on CTA click | ✅ |
| Theme preference label maps machine `ThemePreference` | ✅ |
| No raw TranslationKey leakage | ✅ |
| No vehicle label translation | ✅ |

---

## 46. Category E feasibility

All changes are host-owned presentation strings and theme-preference label mapping.  
**business/runtime semantic modifications = 0** — **Category E = 0 feasible** ✅

---

## 47. Active PR collision (selected target)

| Workstream | vs Operator More View |
|------------|----------------------|
| #1263 / #1267 / #1269 | **NONE** (backend/connectivity) |
| #906 Today work queue | **NONE** |
| #915 Connectivity banner | **NONE** |
| P236–P238 frozen sheets | **NONE** (callbacks only) |
| Dashboard/fleet readiness | **NONE** |
| Theme V4.9.200 radius (#1257) | **LOW** (cosmetic class drift on main) |

**Selected target collision:** **NONE**

---

## 48. Current main drift

| Path | `0e01cd12` vs `origin/main` | Classification |
|------|----------------------------|----------------|
| `OperatorMoreView.tsx` | 2 hunks — card border/radius classes removed | **LOW** (cosmetic) |
| `OperatorBookingDetailSheet.tsx` | No semantic diff on baseline comparison | **NONE** |
| `OperatorTodayView.tsx` | Minor class changes | **LOW** |

**Implementation risk:** merge main cosmetic changes during P239 rebase — no semantic conflict expected.

---

## 49. Baseline strategy

**DIRECT FROM P238 MERGE BASELINE**

Use `0e01cd12cd888f4df20aad0c398c99823cc3286b` as implementation base. Rebase onto `main` only after implementation if required for deploy — cosmetic drift is LOW.

---

## 50. Global success contract

Future P239 implementation must achieve:

- Selected visible/hidden/fixed-locale debt = **0**
- P239 = **0**; P238–P216 = **0**; global enforce-clean = **0**
- EN = DE, parity 100%, orphans 0
- shim ≤ baseline; new compatibility consumers = 0
- Category E = 0
- Meaningful tests PASS; `npm run i18n:check` PASS; `npm run build` PASS; `git diff --check` PASS
- P239-caused required CI failures = 0

---

## 51. Campaign forecast

| Slice | Target (forecast only — not authorized) |
|-------|------------------------------------------|
| **P239** | **Operator More View** (selected) |
| P240 | Operator Booking Detail Sheet non-doc chrome **or** Operator Header/bottom nav |
| P241 | Operator Today View chrome (requires `useOperatorToday` locale threading plan) **or** Operator Booking Card rows |

---

## 52. Claim reconciliation

| Claim | Result |
|-------|--------|
| Baseline `0e01cd12` | ✅ verified |
| P238 merged | ✅ |
| EN/DE 8578 | ✅ |
| P238–P216 = 0 | ✅ |
| Global enforce-clean = 0 | ✅ |
| No baseline regression | ✅ |
| Vehicle/fleet deferred | ✅ |
| Target selected | ✅ Operator More View |
| Implementation not started | ✅ |

---

## 53. Final verdict

### **A — GO — P2.2.39 TARGET SELECTED**

**P2.2.39 — Operator More View Localization**

**CAMPAIGN:** OPERATOR (continue)

**IMPLEMENTATION NOT STARTED.**

---

*Read-only pre-flight completed 2026-08-25. No production, dictionary, test, or scanner changes made.*
