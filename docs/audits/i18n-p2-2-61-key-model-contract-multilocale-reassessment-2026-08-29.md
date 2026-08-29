# P2.2.61 — Vehicle Damages Key-Model / Pickup-Context / Multi-Locale Reassessment

**Date:** 2026-08-29  
**Mode:** STRICT READ-ONLY REASSESSMENT  
**Implementation PR:** #1406 (Draft, open, unmerged — not modified by this audit)  
**Authoritative baseline:** `aa5c1f79826982fb1d4957026b0e3a5009a15c17`  
**Implementation HEAD:** `2467f0d8efe290b1a35c362c20edf26c30adcc21`  
**Pre-flight:** PR #1405 — A GO  
**Audit branch:** `cursor/p2261-damages-reassessment-3c10`

---

## Executive summary

| Gate | Result |
|------|--------|
| **360-KEY REASSESSMENT** | **FAIL** — 360 keys vs pre-flight ~115–130 / hard stop >150 |
| **PICKUP CONTEXT CONTRACT** | **FAIL** — `label`/`reason` return machine codes; contract shape changed (Category E = 1) |
| **SUPPORTED-LOCALE FORMATTER** | **FAIL** — `vehicleDamagesFormattingLocale()` collapses 7 non-DE locales to `en-GB` |
| **MUTATION EVIDENCE** | **FAIL** — static source inspection only; no real hook payload tests |
| **ENFORCE-CLEAN BOUNDARY** | **PASS** — 23 paths, 0 findings, sufficient for mounted stack |
| **FINAL SCANNER ACCOUNTING** | **PASS** — Global 1282 (−93), Rental 185 (−93), P261 scope 0 |

### Final verdict

**B — KEY REDUCTION REQUIRED BEFORE FINAL RE-AUDIT**

Secondary corrections also required: pickup-context contract normalization (C), multi-locale formatter (D), mutation/test evidence (E). PR #1406 remains unmerged.

### Key-model verdict

**C — MATERIAL KEY REDUCTION REQUIRED**

Irreducible estimate after reuse/consolidation: **~285–310 keys** (not 360).

---

## 1. Provenance (#1406)

| Check | Result |
|-------|--------|
| open | true |
| Draft | true |
| merged | false |
| mergeable | MERGEABLE |
| base SHA | `aa5c1f79826982fb1d4957026b0e3a5009a15c17` ✓ |
| head SHA | `2467f0d8efe290b1a35c362c20edf26c30adcc21` ✓ |
| commit count | 2 ✓ |
| commit 1 | `699300c63dcd003499d957f0ae7cc4d6b9227d48` |
| commit 2 | `2467f0d8efe290b1a35c362c20edf26c30adcc21` |
| first parent of 699300c63 | `aa5c1f79826982fb1d4957026b0e3a5009a15c17` ✓ |
| #1405 ancestry | none ✓ |
| main ancestry | none ✓ |

---

## 2. Complete diff forensics (37 paths)

| Class | Count | Notes |
|-------|-------|-------|
| **A** static presentation | ~28 files | Component/helper copy → `t('vehicleDamages.*')` |
| **B** machine→presentation adapter | 1 | `rental-vehicle-damages-i18n.ts` |
| **C** date/currency presentation | 2 | `formatDamageDateLocale`, `formatDamageEuroCents` |
| **D** raw fallback | preserved | description, liabilityNote, locationLabel, task title, image caption, backend error |
| **E** validation/error boundary | hooks | host-error refactor; validation codes typed |
| **F** hook output-shape | 1 | `PickupContextResult.reason` string → `DamagePickupReasonCode` |
| **G** domain return-model | 1 | `PickupContextResult.label` human → machine code duplicate of `context` |
| **H** machine/business semantics | **0** | enums, thresholds, predicates unchanged |
| **I** mutation payload | **0** | endpoints/payloads frozen |
| **J** filtering/sorting | **0** | machine-driven |
| **K** pickup derivation | presentation-only delta | matching logic zero diff; display codes only |
| **L** shared/operator blast | **0** | operator source files unchanged |
| **M** scanner/governance | 2 | enforce-clean registration |
| **N** tests/docs | 6 | localization + lib tests + audit/architecture |
| **O** frozen P260 | **0** | no P260 surface semantic change |
| **P** Data Analyse | **0** | zero diff |
| **Q** unrelated | **0** | |

**Equivalence proof (F/G/K/L):** Pickup matching thresholds (score ≥6/≥4), coordinate distance 12, rental impact derivation, filter predicates, and sort order are byte-identical in logic. UI resolves all pickup/rental labels through adapter before render.

---

## 3. 360-KEY HARD STOP

| Metric | Value |
|--------|-------|
| Pre-flight estimate | ~115–130 |
| Hard gate | >150 → STOP |
| Actual new keys | **360** |
| Independent justification | **NOT PROVEN** |

---

## 4–5. Key inventory and group accounting

### Group accounting (reconciles to 360)

| Group | Count |
|-------|-------|
| header | 7 |
| summary/KPI | 35 |
| insights | 27 |
| queue | 27 |
| canvas/map | 15 |
| detail drawer | 31 |
| rental sections | 37 |
| create dialog | 22 |
| repair dialog | 9 |
| repair-task dialog | 15 |
| repair-task priority | 4 |
| AI dialog | 26 |
| photo panel | 8 |
| validation | 22 |
| errors (hostError) | 9 |
| toasts | 22 |
| status | 4 |
| locationView | 6 |
| rentalImpact (rentalGate) | 4 |
| evidence | 4 |
| liability | 6 |
| queue filters | 6 |
| pickupContext | 3 |
| pickupReason | 7 |
| match confidence | 3 |
| a11y/tooltips/placeholders | 1 |
| **Total** | **360** |

**Note:** `damageType`, `severity`, `rentalImpact`, `source` machine labels reuse `operator.damageCapture.*` via adapter — **0 duplicate keys in dictionary**.

### Full 360-key inventory (no sampling)

