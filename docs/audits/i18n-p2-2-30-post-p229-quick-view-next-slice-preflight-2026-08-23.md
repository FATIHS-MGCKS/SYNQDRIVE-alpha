# P2.2.30 — Post-P229 Vehicle Quick View Next-Slice Pre-Flight

**Date:** 2026-08-23  
**Mode:** STRICT READ-ONLY PRE-FLIGHT  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Authoritative baseline:** `8498f0442712c326ceffba9b8d46cc0932bd364d` (merge commit of PR #1216 / P2.2.29 QV Quick Actions)  
**Audit branch:** `cursor/p2230-post-p229-quick-view-next-slice-preflight-3c10`

---

## 0. Baseline / topology hard gate

| Check | Result |
|-------|--------|
| PR #1216 merged | **YES** (`gh pr view 1216` → `state: MERGED`) |
| Exact merge SHA | `8498f0442712c326ceffba9b8d46cc0932bd364d` |
| Commit exists locally | **YES** (`git cat-file -t` → commit) |
| Commit exists remotely | **YES** (`origin/p228-authoritative-baseline-3c10` → `8498f044`) |
| `merge-base(HEAD, baseline)` | `8498f0442712c326ceffba9b8d46cc0932bd364d` ✓ |
| Pre-audit commits on baseline | **0** (`git rev-list --count 8498f044..HEAD` = 0) ✓ |
| Working tree clean (pre-audit) | **YES** |

### Ancestry (verified via `git log` on baseline)

| Slice | Commit on baseline ancestry |
|-------|----------------------------|
| P229 (QV Quick Actions) | `8498f044` |
| P228 (QV Header/Status) | `59e3395e` |
| P227 (QV Open Tasks) | `314f20aa` |
| P226 (Tire Measure) | `9f87c3d7` |
| P225 (Pickup Verification) | `bbb4f574` |
| P224 (Damage Capture) | `bf0a5a57` |
| P223 (Invoice Documents) | `96dadcb3` |
| P222 (Send Invoice Dialog) | `80dbba83` |
| P221 (Create Invoice Dialog) | `59b01928` |
| P220 (Parts & Accessories) | `6413a3dd` |
| P219 (Insurances View) | `9b714458` |
| P218 (Data Authorization) | `d645343f` |
| P217 (Booking Vehicle Picker) | `6e578fd9` |
| P216C2B | `f7095205` |
| P216C2A | `718a5e82` |
| P216C1 | `2f47b6a0` |
| P216B2 | `3d0dc906` |
| P216B1 | `8941158c` |
| P216A | `1370a384` |

**Topology verdict:** VALID — proceed.

**Note:** Baseline is on `origin/p228-authoritative-baseline-3c10` (updated to P229 merge tip). `origin/main` is **86 commits ahead** with Communication Center and notification routing work; it **does not** contain the P227–P229 QV extraction stack at this baseline.

---

## 1. Post-P229 freeze verification

| Check | Result |
|-------|--------|
| `npm run i18n:check` | **PASS** |
| i18n test count | **329** tests (23 files) |
| EN keys | **8446** |
| DE keys | **8446** |
| Parity | **100%** |
| Orphans | **0** |
| Shim inventory | **29** (prod 18, test 11) |
| New compatibility consumers | **0** |
| Global active enforce-clean debt | **0** |

### Per-slice enforce-clean debt

| Slice | Debt |
|-------|------|
| P229 | **0** |
| P228 | **0** |
| P227 | **0** |
| P226 | **0** |
| P225 | **0** |
| P224 | **0** |
| P223 | **0** |
| P222 | **0** |
| P221 | **0** |
| P220 | **0** |
| P219 | **0** |
| P218 | **0** |
| P217 | **0** |
| P216A/B1/B2/C1/C2A/C2B | **0** |

### Frozen boundary sanity

| Frozen surface | Scanner debt |
|----------------|-------------|
| `OperatorVehicleQuickViewQuickActions.tsx` | **0** |
| `OperatorVehicleQuickViewHeader.tsx` | **0** |
| `OperatorVehicleQuickViewTasks.tsx` | **0** |
| `operator-vehicle-quick-view-i18n.ts` (frozen mappings) | **0** |
| QV Quick Actions machine IDs (pickup/return/booking-create) | **not leaked** — adapter keys only |
| QV fixed-DE regression in frozen slices | **0** |
| CompanySections (`getCompanySections(locale)` via `CompanySectionTabBar`) | **wired to locale** — prior freeze intact |

**Post-P229 freeze verdict:** PASS — no regression.

---

## 2. Purpose

Select exactly **one** bounded P2.2.30 production localization slice from remaining Operator Vehicle Quick View residual after:

- P227 — Open Tasks
- P228 — Header & Primary Status
- P229 — Quick Actions

---

## 3. Global residual inventory (recomputed)

Scanner: `npm run i18n:check` inventory refresh @ `8498f044`

| Surface | Scanner-visible debt | Active enforce-clean |
|---------|---------------------|---------------------|
| **GLOBAL** | **1573** unique findings | **0** |
| MASTER | 1049 | 0 |
| OPERATOR | 126 | 0 |
| RENTAL | 372 | 0 |
| SHARED | 1 | 0 |
| SHELL | 25 | 0 |

### Debt class breakdown (Operator + QV)

| Class | Operator | QV parent |
|-------|----------|-----------|
| Scanner-visible presentation | 126 | 16 |
| Hidden presentation (utils/hook maps, not scanned) | ~35+ | ~20+ |
| Fixed-locale (`de-DE`, `locale: 'de'`) | present in utils | present in date/tire paths |
| Active enforce-clean | 0 | 0 |

**GLOBAL ACTIVE I18N ENFORCE-CLEAN DEBT = 0** ✓

---

## 4. Exclude frozen QV slices

**Excluded from P230 candidate pool:**

- `OperatorVehicleQuickViewTasks.tsx` (P227)
- `OperatorVehicleQuickViewHeader.tsx` (P228)
- `OperatorVehicleQuickViewQuickActions.tsx` (P229)
- `operator-vehicle-quick-view-i18n.ts` task + header + quick-action adapter mappings
- `operator.vehicleQuickView.tasks.*`, `operator.vehicleQuickView.header.*`, `operator.vehicleQuickView.quickActions.*` keys

No reopen unless regression — **none found**.

---

## 5. Frozen QV sanity check

| Finding | Classification |
|---------|----------------|
| Frozen QV-G task rows | **A** machine/domain — unchanged |
| Frozen header status chips | **A** — adapter maps only |
| Frozen quick actions (pickup/return/create) | **A** — stable action identity preserved |
| Customer names in action subtitles | **B** dynamic business data |
| Gate reason suffixes | **D** already localized via `resolveHandoverGateReason` |
| Scanner hits on frozen files | **0** |

**Category E (presentation regression): 0**

---

## 6. Remaining Quick View residual inventory

Parent host: `OperatorVehicleQuickView.tsx` (428 lines @ baseline).  
Frozen children: Header, QuickActions, Tasks (extracted).  
Remaining inline sub-surfaces:

| ID | Sub-surface | Lines | Scanner hits | Hidden debt |
|----|-------------|-------|--------------|-------------|
| **QV-TF** | Tool / Footer Actions | 317–375 | 8 | 0 |
| **QV-BC** | Booking / Customer Context | 121–133 | 1 (`Buchung`) | hook kind labels in `useOperatorVehicleQuickViewData.ts` |
| **QV-BL** | Blockers & Hints | 135–156 | 1 | error prefix string; API `blocking_reasons` raw |
| **QV-RH** | Rental Health modules | 158–191 | 2 | `HEALTH_MODULE_LABELS`, `formatModuleRow`, `RENTAL_HEALTH_STATE_LABELS` in utils |
| **QV-DM** | Active Damages | 193–218 | 2 | `formatDamageType`; raw severity/rentalImpact |
| **QV-TI** | Tire Profile summary | 242–293 | 2 | InfoTile labels; `tireUiStatusLabel` default `de`; `formatOperatorDateTime('de-DE')` |
| **QV-DO** | AI Uploads / Documents | 295–315 | 1 | raw `documentType` / `status` machine fields |

### Hidden presentation (not scanner-visible on parent)

| Path | Concepts |
|------|----------|
| `useOperatorVehicleQuickViewData.ts` L169–212 | `Abholung heute`, `Rückgabe heute`, `Aktive Buchung`, `Nächste Reservierung` |
| `operatorVehicleQuickView.utils.ts` | `HEALTH_MODULE_LABELS`, `RENTAL_HEALTH_STATE_LABELS`, `PRIMARY_STATUS_LABELS`, contradiction strings, `formatOperatorDateTime('de-DE')`, `formatModuleRow` empty-state `Keine Daten` |

---

## 7. Tool / Footer deep audit

**Location:** `OperatorVehicleQuickView.tsx` L317–375 (`ActionButton` grid at panel bottom).

| # | Icon | Title (DE) | Subtitle (DE) | Callback | Route/sheet |
|---|------|------------|---------------|----------|-------------|
| 1 | ShieldAlert | Schaden aufnehmen | Foto, Typ & Position | `openDamageCapture({...})` | damage-capture flow |
| 2 | Sparkles | AI Upload | Dokument scannen & bestätigen | `openSheet({ type: 'ai-upload', ... })` | ai-upload sheet |
| 3 | Disc3 | Reifenprofil messen | Profiltiefe erfassen | `openSheet({ type: 'tire-measure', ... })` | tire-measure sheet |
| 4 | ListTodo | Aufgabe erstellen | Operative Aufgabe am Fahrzeug | `openSheet({ type: 'task-create', ... })` | task-create sheet |

**Layout ownership:** inline `ActionButton` helper (L389–427) co-located in parent.  
**Permissions:** none — all actions always visible.  
**Disabled behavior:** none — always enabled.  
**Highlight:** action 1 only (`highlight` prop).  
**Tooltips/aria:** none present.

---

## 8. Tool / Footer machine contract

| Action | Stable machine identity | Label | Callback | Args (frozen) | Route/sheet | Permission | Visibility | Disabled |
|--------|------------------------|-------|----------|---------------|-------------|------------|------------|----------|
| Damage capture | `damage-capture` | presentation | `openDamageCapture` | `{ vehicleId, vehicleName, plate, bookingId?, skipVehicleConfirm: true }` | capture flow | none | always | never |
| AI Upload | `ai-upload` | presentation | `openSheet` | `{ type: 'ai-upload', vehicleId, vehicleLabel, bookingId?, contextMode: 'vehicle' }` | sheet | none | always | never |
| Tire measure | `tire-measure` | presentation | `openSheet` | `{ type: 'tire-measure', vehicleId, vehicleLabel, onSuccess }` | sheet | none | always | never |
| Task create | `task-create` | presentation | `openSheet` | `{ type: 'task-create', vehicleId, vehicleLabel, bookingId?, onSuccess }` | sheet | none | always | never |

**Action order:** damage → AI upload → tire → task (fixed, 4 actions).  
**Action count:** 4.

**Localization coupling:** **SAFE PRESENTATION-ONLY** — labels/subtitles are pure presentation; callbacks, args, routes, and visibility are unchanged by i18n.

---

## 9. Booking / Customer context deep audit

**Location:** L121–133 + `useOperatorVehicleQuickViewData.ts` `bookingContext` memo.

| Field | Source | Presentation | Business logic |
|-------|--------|----------------|----------------|
| Section title | hardcoded `Buchung` | yes | no |
| `label` | hook kind map | yes | drives display only |
| `customerName` | API row / vehicle booking | dynamic — **do not translate** | identity |
| `when` | ISO timestamp | formatted via `formatOperatorDateTime` | sort/compare uses raw ISO |
| `station` | API station name | dynamic — **do not translate** | identity |
| `bookingId` | string ID | hidden in UI | routing/API |
| `status` | normalized booking status | machine code | workflow |

**Kind labels (hidden, hook-owned):** `Abholung heute`, `Rückgabe heute`, `Aktive Buchung`, `Nächste Reservierung`.

**Empty states:** section hidden when `bookingContext` is null.

---

## 10. Booking machine freeze

| Field | Type | Must remain unchanged? |
|-------|------|------------------------|
| `bookingId` | string | **YES** |
| `customerId` | string \| null | **YES** |
| `kind` | `pickup \| return \| active \| reserved` | **YES** |
| `status` | normalized booking status code | **YES** |
| `when` | ISO instant | **YES** (display may localize) |
| `station` | string | **YES** (dynamic data) |
| pickup/return action IDs | derived from dashboard rows | **YES** |

Future freeze must preserve kind→row selection logic and booking status machine values.

---

## 11. Booking date/time audit

| Location | Mechanism | Classification |
|----------|-----------|----------------|
| `formatOperatorDateTime` | `toLocaleString('de-DE', …)` hardcoded | **presentation-only formatter debt** — must thread locale in future slice |
| Booking `when` display | calls `formatOperatorDateTime` | presentation |
| Business comparisons | raw ISO in hook/API | **must not change** |

---

## 12. Booking status presentation

Booking context exposes normalized status codes via `normalizeBookingStatus`. No human-readable status label is rendered in the booking block at baseline — only kind label + customer + datetime. Status is machine-only in this slice.

---

## 13. Customer data freeze

Future implementation must **never translate:**

- customer name
- company name
- booking number
- email / phone / address / notes
- station names (dynamic)

---

## 14. Health / Tire / Damage deep audit

### Rental Health (QV-RH) L158–191

- Section title `Rental Health`
- Module rows from `HEALTH_MODULE_LABELS` + `formatModuleRow`
- States from `RENTAL_HEALTH_STATE_LABELS` / API `module.state`
- Empty: `Status nicht verfügbar.`
- Stale suffix: ` · stale` (English literal)

### Active Damages (QV-DM) L193–218

- Title `Aktive Schäden`
- Empty `Keine aktiven Schäden.`
- Rows: `formatDamageType(d.damageType) · d.severity` + `locationLabel` + `rentalImpact` chip

### Tire Profile (QV-TI) L242–293

- Title `Reifenprofil`
- Inline CTA `Messung eintragen`
- InfoTile labels: Letzte Messung, Profil (min.), Status, Restlaufzeit, Modus
- Values from `tireLowestTreadLabel`, `tireUiStatusLabel`, `tireRemainingKmLabel`, raw `displayMode`/`measurementState`

### Blockers (QV-BL) L135–156

- Title `Blocker & Hinweise`
- Error prefix `Rental Health nicht geladen:`
- Raw `blocking_reasons` from API
- Contradiction strings from utils snapshot

---

## 15. Canonical health derivation boundary

| Visible value | Source class | Future localization |
|---------------|-------------|---------------------|
| Module state chip | **A** machine `module.state` | **D** label map only |
| Module reason text | **B** API string / **C** threshold-derived | presentation cautiously — may be API-owned |
| Damage severity | **A** machine code | **D** map if standardized |
| Tire tread mm | **B** numeric | formatter only |
| Tire UI status | **C** threshold-derived via `tireUiStatusLabel` | **D/E** presentation map — do not change thresholds |
| `rental_blocked` flag | **A** | no label change in logic |

Future localization may touch **D/E only** unless A→TranslationKey is a pure presentation adapter.

---

## 16. P226 tire machine freeze

Tire summary in QV-TI reads `tireSummary` from `api.vehicleIntelligence.tireHealthSummary`. Must preserve:

- measurement values (mm)
- positions
- thresholds / warning predicates
- setup IDs / `displayMode` / `measurementState`
- P226 `OperatorTireMeasureFlow` workflow semantics

**No reopening P226.**

---

## 17. Damage machine freeze

Damage rows display:

- `d.id`, `d.damageType`, `d.severity`, `d.rentalImpact`, `d.locationLabel`, descriptions

Dynamic damage descriptions and severity codes remain unchanged. Localization may only add presentation maps for known enum codes.

---

## 18. Health candidate coupling score

| Sub-block | Score |
|-----------|-------|
| QV-RH Rental Health modules | **TOO COUPLED** (utils maps + API reasons + stale English) |
| QV-DM Active damages | **SAFE WITH HARD MACHINE FREEZE** |
| QV-TI Tire profile | **SAFE WITH HARD MACHINE FREEZE** (P226 boundary) |
| QV-BL Blockers | **TOO COUPLED** (API reasons + contradiction derivation) |

---

## 19. Secondary metadata audit

| Metadata | Owner slice | Coherent alone? |
|----------|-------------|-----------------|
| Odometer | not in QV parent | N/A |
| Last update / telemetry | not in QV parent | N/A |
| Document timestamps | QV-DO | belongs with documents slice |
| Tire last measurement datetime | QV-TI | belongs with tire slice |
| ` · stale` suffix | QV-RH | belongs with health slice |

No standalone metadata-only slice recommended.

---

## 20. Empty / Error / Accessibility residual

| State | Location | Copy |
|-------|----------|------|
| Health loading | QV-RH | SkeletonRows |
| Health empty | QV-RH | `Status nicht verfügbar.` |
| Damages empty | QV-DM | `Keine aktiven Schäden.` |
| Tire empty | QV-TI | `Keine Reifendaten.` |
| Health error | QV-BL | `Rental Health nicht geladen: {error}` |
| Header not-found | frozen P228 | already localized |

Residual empty/error strings are distributed across section slices — not a viable one-string campaign.

---

## 21. Residual structural decomposition

| Sub-slice | Files | Est. keys | Operational value | Risk | Classification |
|-----------|-------|-----------|-------------------|------|----------------|
| **QV-TF Tool/Footer** | parent → extract `OperatorVehicleQuickViewToolActions.tsx`, adapter | **8** | **5** | **1** | **SAFE BOUNDED** |
| QV-BC Booking context | parent + hook + adapter datetime | 12–16 | 4 | 3 | SAFE WITH EXTRA FREEZE |
| QV-BL Blockers | parent + utils contradictions | 10–15 | 3 | 4 | TOO COUPLED |
| QV-RH Rental Health | parent + utils maps | 20–30 | 4 | 4 | TOO COUPLED |
| QV-DM Damages | parent + damage type maps | 8–12 | 3 | 3 | SAFE WITH EXTRA FREEZE |
| QV-TI Tire profile | parent + tire UI helpers | 12–18 | 4 | 3 | SAFE WITH EXTRA FREEZE |
| QV-DO Documents | parent section title only | 2–4 | 2 | 2 | LOW VALUE |

---

## 22. Tool/Footer boundedness test

| Criterion | Result |
|-----------|--------|
| ≤ 4 production files? | **YES** (extract 1 component + parent wire + adapter + dict modules) |
| ≤ 40 presentation concepts? | **YES** (8 visible strings) |
| ≤ 40 likely keys? | **YES** (~8 new keys) |
| Callbacks easy to freeze? | **YES** — 4 stable sheet/capture opens |
| Category E realistically 0? | **YES** |
| Scanner boundary feasible? | **YES** — dedicated enforce-clean path |

**Verdict: ONE SAFE SLICE**

---

## 23. Booking context boundedness test

| Criterion | Result |
|-----------|--------|
| ≤ 4 production files? | Borderline (parent + hook + adapter + utils datetime) |
| Date/time semantics separable? | Requires hook + formatter threading — **extra freeze** |
| Category E = 0? | Achievable with care |

**Verdict: SAFE WITH EXTRA FREEZE** (not first pick)

---

## 24. Health/Tire/Damage boundedness test

Mixed canonical machines (health modules + tire thresholds + damage enums). Prefer split.

**Verdict: SPLIT REQUIRED** if pursued; tire and damages should not ship together with rental health modules.

---

## 25–31. Scoring (0–5)

### QV-TF Tool/Footer (selected)

| Dimension | Score |
|-----------|-------|
| Operational leverage | **5** |
| Machine/display separation | **5** |
| Business risk | **1** |
| Boundedness | **5** |
| Testability | **5** |
| Collision | **4** (main touched QV parent — branch from baseline mitigates) |
| Residual quality | **4** |

### Runner-ups

| Candidate | Op lev | Sep | Risk | Bound | Test | Coll | Qual |
|-----------|--------|-----|------|-------|------|------|------|
| QV-BC Booking | 4 | 3 | 3 | 3 | 3 | 4 | 4 |
| QV-TI Tire | 4 | 3 | 3 | 3 | 3 | 3 | 4 |
| QV-DM Damages | 3 | 3 | 3 | 4 | 3 | 4 | 3 |
| OperatorBookingFormSheet | 4 | 2 | 4 | 2 | 2 | 3 | 5 |
| OperatorAiUploadFlow | 4 | 3 | 3 | 2 | 3 | 2 | 4 |
| OperatorTodayView | 3 | 3 | 2 | 3 | 3 | 3 | 3 |

---

## 32. Remaining Quick View ranking

| Rank | Sub-slice | Files | Visible | Hidden | Fixed locale | Op lev | Sep | Risk | Bound | Test | Coll | Est. keys | Recommendation |
|------|-----------|-------|---------|--------|--------------|--------|-----|------|-------|------|------|-----------|----------------|
| 1 | **QV-TF Tool/Footer** | `OperatorVehicleQuickView.tsx` → extract | 8 | 0 | 0 | 5 | 5 | 1 | 5 | 5 | 4 | 8 | **P230 winner** |
| 2 | QV-BC Booking | parent + hook | 1 | 4 | 1 | 4 | 3 | 3 | 3 | 3 | 4 | 14 | Next after P230 |
| 3 | QV-TI Tire | parent + tire helpers | 2 | 5 | 1 | 4 | 3 | 3 | 3 | 3 | 3 | 14 | Split slice |
| 4 | QV-DM Damages | parent | 2 | 2 | 0 | 3 | 3 | 3 | 4 | 3 | 4 | 10 | Later |
| 5 | QV-BL Blockers | parent + utils | 1 | 6+ | 0 | 3 | 2 | 4 | 2 | 2 | 4 | 15 | Defer |
| 6 | QV-RH Rental Health | parent + utils | 2 | 15+ | 0 | 4 | 2 | 4 | 2 | 2 | 4 | 25+ | Defer / split |
| 7 | QV-DO Documents | parent | 1 | 0 | 0 | 2 | 4 | 2 | 5 | 3 | 4 | 3 | Low value alone |

---

## 33. Top non-QV Operator alternatives

| Rank | Surface | Files | Est. keys | Notes |
|------|---------|-------|-----------|-------|
| 1 | Operator Booking Form Sheet | `OperatorBookingFormSheet.tsx` | 16 scanner | High debt, high form coupling |
| 2 | Operator AI Upload Flow | `OperatorAiUploadFlow.tsx` | 11 | Active CC adjacency — collision risk |
| 3 | Operator Today View | `OperatorTodayView.tsx` | 12 | Dashboard shell copy |

---

## 34. Vehicle/Fleet runner-up

Rental vehicle detail / health surfaces outside Operator QV — already partially covered by P2.2.2 rental-vehicles-health pack. No stronger bounded target than continuing QV sequence.

---

## 35. Rental / Master runner-up

**Rental:** Finance/Billing residual (`FinanceView.tsx` etc.) — large, unbounded.  
**Master:** Support Ops — **frozen clean** (P210). No new Master slice beats Operator QV-TF.

---

## 36. Top 12 cross-domain ranking

| Rank | Domain | Surface | Files | Active? | Vis | Hid | Fix | Op | Sep | Risk | Bound | Test | Coll | Keys | Rec |
|------|--------|---------|-------|---------|-----|-----|-----|----|----|------|-------|------|------|------|-----|
| 1 | Operator/QV | Tool/Footer Actions | QV parent → extract | yes | 8 | 0 | 0 | 5 | 5 | 1 | 5 | 5 | 4 | 8 | **P230** |
| 2 | Operator/QV | Booking Context | parent+hook | yes | 1 | 4 | 1 | 4 | 3 | 3 | 3 | 3 | 4 | 14 | QV next |
| 3 | Operator | Booking Form Sheet | `OperatorBookingFormSheet.tsx` | yes | 16 | 5+ | 1 | 4 | 2 | 4 | 2 | 2 | 3 | 20+ | Later |
| 4 | Operator/QV | Tire Profile | parent | yes | 2 | 5 | 1 | 4 | 3 | 3 | 3 | 3 | 3 | 14 | QV split |
| 5 | Operator | AI Upload Flow | `OperatorAiUploadFlow.tsx` | yes | 11 | 3 | 0 | 4 | 3 | 3 | 2 | 3 | 2 | 15+ | CC collision |
| 6 | Operator | Today View | `OperatorTodayView.tsx` | yes | 12 | 2 | 0 | 3 | 3 | 2 | 3 | 3 | 3 | 12 | Later |
| 7 | Operator/QV | Active Damages | parent | yes | 2 | 2 | 0 | 3 | 3 | 3 | 4 | 3 | 4 | 10 | QV later |
| 8 | Operator | Booking Detail Sheet | `OperatorBookingDetailSheet.tsx` | yes | 8 | 2 | 0 | 3 | 2 | 3 | 3 | 2 | 3 | 10 | Later |
| 9 | Operator/QV | Rental Health modules | parent+utils | yes | 2 | 15 | 0 | 4 | 2 | 4 | 2 | 2 | 4 | 25+ | Defer |
| 10 | Operator | Scan View | `OperatorScanView.tsx` | yes | 6 | 1 | 0 | 3 | 3 | 2 | 4 | 3 | 3 | 8 | Later |
| 11 | Operator/QV | Blockers & Hints | parent+utils | yes | 1 | 6 | 0 | 3 | 2 | 4 | 2 | 2 | 4 | 15 | Defer |
| 12 | Rental | Finance/Billing | `FinanceView.tsx` cluster | yes | 90 | many | 2 | 3 | 2 | 3 | 1 | 2 | 2 | 60+ | Too broad |

---

## 37. Winner comparison

| Candidate | Verdict |
|-----------|---------|
| Best remaining QV | **QV-TF Tool/Footer** |
| Best non-QV Operator | Operator Booking Form Sheet |
| Best non-Operator | Rental Finance (too broad) |

**Winner: QUICK VIEW WINS**

---

## 38. Campaign decision

**CONTINUE OPERATOR — VEHICLE QUICK VIEW**

---

## 39. Selected P2.2.30 target

**P2.2.30 — Operator Vehicle Quick View Tool & Footer Actions Localization**

---

## 40. One slice / split decision

**ONE SLICE**

---

## 41. Exact P230 production scope

| Path | Role | Presentation ownership | Machine/business | Why required |
|------|------|------------------------|----------------|--------------|
| `frontend/src/operator/components/OperatorVehicleQuickViewToolActions.tsx` | **NEW** extracted footer action grid | title + subtitle per action | passes through frozen callbacks/args | bounded enforce-clean surface |
| `frontend/src/operator/components/OperatorVehicleQuickView.tsx` | parent host | wire extraction only | preserves sheet/capture opens | remove inline ActionButton block |
| `frontend/src/operator/lib/operator-vehicle-quick-view-i18n.ts` | adapter | 4× (title, subtitle) helpers | locale resolve only | cohesive with P227–P229 adapter |
| `frontend/src/i18n/translations/operator.vehicleQuickView.toolActions.en.ts` | dictionary | EN keys | — | parity |
| `frontend/src/i18n/translations/operator.vehicleQuickView.toolActions.de.ts` | dictionary | DE keys | — | parity |

**Tests / scanner / docs:** P230 test file + `P230_ENFORCE_CLEAN_EXACT` guard + implementation audit doc (out of scope for this pre-flight).

---

## 42. Selected presentation inventory

| Concept | DE baseline | EN target (new keys) |
|---------|-------------|----------------------|
| Damage action title | Schaden aufnehmen | Record damage |
| Damage action subtitle | Foto, Typ & Position | Photo, type & position |
| AI Upload title | AI Upload | AI Upload |
| AI Upload subtitle | Dokument scannen & bestätigen | Scan document & confirm |
| Tire measure title | Reifenprofil messen | Measure tire tread |
| Tire measure subtitle | Profiltiefe erfassen | Capture tread depth |
| Task create title | Aufgabe erstellen | Create task |
| Task create subtitle | Operative Aufgabe am Fahrzeug | Operational task on vehicle |

**Presentation concept count: 8** (visible). Hidden: 0. Fixed-locale in slice: 0.

---

## 43. Machine / domain freeze

| Machine value | Used by | Presentation map? | Must remain unchanged? |
|---------------|---------|--------------------|-----------------------|
| `vehicleId` | all callbacks | no | **YES** |
| `vehicleName` / `plate` | damage capture | no | **YES** (dynamic) |
| `vehicleLabel` | sheet args | no | **YES** (dynamic) |
| `bookingId` | optional arg | no | **YES** |
| `skipVehicleConfirm: true` | damage capture | no | **YES** |
| `contextMode: 'vehicle'` | ai-upload | no | **YES** |
| `type` sheet discriminator | openSheet | no | **YES** |
| `onSuccess` callbacks | tire/task | no | **YES** |
| `highlight` on damage action | UI only | no | **YES** (visual flag) |
| action order (4) | DOM order | no | **YES** |

---

## 44. Callback / route freeze

| Callback | Frozen invocation |
|----------|-------------------|
| `openDamageCapture` | `{ vehicleId, vehicleName: vehicle.model, plate: vehicle.license, bookingId: data.bookingContext?.bookingId ?? undefined, skipVehicleConfirm: true }` |
| `openSheet` ai-upload | `{ type: 'ai-upload', vehicleId, vehicleLabel: label, bookingId?, contextMode: 'vehicle' }` |
| `openSheet` tire-measure | `{ type: 'tire-measure', vehicleId, vehicleLabel: label, onSuccess: () => void data.reloadDetails() }` |
| `openSheet` task-create | `{ type: 'task-create', vehicleId, vehicleLabel: label, bookingId?, onSuccess: () => void data.reloadDetails() }` |

---

## 45. Permission freeze

No permission predicates in tool/footer block. All four actions always visible and enabled.

---

## 46. Date/time freeze

Tool/footer slice includes **no timestamps**. N/A.

---

## 47. State preservation contract

No popover/menu/tab state in footer grid. Same-mount EN↔DE locale switch must preserve: nothing beyond re-rendered labels (no local state).

---

## 48. Dynamic business data freeze

Do not translate: `vehicle.model`, `vehicle.license`, `vehicleLabel`, `bookingId`, customer names.

---

## 49. Existing Quick View adapter strategy

**EXTEND EXISTING ADAPTER** — add `operatorVehicleQuickViewToolAction*` helpers to `operator-vehicle-quick-view-i18n.ts` following P227–P229 pattern. Remains cohesive (presentation maps only).

---

## 50. Adapter responsibility hard limit

**Forbidden:** booking predicates, health thresholds, routes, callbacks, permissions, API, sorting.  
**Allowed:** stable label lookup via `ovqt`, locale resolution.

---

## 51. Key reuse analysis

| Key | Reuse decision |
|-----|----------------|
| `operator.damageCapture.title` | **semantic near-match** (`Schaden erfassen` vs `Schaden aufnehmen`) — prefer **new** QV-specific keys to avoid wording drift |
| `operator.tireMeasure.eyebrow` | **semantic reuse candidate** for tire title (`Reifenprofil messen`) — evaluate at implementation; may still prefer dedicated QV keys for subtitle pairing |
| `tasks.createTaskButton` | **semantic reuse candidate** for task title |
| `handover.operator.condition.tireMeasureTitle` | partial overlap — not ideal for footer subtitle |
| **New namespace** | `operator.vehicleQuickView.toolActions.*` (8 keys) |

**Estimated new keys: 8** (well under 70 gate). Duplicate-risk: **low** if QV-specific namespace used.

---

## 52. Key growth gate

8 new keys ≪ 70 threshold. **PASS.**

---

## 53. P230 enforce-clean boundary

```text
P230_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewToolActions.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',  // toolActions section only — parent file shared; guard by path + future slice marker
]
```

Parent `OperatorVehicleQuickView.tsx` **must NOT** be fully enforce-clean — residual sections remain. Only extracted component is enforce-clean.

---

## 54. Optional structural extraction

**Required:** extract `OperatorVehicleQuickViewToolActions.tsx` mirroring P229 `OperatorVehicleQuickViewQuickActions.tsx` pattern.

Preserve: same props order, same callbacks, same highlight flag, same grid layout/classes, same icon mapping.

---

## 55. Blind-spot guards

- No raw `operator.vehicleQuickView.toolActions.*` key leakage in DOM
- No accidental reuse changing subtitle semantics
- `highlight` prop preserved on damage action only
- Callback arg object literals unchanged (deep compare in tests)
- No German literals reintroduced in extracted component

---

## 56. Future runtime test contract

| Test | Required |
|------|----------|
| EN render — 4 action labels | yes |
| DE render — 4 action labels | yes |
| Same-mount DE → EN | yes |
| Same-mount EN → DE | yes |
| `openDamageCapture` args unchanged | spy |
| `openSheet` type + args unchanged (×3) | spy |
| Action order DOM stable | yes |
| `highlight` on first action only | yes |
| No raw TranslationKey in DOM | yes |
| Dynamic vehicleLabel not translated | yes |

---

## 57. Category E contract

Compared against `8498f044`, future P230 diff must have:

- business/runtime semantic modifications = **0**
- Category E = **0**

Achievable: pure presentation extraction + adapter keys.

---

## 58. Global freeze contract

Future P230 must preserve all P229–P216 enforce-clean = 0, global enforce-clean = 0, `npm run i18n:check` PASS, parity 100%, orphans 0.

---

## 59. Shim / compatibility freeze

Current baseline: **29** shims, **0** new compatibility consumers.  
Future P230: shim ≤ 29, no new compat consumers, no shim cleanup.

---

## 60. Active feature collision

| Area | Collision risk |
|------|----------------|
| Communication Center (#1220 voice parity, C9–C11 branches) | **LOW** for QV-TF — no file overlap |
| Operator AI Upload (#1220 unrelated) | **LOW** — flow localized separately; QV only opens sheet |
| Main QV parent drift | **MEDIUM** — `OperatorVehicleQuickView.tsx` +277/−52 on main vs baseline; **mitigated** by branching from `8498f044`, not main |
| i18n infrastructure | **LOW** |

**No HIGH/DIRECT collision** on selected P230 files if implementation uses authoritative baseline.

---

## 61. Main drift check

| Item | Value |
|------|-------|
| Current `origin/main` SHA | `caf2c0f1594de77e2d67551bcb0dd79b3cd48a6d` |
| Commits after P230 baseline | **86** |
| Material QV file touches on main | `OperatorVehicleQuickView.tsx` (+225/−52), Header, QuickActions, Tasks, adapter — notification routing refactor |
| Selected P230 file collision | **MEDIUM** (parent wiring only; extract is new file) |

**Do NOT replace authoritative baseline with main.**

---

## 62. Implementation contract (if GO)

**TITLE:** P2.2.30 — Operator Vehicle Quick View Tool & Footer Actions Localization

**AUTHORITATIVE BASE:** `8498f0442712c326ceffba9b8d46cc0932bd364d`

**IN SCOPE:**

- `OperatorVehicleQuickViewToolActions.tsx` (new)
- parent wire in `OperatorVehicleQuickView.tsx`
- adapter extension + `operator.vehicleQuickView.toolActions.{en,de}.ts`
- P230 tests + `P230_ENFORCE_CLEAN_EXACT`
- implementation audit doc

**OUT OF SCOPE:**

- P227 Open Tasks, P228 Header, P229 Quick Actions
- remaining QV sections (booking, health, tire, damages, documents, blockers)
- business logic, API, routing, permissions, shim cleanup, Communication Center

**Acceptance:** selected visible/hidden/fixed-locale debt = 0; machine IDs/callbacks/routes/permissions unchanged; Category E = 0; P230 = 0; global freeze intact; tests + build PASS.

---

## 63. Audit artifact

This document: `docs/audits/i18n-p2-2-30-post-p229-quick-view-next-slice-preflight-2026-08-23.md`

---

## 64. Audit PR topology

(To be filled after push)

| Field | Value |
|-------|-------|
| Base branch | `p228-authoritative-baseline-3c10` @ `8498f044` |
| Head branch | `cursor/p2230-post-p229-quick-view-next-slice-preflight-3c10` |
| Changed files | 1 (this audit only) |
| Production modified | **NO** |
| Dictionaries modified | **NO** |
| Tests modified | **NO** |
| Scanner modified | **NO** |

---

## 65. Final report summary

| # | Item | Value |
|---|------|-------|
| 1 | Authoritative baseline | `8498f0442712c326ceffba9b8d46cc0932bd364d` |
| 2 | Topology valid | **YES** |
| 3 | `npm run i18n:check` | **PASS** |
| 4 | i18n suite count | **329** |
| 5 | Global enforce-clean | **0** |
| 6–19 | P229–P216A/B1/B2/C1/C2A/C2B | **0** each |
| 20 | CompanySections freeze | **clean** (locale-wired tab bar) |
| 21–22 | EN / DE | **8446 / 8446** |
| 23 | Parity | **100%** |
| 24 | Orphans | **0** |
| 25 | Shim | **29** |
| 26 | Compat consumers | **0** |
| 27 | Global residual | **1573** scanner findings |
| 28 | Operator residual | **126** |
| 29 | Remaining QV residual | **16** scanner (parent) + ~20 hidden |
| 30 | QV sub-surfaces | 7 (TF, BC, BL, RH, DM, TI, DO) |
| 31 | Tool/Footer candidate | **Rank #1 — selected** |
| 32 | Booking/Customer candidate | Rank #2 |
| 33 | Health/Tire/Damage candidate | Rank #4–6 (split/defer) |
| 34 | Metadata candidate | distributed — no standalone slice |
| 35 | Best QV target | **QV-TF Tool/Footer** |
| 36 | Best non-QV Operator | OperatorBookingFormSheet |
| 37 | Best non-Operator | Rental Finance (too broad) |
| 38 | Top 12 | see §36 |
| 39 | Winner comparison | **QUICK VIEW WINS** |
| 40 | Campaign decision | **CONTINUE OPERATOR — VEHICLE QUICK VIEW** |
| 41 | Selected P230 target | **Tool & Footer Actions** |
| 42 | Split decision | **ONE SLICE** |
| 43 | Production scope | see §41 |
| 44 | Presentation concepts | **8** |
| 45 | Visible debt (selected) | **8** |
| 46 | Hidden debt (selected) | **0** |
| 47 | Fixed-locale debt (selected) | **0** |
| 48–54 | Scores (selected) | Op 5, Sep 5, Risk 1, Bound 5, Test 5, Coll 4, Qual 4 |
| 55 | Estimated new keys | **8** |
| 56–61 | Freezes | see §43–48 |
| 62 | Adapter strategy | **EXTEND EXISTING** |
| 63 | Key reuse | §51 — prefer new `toolActions.*` namespace |
| 64 | P230 boundary | §53 |
| 65 | Guards | §55 |
| 66 | Future tests | §56 |
| 67 | Category E | **0 expected** |
| 68 | Global freeze | §58 |
| 69 | Current main SHA | `caf2c0f1` |
| 70 | Main-drift collision | **MEDIUM** (mitigated by baseline branch) |
| 71 | Audit artifact | this file |
| 72 | Audit PR | pending |
| 73 | Final verdict | **A — GO — P2.2.30 TARGET SELECTED** |

### Explicit confirmations

| Check | Value |
|-------|-------|
| production modified | **NO** |
| dictionaries modified | **NO** |
| tests modified | **NO** |
| scanner modified | **NO** |
| P2.2.30 implementation started | **NO** |
| merged | **NO** |

---

## 66. Final verdict

**A — GO — P2.2.30 TARGET SELECTED**

P2.2.30 should implement **Operator Vehicle Quick View Tool & Footer Actions Localization** as a single bounded slice extracted from `OperatorVehicleQuickView.tsx` L317–375, extending the existing `operator-vehicle-quick-view-i18n.ts` adapter with ~8 new keys under `operator.vehicleQuickView.toolActions.*`.
