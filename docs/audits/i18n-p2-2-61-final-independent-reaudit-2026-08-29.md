# P2.2.61 — Vehicle Damages Final Independent Re-Audit

**Date:** 2026-08-29  
**Mode:** STRICT READ-ONLY FINAL MERGE GATE  
**Implementation PR:** #1406 (not modified)  
**Reassessment PR:** #1408 (reference only)  
**Baseline:** `aa5c1f79826982fb1d4957026b0e3a5009a15c17`  
**Audited HEAD:** `c1bc56aaa58a858784dd5f6126d307be86ec4a9f`  
**Audit branch:** `cursor/p2261-final-independent-reaudit-3c10`

---

## Executive summary

| Gate | Result |
|------|--------|
| Topology | **PASS** |
| Correction commit scope | **PASS** |
| **350-key certification** | **FAIL** — 350 > 325 hard stop; 22 EN+DE exact reuse misses |
| Multi-locale formatter | **PASS** — canonical `getFormattingLocale()` |
| Pickup contract | **PASS** — `label` removed; adapter resolution only |
| Category E | **0** |
| Mutation evidence | **PASS** — 8 behavioral hook tests (ACCEPTABLE–STRONG) |
| Same-mount | **WEAK** — mount=1/mutations=0 pass; DE restoration assertion fails |
| Enforce-clean | **PASS** — 23 paths / 0 findings |
| Active mounted debt | **0** (scoped) |
| Focused test suite | **FAIL** — 1/44 tests failing (same-mount assertion) |
| Global validation | **PASS** (i18n, surface, typecheck, build, diff-check) |

### Final verdict

**C — MATERIAL KEY REDUCTION STILL REQUIRED**

### Merge recommendation

**DO NOT MERGE #1406** until key count ≤325 with documented irreducible justification and same-mount test repair.

---

## 1. Topology (#1406)

| Check | Result |
|-------|--------|
| open | true |
| Draft | true |
| merged | false |
| mergeable | MERGEABLE |
| base SHA | `aa5c1f79826982fb1d4957026b0e3a5009a15c17` ✓ |
| HEAD SHA | `c1bc56aaa58a858784dd5f6126d307be86ec4a9f` ✓ |
| commit count | **3** ✓ |
| implementation parent | `aa5c1f79` ✓ |
| #1405 ancestry | none ✓ |
| #1408 ancestry | none ✓ |

Commits: `699300c63`, `2467f0d8e`, `c1bc56aaa`

---

## 2. Correction commit forensics (`2467f0d8e` → `c1bc56aaa`)

16 files, +350/−59 lines. Scope limited to:

- Key reuse/removal (−10 dictionary keys)
- Canonical `getFormattingLocale()`
- Pickup contract cleanup (`PickupContextResult.label` removed)
- `useVehicleDamageActions.localization.test.ts` (8 behavioral tests)
- Localization test extensions (pl/fr/tr BCP47, shared-key reuse)
- `ChangesView` bookkeeping

**No unrelated business logic changes detected.**

---

## 3–4. 350-key certification and group accounting

**Total P261-owned keys: 350** (EN=DE parity 100%)

| Group | Count |
|-------|-------|
| header | 14 |
| summary | 27 |
| insights | 27 |
| queue | 27 |
| map/canvas | 16 |
| detail | 31 |
| rental sections | 36 |
| create | 21 |
| repair | 8 |
| repair task | 15 |
| priority | 3 |
| AI | 25 |
| photo | 8 |
| validation | 22 |
| errors | 9 |
| toasts | 22 |
| status | 4 |
| location | 5 |
| evidence | 4 |
| liability | 6 |
| pickup | 10 |
| filters | 5 |
| match confidence | 3 |
| a11y | 0 |
| other | 2 |
| **Total** | **350** |

All 350 keys have production callsites (direct or adapter-dynamic). **0 unused. 0 orphans.**

---

## 5. Reuse audit (EN+DE exact match)

**22 exact reuse misses** (identical EN and DE in canonical namespaces):

| Key | Existing candidate |
|-----|-------------------|
| `vehicleDamages.summary.badge.open` | `tasks.view.open` |
| `vehicleDamages.summary.oldestOneDay` | `tasks.form.duration1440` |
| `vehicleDamages.insights.repairDuration.oneDay` | `tasks.form.duration1440` |
| `vehicleDamages.queueFilter.open` | `tasks.view.open` |
| `vehicleDamages.status.OPEN` | `tasks.view.open` |
| `vehicleDamages.drawer.field.source` | `tasks.filter.sourceLabel` |
| `vehicleDamages.drawer.section.timeline` | `health.timeline` |
| `vehicleDamages.create.field.severity` | `health.observation.severity` |
| `vehicleDamages.create.field.description` | `tasks.form.description` |
| `vehicleDamages.aiIntake.field.description` | `tasks.form.description` |
| `vehicleDamages.aiIntake.field.type` | `tasks.detail.technical.type` |
| `vehicleDamages.repairTask.preview.title` | `tasks.form.title` |
| `vehicleDamages.repairTask.preview.priority` | `tasks.filter.sortPriority` |
| `vehicleDamages.repairTask.preview.vehicle` | `tasks.filter.vehicleLabel` |
| `vehicleDamages.repairTask.priority.HIGH` | `tasks.filter.priority.HIGH` |
| `vehicleDamages.repairTask.priority.NORMAL` | `tasks.filter.priority.NORMAL` |
| `vehicleDamages.repairTask.priority.LOW` | `tasks.filter.priority.LOW` |
| `vehicleDamages.rental.field.booking` | `tasks.entity.booking` |
| `vehicleDamages.rental.field.customer` | `tasks.entity.customer` |
| `vehicleDamages.rental.reportedByLine` | `tasks.detail.summary.completedBy` |
| `vehicleDamages.hostError.actionFailed` | `tasks.detail.toast.actionFailed` |
| `vehicleDamages.toast.actionFailed` | `tasks.detail.toast.actionFailed` |

**Operator reuse (adapter, 0 dict keys):** damageType, severity, rentalImpact, source via `operator.damageCapture.*`.

---

## 6. Internal duplication (25 groups)

Representative type-D unnecessary duplicates:

- `hostError.actionFailed` ↔ `toast.actionFailed`
- `summary.oldestOneDay` ↔ `insights.repairDuration.oneDay`
- `queueFilter.open` ↔ `status.OPEN` ↔ `summary.badge.open`
- `aiIntake.field.description` ↔ `create.field.description`
- `drawer.timeline.*` ↔ matching `toast.*` titles (6 pairs)