| key | EN | DE | callsite | component/helper | mounted | host-owned | machine mapping | raw | exact reuse | duplicate | used | needed P261 |
|-----|----|----|----------|------------------|---------|------------|-----------------|-----|-------------|-----------|------|-------------|
| `vehicleDamages.aiIntake.accept` | Accept | Annehmen | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.addPhoto` | Add photo | Foto hinzufügen | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.analyzePhotos` | Analyze photos | Fotos analysieren | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.analyzing` | Analyzing exterior photos… | Außenfotos werden analysiert… | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.confirmSelected` | Confirm selected | Ausgewählte bestätigen | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.confirmationWarning` | Needs operator confirmation — suggestions are not saved until you confirm. | Operator-Bestätigung erforderlich — Vorschläge werden erst nach Bestätigung gespeichert. | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.description` | AI-assisted intake reuses the document-extraction architecture. Suggestions require operator confirmation before any damage is saved. | KI-gestützte Erfassung nutzt die Document-Extraction-Architektur. Vorschläge erfordern Operator-Bestätigung, bevor ein Schaden gespeichert wird. | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.disabledBanner` | Exterior photo analysis is not enabled. For structured damage reports (invoices, police reports), use canonical Document Intake with human confirmation. | Außenfoto-Analyse ist nicht aktiviert. Für strukturierte Schadensberichte (Rechnungen, Polizeiberichte) nutzen Sie Document Intake mit menschlicher Bestätigung. | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.disabledReason` | Exterior photo analysis requires VITE_DAMAGE_AI_INTAKE_ENABLED and a deployed vision backend. Use AI Upload (DAMAGE documents) for damage reports. | Außenfoto-Analyse erfordert VITE_DAMAGE_AI_INTAKE_ENABLED und ein bereitgestelltes Vision-Backend. Für Schadensberichte nutzen Sie AI Upload (DAMAGE-Dokumente). | rental/components/DamagesView.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.done` | Confirmed damages were saved to the register. | Bestätigte Schäden wurden im Register gespeichert. | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.field.description` | Description | Beschreibung | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.field.pinX` | Pin X % | Pin X % | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.field.pinY` | Pin Y % | Pin Y % | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.field.rentalImpact` | Rental impact | Vermietungsauswirkung | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.field.severity` | Severity | Schweregrad | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.field.type` | Type | Typ | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.field.view` | View | Ansicht | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.invalidImage` | Invalid image | Ungültiges Bild | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.lowConfidence` | Low confidence | Niedrige Konfidenz | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.notAvailable` | Analysis not available | Analyse nicht verfügbar | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.notAvailableTitle` | Enable VITE_DAMAGE_AI_INTAKE_ENABLED when the analysis backend is deployed | Aktivieren Sie VITE_DAMAGE_AI_INTAKE_ENABLED, wenn das Analyse-Backend bereitgestellt ist | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.openDocumentIntake` | Open Document Intake (DAMAGE) | Document Intake öffnen (DAMAGE) | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.reject` | Reject | Ablehnen | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.removePhoto` | Remove | Entfernen | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.saving` | Saving confirmed damages… | Bestätigte Schäden werden gespeichert… | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.suggestion` | AI suggestion | KI-Vorschlag | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.aiIntake.title` | Analyze exterior photos | Außenfotos analysieren | rental/components/damages/DamageAiIntakeDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.allPositioned` | All open damages are positioned on the map. | Alle offenen Schäden sind auf der Karte positioniert. | rental/components/damages/DamageEvidenceCanvas.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.description` | Vehicle views with positioned damage evidence. Pins reflect rental impact and repair status. | Fahrzeugansichten mit positionierten Schadensnachweisen. Pins spiegeln Vermietungsauswirkung und Reparaturstatus wider. | rental/components/damages/DamageEvidenceCanvas.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.imageSource.blueprint` | Blueprint fallback | Blueprint-Fallback | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.imageSource.model` | Model template | Modellvorlage | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.imageSource.vehicle` | Vehicle photo | Fahrzeugfoto | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.loadingPhotos` | Loading photos | Fotos werden geladen | rental/components/damages/DamageEvidenceCanvas.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.nextView` | Next view | Nächste Ansicht | rental/components/damages/DamageEvidenceCanvas.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.pinAria` | Damage {type} | Schaden {type} | rental/components/damages/DamageEvidenceCanvas.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.place` | Place | Platzieren | rental/components/damages/DamageEvidenceCanvas.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.placeOnPhoto` | Click on the {view} photo to place this damage. | Klicken Sie auf das {view}-Foto, um diesen Schaden zu platzieren. | rental/components/damages/DamageEvidenceCanvas.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.previousView` | Previous view | Vorherige Ansicht | rental/components/damages/DamageEvidenceCanvas.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.title` | Evidence canvas | Nachweis-Canvas | rental/components/damages/DamageEvidenceCanvas.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.unplacedDescription` | Open damages without a map position. Place them to appear on the canvas. | Offene Schäden ohne Kartenposition. Platzieren Sie sie, damit sie im Canvas erscheinen. | rental/components/damages/DamageEvidenceCanvas.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.unplacedTitle` | Unplaced damages ({count}) | Nicht platzierte Schäden ({count}) | rental/components/damages/DamageEvidenceCanvas.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.uploadBeforePlace` | Upload a {view} vehicle photo before placing (blueprint only). | Laden Sie zuerst ein {view}-Fahrzeugfoto hoch, bevor Sie platzieren (nur Blueprint). | rental/components/damages/DamageEvidenceCanvas.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.canvas.viewAlt` | {view} view | {view}-Ansicht | rental/components/damages/DamageEvidenceCanvas.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.addPhotos` | Add photos | Fotos hinzufügen | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.description` | Record operational damage. You can place it on the vehicle map and add more photos afterwards. | Operativen Schaden erfassen. Sie können ihn danach auf der Fahrzeugkarte platzieren und weitere Fotos hinzufügen. | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.field.coordX` | X % (0–100) | X % (0–100) | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.field.coordY` | Y % (0–100) | Y % (0–100) | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.field.damageType` | Damage type * | Schadenstyp * | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.field.description` | Description | Beschreibung | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.field.descriptionPlaceholder` | What happened, size, context… | Was ist passiert, Größe, Kontext… | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.field.estimatedCost` | Estimated repair cost (EUR) | Geschätzte Reparaturkosten (EUR) | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.field.estimatedCostPlaceholder` | e.g. 450.00 | z. B. 450,00 | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.field.locationLabel` | Location label (optional) | Positionsbezeichnung (optional) | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.field.locationView` | Location view | Positionsansicht | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.field.rentalImpact` | Rental impact | Vermietungsauswirkung | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.field.severity` | Severity * | Schweregrad * | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.locationLabelPlaceholder` | e.g. Front bumper left | z. B. Stoßstange vorne links | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.locationView.unknown` | Unknown / place later | Unbekannt / später platzieren | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.photos` | Photos (optional) | Fotos (optional) | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.photosHint` | JPG, PNG, WebP up to 6 MB each. | JPG, PNG, WebP bis 6 MB je Datei. | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.placeAfterCreate` | Place on vehicle map after create | Nach Erstellung auf Fahrzeugkarte platzieren | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.placementHint` | After create, placement mode opens on the {view} view. | Nach der Erstellung öffnet sich der Platzierungsmodus in der {view}-Ansicht. | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.removePhoto` | Remove | Entfernen | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.submit` | Create damage | Schaden erstellen | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.submitting` | Creating… | Wird erstellt… | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.create.title` | Add damage | Schaden hinzufügen | rental/components/damages/CreateDamageDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.archive` | Archive | Archivieren | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.evidenceAlt` | Damage evidence | Schadensnachweis | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.eyebrow` | Damage record | Schadensdatensatz | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.field.evidence` | Evidence | Nachweis | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.field.rentalImpact` | Rental impact | Vermietungsauswirkung | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.field.severity` | Severity | Schweregrad | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.field.source` | Source | Quelle | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.locationMissing` | Position missing — not shown on map. | Position fehlt — nicht auf der Karte angezeigt. | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.markInRepair` | Mark in repair | In Reparatur markieren | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.markRepaired` | Mark repaired | Als repariert markieren | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.noDescription` | No description provided. | Keine Beschreibung vorhanden. | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.noPhotos` | No photos attached yet. | Noch keine Fotos angehängt. | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.noSelection` | No damage selected. | Kein Schaden ausgewählt. | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.openTask` | Open task | Auftrag öffnen | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.photoFallback` | Photo | Foto | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.placeOnVehicle` | Place on vehicle | Auf Fahrzeug platzieren | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.rentalBlockedBanner` | Rental blocked until this damage is resolved | Vermietung blockiert, bis dieser Schaden behoben ist | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.rentalBlockedHint` | Create a repair task to track workshop work and clear the rental gate after repair. | Erstellen Sie einen Reparaturauftrag, um Werkstattarbeit zu verfolgen und die Vermietungssperre nach der Reparatur aufzuheben. | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.repairTaskLinked` | Repair task linked | Reparaturauftrag verknüpft | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.safetyCriticalBanner` | Safety critical — vehicle must not be rented | Sicherheitskritisch — Fahrzeug darf nicht vermietet werden | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.section.evidencePhotos` | Evidence photos | Nachweisfotos | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.section.location` | Location | Position | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.section.timeline` | Timeline | Zeitverlauf | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.taskFallback` | Task {id} | Auftrag {id} | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.timeline.additionalPhoto` | Additional photo | Weiteres Foto | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.timeline.inRepair` | Marked in repair | In Reparatur markiert | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.timeline.photoAdded` | Photo added | Foto hinzugefügt | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.timeline.recorded` | Damage recorded | Schaden erfasst | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.timeline.repairCost` | Actual repair cost: {amount} | Tatsächliche Reparaturkosten: {amount} | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.timeline.repaired` | Marked repaired | Als repariert markiert | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.timeline.taskLinked` | Repair task linked | Reparaturauftrag verknüpft | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.drawer.title` | Damage detail | Schadendetail | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.error.title` | Damage control center unavailable | Schadenszentrale nicht verfügbar | rental/components/DamagesView.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.evidenceStatus.COMPLETE` | Complete | Vollständig | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.evidenceStatus.DISPUTED` | Disputed | Strittig | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.evidenceStatus.MISSING` | Missing | Fehlt | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.evidenceStatus.PARTIAL` | Partial | Teilweise | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.hostError.actionFailed` | Action failed | Aktion fehlgeschlagen | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.hostError.aiAnalysisFailed` | Exterior analysis unavailable | Außenanalyse nicht verfügbar | rental/hooks/useDamageAiIntake.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.hostError.aiConfirmFailed` | Confirmation failed | Bestätigung fehlgeschlagen | rental/hooks/useDamageAiIntake.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.hostError.loadFailed` | Damages could not be loaded. Please try again. | Schäden konnten nicht geladen werden. Bitte erneut versuchen. | rental/hooks/useVehicleDamages.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.hostError.noVehicle` | No vehicle selected. | Kein Fahrzeug ausgewählt. | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.hostError.orgMissing` | Organization context missing. | Organisationskontext fehlt. | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.hostError.refreshFailed` | Damages could not be refreshed. Your last loaded data is still shown. | Schäden konnten nicht aktualisiert werden. Die zuletzt geladenen Daten werden weiterhin angezeigt. | rental/hooks/useVehicleDamages.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.hostError.taskAlreadyLinked` | This damage already has a linked repair task. | Dieser Schaden hat bereits einen verknüpften Reparaturauftrag. | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.hostError.taskNotEligible` | This damage cannot receive a repair task. | Für diesen Schaden kann kein Reparaturauftrag erstellt werden. | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.avgRepair` | Avg repair time | Ø Reparaturdauer | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.avgRepairHint` | Based on {count} repaired case(s) | Basierend auf {count} reparierten Fall/Fällen | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.charged` | Charged to customer | Dem Kunden berechnet | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.chargedHint` | Recorded charges — not invoiced automatically | Erfasste Beträge — nicht automatisch fakturiert | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.evidence` | Evidence completion | Nachweisabdeckung | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.evidenceHint` | Active damages with at least partial photos | Aktive Schäden mit mindestens teilweisen Fotos | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.mostView` | Most damages | Meiste Schäden | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.mostViewHint` | {count} recorded | {count} erfasst | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.openEst` | Open estimated cost | Offene Schätzkosten | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.openEstHint` | Active damages only — not final repair cost | Nur aktive Schäden — keine endgültigen Reparaturkosten | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.repairTotal` | Total repair cost | Gesamte Reparaturkosten | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.repairTotalHint` | Recorded actual repair costs | Erfasste tatsächliche Reparaturkosten | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.repeat` | Repeat area | Wiederholungsbereich | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.repeatHint` | Clustered map positions | Geclusterte Kartenpositionen | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.trend` | Last 30 days | Letzte 30 Tage | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.trendHint` | Recent activity on this vehicle | Aktuelle Aktivität für dieses Fahrzeug | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.card.trendValue` | {opened} opened · {repaired} repaired | {opened} eröffnet · {repaired} repariert | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.cost.charged` | {amount} (charged) | {amount} (berechnet) | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.cost.estimated` | {amount} (est.) | {amount} (gesch.) | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.cost.repair` | {amount} (actual) | {amount} (tats.) | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.moreCount` | · +{count} more | · +{count} weitere | rental/components/damages/DamageInsightsSection.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.notEnoughData` | Not enough data yet for damage insights. | Noch nicht genug Daten für Schadens-Insights. | rental/components/damages/DamageInsightsSection.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.repairDuration.days` | {count} days | {count} Tage | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.repairDuration.lessThanDay` | <1 day | <1 Tag | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.repairDuration.oneDay` | 1 day | 1 Tag | rental/lib/damage-insights.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.title` | Damage insights | Schadens-Insights | rental/components/damages/DamageInsightsSection.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.insights.unavailable` | Damage insights are temporarily unavailable. Queue metrics above still reflect loaded damages. | Schadens-Insights sind vorübergehend nicht verfügbar. Die Queue-Kennzahlen oben basieren weiterhin auf geladenen Schäden. | rental/components/damages/DamageInsightsSection.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.liabilityStatus.COMPANY_RESPONSIBLE` | Company responsible | Unternehmen verantwortlich | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.liabilityStatus.CUSTOMER_RESPONSIBLE` | Customer responsible | Kunde verantwortlich | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.liabilityStatus.DISPUTED` | Disputed | Strittig | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.liabilityStatus.INSURANCE_CLAIM` | Insurance claim | Versicherungsfall | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.liabilityStatus.NEEDS_REVIEW` | Needs review | Prüfung nötig | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.liabilityStatus.NOT_APPLICABLE` | Not applicable | Nicht zutreffend | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.locationView.FRONT` | Front | Vorne | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.locationView.LEFT` | Left | Links | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.locationView.REAR` | Rear | Hinten | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.locationView.RIGHT` | Right | Rechts | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.locationView.ROOF` | Roof | Dach | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.locationView.UNKNOWN` | Unknown | Unbekannt | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.markRepaired.confirm` | Confirm repaired | Repariert bestätigen | rental/components/damages/MarkRepairedDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.markRepaired.description` | Confirm repair completion. This moves the damage out of the open queue. | Reparaturabschluss bestätigen. Der Schaden wird aus der offenen Queue entfernt. | rental/components/damages/MarkRepairedDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.markRepaired.descriptionWithLabel` | Confirm repair completion for {label}. This moves the damage out of the open queue. | Reparaturabschluss für {label} bestätigen. Der Schaden wird aus der offenen Queue entfernt. | rental/components/damages/MarkRepairedDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.markRepaired.field.note` | Note (optional) | Notiz (optional) | rental/components/damages/MarkRepairedDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.markRepaired.field.repairCost` | Actual repair cost (EUR, optional) | Tatsächliche Reparaturkosten (EUR, optional) | rental/components/damages/MarkRepairedDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.markRepaired.field.repairCostPlaceholder` | e.g. 380.00 | z. B. 380,00 | rental/components/damages/MarkRepairedDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.markRepaired.notePlaceholder` | Workshop reference, parts replaced… | Werkstattreferenz, ausgetauschte Teile… | rental/components/damages/MarkRepairedDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.markRepaired.saving` | Saving… | Wird gespeichert… | rental/components/damages/MarkRepairedDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.markRepaired.title` | Mark as repaired | Als repariert markieren | rental/components/damages/MarkRepairedDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.matchConfidence.high` | high | hoch | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.matchConfidence.low` | low | niedrig | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.matchConfidence.none` | none | keine | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.noVehicle.description` | Select a vehicle to open the damage control center. | Wählen Sie ein Fahrzeug, um die Schadenszentrale zu öffnen. | rental/components/DamagesView.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.photo.captionPlaceholder` | Caption (optional) | Bildunterschrift (optional) | rental/components/damages/AddDamagePhotoPanel.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.photo.chooseFile` | Choose file | Datei wählen | rental/components/damages/AddDamagePhotoPanel.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.photo.clear` | Clear | Leeren | rental/components/damages/AddDamagePhotoPanel.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.photo.hint` | JPG, PNG, WebP or GIF · max 6 MB | JPG, PNG, WebP oder GIF · max. 6 MB | rental/components/damages/AddDamagePhotoPanel.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.photo.previewAlt` | Upload preview | Upload-Vorschau | rental/components/damages/AddDamagePhotoPanel.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.photo.title` | Add evidence photo | Nachweisfoto hinzufügen | rental/components/damages/AddDamagePhotoPanel.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.photo.upload` | Upload photo | Foto hochladen | rental/components/damages/AddDamagePhotoPanel.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.photo.uploading` | Uploading… | Wird hochgeladen… | rental/components/damages/AddDamagePhotoPanel.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.pickupContext.NEEDS_REVIEW` | Needs review | Prüfung nötig | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.pickupContext.NEW_SINCE_PICKUP` | New since pickup | Neu seit Abholung | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.pickupContext.PRE_EXISTING` | Pre-existing | Vorschaden | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.pickupReason.NEW_SINCE_PICKUP` | Documented at return and not linked to pickup protocol. | Bei Rückgabe dokumentiert und nicht mit Abholprotokoll verknüpft. | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.pickupReason.NOT_LINKED_RETURN` | Not linked to a return handover. | Nicht mit einer Rückgabeübergabe verknüpft. | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.pickupReason.NO_DAMAGE_SELECTED` | No damage selected. | Kein Schaden ausgewählt. | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.pickupReason.PICKUP_HANDOVER_SOURCE` | Documented at pickup handover. | Bei Abholübergabe dokumentiert. | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.pickupReason.PICKUP_PROTOCOL_LISTED` | Listed on pickup handover protocol. | Im Abholübergabeprotokoll aufgeführt. | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.pickupReason.POSSIBLE_PICKUP_MATCH_HIGH` | Possible match to a pickup damage — confirm with operator. | Mögliche Übereinstimmung mit Abholschaden — vom Operator bestätigen lassen. | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.pickupReason.POSSIBLE_PICKUP_MATCH_LOW` | Weak match to pickup damage — operator review required. | Schwache Übereinstimmung mit Abholschaden — Operator-Prüfung erforderlich. | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.placementMode.hint` | Placement mode active for {view} view. Select the matching tab if needed, then click the vehicle photo. | Platzierungsmodus aktiv für Ansicht {view}. Wählen Sie bei Bedarf den passenden Tab und klicken Sie dann auf das Fahrzeugfoto. | rental/components/DamagesView.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.addDamage` | Add damage | Schaden hinzufügen | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.addFirstDamage` | Add first damage | Ersten Schaden hinzufügen | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.analyzeExteriorPhotos` | Analyze exterior photos | Außenfotos analysieren | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.analyzeExteriorPhotosTitle` | Upload exterior photos for AI-assisted damage suggestions | Außenfotos für KI-gestützte Schadensvorschläge hochladen | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.chip.blocksRental` | Blocks rental | Blockiert Vermietung | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.chip.disputed` | Disputed | Strittig | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.chip.needsLiabilityReview` | Needs liability review | Haftungsprüfung nötig | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.chip.noPhotos` | No photos | Keine Fotos | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.chip.safety` | Safety | Sicherheit | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.chip.taskLinked` | Task linked | Auftrag verknüpft | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.description` | Operational list sorted by rental impact, evidence gaps, and recency. | Operative Liste sortiert nach Vermietungsauswirkung, Nachweislücken und Aktualität. | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.empty.all.description` | This vehicle has no damage history yet. | Für dieses Fahrzeug liegt noch keine Schadenshistorie vor. | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.empty.all.title` | No damages recorded | Keine Schäden erfasst | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.empty.blocking.description` | No active damages currently block rental. | Keine aktiven Schäden blockieren derzeit die Vermietung. | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.empty.blocking.title` | No blocking damages | Keine blockierenden Schäden | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.empty.missing_evidence.description` | Photo evidence is present or not required for active cases. | Fotonachweise sind vorhanden oder für aktive Fälle nicht erforderlich. | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.empty.missing_evidence.title` | All active damages have evidence | Alle aktiven Schäden haben Nachweise | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.empty.open.description` | This vehicle has no open repair work in the queue. | Für dieses Fahrzeug liegt keine offene Reparaturarbeit in der Queue vor. | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.empty.open.title` | No active damages | Keine aktiven Schäden | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.empty.repaired.description` | Resolved damages will appear here after repair. | Behobene Schäden erscheinen hier nach der Reparatur. | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.empty.repaired.title` | No repaired damages yet | Noch keine reparierten Schäden | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.empty.unplaced.description` | Every open damage has a map position. | Jeder offene Schaden hat eine Kartenposition. | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.empty.unplaced.title` | All open damages are positioned | Alle offenen Schäden sind positioniert | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.positionMissing` | Position missing | Position fehlt | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.quickCreateTask` | Create repair task | Reparaturauftrag erstellen | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.quickMarkRepaired` | Mark repaired | Als repariert markieren | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.status.inRepair` | In repair | In Reparatur | rental/components/damages/DamageDetailDrawer.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queue.title` | Damage work queue | Schadens-Arbeitsliste | rental/components/damages/DamageWorkQueue.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.queueFilter.all` | All | Alle | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.queueFilter.blocking` | Blocking | Blockierend | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.queueFilter.missing_evidence` | Missing evidence | Fehlende Nachweise | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.queueFilter.open` | Open | Offen | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.queueFilter.repaired` | Repaired | Repariert | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.queueFilter.unplaced` | Unplaced | Nicht platziert | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.actualRepairRecorded` | {amount} · recorded on repair | {amount} · bei Reparatur erfasst | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.billingHint` | Prepare amounts on the damage record only. Deposit retention and final invoice line items require the booking billing workflow (not triggered here). | Beträge nur auf dem Schadensdatensatz vorbereiten. Kautionseinbehalt und finale Rechnungspositionen erfordern den Buchungs-Abrechnungsworkflow (wird hier nicht ausgelöst). | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.bookingLine` | Booking: {id}… | Buchung: {id}… | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.chargeNotSet` | Not charged | Nicht berechnet | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.chargePrepared` | {amount} · not invoiced automatically | {amount} · nicht automatisch fakturiert | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.depositNotSet` | Not set | Nicht gesetzt | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.depositPlaceholder` | Requires booking link | Buchungsverknüpfung erforderlich | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.actualRepairCost` | Actual repair cost | Tatsächliche Reparaturkosten | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.booking` | Booking | Buchung | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.customer` | Customer | Kunde | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.customerCharge` | Customer charge (prepared) | Kundenbelastung (vorbereitet) | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.depositHold` | Deposit hold (recorded) | Kautionssperre (erfasst) | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.estimatedRepair` | Estimated repair | Geschätzte Reparatur | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.liabilityNote` | Reason / note | Begründung / Notiz | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.operatorDecision` | Operator decision | Operator-Entscheidung | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.pickupContext` | Pickup context | Abholkontext | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.prepareCharge` | Prepare customer charge (€) | Kundenbelastung vorbereiten (€) | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.prepareDeposit` | Prepare deposit hold (€) | Kautionssperre vorbereiten (€) | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.protocol` | Protocol | Protokoll | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.recordedVia` | Recorded via | Erfasst über | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.reportedBy` | Reported by | Gemeldet von | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.field.status` | Status | Status | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.liabilityNotePlaceholder` | Document operator reasoning — never auto-assigned | Operator-Begründung dokumentieren — wird nie automatisch zugewiesen | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.pdfExportHint` | PDF export not connected — evidence is shown inline below. | PDF-Export nicht angebunden — Nachweise werden unten inline angezeigt. | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.photoCount` | {count} photo | {count} Foto | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.photoCountPlural` | {count} photos | {count} Fotos | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.prepareCharge` | Prepare customer charge | Kundenbelastung vorbereiten | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.prepareDeposit` | Prepare deposit hold | Kautionssperre vorbereiten | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.reportedAt` | Reported {date} | Gemeldet {date} | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.reportedByLine` | By {name} | Von {name} | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.saveLiability` | Save liability decision | Haftungsentscheidung speichern | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.section.context` | Rental context | Mietkontext | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.section.costDeposit` | Cost & deposit | Kosten & Kaution | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.section.evidencePackage` | Evidence package | Nachweispaket | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.section.handover` | Handover context | Übergabekontext | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.section.liability` | Liability | Haftung | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rental.suggestedPickupMatch` | Suggested pickup match: {id}… ({confidence} confidence) — operator must confirm. | Vorgeschlagene Abholübereinstimmung: {id}… ({confidence} Konfidenz) — muss vom Operator bestätigt werden. | rental/components/damages/DamageRentalSections.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.rentalGate.RENTABLE` | Vehicle rentable | Fahrzeug vermietbar | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.rentalGate.RENTAL_BLOCKED` | Rental blocked | Vermietung blockiert | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.rentalGate.SAFETY_CRITICAL` | Safety critical | Sicherheitskritisch | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.rentalGate.WATCH` | Watch | Beobachten | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.create` | Create task | Auftrag erstellen | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.creating` | Creating… | Wird erstellt… | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.description` | Creates an operational repair task linked to this {damageType} damage. | Erstellt einen operativen Reparaturauftrag, der mit diesem {damageType}-Schaden verknüpft ist. | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.field.dueDate` | Due date (optional) | Fälligkeitsdatum (optional) | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.field.note` | Additional note (optional) | Zusätzliche Notiz (optional) | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.field.vendor` | Workshop / vendor (optional) | Werkstatt / Lieferant (optional) | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.loadingVendors` | Loading vendors… | Lieferanten werden geladen… | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.noDamage` | Select a damage record first. | Zuerst einen Schadensdatensatz auswählen. | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.noVendor` | No vendor selected | Kein Lieferant ausgewählt | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.notePlaceholder` | Instructions for the workshop or internal team | Anweisungen für Werkstatt oder internes Team | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.preview.description` | Description preview | Beschreibungsvorschau | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.preview.priority` | Priority | Priorität | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.preview.title` | Title | Titel | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.preview.vehicle` | Vehicle | Fahrzeug | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.priority.CRITICAL` | Critical | Kritisch | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.priority.HIGH` | High | Hoch | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.priority.LOW` | Low | Niedrig | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.priority.NORMAL` | Medium | Mittel | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.repairTask.title` | Create repair task | Reparaturauftrag erstellen | rental/components/damages/CreateRepairTaskDialog.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.status.ARCHIVED` | Archived | Archiviert | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.status.IN_REPAIR` | In repair | In Reparatur | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.status.OPEN` | Open | Offen | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.status.REPAIRED` | Repaired | Repariert | adapter-dynamic | MOUNTED_VIA_ADAPTER | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.badge.blocking` | Blocking | Blockierend | rental/components/damages/damage-summary-display.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.badge.clear` | Clear | Unauffällig | rental/components/damages/damage-summary-display.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.badge.needsReview` | Needs review | Prüfung nötig | rental/components/damages/damage-summary-display.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.badge.open` | Open | Offen | rental/components/damages/damage-summary-display.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.badge.safetyCritical` | Safety critical | Sicherheitskritisch | rental/components/damages/damage-summary-display.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.createRepairTask` | Create repair task | Reparaturauftrag erstellen | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.creatingRepairTask` | Creating… | Wird erstellt… | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.kpi.blocking` | Blocking | Blockierend | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.kpi.estimatedCost` | Estimated cost | Geschätzte Kosten | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.kpi.missingEvidence` | Missing evidence | Fehlende Nachweise | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.kpi.oldestCase` | Oldest case | Ältester Fall | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.kpi.open` | Open damages | Offene Schäden | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.kpi.safetyCritical` | Safety critical | Sicherheitskritisch | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.kpi.unplaced` | Missing location | Fehlende Position | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.kpiHint.blocking` | Blocks bookings | Blockiert Buchungen | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.kpiHint.estimatedCost` | Open cases | Offene Fälle | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.kpiHint.missingEvidence` | No photos yet | Noch keine Fotos | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.kpiHint.oldestCase` | Days since report | Tage seit Meldung | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.kpiHint.open` | Active cases | Aktive Fälle | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.kpiHint.safetyCritical` | Immediate attention | Sofortige Aufmerksamkeit | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.kpiHint.unplaced` | No map position | Keine Kartenposition | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.oldestDays` | {count} days | {count} Tage | rental/components/damages/damage-control.utils.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.oldestOneDay` | 1 day | 1 Tag | rental/components/damages/damage-control.utils.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.oldestToday` | Today | Heute | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.rentalContext.blocked` | Rental may be blocked until resolved. | Vermietung kann bis zur Behebung blockiert sein. | rental/components/damages/damage-summary-display.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.rentalContext.watch` | Open damages under watch — rental still allowed. | Offene Schäden unter Beobachtung — Vermietung weiterhin möglich. | rental/components/damages/damage-summary-display.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.statusTitle` | Damage Status | Schadensstatus | rental/components/damages/DamageControlSummary.tsx | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.subtitle.blocking` | {count} blocking | {count} blockierend | rental/components/damages/damage-summary-display.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.subtitle.blockingOne` | 1 blocking | 1 blockierend | rental/components/damages/damage-summary-display.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.subtitle.noOpen` | No open damages | Keine offenen Schäden | rental/components/damages/damage-summary-display.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.subtitle.openCase` | 1 open damage case | 1 offener Schadensfall | rental/components/damages/damage-summary-display.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.subtitle.openCases` | {count} open damage cases | {count} offene Schadensfälle | rental/components/damages/damage-summary-display.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.subtitle.safetyCritical` | {count} safety critical | {count} sicherheitskritisch | rental/components/damages/damage-summary-display.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.subtitle.safetyCriticalOne` | 1 safety critical | 1 sicherheitskritisch | rental/components/damages/damage-summary-display.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.summary.zeroCost` | €0.00 | 0,00 € | rental/components/damages/damage-control.utils.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.actionFailed` | Action failed | Aktion fehlgeschlagen | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.archived` | Damage archived | Schaden archiviert | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.chargePrepared` | Customer charge prepared | Kundenbelastung vorbereitet | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.chargePreparedDescription` | Amount recorded on damage only — no invoice generated automatically. | Betrag nur auf Schaden erfasst — keine Rechnung automatisch erzeugt. | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.damagePositioned` | Damage positioned | Schaden positioniert | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.damagePositionedDescription` | {view} view · {x}%, {y}% | {view}-Ansicht · {x}%, {y}% | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.damageRecorded` | Damage recorded | Schaden erfasst | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.damageRecordedDescription` | Open the detail drawer to add photos or refine placement. | Öffnen Sie die Detailansicht, um Fotos hinzuzufügen oder die Platzierung zu verfeinern. | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.damagesCreated` | Damages created | Schäden erstellt | rental/hooks/useDamageAiIntake.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.damagesCreatedDescription` | {count} confirmed suggestion(s) saved. | {count} bestätigte Vorschläge gespeichert. | rental/hooks/useDamageAiIntake.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.depositPrepared` | Deposit hold prepared | Kautionssperre vorbereitet | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.depositPreparedDescription` | Amount recorded on damage only — deposit workflow not charged automatically. | Betrag nur auf Schaden erfasst — Kautionsworkflow nicht automatisch belastet. | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.liabilityUpdated` | Liability updated | Haftung aktualisiert | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.liabilityUpdatedDescription` | Operator decision saved — no automatic billing applied. | Operator-Entscheidung gespeichert — keine automatische Abrechnung angewendet. | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.markedInRepair` | Marked in repair | In Reparatur markiert | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.markedRepaired` | Damage marked repaired | Schaden als repariert markiert | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.markedRepairedDescription` | Moved to repaired history. | In reparierte Historie verschoben. | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.photoAdded` | Photo added | Foto hinzugefügt | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.photoAddedDescription` | Evidence gallery updated. | Nachweisgalerie aktualisiert. | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.repairTaskCreated` | Repair task created | Reparaturauftrag erstellt | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.repairTaskCreatedDescription` | Linked to this damage record. | Mit diesem Schadensdatensatz verknüpft. | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.toast.taskNotCreated` | Task not created | Auftrag nicht erstellt | rental/hooks/useVehicleDamageActions.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.aiPhotosRequired` | Add at least one exterior photo before analyzing. | Mindestens ein Außenfoto hinzufügen, bevor analysiert wird. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.aiSelectSuggestion` | Select at least one suggestion to confirm. | Mindestens einen Vorschlag zum Bestätigen auswählen. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.chargeAmountInvalid` | Charge amount must be zero or greater. | Belastungsbetrag muss null oder größer sein. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.chargePrepareFailed` | Could not prepare customer charge. | Kundenbelastung konnte nicht vorbereitet werden. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.coordinatesRange` | Coordinates must be between 0 and 100. | Koordinaten müssen zwischen 0 und 100 liegen. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.coordinatesRequired` | Enter X/Y coordinates (0–100) or choose “Place on map after create”. | X/Y-Koordinaten (0–100) eingeben oder „Nach Erstellung auf Karte platzieren“ wählen. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.createFailed` | Could not create damage. Check the form and try again. | Schaden konnte nicht erstellt werden. Formular prüfen und erneut versuchen. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.createTaskFailed` | Could not create repair task. Please try again. | Reparaturauftrag konnte nicht erstellt werden. Bitte erneut versuchen. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.damageTypeRequired` | Damage type is required. | Schadenstyp ist erforderlich. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.depositAmountInvalid` | Deposit amount must be zero or greater. | Kautionsbetrag muss null oder größer sein. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.depositPrepareFailed` | Could not prepare deposit hold. | Kautionssperre konnte nicht vorbereitet werden. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.descriptionMax` | Description must be at most {max} characters. | Beschreibung max. {max} Zeichen. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.drawerActionFailed` | Action failed. Please try again. | Aktion fehlgeschlagen. Bitte erneut versuchen. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.estimatedCostInvalid` | Estimated cost must be zero or greater. | Geschätzte Kosten müssen null oder größer sein. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.liabilitySaveFailed` | Could not save liability decision. | Haftungsentscheidung konnte nicht gespeichert werden. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.markRepairedFailed` | Could not mark as repaired. Please try again. | Konnte nicht als repariert markiert werden. Bitte erneut versuchen. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.photoTooLarge` | File too large (max {maxMb} MB). Compress before upload. | Datei zu groß (max. {maxMb} MB). Vor dem Upload komprimieren. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.photoUnsupportedFormat` | Unsupported format. Use JPG, PNG, WebP, or GIF. | Nicht unterstütztes Format. JPG, PNG, WebP oder GIF verwenden. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.photoUploadFailed` | Upload failed. Please try again. | Upload fehlgeschlagen. Bitte erneut versuchen. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.repairCostInvalid` | Repair cost must be zero or greater. | Reparaturkosten müssen null oder größer sein. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.sectionActionFailed` | Could not save liability decision. | Haftungsentscheidung konnte nicht gespeichert werden. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |
| `vehicleDamages.validation.severityRequired` | Severity is required. | Schweregrad ist erforderlich. | rental/lib/rental-vehicle-damages-i18n.ts | NEW_REQUIRED | yes | no | no | — | — | no | yes |

