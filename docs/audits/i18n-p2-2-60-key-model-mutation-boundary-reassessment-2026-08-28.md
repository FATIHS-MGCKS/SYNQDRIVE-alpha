# P2.2.60 — KEY-MODEL / MUTATION-BOUNDARY / LOCALE-REF REASSESSMENT

**165-KEY REASSESSMENT**

**Date:** 2026-08-28  
**Mode:** STRICT READ-ONLY AUDIT  
**Implementation PR:** [#1400](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1400) (unmerged, draft)  
**Authoritative baseline:** `2586c202564f8b10c0c48b5717ea8bf339138da1` (P2.2.59)  
**Implementation HEAD:** `91e6034ee86a2c8de8a025854d85e687316fbf41`  
**Pre-flight PR:** #1397 (not in ancestry)  
**Audit branch:** `cursor/p2260-key-model-mutation-reassessment-3c10`

---

## Executive summary

| Item | Result |
|------|--------|
| Provenance | PASS — 1 commit, exact base/HEAD, no #1397 ancestry |
| Key count | **165** (exceeds pre-flight hard stop >160) |
| Key-model verdict | **B — REDUCTION REQUIRED, FINAL COUNT ≤160** |
| Final audit verdict | **B — KEY REDUCTION REQUIRED BEFORE FINAL RE-AUDIT** |
| Correction required | **YES** |
| Category E (mutation semantics) | **0** — endpoints/payloads unchanged |
| Mutation boundary | PASS — presentation-ownership normalization only |
| localeRef stale-payload risk | **LOW** — synchronous render update |
| Error ownership | PASS with documented non-Error drift (pre-existing pattern) |
| Polling semantics | Improved (locale removed from `applyRecord` deps); test evidence WEAK |
| Enforce-clean boundary | **INCOMPLETE** — hooks/shared helpers changed but excluded |
| diff-check | **FAIL** — trailing whitespace in docs, EOF blank line in shared |

---

## 1. Provenance

| Check | Result |
|-------|--------|
| PR #1400 open | ✅ `state: OPEN` |
| Draft | ✅ `isDraft: true` |
| Merged | ❌ not merged |
| Mergeable | ✅ `MERGEABLE` |
| Base SHA | ✅ `2586c202564f8b10c0c48b5717ea8bf339138da1` |
| HEAD SHA | ✅ `91e6034ee86a2c8de8a025854d85e687316fbf41` |
| Commit count | ✅ exactly **1** (`91e6034ee`) |
| Parent | ✅ `2586c202564f8b10c0c48b5717ea8bf339138da1` |
| #1397 ancestry | ❌ none |
| main-only ancestry | ❌ none — direct P259 child |

---

## 2. Complete diff forensics (25 paths)

| Path | Class | Notes |
|------|-------|-------|
| `rental.documentIntake.en.ts` / `.de.ts` | **D** | +165 keys |
| `document-intake-i18n.ts` | **E** | Resolvers |
| `VehicleDocumentUploadDrawer.tsx` | **A** | Drawer presentation |
| `DocumentExtractionFlowStatus.tsx` | **A/B** | Flow status presentation |
| `DocumentExtractionReviewPanel.tsx` | **B/C** | Review presentation |
| `DocumentIntakeProcessingSteps.tsx` | **B** | Processing steps |
| `DocumentUploadDuplicatePanel.tsx` | **B** | Duplicate panel |
| `document-extraction.shared.ts` | **C/E** | Removed inline DE labels; template structure preserved |
| `useDocumentIntakeFlow.ts` | **F/G** | Error boundary + localeRef; no endpoint change |
| `useDocumentIntakeFlow.types.ts` | **F** | Return type boundary |
| `useDocumentUploadPage.ts` | **K** | Adapter for new error boundary |
| `OperatorAiUploadFlow.tsx` | **K** | Shared caller adaptation |
| `operatorAiUpload.config.ts` | **K** | Config label keys |
| `rental-vehicle-documents-upload-localization.test.tsx` | **M** | P260 tests |
| `document-intake-processing-steps.ui.test.tsx` | **M** | Step label test |
| `hardcoded-copy-guard.test.ts` | **L** | P260 enforce-clean |
| `i18n-hardcoded-scan.mjs` | **L** | P260 scope + P22 drawer removal |
| `hardcoded-copy-inventory.json` | **L** | Scanner refresh |
| `en.ts` / `de.ts` | **D** | Spread import only |
| `ChangesView.tsx` / `ArchitekturView.tsx` | **N** | Bookkeeping |
| Implementation audit + architecture docs | **N** | Bookkeeping |

**Required counts:** I=0, O=0, P=0 ✅  
**G/H/J:** Semantically equivalent or presentation-architectural only ✅

---

## 3. Exact 165-key inventory

**Module:** `frontend/src/i18n/translations/rental.documentIntake.{en,de}.ts`  
**EN = DE = 165**, parity 100%, orphans 0.

### Key group accounting

| Group | Count |
|-------|------:|
| `docUpload.extractionField.*` | 119 |
| `documentExtraction.classification.*` | 13 |
| `docUpload.hostError.*` | 11 |
| `docUpload.duplicate.*` + `businessDuplicate.*` | 9 |
| `docUpload.drawer.*` | 7 |
| `docUpload.done` / formats / retry / a11y | 5 |
| `docUpload.flow.duplicate_blocked` | 1 |
| **TOTAL** | **165** |

> Note: `docUpload.flow.*` (except `duplicate_blocked`), `docUpload.validation.*`, and `docUpload.processingStep.*` already existed in root `en.ts`/`de.ts` from prior slices — **not** part of the +165.

### Full per-key inventory

See [Appendix A](#appendix-a--complete-165-key-inventory-table) for all 165 keys with EN, DE, callsite, mounted path, classification, reuse candidate, used/required.

---

## 4. Key reconciliation

| Metric | Value |
|--------|------:|
| Current | 165 |
| Exact reuse missed (X) | **8** |
| Safe semantic reuse (Y) | **6** |
| Duplicate keys in module (Z) | **0** |
| Unused/speculative (Q) | **0** |
| **Irreducible after exact-reuse fix (N)** | **157** |

### Exact reuse missed (X = 8)

**Classification → `documentExtraction.type.*` (7 keys, identical EN text):**

| New key | Existing key |
|---------|-------------|
| `documentExtraction.classification.SERVICE` | `documentExtraction.type.SERVICE` |
| `documentExtraction.classification.OIL_CHANGE` | `documentExtraction.type.OIL_CHANGE` |
| `documentExtraction.classification.BOKRAFT_REPORT` | `documentExtraction.type.BOKRAFT_REPORT` |
| `documentExtraction.classification.INVOICE` | `documentExtraction.type.INVOICE` |
| `documentExtraction.classification.DAMAGE` | `documentExtraction.type.DAMAGE` |
| `documentExtraction.classification.ACCIDENT` | `documentExtraction.type.ACCIDENT` |
| `documentExtraction.classification.OTHER` | `documentExtraction.type.OTHER` |

**Field → `docUpload.field.*` (1 key, identical EN text):**

| New key | Existing key |
|---------|-------------|
| `docUpload.extractionField.description` | `docUpload.field.description` |

### Safe semantic reuse (Y = 6)

Classification keys with overlapping but **different** EN text vs `documentExtraction.type.*`:

| Key | P260 EN | Existing type EN | Classification |
|-----|---------|------------------|----------------|
| `classification.TIRE` | Tire record | Tire service | SAME CONCEPT — semantic reuse candidate |
| `classification.BRAKE` | Brake record | Brake service | SAME CONCEPT — semantic reuse candidate |
| `classification.BATTERY` | Battery record | Battery service | SAME CONCEPT — semantic reuse candidate |
| `classification.TUV_REPORT` | MOT / inspection | TÜV / inspection | WEAK OVERLAP — keep separate or align |
| `classification.VEHICLE_CONDITION` | Registration / vehicle document | Registration / vehicle documents | WEAK OVERLAP — singular/plural |
| `classification.FINE` | Fine | Fine / penalty | SAME CONCEPT — semantic reuse candidate |

### Alias field pairs (KEEP SEPARATE — different machine field IDs)

`vendorName`/`supplier`, `totalCents`/`costCents`, `measurementType`/`recordKind`, `drivableAfterIncident`/`drivable`, `opponentInvolved`/`thirdPartyInvolved`, `policeReport`/`policeReference` — intentional per extraction schema.

---

## 5. Key-model verdict

**B — REDUCTION REQUIRED, FINAL COUNT ≤160**

Rationale: 165 exceeds the pre-flight hard stop. Removing 8 exact-reuse keys yields **157 ≤ 160**. All 119 `extractionField.*` keys are required (1:1 with `EXTRACTION_TEMPLATES` field IDs). The overage is primarily the redundant `documentExtraction.classification.*` namespace (13 keys, 7 exact duplicates).

---

## ERROR OWNERSHIP AUDIT

### Hook state-model change

| Baseline | Final | Classification |
|----------|-------|----------------|
| `validationError: string` | `validationErrorCode: UploadValidationCode` | **PRESENTATION-OWNERSHIP NORMALIZATION** |
| `errorMessage: string` | `errorMessage` + `hostErrorKey` + `actionPlanBlockedReason` | **PRESENTATION-OWNERSHIP NORMALIZATION** |

No control-flow branch changes; same guards, same API calls.

### `mapUploadError` truth table

| Input | Baseline | Final |
|-------|----------|-------|
| `DocumentUploadRateLimitedError` | raw composed message | same raw message, `hostErrorKey: null` |
| `DocumentIdentificationRejectedError` | raw `payload.message` | same |
| `new Error('Backend Upload Error X7')` | `'Backend Upload Error X7'` | `{ message: 'Backend Upload Error X7', hostErrorKey: null }` |
| `throw {}` | `'Upload fehlgeschlagen.'` (DE host) | `{ message: '', hostErrorKey: 'uploadFailed' }` → localized host |
| `throw 'Backend String Error X7'` | `'Upload fehlgeschlagen.'` (DE host) | same as `{}` — **pre-existing non-Error pattern preserved** |

### Action-plan blocked reason precedence

**Baseline:** `errorMessage = confirmBlockedReason ?? German fallback`  
**Final:** `actionPlanBlockedReason` preserved; `resolveHostErrorMessage` returns `actionPlanBlockedReason` when `hostErrorKey === actionPlanBlocked` and reason present.  
**Provider Action Plan Block X7** remains raw ✅

### Upload-target sentinel

`UPLOAD_TARGET_UNAVAILABLE` thrown internally in `performUpload`, caught in `handleFile`, mapped to `hostErrorKey`.  
If backend returned this exact string as `Error.message`, it would display raw (not host key).  
**Verdict: SAFE INTERNAL SENTINEL** (low collision risk).

---

## LOCALE-REF / CONFIRM PAYLOAD AUDIT

### Implementation

```typescript
const localeRef = useRef(locale);
localeRef.current = locale; // synchronous during render — NOT useEffect
```

### Update timing

React 18: ref updated **before** event handlers in the same render cycle after locale state change. Stale-DE-on-immediate-confirm risk: **LOW**.

### Confirm payload locale semantics

`parseReviewFieldsForConfirm(editedFields, { locale: localeRef.current })` affects:
- **date fields:** `parseDisplayDateToIso(trimmed, locale)` — locale-dependent
- **currency fields:** `parseCurrencyDisplayToCents(trimmed)` — locale-independent

`buildReviewFields` uses locale for `formatFieldValue` (presentation only).

### Confirm-after-locale-switch test

**NO** — current test does not establish review data, switch locale, confirm, and inspect `confirmedData` payload.

**Grade:** BLOCKING TEST GAP for payload locale semantics (mitigated by sync `localeRef` but unproven).

---

## POLLING STABILITY AUDIT

### Baseline chain

`locale` in `applyRecord` deps → locale change recreates `applyRecord` → `startPolling` depends on `applyRecord` → **poll callback identity changes** (potential restart).

### Final

`locale` removed from `applyRecord` deps; `localeRef.current` used inside. **Fixes pre-existing locale-triggered identity churn.**

### Poll restart test grade

**WEAK** — same-mount test asserts mutation counters = 0 only; does not prove poll timer/instance identity unchanged.

---

## SHARED CALLER BLAST RADIUS

| Caller | Change | Classification |
|--------|--------|----------------|
| `VehicleDocumentUploadDrawer` | Full i18n via `useLanguage` + resolvers | Required |
| `DocumentUploadView` / `useDocumentUploadPage` | Resolves `hostErrorKey`/`validationErrorCode` at page boundary | Required shared adaptation |
| `OperatorAiUploadFlow` | Replaces `FLOW_STATUS_LABEL_DE` with resolvers | **REQUIRED SHARED PRESENTATION ADAPTATION** — not semantic regression |

Raw backend `errorMessage` preserved; host fallbacks localized.

---

## ENFORCE-CLEAN BOUNDARY

P260 defines 13 exact component paths + `document-intake-i18n.ts`.

**Also changed but excluded:**
- `useDocumentIntakeFlow.ts`
- `useDocumentUploadPage.ts`
- `OperatorAiUploadFlow.tsx`
- `document-extraction.shared.ts`

German literals removed from hook (now machine keys). Active mounted debt in these paths: **0**.

**Verdict: BOUNDARY INCOMPLETE** — governance gap; hooks can accumulate future presentation debt outside scanner scope. Recommend extending P260 enforce-clean to hook boundary files in a follow-up (not blocking if debt = 0 today).

### P22 allowlist

`VehicleDocumentUploadDrawer` **removed** from `P22_ENFORCE_CLEAN_EXACT`, added to `P260_ENFORCE_CLEAN_EXACT`. No other P22 guards weakened.

---

## Validation results

| Check | Result |
|-------|--------|
| P260 focused tests | ✅ PASS (11 tests) |
| `useDocumentIntakeFlow.test.ts` | ✅ PASS (source inspection + poller contract) |
| `npm run i18n:check` | ✅ PASS — EN/DE 9247/9247 |
| `npm run check:surface` | ✅ PASS |
| `npx tsc -b --noEmit` | ✅ PASS |
| `npm run build` | ✅ PASS |
| `git diff --check` | ❌ FAIL — trailing whitespace in docs; EOF blank line in `document-extraction.shared.ts` |
| Global scanner | ✅ 1375 (−7 from 1382) |
| Rental scanner | ✅ 278 (−7 from 285) |
| Category E | ✅ 0 |
| P259 frozen surface | ✅ no overview/list files changed |
| P258–P216 | ✅ no frozen paths modified |
| main drift | ✅ none |
| Active collision | ✅ none identified |

### Real hook contract test coverage

| Mutation | Coverage |
|----------|----------|
| upload | SOURCE INSPECTION ONLY |
| reupload | SOURCE INSPECTION ONLY |
| retry | SOURCE INSPECTION ONLY |
| set type | SOURCE INSPECTION ONLY |
| reextract | SOURCE INSPECTION ONLY |
| confirm | SOURCE INSPECTION ONLY |
| retry failed actions | SOURCE INSPECTION ONLY |

---

## Smallest correction set (DO NOT IMPLEMENT — audit only)

### C1 — Classification exact reuse (−7 keys)

| File | Symbol | Problem | Correction | Key effect |
|------|--------|---------|------------|------------|
| `document-intake-i18n.ts` | `resolveDocumentTypeLabel` | Duplicates 7 existing `documentExtraction.type.*` keys | Resolve via `documentExtraction.type.${docType}` with fallback to raw `docType` | −7 |
| `rental.documentIntake.{en,de}.ts` | `documentExtraction.classification.{SERVICE,OIL_CHANGE,BOKRAFT,INVOICE,DAMAGE,ACCIDENT,OTHER}` | Redundant keys | Remove; use existing type keys | −7 |

**Regression test:** Assert `resolveDocumentTypeLabel('SERVICE', t)` equals `t('documentExtraction.type.SERVICE')`.

### C2 — Field exact reuse (−1 key)

| File | Symbol | Problem | Correction | Key effect |
|------|--------|---------|------------|------------|
| `document-intake-i18n.ts` | `resolveExtractionFieldLabel` | `description` duplicates `docUpload.field.description` | Fallback chain: `docUpload.extractionField.*` → `docUpload.field.*` → raw key | −1 |
| `rental.documentIntake.{en,de}.ts` | `docUpload.extractionField.description` | Redundant | Remove | −1 |

**Regression test:** `resolveExtractionFieldLabel('description', t)` uses `docUpload.field.description`.

### C3 — Optional semantic alignment (−6 keys, if product accepts type labels)

Consolidate remaining `classification.*` to `documentExtraction.type.*` where concept matches (TIRE, BRAKE, BATTERY, FINE). Would bring total to **151**.

### C4 — Governance (non-key)

| File | Problem | Correction |
|------|---------|------------|
| Implementation docs | Trailing whitespace | Strip trailing WS |
| `document-extraction.shared.ts` | EOF blank line | Remove for diff-check PASS |

### C5 — Test gap (recommended with correction)

Add `renderHook(useDocumentIntakeFlow)` test: establish DE review fields with locale-formatted dates, switch EN, confirm, assert `confirmedData` uses EN date parsing semantics.

---

## Final verdicts

| Gate | Verdict |
|------|---------|
| **Key-model (§12)** | **B — REDUCTION REQUIRED, FINAL COUNT ≤160** |
| **Final audit (§62)** | **B — KEY REDUCTION REQUIRED BEFORE FINAL RE-AUDIT** |
| **Correction required (§57)** | **YES** |

PR #1400 must **not** proceed to final independent re-audit until at least **8 exact-reuse keys** are eliminated (target ≤157 keys). Optional semantic consolidation of 6 classification keys can reach ≤151.

---

| # | Key | EN | DE | Callsite | Mounted | Shared/Vehicle | Class | Reuse | Dup | Used | Req |
|---|-----|----|----|----------|---------|----------------|-------|-------|-----|------|-----|
| 1 | `docUpload.businessDuplicate.body` | Invoice or case reference matches an existing document in this organization. The upload was started anyway. | Rechnungs- oder Aktenzeichen-Hinweis passt zu einem bestehenden Dokument in dieser Organisation. Der Upload wurde dennoch gestartet. | shared intake components | shared | shared | presentation | — | no | yes | yes |
| 2 | `docUpload.businessDuplicate.title` | Possible business duplicate | Mögliches Business-Duplikat | shared intake components | shared | shared | presentation | — | no | yes | yes |
| 3 | `docUpload.done` | Done | Fertig | shared intake components | shared | shared | presentation | — | no | yes | yes |
| 4 | `docUpload.drawer.description` | AI-assisted document upload | KI-gestützter Dokumenten-Upload | VehicleDocumentUploadDrawer | vehicle | vehicle-specific | presentation | — | no | yes | yes |
| 5 | `docUpload.drawer.documentFallback` | Document | Dokument | VehicleDocumentUploadDrawer | vehicle | vehicle-specific | presentation | — | no | yes | yes |
| 6 | `docUpload.drawer.eyebrow` | AI Document Upload | AI Document Upload | VehicleDocumentUploadDrawer | vehicle | vehicle-specific | presentation | — | no | yes | yes |
| 7 | `docUpload.drawer.originSurface` | Vehicle detail | Fahrzeugdetail | VehicleDocumentUploadDrawer | vehicle | vehicle-specific | presentation | — | no | yes | yes |
| 8 | `docUpload.drawer.title.review` | Review document | Dokument prüfen | VehicleDocumentUploadDrawer | vehicle | vehicle-specific | presentation | — | no | yes | yes |
| 9 | `docUpload.drawer.title.upload` | Upload document | Dokument hochladen | VehicleDocumentUploadDrawer | vehicle | vehicle-specific | presentation | — | no | yes | yes |
| 10 | `docUpload.drawer.title.view` | View document | Dokument ansehen | VehicleDocumentUploadDrawer | vehicle | vehicle-specific | presentation | — | no | yes | yes |
| 11 | `docUpload.duplicate.body` | An identical upload already exists in this organization. Nothing was deleted. | Ein identischer Upload existiert bereits in dieser Organisation. Es wurde nichts gelöscht. | DocumentUploadDuplicatePanel | shared | shared | presentation | — | no | yes | yes |
| 12 | `docUpload.duplicate.existingFallback` | Existing document | Bestehendes Dokument | DocumentUploadDuplicatePanel | shared | shared | presentation | — | no | yes | yes |
| 13 | `docUpload.duplicate.reasonLabel` | Reason for re-upload | Begründung für erneuten Upload | DocumentUploadDuplicatePanel | shared | shared | presentation | — | no | yes | yes |
| 14 | `docUpload.duplicate.reasonPlaceholder` | e.g. corrected scan quality, second archive copy, accounting requested | z. B. korrigierte Scanqualität, zweite Archivkopie, Buchhaltung angefordert | DocumentUploadDuplicatePanel | shared | shared | presentation | — | no | yes | yes |
| 15 | `docUpload.duplicate.reupload` | Re-upload with reason | Mit Begründung erneut hochladen | DocumentUploadDuplicatePanel | shared | shared | presentation | — | no | yes | yes |
| 16 | `docUpload.duplicate.statusLine` | Status: {status} · Type: {type} | Status: {status} · Typ: {type} | DocumentUploadDuplicatePanel | shared | shared | presentation | — | no | yes | yes |
| 17 | `docUpload.duplicate.title` | Document already exists | Dokument bereits vorhanden | DocumentUploadDuplicatePanel | shared | shared | presentation | — | no | yes | yes |
| 18 | `docUpload.extractionField.accidentApplyConfirmed` | Accident apply confirmed | Unfall-Apply bestätigt | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 19 | `docUpload.extractionField.action` | Action | Aktion | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 20 | `docUpload.extractionField.actionRequired` | Required action | Erforderliche Aktion | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 21 | `docUpload.extractionField.amountSemantics` | Amount semantics | Betragssemantik | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 22 | `docUpload.extractionField.archiveSubtype` | Archive subtype | Archiv-Untertyp | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 23 | `docUpload.extractionField.batteryType` | Battery type | Batterietyp | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 24 | `docUpload.extractionField.bookingContext` | Booking context | Buchungskontext | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 25 | `docUpload.extractionField.capacityAh` | Capacity (Ah) | Kapazität (Ah) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 26 | `docUpload.extractionField.capacityKwh` | Capacity (kWh) | Kapazität (kWh) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 27 | `docUpload.extractionField.costCents` | Cost (cents) | Kosten (Cent) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 28 | `docUpload.extractionField.creditNoteReference` | Credit note reference | Gutschrift-Referenz | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 29 | `docUpload.extractionField.currency` | Currency | Währung | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 30 | `docUpload.extractionField.customer` | Customer / recipient | Kunde / Empfänger | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | SEMANTIC: docUpload.field.customer | no | yes | yes |
| 31 | `docUpload.extractionField.damageArea` | Damage area | Schadensbereich | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 32 | `docUpload.extractionField.damageAreas` | Damage areas | Schadensbereiche | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 33 | `docUpload.extractionField.damageDescription` | Damage description | Schadensbeschreibung | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 34 | `docUpload.extractionField.damageType` | Damage type | Schadenstyp | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 35 | `docUpload.extractionField.deadlines` | Deadlines (suggestion only) | Fristen (nur Vorschlag) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 36 | `docUpload.extractionField.defectLevel` | Defect level | Mangelstufe | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 37 | `docUpload.extractionField.defects` | Defects | Mängel | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 38 | `docUpload.extractionField.description` | Description | Beschreibung | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | EXACT: docUpload.field.description | no | yes | yes |
| 39 | `docUpload.extractionField.deviceOrWorkshop` | Device/workshop | Gerät/Werkstatt | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 40 | `docUpload.extractionField.discThicknessUnit` | Disc thickness unit | Scheibendicke-Einheit | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 41 | `docUpload.extractionField.documentDate` | Document date | Dokumentdatum | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 42 | `docUpload.extractionField.documentKind` | Document kind | Dokumentart | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 43 | `docUpload.extractionField.dot` | DOT | DOT | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 44 | `docUpload.extractionField.drivable` | Drivable | Fahrbereit | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 45 | `docUpload.extractionField.drivableAfterIncident` | Drivable after incident (alias) | Fahrbereit danach (Alias) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 46 | `docUpload.extractionField.dueDate` | Due date | Fällig am | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | SEMANTIC: docUpload.field.dueDate | no | yes | yes |
| 47 | `docUpload.extractionField.estimatedCostGross` | Estimated cost | Geschätzte Kosten | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 48 | `docUpload.extractionField.eventDate` | Event date | Service-Datum | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 49 | `docUpload.extractionField.eventDateTime` | Incident date/time | Schadensdatum/-zeit | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 50 | `docUpload.extractionField.feeBreakdown` | Fee breakdown | Gebührenaufstellung | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 51 | `docUpload.extractionField.frontDiscMm` | Front discs | Scheiben vorn | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 52 | `docUpload.extractionField.frontPadMm` | Front pads | Beläge vorn | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 53 | `docUpload.extractionField.inspectionDate` | Inspection date | TÜV-Datum | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 54 | `docUpload.extractionField.insuranceReference` | Insurance reference | Versicherungsreferenz | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 55 | `docUpload.extractionField.invoiceDate` | Invoice date | Rechnungsdatum | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 56 | `docUpload.extractionField.invoiceNumber` | Invoice number | Rechnungsnummer | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | SEMANTIC: docUpload.field.invoiceNumber | no | yes | yes |
| 57 | `docUpload.extractionField.issuingAuthority` | Issuing authority / company | Ausstellende Behörde / Firma | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 58 | `docUpload.extractionField.issuingOrganization` | Inspection organization | Prüforganisation | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 59 | `docUpload.extractionField.licensePlate` | License plate | Kennzeichen | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 60 | `docUpload.extractionField.linkedDamageId` | Linked damage | Verknüpfter Schaden | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 61 | `docUpload.extractionField.location` | Location | Ort | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 62 | `docUpload.extractionField.locationLabel` | Position label | Positionslabel | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 63 | `docUpload.extractionField.measurementDate` | Measurement date | Messdatum | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 64 | `docUpload.extractionField.measurementType` | Measurement type (alias) | Messungsart (Alias) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 65 | `docUpload.extractionField.mentionedEntities` | Mentioned entities | Erwähnte Entitäten | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 66 | `docUpload.extractionField.mileage` | Mileage (km) | Kilometerstand (km) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 67 | `docUpload.extractionField.minimumDiscMmFront` | Minimum disc front | Mindestmaß Scheibe vorn | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 68 | `docUpload.extractionField.minimumDiscMmRear` | Minimum disc rear | Mindestmaß Scheibe hinten | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 69 | `docUpload.extractionField.minimumPadMmFront` | Minimum pad front | Mindestmaß Belag vorn | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 70 | `docUpload.extractionField.minimumPadMmRear` | Minimum pad rear | Mindestmaß Belag hinten | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 71 | `docUpload.extractionField.nextOilChangeDate` | Next oil change | Nächster Ölwechsel | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 72 | `docUpload.extractionField.nextOilChangeMileageKm` | Next oil change (km) | Nächster Ölwechsel (km) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 73 | `docUpload.extractionField.nextServiceDate` | Next service | Nächster Service | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 74 | `docUpload.extractionField.nextServiceMileageKm` | Next service (km) | Nächster Service (km) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 75 | `docUpload.extractionField.notes` | Notes | Notizen | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 76 | `docUpload.extractionField.odometerKm` | Odometer (km) | Kilometerstand (km) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 77 | `docUpload.extractionField.offenseType` | Offense type | Art des Verstoßes | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 78 | `docUpload.extractionField.oilType` | Oil type | Öltyp | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 79 | `docUpload.extractionField.opponentInvolved` | Opponent involved (alias) | Unfallgegner (Alias) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 80 | `docUpload.extractionField.originalInvoiceReference` | Original invoice reference | Ursprungsrechnung | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 81 | `docUpload.extractionField.padThicknessUnit` | Pad thickness unit | Belagstärke-Einheit | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 82 | `docUpload.extractionField.policeReference` | Police reference | Polizeiaktenzeichen | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 83 | `docUpload.extractionField.policeReport` | Police report (alias) | Polizeibericht (Alias) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 84 | `docUpload.extractionField.pressureBar_fl` | Pressure FL | Druck VL | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 85 | `docUpload.extractionField.pressureBar_fr` | Pressure FR | Druck VR | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 86 | `docUpload.extractionField.pressureBar_rl` | Pressure RL | Druck HL | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 87 | `docUpload.extractionField.pressureBar_rr` | Pressure RR | Druck HR | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 88 | `docUpload.extractionField.pressureUnit` | Pressure unit | Druck-Einheit | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 89 | `docUpload.extractionField.quantityLiters` | Quantity (liters) | Menge (Liter) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 90 | `docUpload.extractionField.rearDiscMm` | Rear discs | Scheiben hinten | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 91 | `docUpload.extractionField.rearPadMm` | Rear pads | Beläge hinten | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 92 | `docUpload.extractionField.recipient` | Recipient | Empfänger | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 93 | `docUpload.extractionField.recordKind` | Measurement kind | Messungsart | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 94 | `docUpload.extractionField.referenceNumber` | Reference number | Aktenzeichen / Referenz | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 95 | `docUpload.extractionField.reinspectionDeadline` | Re-inspection deadline | Nachprüfung bis | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 96 | `docUpload.extractionField.reinspectionRequired` | Re-inspection required | Nachprüfung erforderlich | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 97 | `docUpload.extractionField.reportNumber` | Report number | Berichtsnummer | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 98 | `docUpload.extractionField.restingVoltage` | Resting voltage (V) | Ruhespannung (V) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 99 | `docUpload.extractionField.result` | Result | Ergebnis | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 100 | `docUpload.extractionField.reverseCharge` | Reverse charge | Reverse Charge | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 101 | `docUpload.extractionField.scope` | Scope (LV/HV) | Bereich (LV/HV) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 102 | `docUpload.extractionField.scopeCsv` | Axle/position | Achse/Position | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 103 | `docUpload.extractionField.season` | Season | Saison | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 104 | `docUpload.extractionField.sender` | Sender | Absender | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 105 | `docUpload.extractionField.serviceKind` | Kind | Art | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 106 | `docUpload.extractionField.severity` | Severity | Schweregrad | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 107 | `docUpload.extractionField.sohPercent` | SOH (%) | SOH (%) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 108 | `docUpload.extractionField.sohSource` | SOH source | SOH-Quelle | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 109 | `docUpload.extractionField.subject` | Subject | Betreff | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 110 | `docUpload.extractionField.subtotalNet` | Net (cents) | Netto (Cent) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 111 | `docUpload.extractionField.summary` | Summary | Zusammenfassung | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 112 | `docUpload.extractionField.supplier` | Supplier | Lieferant | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 113 | `docUpload.extractionField.taxExemptReason` | Tax exemption | Steuerbefreiung | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 114 | `docUpload.extractionField.taxRatePercent` | Tax rate (%) | Steuersatz (%) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 115 | `docUpload.extractionField.taxSemantics` | Tax semantics | Steuersemantik | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 116 | `docUpload.extractionField.temperatureC` | Temperature (°C) | Temperatur (°C) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 117 | `docUpload.extractionField.temperatureContext` | Temperature context | Temperaturkontext | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 118 | `docUpload.extractionField.testResult` | Test result | Testergebnis | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 119 | `docUpload.extractionField.thirdPartyInvolved` | Third party involved | Drittbeteiligung | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 120 | `docUpload.extractionField.tireBrand` | Brand | Marke | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 121 | `docUpload.extractionField.tireModel` | Model | Modell | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 122 | `docUpload.extractionField.tireSize` | Size | Dimension | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 123 | `docUpload.extractionField.title` | Title | Titel | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 124 | `docUpload.extractionField.totalCents` | Amount (cents, alias) | Betrag (Cent, Alias) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 125 | `docUpload.extractionField.totalGross` | Gross (cents) | Brutto (Cent) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 126 | `docUpload.extractionField.totalTax` | VAT (cents) | MwSt. (Cent) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 127 | `docUpload.extractionField.treadDepthMm_fl` | Tread FL | Profil VL | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 128 | `docUpload.extractionField.treadDepthMm_fr` | Tread FR | Profil VR | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 129 | `docUpload.extractionField.treadDepthMm_rl` | Tread RL | Profil HL | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 130 | `docUpload.extractionField.treadDepthMm_rr` | Tread RR | Profil HR | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 131 | `docUpload.extractionField.treadDepthUnit` | Tread depth unit | Profiltiefe-Einheit | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 132 | `docUpload.extractionField.validUntil` | Valid until | Gültig bis | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 133 | `docUpload.extractionField.vendorName` | Vendor (alias) | Anbieter (Alias) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 134 | `docUpload.extractionField.voltageV` | Voltage (V) | Spannung (V) | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 135 | `docUpload.extractionField.workshopFinding` | Workshop finding | Werkstattbefund | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 136 | `docUpload.extractionField.workshopName` | Workshop | Werkstatt | resolveExtractionFieldLabel | vehicle | vehicle-specific | machine-field-label | — | no | yes | yes |
| 137 | `docUpload.flow.duplicate_blocked` | Duplicate detected | Duplikat erkannt | DocumentUploadDuplicatePanel | shared | shared | flow-status | — | no | yes | yes |
| 138 | `docUpload.hostError.actionPlanBlocked` | The action plan is blocked — please resolve open items. | Der Aktionsplan ist blockiert — bitte offene Punkte beheben. | resolveHostErrorMessage | shared | shared | host-fallback | — | no | yes | yes |
| 139 | `docUpload.hostError.confirmFailed` | Confirmation failed. | Bestätigung fehlgeschlagen. | resolveHostErrorMessage | shared | shared | host-fallback | — | no | yes | yes |
| 140 | `docUpload.hostError.extractionFailed` | Extraction failed. | Extraktion fehlgeschlagen. | resolveHostErrorMessage | shared | shared | host-fallback | — | no | yes | yes |
| 141 | `docUpload.hostError.loadFailed` | Could not load document. | Dokument konnte nicht geladen werden. | resolveHostErrorMessage | shared | shared | host-fallback | — | no | yes | yes |
| 142 | `docUpload.hostError.reextractFailed` | Re-extraction failed. | Re-Extraktion fehlgeschlagen. | resolveHostErrorMessage | shared | shared | host-fallback | — | no | yes | yes |
| 143 | `docUpload.hostError.retryFailed` | Retry failed. | Erneuter Versuch fehlgeschlagen. | resolveHostErrorMessage | shared | shared | host-fallback | — | no | yes | yes |
| 144 | `docUpload.hostError.saveFieldsBeforeConfirm` | Please save fields and re-check before confirming. | Bitte Felder speichern und erneut prüfen, bevor Sie bestätigen. | resolveHostErrorMessage | shared | shared | host-fallback | — | no | yes | yes |
| 145 | `docUpload.hostError.typeSetFailed` | Could not set document type. | Dokumenttyp konnte nicht gesetzt werden. | resolveHostErrorMessage | shared | shared | host-fallback | — | no | yes | yes |
| 146 | `docUpload.hostError.uploadFailed` | Upload failed. | Upload fehlgeschlagen. | resolveHostErrorMessage | shared | shared | host-fallback | — | no | yes | yes |
| 147 | `docUpload.hostError.uploadTargetUnavailable` | Upload target unavailable. | Upload-Ziel nicht verfügbar. | resolveHostErrorMessage | shared | shared | host-fallback | — | no | yes | yes |
| 148 | `docUpload.hostError.vehicleRequiredBeforeConfirm` | Vehicle assignment required before confirming apply. | Fahrzeugzuordnung erforderlich, bevor die Übernahme bestätigt werden kann. | resolveHostErrorMessage | shared | shared | host-fallback | — | no | yes | yes |
| 149 | `docUpload.processingProgressAria` | Processing progress | Verarbeitungsfortschritt | shared intake components | shared | shared | presentation | — | no | yes | yes |
| 150 | `docUpload.retryFromStep` | Retry from “{step}” | Erneut ab „{step}“ | shared intake components | shared | shared | presentation | — | no | yes | yes |
| 151 | `docUpload.retryTryAgain` | Try again | Erneut versuchen | shared intake components | shared | shared | presentation | — | no | yes | yes |
| 152 | `docUpload.supportedFormatsTemplate` | {extensions} · max. {maxMb} MB | {extensions} · max. {maxMb} MB | shared intake components | shared | shared | presentation | — | no | yes | yes |
| 153 | `documentExtraction.classification.ACCIDENT` | Accident report | Unfallbericht | resolveDocumentTypeLabel | shared | shared | document-type-label | EXACT: documentExtraction.type.ACCIDENT | no | yes | yes |
| 154 | `documentExtraction.classification.BATTERY` | Battery record | Batterie-Nachweis | resolveDocumentTypeLabel | shared | shared | document-type-label | SEMANTIC: documentExtraction.type.BATTERY | no | yes | yes |
| 155 | `documentExtraction.classification.BOKRAFT_REPORT` | BOKraft | BOKraft | resolveDocumentTypeLabel | shared | shared | document-type-label | EXACT: documentExtraction.type.BOKRAFT_REPORT | no | yes | yes |
| 156 | `documentExtraction.classification.BRAKE` | Brake record | Bremsen-Nachweis | resolveDocumentTypeLabel | shared | shared | document-type-label | SEMANTIC: documentExtraction.type.BRAKE | no | yes | yes |
| 157 | `documentExtraction.classification.DAMAGE` | Damage report | Schadensbericht | resolveDocumentTypeLabel | shared | shared | document-type-label | EXACT: documentExtraction.type.DAMAGE | no | yes | yes |
| 158 | `documentExtraction.classification.FINE` | Fine | Fine | resolveDocumentTypeLabel | shared | shared | document-type-label | SEMANTIC: documentExtraction.type.FINE | no | yes | yes |
| 159 | `documentExtraction.classification.INVOICE` | Invoice | Rechnung | resolveDocumentTypeLabel | shared | shared | document-type-label | EXACT: documentExtraction.type.INVOICE | no | yes | yes |
| 160 | `documentExtraction.classification.OIL_CHANGE` | Oil change | Ölwechsel | resolveDocumentTypeLabel | shared | shared | document-type-label | EXACT: documentExtraction.type.OIL_CHANGE | no | yes | yes |
| 161 | `documentExtraction.classification.OTHER` | Other document | Sonstiges Dokument | resolveDocumentTypeLabel | shared | shared | document-type-label | EXACT: documentExtraction.type.OTHER | no | yes | yes |
| 162 | `documentExtraction.classification.SERVICE` | Service record | Service-Nachweis | resolveDocumentTypeLabel | shared | shared | document-type-label | EXACT: documentExtraction.type.SERVICE | no | yes | yes |
| 163 | `documentExtraction.classification.TIRE` | Tire record | Reifen-Nachweis | resolveDocumentTypeLabel | shared | shared | document-type-label | SEMANTIC: documentExtraction.type.TIRE | no | yes | yes |
| 164 | `documentExtraction.classification.TUV_REPORT` | MOT / inspection | TÜV / HU | resolveDocumentTypeLabel | shared | shared | document-type-label | SEMANTIC: documentExtraction.type.TUV_REPORT | no | yes | yes |
| 165 | `documentExtraction.classification.VEHICLE_CONDITION` | Registration / vehicle document | Zulassung / Fahrzeugschein | resolveDocumentTypeLabel | shared | shared | document-type-label | SEMANTIC: documentExtraction.type.VEHICLE_CONDITION | no | yes | yes |

**Total: 165 keys**

---

*Audit artifact only. No production, dictionary, test, scanner, or architecture changes.*