Many cross-surface duplicates are type-A (distinct ownership) but share identical copy.

---

## 7–8. Toast and field label models

- **9 toast title/description pairs** — 8 add unique operational detail; `depositPrepared` partially restates title
- **Generic field labels** — Description, Type, Severity, Source, Title, Priority, Vehicle, Booking, Customer duplicated vs `tasks.*`/`health.*`

---

## 9. Enum taxonomy

- damageType/severity/source/rentalImpact: **operator.damageCapture reuse** ✓
- status/evidence/liability/locationView/pickup/matchConfidence/repair priority: rental-local keys (no exact canonical enum elsewhere)

---

## 10. 350-key verdict and irreducible count

| Deduction | Keys |
|-----------|------|
| Current | 350 |
| EN+DE exact reuse misses | −22 |
| Internal duplicate consolidation (type B/D) | −8 |
| **Final irreducible estimate** | **~320** |

### 350-key verdict

**C — MATERIAL KEY REDUCTION STILL REQUIRED**

Current 350 exceeds 325 hard gate. Even aggressive consolidation lands ~320, not independently justified at 350.

---

## 11–12. Multi-locale formatter and tests

`vehicleDamagesFormattingLocale()` → `getFormattingLocale(resolveVehicleDamagesLocale())`

| Locale | Expected | Actual |
|--------|----------|--------|
| de | de-DE | de-DE ✓ |
| en | en-GB | en-GB ✓ |
| pl | pl-PL | pl-PL ✓ |
| fr | fr-FR | fr-FR ✓ |
| cs | cs-CZ | cs-CZ ✓ |
| nl | nl-NL | nl-NL ✓ |
| es | es-ES | es-ES ✓ |
| tr | tr-TR | tr-TR ✓ |
| it | it-IT | it-IT ✓ |

Tests cover de, en, pl, fr, tr (localization test).

---

## 13–15. Pickup context

- `PickupContextResult.label` **removed** ✓
- `reason`: typed `DamagePickupReasonCode`; resolved via `resolveDamagePickupReasonLabel`
- Callers: `DamagesView`, `DamageWorkQueue`, `DamageRentalSections`, `DamageDetailDrawer` — all display via adapter
- Matching thresholds, scores, source/handover checks: **zero semantic diff** vs baseline

---

## 16–22. Semantic parity

| Area | Parity |
|------|--------|
| Category E | **0** |
| Machine enums | unchanged |
| Tone mapping | unchanged |
| Filter predicates | unchanged |
| Sort order | unchanged |
| Insight thresholds | unchanged |
| Rental impact derivation | unchanged |
| Pickup derivation | unchanged |

---

## 23–24. Raw and error ownership

All fixtures preserved: description, liability note, location label, task title, image caption, backend error. Raw API error wins over host key.

---

## 25–32. Mutation evidence grades

| Mutation | Grade |
|----------|-------|
| create | **STRONG** |
| place | **STRONG** |
| IN_REPAIR / REPAIRED / ARCHIVED | **STRONG** |
| liability/cost | **STRONG** |
| photo | **STRONG** |
| repair task | **STRONG** |
| AI intake | **MISSING** (not behavioral; feature mocked off) |

**Mutation gate: PASS** for required surface (create/place/status/liability/photo/repair-task).

---

## 33–36. Same-mount

| Check | Evidence |
|-------|----------|
| mount count = 1 | ✓ |
| mutation counters = 0 | ✓ |
| selected damage | not asserted |
| queue filter | not asserted |
| drawer/dialog | not asserted |
| raw locationLabel | ✓ |
| DE restoration after EN | **FAIL** (assertion expects DE title; DOM still EN at 60ms) |

**Grade: WEAK**

---

## 37–39. Identity and enforce-clean

- No `key={locale}` / `key={t(...)}` anti-patterns
- 23 enforce-clean paths, **0 findings**
- Manual mounted audit: **0** host presentation debt in scope

---

## 40–41. Dictionary and scanner

| Metric | Value |
|--------|-------|
| Baseline EN/DE | 9239 / 9239 |
| Current EN/DE | **9589 / 9589** |
| New P261 keys | **350** |
| Correction removed | 10 |
| Parity | 100% |
| Unused/orphans | 0 |
| Global scanner | **1282** (−93 vs baseline 1375) |
| Rental scanner | **185** (−93 vs baseline 278) |
| Finance/Billing P261 | 0 |
| P261 enforce-clean | 0 |

---

## 42–46. Scope and collision

| Check | Result |
|-------|--------|
| Data Analyse | **0 diff** |
| Operator damages | **0 diff** |
| P260–P216 freeze | **0 semantic diff** |
| Main drift (P261 paths) | **DIRECT** (expected — PR implements P261) |
| Open PR collision | **NONE** identified |

---

## 47–49. Validation execution

| Check | Result |
|-------|--------|
| P261 localization (13) | 12 pass, **1 fail** (same-mount) |
| Mutation tests (8) | **PASS** |
| damage lib tests (12) | **PASS** |
| P260 regression | **PASS** |
| i18n:check | **PASS** |
| check:surface | **PASS** |
| typecheck | **PASS** |
| build | **PASS** |
| diff-check | **PASS** (zero output) |

---

## 50. Merge decision

**NOT MERGEABLE** — fails 350-key gate (>325), 22 exact reuse misses, same-mount test failure.

---

## 51. Minimal correction table (do not implement)

| Key/group | Current | Reuse candidate | Removable | Callsites |
|-----------|---------|-----------------|-----------|-----------|
| `hostError.actionFailed` + `toast.actionFailed` | duplicate | `tasks.detail.toast.actionFailed` | 1 | hooks |
| `summary.oldestOneDay` + `insights.repairDuration.oneDay` | duplicate | `tasks.form.duration1440` | 1 | summary, insights |
| `queueFilter.open` + `status.OPEN` + `summary.badge.open` | triplicate | `tasks.view.open` | 2 | queue, status, summary |
| `create/aiIntake.field.description` | duplicate | `tasks.form.description` | 1 | dialogs |
| `repairTask.priority.{HIGH,NORMAL,LOW}` | duplicate | `tasks.filter.priority.*` | 3 | repair dialog |
| `rental.field.{booking,customer}` | duplicate | `tasks.entity.*` | 2 | rental sections |
| Generic preview labels (title/priority/vehicle) | duplicate | `tasks.form.*` / `tasks.filter.*` | 3 | repair task |
| Toast timeline duplicates vs drawer.timeline | duplicate | shared timeline keys | ~4 | drawer, toast |
| Same-mount test | flaky DE assert | await locale settle | 0 | test only |