---

## 6. Why 130 became 360

| Bucket | Est. keys | Classification |
|--------|-----------|----------------|
| Pre-flight missed AI intake surface | ~27 | PRE-FLIGHT MISSED MOUNTED COPY |
| Pre-flight missed rental sections (deposit/charge/liability) | ~37 | PRE-FLIGHT MISSED MOUNTED COPY |
| Pre-flight missed insights cards | ~27 | PRE-FLIGHT MISSED MOUNTED COPY |
| Pre-flight missed summary/KPI strip | ~35 | PRE-FLIGHT MISSED MOUNTED COPY |
| Validation + toast + hostError host-owned | ~53 | IMPLEMENTATION EXPANDED SCOPE |
| Drawer + queue + create + repair dialogs | ~77 | PRE-FLIGHT MISSED MOUNTED COPY |
| Enum label keys (status, location, evidence, liability, pickup, filters, gates) | ~50 | COPY OVER-MODELED INTO TOO MANY KEYS |
| Exact `common.*` / `vehicle.*` reuse not taken | ~15 | DUPLICATED EXISTING TAXONOMY |
| Operator reuse correctly avoided duplicate type/severity/impact/source | −23 | SHARED-CALLER NEED (credit) |

**Root cause:** Pre-flight scoped visible queue/canvas copy (~115–130) but implementation localized the **complete mounted tab** including AI intake, rental billing sections, insights, validation/toast infrastructure, and per-enum dictionary keys instead of consolidating through `common.*` / canonical formatters.

