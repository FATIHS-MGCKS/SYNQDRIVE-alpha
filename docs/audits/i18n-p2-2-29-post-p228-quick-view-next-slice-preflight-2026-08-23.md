# P2.2.29 — Post-P228 Vehicle Quick View Next-Slice Pre-Flight

**Date:** 2026-08-23  
**Mode:** STRICT READ-ONLY PRE-FLIGHT  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Authoritative baseline:** `59e3395eafff6de2e9d4301f1e806a24a35c9a31` (merge commit of PR #1211 / P2.2.28 QV Header & Primary Status)  
**Audit branch:** `cursor/p2229-post-p228-quick-view-next-slice-preflight-3c10`

---

## 0. Baseline / topology hard gate

| Check | Result |
|-------|--------|
| PR #1211 merged | **YES** (commit message: `feat(i18n): P2.2.28 … (#1211)`) |
| Exact merge SHA | `59e3395eafff6de2e9d4301f1e806a24a35c9a31` |
| Commit exists locally | **YES** (`git cat-file -t` → commit) |
| Commit exists remotely | **YES** (`origin/p228-authoritative-baseline-3c10`) |
| `merge-base(HEAD, baseline)` | `59e3395eafff6de2e9d4301f1e806a24a35c9a31` ✓ |
| Pre-audit commits on baseline | **0** (`git rev-list --count 59e3395e..HEAD` = 0) ✓ |
| Working tree clean (pre-audit) | **YES** |

### Ancestry (verified via `git log` on baseline)

| Slice | Commit on baseline ancestry |
|-------|----------------------------|
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

**Topology verdict:** VALID — proceed.

**Note:** Baseline is on `origin/p228-authoritative-baseline-3c10`, **not** on `origin/main` (main is 82 commits ahead with Communication Center work and **lacks** P227/P228 QV extractions).

---

## 1. Post-P228 freeze verification

| Check | Result |
|-------|--------|
| `npm run i18n:check` | **PASS** |
| i18n test count | **327** tests (23 files) |
| EN keys | **8445** |
| DE keys | **8445** |
| Parity | **100%** |
| Orphans | **0** |
| Shim inventory | **29** (prod 18, test 11) |
| New compatibility consumers | **0** |
| Global active enforce-clean debt | **0** |

### Per-slice enforce-clean debt

| Slice | Debt |
|-------|------|
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
| P211 (Handover / CompanySections prior freeze) | **0** |

### Frozen boundary sanity

| Frozen surface | Scanner debt |
|----------------|-------------|
| `OperatorVehicleQuickViewHeader.tsx` | **0** |
| `OperatorVehicleQuickViewTasks.tsx` | **0** |
| `operator-vehicle-quick-view-i18n.ts` | **0** |
| QV Header fixed-DE debt | **0** |
| QV-G Open Tasks boundary | **clean** |
| CompanySections (`getCompanySections(locale)`) | **wired to locale** — prior freeze intact |

**Post-P228 freeze verdict:** PASS — no regression.

---

## 2. Purpose

Select exactly **one** bounded P2.2.29 production localization slice from remaining Operator Vehicle Quick View residual after P227 (Open Tasks) and P228 (Header & Primary Status), ranked from actual code structure and scanner inventory.

---

## 3. Global residual inventory (recomputed)

Scanner: `node scripts/i18n-hardcoded-scan.mjs` @ `59e3395e`

| Surface | Scanner-visible debt | Active enforce-clean |
|---------|---------------------|---------------------|
| **GLOBAL** | **1574** unique findings | **0** |
| MASTER | 1049 | 0 |
| OPERATOR | 127 | 0 |
| RENTAL | 372 | 0 |
| SHARED | 1 | 0 |
| SHELL | 25 | 0 |

### Debt class breakdown (Operator + QV)

| Class | Operator | QV parent |
|-------|----------|-----------|
| Scanner-visible presentation | 127 | 17 |
| Hidden presentation (utils/hook maps, not scanned) | ~40+ | ~25+ |
| Fixed-locale (`de-DE`, `locale: 'de'`) | present in utils | present in tire/date paths |
| Active enforce-clean | 0 | 0 |

**Global active enforce-clean debt = 0** ✓

---

## 4. Exclude frozen QV slices

**Excluded from P229 candidate pool:**

- `OperatorVehicleQuickViewTasks.tsx` (P227)
- `OperatorVehicleQuickViewHeader.tsx` (P228)
- `operator-vehicle-quick-view-i18n.ts` task + header adapter mappings
- `operator.vehicleQuickView.tasks.*` and `operator.vehicleQuickView.header.*` keys

No reopen unless regression — **none found**.

---

## 5. P227/P228 residual sanity

| Finding | Classification |
|---------|----------------|
| Frozen QV-G task rows | **A** machine/domain — unchanged |
| Frozen header status chips | **A/B** — adapter maps only |
| Customer names in subtitles | **B** dynamic business data |
| Gate reason suffixes | **D** already localized via `resolveHandoverGateReason` |
| Scanner hits on frozen files | **0** |

**Category E (presentation regression) = 0** ✓

---

## 6. Remaining Vehicle Quick View inventory

### Parent host

| File | Scanner findings | Role |
|------|-----------------|------|
| `operator/components/OperatorVehicleQuickView.tsx` | **17** | All non-frozen sections |
| `operator/lib/operatorVehicleQuickView.utils.ts` | **0** (label maps not scanned) | Status/health/contradiction maps, `formatOperatorDateTime('de-DE')` |
| `operator/hooks/useOperatorVehicleQuickViewData.ts` | **0** (hook labels not scanned) | Booking-context German kind labels |

### Sub-surface map (actual code structure)

| ID | Section | Lines | Scanner | Presentation concepts | Est. new keys | Classification |
|----|---------|-------|---------|----------------------|---------------|----------------|
| **QV-QA** | Quick Actions | 106–168 | 1 TEXT | 3 CTA labels + dynamic subtitles | **3–6** | **D** canonical |
| **QV-BC** | Booking context | 171–181 + hook | 1 TITLE | section title + 4 kind labels + datetime | 6–8 | **D** + hook coupling |
| **QV-BL** | Blockers & hints | 184–205 | 1 TITLE + TEXT | section title, error prefix, API reasons | 4–6 | **C/D** mixed |
| **QV-RH** | Rental Health modules | 208–240 | 1 TITLE + TEXT | module labels, stale suffix, empty | 12–18 | **C** utils-coupled |
| **QV-DM** | Active damages | 243–266 | 1 TITLE + TEXT | section title, empty, type display | 4–6 | **B/C** P224 overlap |
| **QV-TI** | Tire profile | 292–342 | 2 TEXT + TITLE | section, CTA, 5 InfoTile labels | 8–10 | **C** P226 freeze |
| **QV-DO** | Documents | 345–364 | 1 TITLE | section title (+ raw machine fields) | 1–2 | **B** low leverage |
| **QV-TF** | Tool/Footer actions | 366–424 | 8 TITLE | 4 action title/subtitle pairs | 8–12 | **D** canonical |
| **QV-SE** | Empty/error/a11y | distributed | partial | loading skeletons, muted empties | bundle with owner | **D** |

**Category E (uncertain) = 0** — all resolved.

---

## 7. Quick Actions deep audit

**Location:** `OperatorVehicleQuickView.tsx` lines 106–168 (`{/* Quick actions */}` grid).

| Action | Visible label | Icon | Callback | Route/action ID | Permission | Visibility | Disabled |
|--------|--------------|------|----------|-----------------|------------|------------|----------|
| Pickup | `Pickup starten` | `ArrowUpRight` | `openPickup` → `openHandover({ bookingId, kind: 'PICKUP', booking })` | handover PICKUP | gate-derived | `pickupItem` truthy | `!data.pickupAction?.gate.allowed` |
| Return | `Return starten` | `ArrowDownLeft` | `openReturn` → `openHandover({ bookingId, kind: 'RETURN', booking })` | handover RETURN | gate-derived | `returnItem` truthy | `!data.returnAction?.gate.allowed` |
| Create booking | `Buchung für dieses Fahrzeug` | `CalendarPlus` | `openSheet({ type: 'booking-create', prefillVehicleId })` | sheet `booking-create` | none explicit | always | never |

**Subtitles:** `pickupItem.customerName` / `returnItem.customerName` / vehicle `label` — **dynamic business data (B)**.

**Gate reason suffix:** `resolveHandoverGateReason(locale, gate)` — **already localized**; machine gate codes unchanged.

**Tooltip/aria:** none explicit (button text only).

---

## 8. Quick Action machine contract

| Action | Machine fields (frozen) | Visible mapping? |
|--------|------------------------|------------------|
| Pickup | `kind: 'PICKUP'`, `bookingId`, `toHandoverBookingSeed(pickupItem)` | Label only |
| Return | `kind: 'RETURN'`, `bookingId`, `toHandoverBookingSeed(returnItem)` | Label only |
| Booking create | `type: 'booking-create'`, `prefillVehicleId: vehicle.id` | Label only |
| Gate | `gate.allowed`, `gate.reasonCode` (via resolver) | Reason presentation only |

---

## 9. Quick Action callback risk

| Action | Risk |
|--------|------|
| Pickup | **SAFE PRESENTATION-ONLY** |
| Return | **SAFE PRESENTATION-ONLY** |
| Create booking | **SAFE PRESENTATION-ONLY** |

`onClick` handler identity may change only via structural extraction; arguments, routes, and predicates must remain identical.

---

## 10. Quick Action local state

No menu/popover/sheet state in Quick Actions region. Visibility is data-driven (`pickupItem` / `returnItem`). **Same-mount locale switch:** no local state to preserve; disabled/visibility predicates unchanged.

---

## 11. Tool / Footer deep audit

**Location:** lines 366–424 + `ActionButton` helper (438–476).

| Button | Title | Subtitle | Callback |
|--------|-------|----------|----------|
| Damage | `Schaden aufnehmen` | `Foto, Typ & Position` | `openDamageCapture({ vehicleId, vehicleName, plate, bookingId?, skipVehicleConfirm: true })` |
| AI Upload | `AI Upload` | `Dokument scannen & bestätigen` | `openSheet({ type: 'ai-upload', vehicleId, vehicleLabel, bookingId?, contextMode: 'vehicle' })` |
| Tire measure | `Reifenprofil messen` | `Profiltiefe erfassen` | `openSheet({ type: 'tire-measure', vehicleId, vehicleLabel, onSuccess })` |
| Task create | `Aufgabe erstellen` | `Operative Aufgabe am Fahrzeug` | `openSheet({ type: 'task-create', vehicleId, vehicleLabel, bookingId?, onSuccess })` |

**Risk:** **SAFE PRESENTATION-ONLY** — overlaps P224/P226/task flows but callbacks frozen.

**Lower operational centrality than QV-QA** (secondary workflow entry vs primary handover/booking CTAs).

---

## 12. Booking / Customer context deep audit

**Section:** lines 171–181. **Hook:** `useOperatorVehicleQuickViewData` lines 162–217.

| Element | Source | Class |
|---------|--------|-------|
| Section title `Buchung` | parent JSX | **D** |
| Kind labels (`Abholung heute`, etc.) | hook `bookingContext.label` | **D** hidden debt |
| Customer name | API | **B** |
| Datetime | `formatOperatorDateTime` (`de-DE`) | **C** fixed locale |
| Station | API | **B** |
| `bookingId`, `status` | machine | **A** |

---

## 13. Booking date/time risk

`formatOperatorDateTime` in `operatorVehicleQuickView.utils.ts` uses `Intl.DateTimeFormat('de-DE', …)` regardless of UI locale. Future slice must preserve raw timestamps and comparison logic; only presentation may localize. **Not in QV-QA scope.**

---

## 14. Health / Damage / Tire summary audit

| Area | Presentation | Derivation | Risk |
|------|-------------|------------|------|
| Rental Health modules | `HEALTH_MODULE_LABELS`, `formatModuleRow` | API `health.modules` | **TOO COUPLED** for next slice |
| Active damages | `formatDamageType`, raw `severity`/`rentalImpact` | P224 domain | **SAFE WITH HARD FREEZE** |
| Tire summary | `tireUiStatusLabel` (default `de`), InfoTile labels | P226 semantics | **SAFE WITH HARD FREEZE** |

Do **not** reopen P226 tire workflow or canonical health derivation.

---

## 15. Health domain risk summary

| Residual | Verdict |
|----------|---------|
| QV-RH Rental Health | **TOO COUPLED** |
| QV-DM Damages | **SAFE WITH HARD FREEZE** |
| QV-TI Tire | **SAFE WITH HARD FREEZE** / **DEFER** |

---

## 16. Empty / Error / Accessibility residual

| String | Owner slice | Notes |
|--------|------------|-------|
| `Status nicht verfügbar.` | QV-RH | bundle with health |
| `Keine aktiven Schäden.` | QV-DM | bundle with damages |
| `Keine Reifendaten.` | QV-TI | bundle with tire |
| `Rental Health nicht geladen:` | QV-BL | bundle with blockers |
| Skeleton rows | multiple | no copy |

**Do not create one-string slice.**

---

## 17. Structural sub-slice decomposition

| Sub-slice | Files | Concepts | Machine | Callbacks | State | Est. keys | Fixed locale | Business risk | Testability | Recommendation |
|-----------|-------|----------|---------|-----------|-------|-----------|--------------|---------------|-------------|------------------|
| **QV-QA** | parent (+ extract) | 3 labels | handover kinds, sheet type | 3 frozen | none | 3–6 | 0 in slice | Low | High | **SAFE BOUNDED** |
| **QV-TF** | parent (+ extract) | 8 strings | sheet types | 4 frozen | none | 8–12 | 0 | Low–Med | High | **SAFE BOUNDED** |
| **QV-BC** | parent + hook | 5+ | booking kinds | 0 | none | 6–8 | datetime | Med | Med | **SAFE WITH EXTRA FREEZE** |
| **QV-BL** | parent + utils | 6+ | API reasons | 0 | none | 6–10 | contradictions DE | Med | Med | **SAFE WITH EXTRA FREEZE** |
| **QV-RH** | parent + utils | 15+ | health modules | 0 | loading | 15–20 | utils maps | High | Low | **TOO COUPLED** |
| **QV-TI** | parent + tire lib | 10+ | tire state | sheet open | loading | 8–12 | tire label de | Med | Med | **SAFE WITH HARD FREEZE** |
| **QV-DM** | parent | 4 | damage codes | 0 | loading | 4–6 | type formatter | Med | Med | **LOW VALUE** (P224) |

---

## 18. Quick Actions as P229 — boundedness test

| Criterion | Result |
|-----------|--------|
| Production files | **≤ 2** (extract + adapter extension) |
| Presentation concepts | **3** host-owned labels |
| New keys | **≤ 6** (2 reuse + 1–4 new) |
| Category E realistic | **0** |
| Callbacks freezeable | **YES** |

**Verdict: ONE SAFE SLICE** ✓

---

## 19. Tool/Footer as P229 — boundedness test

| Criterion | Result |
|-----------|--------|
| Production files | **≤ 2** |
| Concepts | **8** |
| Keys | **8–12** |
| Overlap with P224/P226 | manageable |

**Verdict: ONE SAFE SLICE** (lower leverage than QV-QA)

---

## 20. Booking Context as P229 — boundedness test

Requires hook + parent + datetime locale threading.

**Verdict: SPLIT REQUIRED** if selected alone (hook labels + section + formatter)

---

## 21. Health Summary as P229 — boundedness test

Touches `operatorVehicleQuickView.utils.ts` maps and API-derived rows.

**Verdict: TOO COUPLED**

---

## 22–28. Scoring (0–5)

| Sub-slice | Op. leverage | Machine sep. | Business risk ↑ | Boundedness | Testability | Collision | Residual quality |
|-----------|-------------|--------------|-----------------|-------------|-------------|-----------|------------------|
| **QV-QA** | **5** | **5** | **2** | **5** | **4** | **5** | **4** |
| **QV-TF** | 4 | 5 | 2 | 4 | 4 | 5 | 4 |
| **QV-BC** | 3 | 4 | 3 | 3 | 3 | 5 | 3 |
| **QV-BL** | 3 | 3 | 4 | 3 | 3 | 5 | 3 |
| **QV-RH** | 4 | 2 | 5 | 2 | 2 | 5 | 4 |
| **QV-TI** | 3 | 3 | 4 | 3 | 3 | 5 | 3 |
| **QV-DM** | 2 | 3 | 3 | 4 | 3 | 5 | 2 |

---

## 29. Remaining Quick View ranking

| Rank | Sub-slice | Exact files | Visible | Hidden | Fixed locale | Op.lev | Mach.sep | Bus.risk | Bounded | Test | Coll | Keys | Recommendation |
|------|-----------|-------------|---------|--------|--------------|--------|----------|----------|---------|------|------|------|----------------|
| **1** | **QV-QA Quick Actions** | `OperatorVehicleQuickView.tsx` (+ extract) | 3 | 0 | 0 | 5 | 5 | 2 | 5 | 4 | 5 | 3–6 | **SELECT P229** |
| 2 | QV-TF Tool/Footer | parent (+ extract) | 8 | 0 | 0 | 4 | 5 | 2 | 4 | 4 | 5 | 8–12 | Next after QA |
| 3 | QV-BC Booking context | parent + hook | 1 | 4 | 1 | 3 | 4 | 3 | 3 | 3 | 5 | 6–8 | Defer |
| 4 | QV-BL Blockers | parent + utils | 2 | 4 | 0 | 3 | 3 | 4 | 3 | 3 | 5 | 6–10 | Defer |
| 5 | QV-TI Tire | parent + tire lib | 3 | 5 | 1 | 3 | 3 | 4 | 3 | 3 | 5 | 8–12 | Defer (P226) |
| 6 | QV-RH Rental Health | parent + utils | 2 | 12 | 0 | 4 | 2 | 5 | 2 | 2 | 5 | 15–20 | Too coupled |
| 7 | QV-DM Damages | parent | 2 | 2 | 0 | 2 | 3 | 3 | 4 | 3 | 5 | 4–6 | Low value |
| 8 | QV-DO Documents | parent | 1 | 0 | 0 | 1 | 4 | 1 | 5 | 2 | 5 | 1–2 | Low value |

---

## 30. Best non-QV Operator alternatives (top 3)

| Rank | Surface | Files | Scanner | Scores (lev/bnd/risk) | Recommendation |
|------|---------|-------|---------|----------------------|----------------|
| 1 | Booking form sheet | `OperatorBookingFormSheet.tsx` | 16 | 4/3/4 | Strong but larger |
| 2 | Today view | `OperatorTodayView.tsx` | 12 | 5/2/3 | High leverage, less bounded |
| 3 | AI Upload flow | `OperatorAiUploadFlow.tsx` | 11 | 3/2/3 | Overlaps rental AI |

---

## 31. Vehicle/Fleet alternative

**Rental vehicles list filters** — residual in fleet views outside operator QV; bounded but lower operator-campaign coherence. **Defer** while QV campaign active.

---

## 32. Rental / Master alternative

| Domain | Surface | Files | Scanner |
|--------|---------|-------|---------|
| Rental | `DocumentsView.tsx` | 22 | bounded medium |
| Master | `HealthTrackingView.tsx` | 132 | not bounded |

**Strongest non-operator:** Rental DocumentsView — **not selected** (operator QV wins).

---

## 33. Top 12 cross-domain ranking

| Rank | Domain | Surface | Files | Active? | Vis | Hid | Fix | Op | MS | BR | Bnd | Tst | Col | Keys | Recommendation |
|------|--------|---------|-------|---------|-----|-----|-----|----|----|----|----|-----|-----|------|----------------|
| **1** | Operator/QV | Quick Actions | `OperatorVehicleQuickView.tsx` | yes | 3 | 0 | 0 | 5 | 5 | 2 | 5 | 4 | 5 | 3–6 | **P229** |
| 2 | Operator/QV | Tool/Footer | same parent | yes | 8 | 0 | 0 | 4 | 5 | 2 | 4 | 4 | 5 | 8–12 | Next QV |
| 3 | Operator | Booking form | `OperatorBookingFormSheet.tsx` | yes | 16 | ~5 | 0 | 4 | 3 | 4 | 3 | 3 | 4 | 25–40 | Alt operator |
| 4 | Operator | Today view | `OperatorTodayView.tsx` | yes | 12 | ~8 | 0 | 5 | 3 | 3 | 2 | 3 | 4 | 30+ | Alt operator |
| 5 | Operator/QV | Booking context | parent+hook | yes | 1 | 4 | 1 | 3 | 4 | 3 | 3 | 3 | 5 | 6–8 | Defer |
| 6 | Operator | AI Upload | `OperatorAiUploadFlow.tsx` | yes | 11 | ~5 | 0 | 3 | 3 | 3 | 2 | 3 | 3 | 20+ | Defer |
| 7 | Operator/QV | Blockers | parent+utils | yes | 2 | 4 | 0 | 3 | 3 | 4 | 3 | 3 | 5 | 6–10 | Defer |
| 8 | Rental | Documents | `DocumentsView.tsx` | yes | 22 | ~10 | 0 | 3 | 3 | 2 | 3 | 3 | 4 | 20–30 | Non-op alt |
| 9 | Operator/QV | Tire summary | parent+tire | yes | 3 | 5 | 1 | 3 | 3 | 4 | 3 | 3 | 5 | 8–12 | P226 freeze |
| 10 | Operator | More view | `OperatorMoreView.tsx` | yes | 9 | ~3 | 0 | 3 | 4 | 2 | 4 | 3 | 5 | 10–15 | Defer |
| 11 | Operator/QV | Rental Health | parent+utils | yes | 2 | 12 | 0 | 4 | 2 | 5 | 2 | 2 | 5 | 15–20 | Too coupled |
| 12 | Master | Health tracking | `HealthTrackingView.tsx` | yes | 132 | many | 0 | 2 | 2 | 4 | 1 | 2 | 5 | 100+ | Out of scope |

---

## 34. Quick View winner vs alternatives

| Comparison | Winner |
|------------|--------|
| Best remaining QV slice vs best non-QV Operator vs best non-Operator | **QUICK VIEW WINS** |

QV-QA scores highest on leverage × boundedness × machine separation with lowest business risk.

---

## 35. Campaign decision

**CONTINUE OPERATOR — VEHICLE QUICK VIEW**

---

## 36. Selected P2.2.29 target

**P2.2.29 — Operator Vehicle Quick View Quick Actions Localization**

---

## 37. One slice / split decision

**ONE SLICE**

---

## 38. Exact P229 production scope

| Path | Role | Presentation ownership | Machine/business | Why required |
|------|------|------------------------|------------------|--------------|
| `frontend/src/operator/components/OperatorVehicleQuickViewQuickActions.tsx` | **NEW** extracted subcomponent | 3 CTA labels, layout, icons | none — receives props | Bounded enforce-clean boundary |
| `frontend/src/operator/components/OperatorVehicleQuickView.tsx` | Parent host | wiring only post-extract | vehicleId, data hooks | Mount extracted component |
| `frontend/src/operator/lib/operator-vehicle-quick-view-i18n.ts` | Adapter | `operator.vehicleQuickView.quickActions.*` | none | Extend existing QV adapter |

**Out of scope for P229:** hook, utils, header, tasks, footer, health, tire, damages, documents.

---

## 39. Selected presentation inventory

| Concept | Current DE | Type |
|---------|-----------|------|
| Pickup CTA label | `Pickup starten` | label |
| Return CTA label | `Return starten` | label |
| Create booking CTA label | `Buchung für dieses Fahrzeug` | label |
| Pickup/return subtitle | customer name | **B** dynamic |
| Booking subtitle | vehicle model · plate | **B** dynamic |
| Gate reason suffix | via `resolveHandoverGateReason` | already i18n |

**Host-owned presentation concepts: 3** (labels only).

---

## 40. Machine/domain freeze

| Machine value | Used by | Visible mapping? | Must remain unchanged? |
|---------------|---------|------------------|------------------------|
| `vehicleId` | booking-create prefill | no | **YES** |
| `bookingId` | handover open | no | **YES** |
| `kind: 'PICKUP' \| 'RETURN'` | handover | no | **YES** |
| `openSheet.type: 'booking-create'` | shell | no | **YES** |
| `gate.allowed` / reason codes | disabled + suffix | mapped separately | **YES** |
| `pickupItem` / `returnItem` presence | visibility | no | **YES** |
| Customer names | subtitle | display only | **YES** (do not translate) |

---

## 41. Callback / route freeze

| Callback | Arguments (exact) |
|----------|-------------------|
| `openPickup` | `openHandover({ bookingId: pickupItem.bookingId, kind: 'PICKUP', booking: toHandoverBookingSeed(pickupItem) })` |
| `openReturn` | `openHandover({ bookingId: returnItem.bookingId, kind: 'RETURN', booking: toHandoverBookingSeed(returnItem) })` |
| booking CTA | `openSheet({ type: 'booking-create', prefillVehicleId: vehicle.id })` |

---

## 42. Permission freeze

No explicit permission checks in Quick Actions region. Visibility/disabled driven by data gates only — **unchanged**.

---

## 43. State preservation contract

No local UI state in QV-QA. Same-mount locale switch: button visibility/disabled unchanged; dynamic subtitles unchanged.

---

## 44. Dynamic business data freeze

Do **not** translate: customer names, vehicle model, license plate, gate machine codes.

---

## 45. Date/time freeze

QV-QA does not format dates. **N/A** for P229.

---

## 46. Existing Quick View adapter strategy

**EXTEND EXISTING ADAPTER** — add `operatorVehicleQuickViewQuickActions*` helpers to `operator-vehicle-quick-view-i18n.ts`.

Forbidden in adapter: callbacks, routing, permissions, predicates, API, health derivation.

---

## 47. Key reuse analysis

| Key | Class | Notes |
|-----|-------|-------|
| `vehicle.bookings.startPickup` | **exact reuse** | DE = `Pickup starten` |
| `vehicle.bookings.startReturn` | **exact reuse** | DE = `Return starten` |
| `handover.tab.startPickup` / `startReturn` | semantic duplicate | prefer `vehicle.bookings.*` (operator vehicle context) |
| `operator.vehicleQuickView.quickActions.createBooking.title` | **new** | booking CTA |
| `operator.vehicleQuickView.quickActions.createBooking.subtitle` | optional new | only if vehicle label needs pattern — likely **omit** (dynamic subtitle) |

**Estimated new keys: 1–3** (net +2 reuse wiring). **Well under 70 gate.**

---

## 48. Key growth gate

Estimated **≤ 6** total touch keys. **PASS** (≪ 70).

---

## 49. P229 enforce-clean boundary — critical

```
P229_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewQuickActions.tsx',  // NEW
  'operator/lib/operator-vehicle-quick-view-i18n.ts',              // shared adapter — quickActions section only guarded
]
```

**Strategy B** — narrow structural extraction of Quick Actions grid from parent. Parent `OperatorVehicleQuickView.tsx` **not** enforce-clean (contains later slices).

Forbidden: ignores, allowlists, exemptions, scanner weakening.

---

## 50. Optional structural extraction

**Required** for bounded enforce-clean. Extract lines 106–168 into `OperatorVehicleQuickViewQuickActions.tsx`.

**Freeze contract:** same props (pickup/return items, gates, vehicle id/label, callbacks), same classes, same render conditions, same disabled logic.

---

## 51. Blind-spot guards

Future guards/tests:

- No raw `Pickup starten` / `Return starten` / `Buchung für dieses Fahrzeug` in extracted file
- No new `../i18n/` compat shim consumers
- P229 enforce-clean inventory block in `hardcoded-copy-guard.test.ts`
- Grep: preserve `kind: 'PICKUP'`, `kind: 'RETURN'`, `booking-create`

---

## 52. Future test contract

`operator-vehicle-quick-view-quick-actions-localization.test.tsx`:

1. EN render — all 3 labels when pickup+return visible
2. DE render — matching DE dictionary
3. Same-mount DE → EN — labels swap; customer names unchanged
4. Same-mount EN → DE
5. `openHandover` / `openSheet` spy — args unchanged on click
6. Disabled state unchanged when gate disallowed
7. Pickup hidden when `pickupItem` null
8. No raw TranslationKey leakage

Mirror P227/P228 test patterns.

---

## 53. Category E contract

Diff against `59e3395e` must have:

- business/runtime semantic modifications = **0**
- Category E = **0**

QV-QA is presentation-only — **realistic**.

---

## 54. Global freeze contract

Future implementation preserves:

- `npm run i18n:check` = PASS
- GLOBAL ACTIVE ENFORCE-CLEAN DEBT = 0
- P228–P216 = 0
- CompanySections prior freeze clean

---

## 55. Shim / compatibility freeze

Current shim = **29**. Future: **new compatibility consumers = 0**, shim **≤ 29**. No shim cleanup in P229.

---

## 56. Active feature collision

| Active work | Overlap with P229 scope |
|-------------|------------------------|
| PR #1214 Communication Center C10 | **NONE** — rental CC/voice only |
| PR #1213 P228 re-audit | audit doc only |
| Open i18n audit PRs | docs only |

**Collision score: 5** — no direct production overlap.

---

## 57. Main drift check

`git rev-list --count 59e3395e..origin/main` = **82**

QV files on `origin/main` vs baseline:

- `OperatorVehicleQuickView.tsx` — **169 line delta** (P227/P228 extractions absent on main)
- `operator-vehicle-quick-view-i18n.ts` — **143 lines removed on main** (adapter missing)

**Main-drift collision for P229 production scope: HIGH**

Implementation **must** branch from `59e3395e` / `p228-authoritative-baseline-3c10`, not from `main`.

---

## 58. Implementation contract

**TITLE:** P2.2.29 — Operator Vehicle Quick View Quick Actions Localization

**AUTHORITATIVE BASE:** `59e3395eafff6de2e9d4301f1e806a24a35c9a31`

**IN SCOPE:**

- `OperatorVehicleQuickViewQuickActions.tsx` (new)
- `OperatorVehicleQuickView.tsx` (wiring/extract only)
- `operator-vehicle-quick-view-i18n.ts` (quickActions helpers)
- `en.ts` / `de.ts` keys
- localization test file
- P229 enforce-clean guard
- architecture/audit docs

**OUT OF SCOPE:**

- P227 Open Tasks, P228 Header/Status
- Tool/Footer, Booking context, Health, Tire, Damages, Documents
- Business logic, API, routing, permissions
- Shim cleanup, Communication Center

**Acceptance:** 25-point checklist per user spec (selected debt = 0, parity 100%, P229 = 0, Category E = 0, tests PASS, build PASS).

---

## 59. Audit artifact

This document: `docs/audits/i18n-p2-2-29-post-p228-quick-view-next-slice-preflight-2026-08-23.md`

---

## 60. Audit PR topology

| Field | Value |
|-------|-------|
| PR number | **#1215** |
| Base branch | `p228-authoritative-baseline-3c10` |
| Base SHA | `59e3395eafff6de2e9d4301f1e806a24a35c9a31` |
| Head branch | `cursor/p2229-post-p228-quick-view-next-slice-preflight-3c10` |
| Head SHA | `5390e577` (audit commit) |
| Commit count | **1** |
| Changed files | **1** (`docs/audits/…preflight-2026-08-23.md`) |
| Draft | **YES** |
| Mergeable | **YES** |
| Production modified | **NO** |
| Dictionaries modified | **NO** |
| Tests modified | **NO** |
| Scanner modified | **NO** |

---

## 61. Final report summary

See agent final report (71 fields).

---

## 62. Final verdict

# **A — GO — P2.2.29 TARGET SELECTED**

**Selected target:** P2.2.29 — Operator Vehicle Quick View **Quick Actions** Localization  
**Split:** ONE SLICE  
**Campaign:** CONTINUE OPERATOR — VEHICLE QUICK VIEW

---

*Read-only pre-flight. No production code, dictionaries, tests, or scanner modified.*