**Estimated removable: 28–32 keys → target ≤325**

---

## Full 350-key inventory (no sampling)

| key | EN | DE | callsite | mounted | host-owned | reuse |
|-----|----|----|----------|---------|------------|-------|
| `vehicleDamages.aiIntake.accept` | Accept | Annehmen | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.addPhoto` | Add photo | Foto hinzufügen | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.analyzePhotos` | Analyze photos | Fotos analysieren | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.analyzing` | Analyzing exterior photos… | Außenfotos werden analysiert… | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.confirmSelected` | Confirm selected | Ausgewählte bestätigen | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.confirmationWarning` | Needs operator confirmation — suggestions are not saved until you confirm. | Operator-Bestätigung erforderlich — Vorschläge werden erst nach Bestätigung gespeichert. | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.description` | AI-assisted intake reuses the document-extraction architecture. Suggestions require operator confirmation before any damage is saved. | KI-gestützte Erfassung nutzt die Document-Extraction-Architektur. Vorschläge erfordern Operator-Bestätigung, bevor ein Schaden gespeichert wird. | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.disabledBanner` | Exterior photo analysis is not enabled. For structured damage reports (invoices, police reports), use canonical Document Intake with human confirmation. | Außenfoto-Analyse ist nicht aktiviert. Für strukturierte Schadensberichte (Rechnungen, Polizeiberichte) nutzen Sie Document Intake mit menschlicher Bestätigung. | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.disabledReason` | Exterior photo analysis requires VITE_DAMAGE_AI_INTAKE_ENABLED and a deployed vision backend. Use AI Upload (DAMAGE documents) for damage reports. | Außenfoto-Analyse erfordert VITE_DAMAGE_AI_INTAKE_ENABLED und ein bereitgestelltes Vision-Backend. Für Schadensberichte nutzen Sie AI Upload (DAMAGE-Dokumente). | rental/components/DamagesView.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.done` | Confirmed damages were saved to the register. | Bestätigte Schäden wurden im Register gespeichert. | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.field.description` | Description | Beschreibung | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | REUSE_MISS:tasks.form.description |
| `vehicleDamages.aiIntake.field.pinX` | Pin X % | Pin X % | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.field.pinY` | Pin Y % | Pin Y % | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.field.rentalImpact` | Rental impact | Vermietungsauswirkung | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.field.severity` | Severity | Schweregrad | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.field.type` | Type | Typ | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | REUSE_MISS:tasks.detail.technical.type |
| `vehicleDamages.aiIntake.field.view` | View | Ansicht | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.invalidImage` | Invalid image | Ungültiges Bild | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.lowConfidence` | Low confidence | Niedrige Konfidenz | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.notAvailable` | Analysis not available | Analyse nicht verfügbar | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.notAvailableTitle` | Enable VITE_DAMAGE_AI_INTAKE_ENABLED when the analysis backend is deployed | Aktivieren Sie VITE_DAMAGE_AI_INTAKE_ENABLED, wenn das Analyse-Backend bereitgestellt ist | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.openDocumentIntake` | Open Document Intake (DAMAGE) | Document Intake öffnen (DAMAGE) | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.reject` | Reject | Ablehnen | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.saving` | Saving confirmed damages… | Bestätigte Schäden werden gespeichert… | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.suggestion` | AI suggestion | KI-Vorschlag | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.aiIntake.title` | Analyze exterior photos | Außenfotos analysieren | rental/components/damages/DamageAiIntakeDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.allPositioned` | All open damages are positioned on the map. | Alle offenen Schäden sind auf der Karte positioniert. | rental/components/damages/DamageEvidenceCanvas.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.description` | Vehicle views with positioned damage evidence. Pins reflect rental impact and repair status. | Fahrzeugansichten mit positionierten Schadensnachweisen. Pins spiegeln Vermietungsauswirkung und Reparaturstatus wider. | rental/components/damages/DamageEvidenceCanvas.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.imageSource.blueprint` | Blueprint fallback | Blueprint-Fallback | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.imageSource.model` | Model template | Modellvorlage | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.imageSource.vehicle` | Vehicle photo | Fahrzeugfoto | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.loadingPhotos` | Loading photos | Fotos werden geladen | rental/components/damages/DamageEvidenceCanvas.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.nextView` | Next view | Nächste Ansicht | rental/components/damages/DamageEvidenceCanvas.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.pinAria` | Damage {type} | Schaden {type} | rental/components/damages/DamageEvidenceCanvas.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.place` | Place | Platzieren | rental/components/damages/DamageEvidenceCanvas.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.placeOnPhoto` | Click on the {view} photo to place this damage. | Klicken Sie auf das {view}-Foto, um diesen Schaden zu platzieren. | rental/components/damages/DamageEvidenceCanvas.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.previousView` | Previous view | Vorherige Ansicht | rental/components/damages/DamageEvidenceCanvas.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.title` | Evidence canvas | Nachweis-Canvas | rental/components/damages/DamageEvidenceCanvas.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.unplacedDescription` | Open damages without a map position. Place them to appear on the canvas. | Offene Schäden ohne Kartenposition. Platzieren Sie sie, damit sie im Canvas erscheinen. | rental/components/damages/DamageEvidenceCanvas.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.unplacedTitle` | Unplaced damages ({count}) | Nicht platzierte Schäden ({count}) | rental/components/damages/DamageEvidenceCanvas.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.uploadBeforePlace` | Upload a {view} vehicle photo before placing (blueprint only). | Laden Sie zuerst ein {view}-Fahrzeugfoto hoch, bevor Sie platzieren (nur Blueprint). | rental/components/damages/DamageEvidenceCanvas.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.canvas.viewAlt` | {view} view | {view}-Ansicht | rental/components/damages/DamageEvidenceCanvas.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.addPhotos` | Add photos | Fotos hinzufügen | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.description` | Record operational damage. You can place it on the vehicle map and add more photos afterwards. | Operativen Schaden erfassen. Sie können ihn danach auf der Fahrzeugkarte platzieren und weitere Fotos hinzufügen. | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.field.coordX` | X % (0–100) | X % (0–100) | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.field.coordY` | Y % (0–100) | Y % (0–100) | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.field.damageType` | Damage type * | Schadenstyp * | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.field.description` | Description | Beschreibung | rental/components/damages/CreateDamageDialog.tsx | yes | yes | REUSE_MISS:tasks.form.description |
| `vehicleDamages.create.field.descriptionPlaceholder` | What happened, size, context… | Was ist passiert, Größe, Kontext… | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.field.estimatedCost` | Estimated repair cost (EUR) | Geschätzte Reparaturkosten (EUR) | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.field.estimatedCostPlaceholder` | e.g. 450.00 | z. B. 450,00 | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.field.locationLabel` | Location label (optional) | Positionsbezeichnung (optional) | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.field.locationView` | Location view | Positionsansicht | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.field.rentalImpact` | Rental impact | Vermietungsauswirkung | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.field.severity` | Severity * | Schweregrad * | rental/components/damages/CreateDamageDialog.tsx | yes | yes | REUSE_MISS:health.observation.severity |
| `vehicleDamages.create.locationLabelPlaceholder` | e.g. Front bumper left | z. B. Stoßstange vorne links | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.locationView.unknown` | Unknown / place later | Unbekannt / später platzieren | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.photos` | Photos (optional) | Fotos (optional) | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.photosHint` | JPG, PNG, WebP up to 6 MB each. | JPG, PNG, WebP bis 6 MB je Datei. | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.placeAfterCreate` | Place on vehicle map after create | Nach Erstellung auf Fahrzeugkarte platzieren | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.placementHint` | After create, placement mode opens on the {view} view. | Nach der Erstellung öffnet sich der Platzierungsmodus in der {view}-Ansicht. | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.submit` | Create damage | Schaden erstellen | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.submitting` | Creating… | Wird erstellt… | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.create.title` | Add damage | Schaden hinzufügen | rental/components/damages/CreateDamageDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.archive` | Archive | Archivieren | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.evidenceAlt` | Damage evidence | Schadensnachweis | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.eyebrow` | Damage record | Schadensdatensatz | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.field.evidence` | Evidence | Nachweis | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.field.rentalImpact` | Rental impact | Vermietungsauswirkung | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.field.severity` | Severity | Schweregrad | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.field.source` | Source | Quelle | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | REUSE_MISS:tasks.filter.sourceLabel |
| `vehicleDamages.drawer.locationMissing` | Position missing — not shown on map. | Position fehlt — nicht auf der Karte angezeigt. | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.markInRepair` | Mark in repair | In Reparatur markieren | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.markRepaired` | Mark repaired | Als repariert markieren | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.noDescription` | No description provided. | Keine Beschreibung vorhanden. | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.noPhotos` | No photos attached yet. | Noch keine Fotos angehängt. | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.noSelection` | No damage selected. | Kein Schaden ausgewählt. | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.openTask` | Open task | Auftrag öffnen | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.photoFallback` | Photo | Foto | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.placeOnVehicle` | Place on vehicle | Auf Fahrzeug platzieren | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.rentalBlockedBanner` | Rental blocked until this damage is resolved | Vermietung blockiert, bis dieser Schaden behoben ist | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.rentalBlockedHint` | Create a repair task to track workshop work and clear the rental gate after repair. | Erstellen Sie einen Reparaturauftrag, um Werkstattarbeit zu verfolgen und die Vermietungssperre nach der Reparatur aufzuheben. | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.repairTaskLinked` | Repair task linked | Reparaturauftrag verknüpft | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.safetyCriticalBanner` | Safety critical — vehicle must not be rented | Sicherheitskritisch — Fahrzeug darf nicht vermietet werden | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.section.evidencePhotos` | Evidence photos | Nachweisfotos | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.section.location` | Location | Position | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.section.timeline` | Timeline | Zeitverlauf | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | REUSE_MISS:health.timeline |
| `vehicleDamages.drawer.taskFallback` | Task {id} | Auftrag {id} | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.timeline.additionalPhoto` | Additional photo | Weiteres Foto | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.timeline.inRepair` | Marked in repair | In Reparatur markiert | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.timeline.photoAdded` | Photo added | Foto hinzugefügt | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.timeline.recorded` | Damage recorded | Schaden erfasst | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.timeline.repairCost` | Actual repair cost: {amount} | Tatsächliche Reparaturkosten: {amount} | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.timeline.repaired` | Marked repaired | Als repariert markiert | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.timeline.taskLinked` | Repair task linked | Reparaturauftrag verknüpft | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.drawer.title` | Damage detail | Schadendetail | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.error.title` | Damage control center unavailable | Schadenszentrale nicht verfügbar | rental/components/DamagesView.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.evidenceStatus.COMPLETE` | Complete | Vollständig | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.evidenceStatus.DISPUTED` | Disputed | Strittig | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.evidenceStatus.MISSING` | Missing | Fehlt | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.evidenceStatus.PARTIAL` | Partial | Teilweise | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.hostError.actionFailed` | Action failed | Aktion fehlgeschlagen | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | REUSE_MISS:tasks.detail.toast.actionFailed |
| `vehicleDamages.hostError.aiAnalysisFailed` | Exterior analysis unavailable | Außenanalyse nicht verfügbar | rental/hooks/useDamageAiIntake.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.hostError.aiConfirmFailed` | Confirmation failed | Bestätigung fehlgeschlagen | rental/hooks/useDamageAiIntake.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.hostError.loadFailed` | Damages could not be loaded. Please try again. | Schäden konnten nicht geladen werden. Bitte erneut versuchen. | rental/hooks/useVehicleDamages.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.hostError.noVehicle` | No vehicle selected. | Kein Fahrzeug ausgewählt. | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.hostError.orgMissing` | Organization context missing. | Organisationskontext fehlt. | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.hostError.refreshFailed` | Damages could not be refreshed. Your last loaded data is still shown. | Schäden konnten nicht aktualisiert werden. Die zuletzt geladenen Daten werden weiterhin angezeigt. | rental/hooks/useVehicleDamages.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.hostError.taskAlreadyLinked` | This damage already has a linked repair task. | Dieser Schaden hat bereits einen verknüpften Reparaturauftrag. | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.hostError.taskNotEligible` | This damage cannot receive a repair task. | Für diesen Schaden kann kein Reparaturauftrag erstellt werden. | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.avgRepair` | Avg repair time | Ø Reparaturdauer | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.avgRepairHint` | Based on {count} repaired case(s) | Basierend auf {count} reparierten Fall/Fällen | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.charged` | Charged to customer | Dem Kunden berechnet | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.chargedHint` | Recorded charges — not invoiced automatically | Erfasste Beträge — nicht automatisch fakturiert | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.evidence` | Evidence completion | Nachweisabdeckung | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.evidenceHint` | Active damages with at least partial photos | Aktive Schäden mit mindestens teilweisen Fotos | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.mostView` | Most damages | Meiste Schäden | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.mostViewHint` | {count} recorded | {count} erfasst | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.openEst` | Open estimated cost | Offene Schätzkosten | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.openEstHint` | Active damages only — not final repair cost | Nur aktive Schäden — keine endgültigen Reparaturkosten | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.repairTotal` | Total repair cost | Gesamte Reparaturkosten | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.repairTotalHint` | Recorded actual repair costs | Erfasste tatsächliche Reparaturkosten | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.repeat` | Repeat area | Wiederholungsbereich | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.repeatHint` | Clustered map positions | Geclusterte Kartenpositionen | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.trend` | Last 30 days | Letzte 30 Tage | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.trendHint` | Recent activity on this vehicle | Aktuelle Aktivität für dieses Fahrzeug | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.card.trendValue` | {opened} opened · {repaired} repaired | {opened} eröffnet · {repaired} repariert | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.cost.charged` | {amount} (charged) | {amount} (berechnet) | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.cost.estimated` | {amount} (est.) | {amount} (gesch.) | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.cost.repair` | {amount} (actual) | {amount} (tats.) | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.moreCount` | · +{count} more | · +{count} weitere | rental/components/damages/DamageInsightsSection.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.notEnoughData` | Not enough data yet for damage insights. | Noch nicht genug Daten für Schadens-Insights. | rental/components/damages/DamageInsightsSection.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.repairDuration.days` | {count} days | {count} Tage | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.repairDuration.lessThanDay` | <1 day | <1 Tag | rental/lib/damage-insights.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.repairDuration.oneDay` | 1 day | 1 Tag | rental/lib/damage-insights.ts | yes | yes | REUSE_MISS:tasks.form.duration1440 |
| `vehicleDamages.insights.title` | Damage insights | Schadens-Insights | rental/components/damages/DamageInsightsSection.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.insights.unavailable` | Damage insights are temporarily unavailable. Queue metrics above still reflect loaded damages. | Schadens-Insights sind vorübergehend nicht verfügbar. Die Queue-Kennzahlen oben basieren weiterhin auf geladenen Schäden. | rental/components/damages/DamageInsightsSection.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.liabilityStatus.COMPANY_RESPONSIBLE` | Company responsible | Unternehmen verantwortlich | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.liabilityStatus.CUSTOMER_RESPONSIBLE` | Customer responsible | Kunde verantwortlich | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.liabilityStatus.DISPUTED` | Disputed | Strittig | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.liabilityStatus.INSURANCE_CLAIM` | Insurance claim | Versicherungsfall | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.liabilityStatus.NEEDS_REVIEW` | Needs review | Prüfung nötig | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.liabilityStatus.NOT_APPLICABLE` | Not applicable | Nicht zutreffend | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.locationView.FRONT` | Front | Vorne | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.locationView.LEFT` | Left | Links | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.locationView.REAR` | Rear | Hinten | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.locationView.RIGHT` | Right | Rechts | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.locationView.ROOF` | Roof | Dach | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.markRepaired.confirm` | Confirm repaired | Repariert bestätigen | rental/components/damages/MarkRepairedDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.markRepaired.description` | Confirm repair completion. This moves the damage out of the open queue. | Reparaturabschluss bestätigen. Der Schaden wird aus der offenen Queue entfernt. | rental/components/damages/MarkRepairedDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.markRepaired.descriptionWithLabel` | Confirm repair completion for {label}. This moves the damage out of the open queue. | Reparaturabschluss für {label} bestätigen. Der Schaden wird aus der offenen Queue entfernt. | rental/components/damages/MarkRepairedDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.markRepaired.field.note` | Note (optional) | Notiz (optional) | rental/components/damages/MarkRepairedDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.markRepaired.field.repairCost` | Actual repair cost (EUR, optional) | Tatsächliche Reparaturkosten (EUR, optional) | rental/components/damages/MarkRepairedDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.markRepaired.field.repairCostPlaceholder` | e.g. 380.00 | z. B. 380,00 | rental/components/damages/MarkRepairedDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.markRepaired.notePlaceholder` | Workshop reference, parts replaced… | Werkstattreferenz, ausgetauschte Teile… | rental/components/damages/MarkRepairedDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.markRepaired.title` | Mark as repaired | Als repariert markieren | rental/components/damages/MarkRepairedDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.matchConfidence.high` | high | hoch | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.matchConfidence.low` | low | niedrig | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.matchConfidence.none` | none | keine | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.noVehicle.description` | Select a vehicle to open the damage control center. | Wählen Sie ein Fahrzeug, um die Schadenszentrale zu öffnen. | rental/components/DamagesView.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.photo.captionPlaceholder` | Caption (optional) | Bildunterschrift (optional) | rental/components/damages/AddDamagePhotoPanel.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.photo.chooseFile` | Choose file | Datei wählen | rental/components/damages/AddDamagePhotoPanel.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.photo.clear` | Clear | Leeren | rental/components/damages/AddDamagePhotoPanel.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.photo.hint` | JPG, PNG, WebP or GIF · max 6 MB | JPG, PNG, WebP oder GIF · max. 6 MB | rental/components/damages/AddDamagePhotoPanel.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.photo.previewAlt` | Upload preview | Upload-Vorschau | rental/components/damages/AddDamagePhotoPanel.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.photo.title` | Add evidence photo | Nachweisfoto hinzufügen | rental/components/damages/AddDamagePhotoPanel.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.photo.upload` | Upload photo | Foto hochladen | rental/components/damages/AddDamagePhotoPanel.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.photo.uploading` | Uploading… | Wird hochgeladen… | rental/components/damages/AddDamagePhotoPanel.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.pickupContext.NEEDS_REVIEW` | Needs review | Prüfung nötig | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.pickupContext.NEW_SINCE_PICKUP` | New since pickup | Neu seit Abholung | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.pickupContext.PRE_EXISTING` | Pre-existing | Vorschaden | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.pickupReason.NEW_SINCE_PICKUP` | Documented at return and not linked to pickup protocol. | Bei Rückgabe dokumentiert und nicht mit Abholprotokoll verknüpft. | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.pickupReason.NOT_LINKED_RETURN` | Not linked to a return handover. | Nicht mit einer Rückgabeübergabe verknüpft. | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.pickupReason.NO_DAMAGE_SELECTED` | No damage selected. | Kein Schaden ausgewählt. | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.pickupReason.PICKUP_HANDOVER_SOURCE` | Documented at pickup handover. | Bei Abholübergabe dokumentiert. | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.pickupReason.PICKUP_PROTOCOL_LISTED` | Listed on pickup handover protocol. | Im Abholübergabeprotokoll aufgeführt. | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.pickupReason.POSSIBLE_PICKUP_MATCH_HIGH` | Possible match to a pickup damage — confirm with operator. | Mögliche Übereinstimmung mit Abholschaden — vom Operator bestätigen lassen. | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.pickupReason.POSSIBLE_PICKUP_MATCH_LOW` | Weak match to pickup damage — operator review required. | Schwache Übereinstimmung mit Abholschaden — Operator-Prüfung erforderlich. | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.placementMode.hint` | Placement mode active for {view} view. Select the matching tab if needed, then click the vehicle photo. | Platzierungsmodus aktiv für Ansicht {view}. Wählen Sie bei Bedarf den passenden Tab und klicken Sie dann auf das Fahrzeugfoto. | rental/components/DamagesView.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.addDamage` | Add damage | Schaden hinzufügen | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.addFirstDamage` | Add first damage | Ersten Schaden hinzufügen | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.analyzeExteriorPhotos` | Analyze exterior photos | Außenfotos analysieren | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.analyzeExteriorPhotosTitle` | Upload exterior photos for AI-assisted damage suggestions | Außenfotos für KI-gestützte Schadensvorschläge hochladen | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.chip.blocksRental` | Blocks rental | Blockiert Vermietung | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.chip.disputed` | Disputed | Strittig | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.chip.needsLiabilityReview` | Needs liability review | Haftungsprüfung nötig | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.chip.noPhotos` | No photos | Keine Fotos | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.chip.safety` | Safety | Sicherheit | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.chip.taskLinked` | Task linked | Auftrag verknüpft | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.description` | Operational list sorted by rental impact, evidence gaps, and recency. | Operative Liste sortiert nach Vermietungsauswirkung, Nachweislücken und Aktualität. | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.empty.all.description` | This vehicle has no damage history yet. | Für dieses Fahrzeug liegt noch keine Schadenshistorie vor. | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.empty.all.title` | No damages recorded | Keine Schäden erfasst | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.empty.blocking.description` | No active damages currently block rental. | Keine aktiven Schäden blockieren derzeit die Vermietung. | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.empty.blocking.title` | No blocking damages | Keine blockierenden Schäden | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.empty.missing_evidence.description` | Photo evidence is present or not required for active cases. | Fotonachweise sind vorhanden oder für aktive Fälle nicht erforderlich. | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.empty.missing_evidence.title` | All active damages have evidence | Alle aktiven Schäden haben Nachweise | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.empty.open.description` | This vehicle has no open repair work in the queue. | Für dieses Fahrzeug liegt keine offene Reparaturarbeit in der Queue vor. | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.empty.open.title` | No active damages | Keine aktiven Schäden | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.empty.repaired.description` | Resolved damages will appear here after repair. | Behobene Schäden erscheinen hier nach der Reparatur. | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.empty.repaired.title` | No repaired damages yet | Noch keine reparierten Schäden | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.empty.unplaced.description` | Every open damage has a map position. | Jeder offene Schaden hat eine Kartenposition. | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.empty.unplaced.title` | All open damages are positioned | Alle offenen Schäden sind positioniert | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.positionMissing` | Position missing | Position fehlt | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.quickCreateTask` | Create repair task | Reparaturauftrag erstellen | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.quickMarkRepaired` | Mark repaired | Als repariert markieren | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.status.inRepair` | In repair | In Reparatur | rental/components/damages/DamageDetailDrawer.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queue.title` | Damage work queue | Schadens-Arbeitsliste | rental/components/damages/DamageWorkQueue.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queueFilter.blocking` | Blocking | Blockierend | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queueFilter.missing_evidence` | Missing evidence | Fehlende Nachweise | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queueFilter.open` | Open | Offen | adapter-dynamic | yes | yes | REUSE_MISS:tasks.view.open |
| `vehicleDamages.queueFilter.repaired` | Repaired | Repariert | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.queueFilter.unplaced` | Unplaced | Nicht platziert | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.actualRepairRecorded` | {amount} · recorded on repair | {amount} · bei Reparatur erfasst | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.billingHint` | Prepare amounts on the damage record only. Deposit retention and final invoice line items require the booking billing workflow (not triggered here). | Beträge nur auf dem Schadensdatensatz vorbereiten. Kautionseinbehalt und finale Rechnungspositionen erfordern den Buchungs-Abrechnungsworkflow (wird hier nicht ausgelöst). | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.bookingLine` | Booking: {id}… | Buchung: {id}… | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.chargeNotSet` | Not charged | Nicht berechnet | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.chargePrepared` | {amount} · not invoiced automatically | {amount} · nicht automatisch fakturiert | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.depositNotSet` | Not set | Nicht gesetzt | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.depositPlaceholder` | Requires booking link | Buchungsverknüpfung erforderlich | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.field.actualRepairCost` | Actual repair cost | Tatsächliche Reparaturkosten | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.field.booking` | Booking | Buchung | rental/components/damages/DamageRentalSections.tsx | yes | yes | REUSE_MISS:tasks.entity.booking |
| `vehicleDamages.rental.field.customer` | Customer | Kunde | rental/components/damages/DamageRentalSections.tsx | yes | yes | REUSE_MISS:tasks.entity.customer |
| `vehicleDamages.rental.field.customerCharge` | Customer charge (prepared) | Kundenbelastung (vorbereitet) | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.field.depositHold` | Deposit hold (recorded) | Kautionssperre (erfasst) | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.field.estimatedRepair` | Estimated repair | Geschätzte Reparatur | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.field.liabilityNote` | Reason / note | Begründung / Notiz | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.field.operatorDecision` | Operator decision | Operator-Entscheidung | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.field.pickupContext` | Pickup context | Abholkontext | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.field.prepareCharge` | Prepare customer charge (€) | Kundenbelastung vorbereiten (€) | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.field.prepareDeposit` | Prepare deposit hold (€) | Kautionssperre vorbereiten (€) | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.field.protocol` | Protocol | Protokoll | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.field.recordedVia` | Recorded via | Erfasst über | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.field.reportedBy` | Reported by | Gemeldet von | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.liabilityNotePlaceholder` | Document operator reasoning — never auto-assigned | Operator-Begründung dokumentieren — wird nie automatisch zugewiesen | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.pdfExportHint` | PDF export not connected — evidence is shown inline below. | PDF-Export nicht angebunden — Nachweise werden unten inline angezeigt. | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.photoCount` | {count} photo | {count} Foto | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.photoCountPlural` | {count} photos | {count} Fotos | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.prepareCharge` | Prepare customer charge | Kundenbelastung vorbereiten | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.prepareDeposit` | Prepare deposit hold | Kautionssperre vorbereiten | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.reportedAt` | Reported {date} | Gemeldet {date} | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.reportedByLine` | By {name} | Von {name} | rental/components/damages/DamageRentalSections.tsx | yes | yes | REUSE_MISS:tasks.detail.summary.completedBy |
| `vehicleDamages.rental.saveLiability` | Save liability decision | Haftungsentscheidung speichern | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.section.context` | Rental context | Mietkontext | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.section.costDeposit` | Cost & deposit | Kosten & Kaution | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.section.evidencePackage` | Evidence package | Nachweispaket | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.section.handover` | Handover context | Übergabekontext | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.section.liability` | Liability | Haftung | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rental.suggestedPickupMatch` | Suggested pickup match: {id}… ({confidence} confidence) — operator must confirm. | Vorgeschlagene Abholübereinstimmung: {id}… ({confidence} Konfidenz) — muss vom Operator bestätigt werden. | rental/components/damages/DamageRentalSections.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rentalGate.RENTABLE` | Vehicle rentable | Fahrzeug vermietbar | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.rentalGate.SAFETY_CRITICAL` | Safety critical | Sicherheitskritisch | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.repairTask.create` | Create task | Auftrag erstellen | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.repairTask.creating` | Creating… | Wird erstellt… | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.repairTask.description` | Creates an operational repair task linked to this {damageType} damage. | Erstellt einen operativen Reparaturauftrag, der mit diesem {damageType}-Schaden verknüpft ist. | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.repairTask.field.dueDate` | Due date (optional) | Fälligkeitsdatum (optional) | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.repairTask.field.note` | Additional note (optional) | Zusätzliche Notiz (optional) | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.repairTask.field.vendor` | Workshop / vendor (optional) | Werkstatt / Lieferant (optional) | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.repairTask.loadingVendors` | Loading vendors… | Lieferanten werden geladen… | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.repairTask.noDamage` | Select a damage record first. | Zuerst einen Schadensdatensatz auswählen. | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.repairTask.noVendor` | No vendor selected | Kein Lieferant ausgewählt | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.repairTask.notePlaceholder` | Instructions for the workshop or internal team | Anweisungen für Werkstatt oder internes Team | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.repairTask.preview.description` | Description preview | Beschreibungsvorschau | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.repairTask.preview.priority` | Priority | Priorität | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | REUSE_MISS:tasks.filter.sortPriority |
| `vehicleDamages.repairTask.preview.title` | Title | Titel | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | REUSE_MISS:tasks.form.title |
| `vehicleDamages.repairTask.preview.vehicle` | Vehicle | Fahrzeug | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | REUSE_MISS:tasks.filter.vehicleLabel |
| `vehicleDamages.repairTask.priority.HIGH` | High | Hoch | adapter-dynamic | yes | yes | REUSE_MISS:tasks.filter.priority.HIGH |
| `vehicleDamages.repairTask.priority.LOW` | Low | Niedrig | adapter-dynamic | yes | yes | REUSE_MISS:tasks.filter.priority.LOW |
| `vehicleDamages.repairTask.priority.NORMAL` | Medium | Mittel | adapter-dynamic | yes | yes | REUSE_MISS:tasks.filter.priority.NORMAL |
| `vehicleDamages.repairTask.title` | Create repair task | Reparaturauftrag erstellen | rental/components/damages/CreateRepairTaskDialog.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.status.ARCHIVED` | Archived | Archiviert | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.status.IN_REPAIR` | In repair | In Reparatur | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.status.OPEN` | Open | Offen | adapter-dynamic | yes | yes | REUSE_MISS:tasks.view.open |
| `vehicleDamages.status.REPAIRED` | Repaired | Repariert | adapter-dynamic | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.badge.blocking` | Blocking | Blockierend | rental/components/damages/damage-summary-display.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.badge.clear` | Clear | Unauffällig | rental/components/damages/damage-summary-display.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.badge.needsReview` | Needs review | Prüfung nötig | rental/components/damages/damage-summary-display.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.badge.open` | Open | Offen | rental/components/damages/damage-summary-display.ts | yes | yes | REUSE_MISS:tasks.view.open |
| `vehicleDamages.summary.badge.safetyCritical` | Safety critical | Sicherheitskritisch | rental/components/damages/damage-summary-display.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.createRepairTask` | Create repair task | Reparaturauftrag erstellen | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.creatingRepairTask` | Creating… | Wird erstellt… | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.kpi.blocking` | Blocking | Blockierend | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.kpi.estimatedCost` | Estimated cost | Geschätzte Kosten | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.kpi.missingEvidence` | Missing evidence | Fehlende Nachweise | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.kpi.oldestCase` | Oldest case | Ältester Fall | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.kpi.open` | Open damages | Offene Schäden | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.kpi.safetyCritical` | Safety critical | Sicherheitskritisch | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.kpi.unplaced` | Missing location | Fehlende Position | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.kpiHint.blocking` | Blocks bookings | Blockiert Buchungen | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.kpiHint.estimatedCost` | Open cases | Offene Fälle | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.kpiHint.missingEvidence` | No photos yet | Noch keine Fotos | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.kpiHint.oldestCase` | Days since report | Tage seit Meldung | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.kpiHint.open` | Active cases | Aktive Fälle | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.kpiHint.safetyCritical` | Immediate attention | Sofortige Aufmerksamkeit | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.kpiHint.unplaced` | No map position | Keine Kartenposition | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.oldestDays` | {count} days | {count} Tage | rental/components/damages/damage-control.utils.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.oldestOneDay` | 1 day | 1 Tag | rental/components/damages/damage-control.utils.ts | yes | yes | REUSE_MISS:tasks.form.duration1440 |
| `vehicleDamages.summary.rentalContext.blocked` | Rental may be blocked until resolved. | Vermietung kann bis zur Behebung blockiert sein. | rental/components/damages/damage-summary-display.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.rentalContext.watch` | Open damages under watch — rental still allowed. | Offene Schäden unter Beobachtung — Vermietung weiterhin möglich. | rental/components/damages/damage-summary-display.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.statusTitle` | Damage Status | Schadensstatus | rental/components/damages/DamageControlSummary.tsx | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.subtitle.blocking` | {count} blocking | {count} blockierend | rental/components/damages/damage-summary-display.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.subtitle.blockingOne` | 1 blocking | 1 blockierend | rental/components/damages/damage-summary-display.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.subtitle.noOpen` | No open damages | Keine offenen Schäden | rental/components/damages/damage-summary-display.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.subtitle.openCase` | 1 open damage case | 1 offener Schadensfall | rental/components/damages/damage-summary-display.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.subtitle.openCases` | {count} open damage cases | {count} offene Schadensfälle | rental/components/damages/damage-summary-display.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.subtitle.safetyCritical` | {count} safety critical | {count} sicherheitskritisch | rental/components/damages/damage-summary-display.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.subtitle.safetyCriticalOne` | 1 safety critical | 1 sicherheitskritisch | rental/components/damages/damage-summary-display.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.summary.zeroCost` | €0.00 | 0,00 € | rental/components/damages/damage-control.utils.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.actionFailed` | Action failed | Aktion fehlgeschlagen | rental/hooks/useVehicleDamageActions.ts | yes | yes | REUSE_MISS:tasks.detail.toast.actionFailed |
| `vehicleDamages.toast.archived` | Damage archived | Schaden archiviert | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.chargePrepared` | Customer charge prepared | Kundenbelastung vorbereitet | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.chargePreparedDescription` | Amount recorded on damage only — no invoice generated automatically. | Betrag nur auf Schaden erfasst — keine Rechnung automatisch erzeugt. | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.damagePositioned` | Damage positioned | Schaden positioniert | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.damagePositionedDescription` | {view} view · {x}%, {y}% | {view}-Ansicht · {x}%, {y}% | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.damageRecorded` | Damage recorded | Schaden erfasst | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.damageRecordedDescription` | Open the detail drawer to add photos or refine placement. | Öffnen Sie die Detailansicht, um Fotos hinzuzufügen oder die Platzierung zu verfeinern. | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.damagesCreated` | Damages created | Schäden erstellt | rental/hooks/useDamageAiIntake.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.damagesCreatedDescription` | {count} confirmed suggestion(s) saved. | {count} bestätigte Vorschläge gespeichert. | rental/hooks/useDamageAiIntake.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.depositPrepared` | Deposit hold prepared | Kautionssperre vorbereitet | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.depositPreparedDescription` | Amount recorded on damage only — deposit workflow not charged automatically. | Betrag nur auf Schaden erfasst — Kautionsworkflow nicht automatisch belastet. | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.liabilityUpdated` | Liability updated | Haftung aktualisiert | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.liabilityUpdatedDescription` | Operator decision saved — no automatic billing applied. | Operator-Entscheidung gespeichert — keine automatische Abrechnung angewendet. | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.markedInRepair` | Marked in repair | In Reparatur markiert | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.markedRepaired` | Damage marked repaired | Schaden als repariert markiert | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.markedRepairedDescription` | Moved to repaired history. | In reparierte Historie verschoben. | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.photoAdded` | Photo added | Foto hinzugefügt | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.photoAddedDescription` | Evidence gallery updated. | Nachweisgalerie aktualisiert. | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.repairTaskCreated` | Repair task created | Reparaturauftrag erstellt | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.repairTaskCreatedDescription` | Linked to this damage record. | Mit diesem Schadensdatensatz verknüpft. | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.toast.taskNotCreated` | Task not created | Auftrag nicht erstellt | rental/hooks/useVehicleDamageActions.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.aiPhotosRequired` | Add at least one exterior photo before analyzing. | Mindestens ein Außenfoto hinzufügen, bevor analysiert wird. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.aiSelectSuggestion` | Select at least one suggestion to confirm. | Mindestens einen Vorschlag zum Bestätigen auswählen. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.chargeAmountInvalid` | Charge amount must be zero or greater. | Belastungsbetrag muss null oder größer sein. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.chargePrepareFailed` | Could not prepare customer charge. | Kundenbelastung konnte nicht vorbereitet werden. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.coordinatesRange` | Coordinates must be between 0 and 100. | Koordinaten müssen zwischen 0 und 100 liegen. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.coordinatesRequired` | Enter X/Y coordinates (0–100) or choose “Place on map after create”. | X/Y-Koordinaten (0–100) eingeben oder „Nach Erstellung auf Karte platzieren“ wählen. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.createFailed` | Could not create damage. Check the form and try again. | Schaden konnte nicht erstellt werden. Formular prüfen und erneut versuchen. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.createTaskFailed` | Could not create repair task. Please try again. | Reparaturauftrag konnte nicht erstellt werden. Bitte erneut versuchen. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.damageTypeRequired` | Damage type is required. | Schadenstyp ist erforderlich. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.depositAmountInvalid` | Deposit amount must be zero or greater. | Kautionsbetrag muss null oder größer sein. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.depositPrepareFailed` | Could not prepare deposit hold. | Kautionssperre konnte nicht vorbereitet werden. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.descriptionMax` | Description must be at most {max} characters. | Beschreibung max. {max} Zeichen. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.drawerActionFailed` | Action failed. Please try again. | Aktion fehlgeschlagen. Bitte erneut versuchen. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.estimatedCostInvalid` | Estimated cost must be zero or greater. | Geschätzte Kosten müssen null oder größer sein. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.liabilitySaveFailed` | Could not save liability decision. | Haftungsentscheidung konnte nicht gespeichert werden. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.markRepairedFailed` | Could not mark as repaired. Please try again. | Konnte nicht als repariert markiert werden. Bitte erneut versuchen. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.photoTooLarge` | File too large (max {maxMb} MB). Compress before upload. | Datei zu groß (max. {maxMb} MB). Vor dem Upload komprimieren. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.photoUnsupportedFormat` | Unsupported format. Use JPG, PNG, WebP, or GIF. | Nicht unterstütztes Format. JPG, PNG, WebP oder GIF verwenden. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.photoUploadFailed` | Upload failed. Please try again. | Upload fehlgeschlagen. Bitte erneut versuchen. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.repairCostInvalid` | Repair cost must be zero or greater. | Reparaturkosten müssen null oder größer sein. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.sectionActionFailed` | Could not save liability decision. | Haftungsentscheidung konnte nicht gespeichert werden. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |
| `vehicleDamages.validation.severityRequired` | Severity is required. | Schweregrad ist erforderlich. | rental/lib/rental-vehicle-damages-i18n.ts | yes | yes | NEW_REQUIRED |

---

*Audit artifact only. Zero production changes.*