---

## 7. Exact reuse audit (summary)

| Classification | Count |
|----------------|-------|
| EXACT REUSE AVAILABLE (not taken) | ~15 |
| SEMANTICALLY SIMILAR BUT NOT SAFE | ~8 (e.g. `common.open` vs damage status OPEN) |
| NEW REQUIRED | ~337 |
| OPERATOR REUSE (adapter, no dict keys) | 4 enum families |

---

## 8. Operator damageCapture reuse

| Machine | Rental meaning | Operator meaning | EN (operator) | DE | Verdict |
|---------|----------------|------------------|---------------|-----|---------|
| damageType.* (9) | Damage type label | Damage type label | Scratch…Other | (DE parity) | **EXACT REUSE** |
| severity.* (4) | Severity label | Severity label | Minor…Critical | (DE parity) | **EXACT REUSE** |
| rentalImpact.* (4) | Rental impact | Rental impact | No impact…Safety critical | (DE parity) | **EXACT REUSE** |
| source.* (6) | Damage source | Capture source | Pickup handover…Inspection | (DE parity) | **EXACT REUSE** |

No **WRONG CROSS-DOMAIN REUSE** identified.

---

## 9. Duplicate machine taxonomies

P261 did **not** add dictionary keys for operator-covered enums. Remaining duplicate-risk keys are **vehicleDamages-local** enums (status, locationView, evidenceStatus, liabilityStatus, pickupContext, pickupReason, queueFilter, rentalGate, matchConfidence, repairTask.priority) — justified for rental namespace isolation but consolidatable with shared taxonomies where semantics are identical.

---

## 10. Key-model irreducible count

| Deduction | Keys |
|-----------|------|
| Current | 360 |
| Exact `common.*`/`vehicle.*` reuse misses | −15 |
| Toast description consolidation potential | −10 |
| Redundant pickup label field (use context only) | −3 |
| Over-modeled enum keys (shared health/tasks taxonomies) | −25 to −40 |
| **Irreducible N** | **~285–310** |

---

## 11. Key-model verdict

**C — MATERIAL KEY REDUCTION REQUIRED**

---

## 12–20. Pickup context audit

### Return-shape change

| Field | Baseline | P261 |
|-------|----------|------|
| `label` | Human ("Pre-existing") | Machine code (`PRE_EXISTING`) — duplicate of `context` |
| `reason` | Human sentence | `DamagePickupReasonCode` enum |
| `emptyPickupContext` | inline in DamagesView | extracted helper; adds `NO_DAMAGE_SELECTED` code |

### Caller inventory

| Path | Active | Rendered | Persisted | API | Analytics | Notes |
|------|--------|----------|-----------|-----|-----------|-------|
| `DamagesView.tsx` | yes | via children | no | no | no | derives context; passes to queue/drawer |
| `DamageWorkQueue.tsx` | yes | yes | no | no | no | conditions use `context`; display via `resolveDamagePickupContextLabel(t, context)` |
| `DamageRentalSections.tsx` | yes | yes | no | no | no | reason via `resolveDamagePickupReasonLabel` |
| `DamageDetailDrawer.tsx` | yes | passes through | no | no | no | prop only |
| `damage-pickup-context.test.ts` | test | — | — | — | — | expects machine codes |

### Label contract: **C — MIXED**

`label` is no longer presentation copy but is **not displayed raw** in active UI (display uses `context` + resolver). Field is misleading dead weight.

### Reason contract: **B — domain code** (presentation resolved at UI boundary)

### Persisted/serialized: **NO**

No API payload, DB, task payload, analytics, or audit log consumes pickup context strings.

### Pickup contract verdict

**Presentation-safe at UI layer; contract correction still required** — return model should not expose machine codes in `label` or human-facing `reason` type without explicit versioned contract.

### Unknown fallback

`resolveDamagePickupReasonLabel` returns raw code if key missing — safe, not misleading.

### emptyPickupContext behavior

Equivalent to baseline inline default except `reason` changed from `'No damage selected.'` to `'NO_DAMAGE_SELECTED'` code.

---

## 21. Rental impact / insights contracts

- `deriveDamageRentalImpact` / `isDamageRentalBlocked` — **zero semantic diff**
- `damageRentalGateLabel(gate, t)` — presentation only; callers pass `t`
- Insight helpers receive `t` — output used for display only; thresholds unchanged

---

## 22–24. Multi-locale formatter

### Supported locales (repository truth)

`de, en, pl, fr, cs, nl, es, tr, it`

### Formatter mapping

| Locale | Expected (canonical `getFormattingLocale`) | Actual `vehicleDamagesFormattingLocale` |
|--------|---------------------------------------------|-------------------------------------------|
| de | de-DE | de-DE ✓ |
| en | en-GB | en-GB ✓ |
| pl | pl-PL | **en-GB** ✗ |
| fr | fr-FR | **en-GB** ✗ |
| cs | cs-CZ | **en-GB** ✗ |
| nl | nl-NL | **en-GB** ✗ |
| es | es-ES | **en-GB** ✗ |
| tr | tr-TR | **en-GB** ✗ |
| it | it-IT | **en-GB** ✗ |

### Multi-locale verdict

**C — CORRECTION REQUIRED — SUPPORTED LOCALES COLLAPSE TO EN-GB**

Canonical helper exists: `getFormattingLocale()` in `frontend/src/i18n/locales.ts`; P259 vehicle documents uses `vehicleFormattingLocaleOrDefault`.

---

## 25–29. Date/currency semantics

- **Date:** presentation only; ISO/sorting unchanged
- **Cost:** `cents == null || cents < 0 → null` preserved; EUR only; no conversion
- **Baseline drift:** baseline `formatEuroCents` hardcoded `de-DE` for all locales; P261 improves EN but regresses pl/fr/cs/nl/es/it vs canonical
- **Other-locale tests:** **GAP** — only de/en covered

---

## 30–35. Raw data ownership

| Fixture | Preserved |
|---------|-----------|
| Provider Damage Description X7 | YES — raw |
| Provider Liability Note X7 | YES — raw |
| Provider Repair Shop X7 (locationLabel) | YES — raw |
| Provider Task Title X7 | YES — raw (API mock) |
| Damage_Photo_X7.jpg caption | YES — raw |
| Backend Damage Error X7 | YES — raw wins over host key |

---

## 36–40. Hooks, toasts, validation

- Hook error model: presentation normalization only; `error` string + `hostErrorKey` pattern
- Toast timing/callbacks/refetch: unchanged
- Validation codes typed; same conditions/limits (`DESCRIPTION_MAX_LENGTH=4000`, `PHOTO_TOO_LARGE maxMb=6`)
- **Category E (pickup contract):** **1**

---

## 41–48. Machine semantics parity

| Area | Parity |
|------|--------|
| Machine enums | zero diff |
| Unknown type fallback | raw value, no forced OTHER |
| Status/severity tones | zero diff |
| Filter predicates | exact ID sets |
| Sort order | unchanged |
| Insight thresholds | unchanged |
| Rental impact derivation | unchanged |
| Pickup matching derivation | unchanged (display only) |

---

## 49–55. Mutation parity

Endpoints and payloads **unchanged**. No translation keys in payloads.

### Mutation test evidence

| Mutation | Evidence grade |
|----------|----------------|
| create | STATIC SOURCE INSPECTION |
| place | STATIC SOURCE INSPECTION |
| photo | STATIC SOURCE INSPECTION |
| in-repair | STATIC SOURCE INSPECTION |
| repaired | STATIC SOURCE INSPECTION |
| archive | STATIC SOURCE INSPECTION |
| cost/liability | STATIC SOURCE INSPECTION |
| repair task | STATIC SOURCE INSPECTION |
| AI analyze | NOT TESTED |

---

## 56–59. Same-mount / identity

| Check | Grade / Result |
|-------|----------------|
| Same-mount overall | **ACCEPTABLE** |
| Selected damage ID | not explicitly asserted |
| Queue filter | not tested |
| Drawer open | not tested |
| Form raw input | not tested |
| File identity | **evidence gap** |
| Mutation counters | all zero ✓ |
| React `key={locale}` anti-patterns | **none found** |

---

## 60–66. Enforce-clean and completion

### 23 enforce-clean paths

`DamagesView.tsx`, `DamageControlSummary.tsx`, `DamageInsightsSection.tsx`, `DamageEvidenceCanvas.tsx`, `DamageWorkQueue.tsx`, `DamageDetailDrawer.tsx`, `CreateDamageDialog.tsx`, `MarkRepairedDialog.tsx`, `CreateRepairTaskDialog.tsx`, `DamageAiIntakeDialog.tsx`, `AddDamagePhotoPanel.tsx`, `DamageRentalSections.tsx`, `DamageMapBlueprint.tsx`, `DamageHeatmapOverlay.tsx`, `damage-summary-display.ts`, `damage-control.utils.ts`, `rental-vehicle-damages-i18n.ts`, `useVehicleDamages.ts`, `useVehicleDamageActions.ts`, `damage-insights.ts`, `damage-rental-impact.ts`, `damage-pickup-context.ts`, `useDamageAiIntake.ts`

**Boundary verdict: BOUNDARY SUFFICIENT**

### Scanner accounting

| Metric | Baseline | Final |
|--------|----------|-------|
| Global | 1375 | **1282** |
| Rental | 278 | **185** |
| Finance/Billing | (unchanged scope) | 0 P261 findings |
| P261 enforce-clean | — | **0** |
| Visible Damage reduction | 93 | **93** (−93) |

**Active mounted Vehicle Damages = 100% I18N-CLEAN** (in scoped paths)

---

## 67–71. Scope / freeze / drift

| Check | Result |
|-------|--------|
| Data Analyse diff | **0** |
| Operator damages diff | **0** |
| P260–P216 freeze | **0 semantic diff** |
| Main drift/collision | none identified for Damage paths |

---

## 72–73. Validation (independent)

| Check | Result |
|-------|--------|
| P261 localization tests (11) | **PASS** |
| damage-insights tests (3) | **PASS** |
| damage-pickup-context tests (4) | **PASS** |
| damage-rental-impact tests (5) | **PASS** |
| P260 upload regression | **PASS** (prior run) |
| `npm run i18n:check` | **PASS** |
| `npm run check:surface` | **PASS** |
| TypeScript | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` | **PASS** (zero output) |

---

## 74–75. Correction required

**YES**

### Smallest correction set (do not implement in #1406 reassessment)

| # | File / symbol | Baseline | P261 | Risk | Minimal correction | Key Δ | Test |
|---|---------------|----------|------|------|-------------------|-------|------|
| 1 | `rental-vehicle-damages-i18n.ts` `vehicleDamagesFormattingLocale` | N/A (new) | de-DE / en-GB only | Wrong dates/currency for 7 locales | Use `getFormattingLocale(resolveVehicleDamagesLocale(locale))` | 0 | Add pl/fr/tr format assertions |
| 2 | `damage-pickup-context.ts` `PickupContextResult` | human label/reason | machine codes | Contract confusion | Keep `context` enum; drop human-misleading `label` or restore presentation-only; type `reason` as code only with resolver at UI | −3 | Extend pickup-context tests |
| 3 | `rental.vehicleDamages.*` | — | 360 keys | Budget gate | Consolidate ~15 `common.*`/`vehicle.*` exact matches; review toast pairs | −25 to −75 | i18n:check + localization test |
| 4 | `rental-vehicle-damages-localization.test.tsx` | — | static grep | No payload proof | Add hook integration tests asserting mutation payloads | 0 | Real endpoint-facing hook tests |
| 5 | Same-mount test | — | shallow | Drawer/form/File not proven | Extend same-mount with drawer open + form input + File ref | 0 | STRONG same-mount |

---

## 79. Final verdict (reassessment)

**B — KEY REDUCTION REQUIRED BEFORE FINAL RE-AUDIT**

PR #1406 remains unmerged. Do not proceed to final independent re-audit until key-model reduction, formatter correction, pickup contract cleanup, and mutation evidence upgrades are addressed.

---

*Audit artifact only. Zero production/dictionary/test/scanner changes.*
