# P2.2.60 — Vehicle Documents Upload / Extraction Flow

**Date:** 2026-08-28  
**Mode:** Strict read-only mutation-aware pre-flight  
**Campaign:** RENTAL  
**Frozen:** P216–P259  
**Baseline:** `2586c202564f8b10c0c48b5717ea8bf339138da1` (P259 merge SHA)

---

## PART A — P259 freeze certification

| Check | Result |
|-------|--------|
| PR #1390 merged | **YES** (`mergedAt: 2026-08-28T17:42:38Z`, `state: MERGED`, `closed: true`) |
| Implementation HEAD | `11653bbe6bc6bcde610561a67fe1b28a6fc95e6c` ✓ |
| Merge SHA | `2586c202564f8b10c0c48b5717ea8bf339138da1` ✓ |
| Final audit #1394 verdict | **A — READY FOR P2.2.59 FREEZE / MERGE** |

### Certified P259 dictionary / scanner state

| Metric | Expected | Actual (P259 baseline) |
|--------|----------|----------------------|
| EN | 9082 | **9082** |
| DE | 9082 | **9082** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| Global scanner | 1382 | **1382** |
| Rental scanner | 285 | **285** |
| Finance/Billing scanner | 25 | **25** |
| P259 enforce-clean | 0 | **0** |
| Category E | 0 | **0** |

**P259 scope complete:** `DocumentsView.tsx` + `DocumentComplianceSummaryCard.tsx` — 100% localized.  
**P259 deliberate deferral:** `VehicleDocumentUploadDrawer` and full upload/review/extraction stack.

---

## PART B — Baseline selection

| Item | SHA |
|------|-----|
| P259 merge SHA | `2586c202564f8b10c0c48b5717ea8bf339138da1` |
| Current `origin/main` | `d6198e8b80d394b23a804c80b03b5074a4e7ea3f` |
| Merge-base | `fe40f5cdd85b7843edbd486213e1cd2b26bad02b` |
| P259 ahead of main | 73 commits |
| Main ahead of P259 | 186 commits |

**P259 merge SHA is NOT an ancestor of `origin/main`.** P259 merged on GitHub but not yet absorbed into `main`.

### Documents-path drift (P259 merge → main)

15 files differ on vehicle-documents paths:

- `DocumentsView.tsx`, `DocumentComplianceSummaryCard.tsx`, `vehicle-file.constants.ts`
- `DocumentArchivePanel.tsx`, `DocumentClassificationResultPanel.tsx`, `DocumentEntityReview.tsx`
- `DocumentExtractionFlowStatus.tsx`, `DocumentExtractionReviewPanel.tsx`, `DocumentIntakeProcessingSteps.tsx`
- `DocumentIntakeUploadZone.tsx`, `DocumentReviewInboxPanel.tsx`, `DocumentSchemaFieldReview.tsx`
- `VehicleDocumentUploadDrawer.tsx`, `document-upload-ui-coverage.test.ts`, `vehicle-file.hardening.test.ts`
- `document-intake-v2-flow.contract.test.ts`

Drift character: mostly theme/token class migrations and test harness updates — **LOW semantic**, but topology diverges.

**Baseline strategy:** **DIRECT FROM P259 MERGE BASELINE** (`2586c202`)

Rationale: P259 certified state lives on merge SHA; absorbing unrelated Battery/Trip/runtime work from `main` would contaminate campaign topology.

---

## PART C — Runtime mount trace

### Route topology

```
/rental (App.tsx state machine)
  → selected vehicle
  → currentView === 'documents'
  → DocumentsView.tsx
      → upload CTA (per category) / review CTA
      → VehicleDocumentUploadDrawer (open={!!drawer})
```

### Drawer children (active mount order)

| Component | Role |
|-----------|------|
| `DocumentIntakeUploadZone` | Idle file picker / dropzone (`flow === 'idle'`) |
| `DocumentExtractionFlowStatus` | Processing, duplicate, failed, business-duplicate warning |
| `DocumentUploadDuplicatePanel` | Hard duplicate resolution (`flow === 'duplicate_blocked'`) |
| `DocumentIntakeProcessingSteps` | Step list during processing (via FlowStatus) |
| `DocumentClassificationResultPanel` | Awaiting type selection (`flow === 'awaiting_type'`) |
| `DocumentExtractionReviewPanel` | Field review + entity/schema/action-plan review |
| `DocumentApplyResultPanel` | Apply progress / partial / retry failed actions |
| `DocumentFollowUpSuggestionsPanel` | Post-apply follow-up suggestions |

### Hook authority

```
VehicleDocumentUploadDrawer
  → useDocumentExtractionFlow (thin wrapper)
    → useDocumentIntakeFlow (all mutations + polling)
```

**Note:** `categoryId` prop is passed from `DocumentsView` but **not consumed** inside `VehicleDocumentUploadDrawer` (drawer uses `initialDocType: 'AUTO'`).

### Shared surfaces (blast radius)

`DocumentExtractionFlowStatus`, `useDocumentIntakeFlow`, `document-extraction.shared.ts` are also mounted from:

- `DocumentUploadView.tsx` (org-level AI upload page)
- `OperatorAiUploadFlow.tsx` (operator surface)

P260 localization of shared components affects these surfaces — acceptable if keys are shared/reused, not vehicle-documents-only.

---

## PART D — Component classification

| Component / module | Classification |
|--------------------|----------------|
| `VehicleDocumentUploadDrawer.tsx` | **ACTIVE MOUNTED** (rental documents tab) |
| `DocumentIntakeUploadZone.tsx` | **ACTIVE SHARED** (prop-driven labels) |
| `DocumentExtractionFlowStatus.tsx` | **ACTIVE SHARED** |
| `DocumentUploadDuplicatePanel.tsx` | **ACTIVE CONDITIONAL** |
| `DocumentIntakeProcessingSteps.tsx` | **ACTIVE CONDITIONAL** |
| `DocumentClassificationResultPanel.tsx` | **ACTIVE CONDITIONAL** (mostly `t()` already) |
| `DocumentExtractionReviewPanel.tsx` | **ACTIVE CONDITIONAL** |
| `DocumentApplyResultPanel.tsx` | **ACTIVE CONDITIONAL** (mostly `t()` already) |
| `DocumentFollowUpSuggestionsPanel.tsx` | **ACTIVE CONDITIONAL** (already `docUpload.followUp.*`) |
| `DocumentEntityReview.tsx` | **ACTIVE CONDITIONAL** (child of review panel) |
| `DocumentSchemaFieldReview.tsx` | **ACTIVE CONDITIONAL** |
| `DocumentActionPlanReview.tsx` | **ACTIVE CONDITIONAL** |
| `useDocumentIntakeFlow.ts` | **ACTIVE SHARED** (validation/error host copy) |
| `document-extraction.shared.ts` | **ACTIVE SHARED** (`FLOW_STATUS_LABEL_DE`, `DOC_TYPE_LABELS`, `EXTRACTION_TEMPLATES`) |
| `DocumentsView.tsx` | **FROZEN P259** — do not rewrite |
| `DocumentComplianceSummaryCard.tsx` | **FROZEN P259** |
| `DocumentArchivePanel.tsx` | **DEFERRED FUTURE** (not in drawer mount) |
| `DocumentReviewInboxPanel.tsx` | **DEFERRED FUTURE** (not in drawer mount) |
| `LegalDocumentsTab.tsx` | **UNRELATED** (1 scanner finding, separate surface) |
| `CustomerDocumentUploadBox.tsx` | **UNRELATED** (customer context) |

---

## PART E — Scanner / hidden debt

### Scanner-visible debt (active upload/extraction subtree)

| File | Findings | Samples |
|------|----------|---------|
| `DocumentUploadDuplicatePanel.tsx` | **6** | Title, body, label, placeholder, CTA |
| `DocumentExtractionFlowStatus.tsx` | **1** | Business-duplicate warning title |
| **Total scanner-visible** | **7** | |

`VehicleDocumentUploadDrawer.tsx` is on **P22 enforce-clean allowlist** (`hardcoded-copy-guard.test.ts:61`) — **zero scanner findings, NOT zero debt**.

### Hidden host debt (manual inventory)

| Location | Est. strings | Examples |
|----------|-------------|----------|
| `VehicleDocumentUploadDrawer.tsx` | ~30 | Drawer eyebrow/title/description, dropzone labels, processing step labels, `FLOW_STATUS_LABEL_DE` chip, `"Fertig"`, `buildOriginContextHint(..., 'Fahrzeugdetail')` |
| `DocumentExtractionFlowStatus.tsx` | ~10 | Retry/cancel buttons, business-duplicate body, retry-from-step label |
| `useDocumentIntakeFlow.ts` | ~15 | `defaultValidationMessage`, `mapUploadError`, confirm blockers |
| `document-extraction.shared.ts` | ~90+ | `FLOW_STATUS_LABEL_DE` (19), `DOC_TYPE_LABELS` (13), `EXTRACTION_TEMPLATES` field labels (~120+) |
| `DocumentIntakeProcessingSteps.tsx` | 1 | `aria-label="Verarbeitungsfortschritt"` |

| Category | Count |
|----------|-------|
| Scanner-visible | **7** |
| Hidden host (drawer + flow status + hook validation) | **~55** |
| Hidden host (`EXTRACTION_TEMPLATES` field labels) | **~120** (review panel — same mount) |
| **Total actionable presentation debt** | **~180** (best-effort; templates dominate worst case) |

---

## PART F — Host copy inventory (active P260 flow)

| UI element | Path | Symbol / source | Condition | Scanner |
|------------|------|-----------------|-----------|---------|
| Drawer eyebrow | `VehicleDocumentUploadDrawer.tsx:170` | `"AI Document Upload"` | always | NO (allowlisted) |
| Drawer title | `:171` | mode-dependent DE strings | upload/review/view | NO |
| Drawer description | `:172` | `"KI-gestützter Dokumenten-Upload"` | always | NO |
| Status chip | `:176` | `FLOW_STATUS_LABEL_DE[flow.flow]` | always | NO |
| Dropzone label | `:194` | `"Datei hier ablegen oder klicken"` | idle upload | NO |
| Dropzone active | `:195` | `"Datei hier ablegen..."` | drag | NO |
| Browse label | `:196` | `"Datei auswählen"` | idle | NO |
| Formats label | `:186-188` | dynamic ext + MB | idle | NO |
| Processing steps | `:216-221` | 6 DE step labels | processing | NO |
| Awaiting type detail | `:223` | DE string | awaiting_type | NO |
| Retry detail | `:224` | DE strings | retrying/failed | NO |
| Elapsed prefix | `:225` | `"Laufzeit"` | processing | NO |
| Long-running hint | `:226` | DE string | >90s | NO |
| Safe-leave hint | `:227` | DE string | >90s | NO |
| Network warning | `:228` | DE string | poll failures | NO |
| Close button | `:133` | `t('vehicle.documents.close')` | ready/applying | NO (localized) |
| Confirm button | `:143` | `t('docUpload.confirmAndFile')` | ready | NO |
| Done button | `:153` | `"Fertig"` | done | NO |
| Duplicate title | `DocumentUploadDuplicatePanel.tsx:28` | host | duplicate_blocked | **YES** |
| Duplicate body | `:29-30` | host | duplicate_blocked | **YES** |
| Existing doc fallback | `:37` | `"Bestehendes Dokument"` | has existing | NO |
| Status line | `:40` | `Status: {machine} · Typ: {machine}` | has existing | NO (mixed) |
| Reason label | `:53` | host | duplicate_blocked | **YES** |
| Reason placeholder | `:58` | host | duplicate_blocked | **YES** |
| Cancel / reupload | `:69, :77` | host | duplicate_blocked | partial YES |
| Business dup title | `DocumentExtractionFlowStatus.tsx:145` | host | warning path | **YES** |
| Business dup body | `:146-148` | host | warning path | NO |
| Retry button | `:168-169` | host | failed step | NO |
| Cancel button | `:179, :235` | `"Abbrechen"` | failed/cancel | NO |
| Failed title | `:216` | `flowStatusLabel(flow)` | failed | NO |
| Error body | `:217` | `errorMessage` (raw) | failed | NO |
| Validation error | hook → zone/status | `validationError` | validation fail | NO |
| Applied success | `:330` | `t('vehicle.documents.applied')` | done | NO |
| Partial success | `:352-354` | `t('vehicle.documents.partiallyApplied')` | partially_done | NO |
| Re-extract link | `:296` | `t('vehicle.documents.reExtract')` | ready | NO |
| Processing aria | `DocumentIntakeProcessingSteps.tsx:54` | `"Verarbeitungsfortschritt"` | processing | NO |

---

## PART G — Raw data ownership

| Value | Classification | Preserve raw? |
|-------|----------------|---------------|
| `uploadedFileName` / `file.name` | **BACKEND RAW / USER RAW** | YES |
| `errorMessage` (API) | **BACKEND RAW** | YES |
| `validationError` (host rule) | **HOST** (localize by machine code) | N/A |
| `record.sourceFileName` | **BACKEND RAW** | YES |
| `existing.sourceFileName` | **BACKEND RAW** | YES |
| `existing.status` | **MACHINE** | label only |
| `existing.effectiveDocumentType` | **MACHINE** | label via adapter |
| `uploadContext.conflicts[].message` | **BACKEND RAW** | YES |
| `plausibility.checks[].message` | **BACKEND RAW** | YES |
| `suggestion.title` / `rationale` | **BACKEND RAW** | YES |
| Provider extraction field values | **PROVIDER RAW** | YES |
| `reuploadReason` (user textarea) | **USER RAW** | YES |

### Raw preservation fixtures (required tests)

| Fixture | Example | Rule |
|---------|---------|------|
| Filename | `Fahrzeugschein_P260_X7.pdf` | unchanged DE/EN |
| Provider message | `Provider Extraction Message X7` | unchanged |
| Backend upload error | `Backend Upload Error X7` | unchanged |
| Duplicate candidate title | `Provider Duplicate Title X7` | unchanged |
| Unknown category | `Unknown Category P260 X7` | machine fallback label, raw ID preserved |

---

## PART H — Machine state inventory

### FlowStatus (`document-extraction.shared.ts`)

`idle | validating | uploading | stored | queued | retrying | processing | ocr | classifying | extracting | validating_plausibility | awaiting_type | ready | applying | partially_done | apply_failed | done | failed | cancelled | duplicate_blocked`

- **Source:** client + `mapServerToFlowStatus` / `mapApplyAwareFlowStatus`
- **Logic-bearing:** YES (render branches, button eligibility)
- **API payload:** NO (server uses own status enums)
- **May display translated label:** YES via machine key map
- **Unknown fallback:** show raw machine string

### UploadValidationCode

`NO_VEHICLE | NO_FILE | MULTIPLE_FILES | EMPTY_FILE | FILE_TOO_LARGE | INVALID_EXTENSION | INVALID_MIME`

- Host-owned validation messages (localize by code)
- Machine codes must remain exact in logic

### Document type (machine)

`AUTO | SERVICE | OIL_CHANGE | TIRE | BRAKE | BATTERY | TUV_REPORT | BOKRAFT_REPORT | VEHICLE_CONDITION | INVOICE | DAMAGE | ACCIDENT | FINE | OTHER`

- Submit **machine ID**, never localized label
- Reuse `documentExtraction.classification.*` and/or P259 `vehicleDocuments.category.*` where semantically exact

### PlausibilityStatus

`OK | WARNING | BLOCKER` — machine, label only

### allowedActions (server)

`retry | cancel | confirm | reextract | set_document_type | retry_failed_actions` — machine gates

### uploadDuplicateStatus

`POSSIBLE_BUSINESS_DUPLICATE` — machine gate for warning panel

---

## PART I — Mutation inventory

| UI action | Callback | Hook | Endpoint | Method | Payload highlights |
|-----------|----------|------|----------|--------|-------------------|
| Select file | `onFilesSelected` → `handleFile` | `useDocumentIntakeFlow` | — | — | validates locally |
| Upload | `handleFile` → `performUpload` | same | `/vehicles/:id/document-extractions/upload` | POST multipart | `file`, `documentType`, `source`, optional `reuploadReason`, `relatedExtractionId` |
| Org upload (alt path) | `performUpload` | same | org extraction upload | POST | `requestedDocumentType`, context |
| Authorized reupload | `handleAuthorizedReupload` | same | upload + `reuploadReason` | POST | `File` from `pendingFileRef`, reason ≥3 chars |
| Retry extraction | `handleRetry` | same | `/vehicles/:id/document-extractions/:id/retry` | POST | `{}` |
| Set document type | `handleSetDocumentType` | same | setDocumentType | POST | `{ documentType, reextract }` |
| Re-extract | `handleReextract` | same | setDocumentType + `reextract: true` | POST | same |
| Confirm & apply | `handleConfirm` | same | `/confirm` | POST | `{ confirmedData, actionPlanFingerprint }` |
| Retry failed actions | `handleRetryFailedActions` | same | retryFailedDocumentActions | POST | extractionId |
| Poll status | `createExtractionPoller` | same | GET extraction | GET | read-only |
| Reset / cancel UI | `handleReset` | same | — | — | clears state, stops poll |
| Close drawer | `onOpenChange(false)` | drawer effect | — | — | calls `handleReset` when `open=false` |
| Schema review save | `handleSchemaReviewUpdated` | child panels | schema review API | POST | field review payload |
| Follow-up refresh | `followUp.reload()` | `useDocumentFollowUpSuggestions` | GET | GET | read-only |

**Permissions:** No explicit RBAC in drawer — gated by `record.allowedActions` from backend and `canConfirmActionPlan` (field review + plausibility + action plan).

**Idempotency:** No client idempotency key; server owns duplicate detection.

---

## PART J — Duplicate resolution mutations

`DocumentUploadDuplicatePanel` actions:

| Action | Machine value | Callback | Endpoint effect |
|--------|---------------|----------|-----------------|
| Cancel | — | `onCancel` → `handleReset` | no API call; clears state |
| Reupload with reason | free-text `reason` (≥3 chars) | `onReupload(reason)` → `handleAuthorizedReupload` | POST upload with `reuploadReason` + `relatedExtractionId` |

No "keep existing", "replace", or "link existing" UI — only cancel or authorized reupload.

---

## PART K — Extraction flow mutations vs display

`DocumentExtractionFlowStatus` is **mixed**:

| Behavior | Type |
|----------|------|
| Processing step display | **read-only** |
| Elapsed timer | **read-only** (recomputed on poll tick) |
| Poll network warning | **read-only** |
| Business duplicate warning | **read-only** (upload already started) |
| Retry button | **mutation** → `handleRetry` |
| Cancel button | **mutation** → `handleReset` (no server cancel unless `allowedActions` includes cancel — not wired in drawer) |
| Duplicate panel embed | **mutation** on reupload |

---

## PART L — Key reuse / budget / split / verdict

### P259 reuse plan

| Namespace | Reuse |
|-----------|-------|
| `vehicleDocuments.category.*` | YES — 13 category IDs for display where semantically exact |
| `vehicleDocuments.status.*` | YES — UI status chips if shown |
| `docUpload.*` | YES — dropzone, confirm, awaiting type, follow-up, many existing keys |
| `documentExtraction.classification.*` | YES — doc type labels (replace `DOC_TYPE_LABELS`) |
| `vehicle.documents.*` | YES — close, applied, reExtract, partiallyApplied |
| `common.*` | YES — retry, cancel where exact |

**Do NOT duplicate 13 category keys.**

### Status reuse

Map `FlowStatus` → new `docUpload.flowStatus.*` or `vehicleDocuments.uploadFlow.*` keys (19 values).  
Do not conflate with `vehicleDocuments.status.*` (overview UI status — different domain).

### Projected new keys

| Scenario | Count |
|----------|-------|
| Best | **~60** (heavy `docUpload.*` reuse; field labels via compact adapter) |
| Likely | **~90–110** |
| Worst | **~160+** (full `EXTRACTION_TEMPLATES` per-field keys) |

### Scope split decision

**ONE SLICE — COMPLETE UPLOAD / EXTRACTION FLOW**

Rationale: single hook authority, cohesive drawer mount, splitting duplicate vs extraction vs review would leave half-localized mutation UX. Field templates belong to same review mount.

### Category E feasibility

| Constraint | Feasible? |
|------------|-----------|
| File identity unchanged | YES |
| Category machine unchanged | YES (`AUTO` default; type selector uses machine IDs) |
| Upload payload unchanged | YES |
| Duplicate decision machine unchanged | YES |
| Extraction/apply payload unchanged | YES |
| Permission/eligibility unchanged | YES |
| Polling unchanged | YES (locale must not restart poll) |
| P259 overview refetch unchanged | YES (`onComplete → reload()`) |
| Raw ownership preserved | YES |

**Category E: YES** — presentation-only slice.

### Enforce-clean boundary (P260)

Must include (no allowlists, no ignores):

- `rental/components/documents/VehicleDocumentUploadDrawer.tsx`
- `rental/components/documents/DocumentExtractionFlowStatus.tsx`
- `rental/components/documents/DocumentUploadDuplicatePanel.tsx`
- `rental/components/documents/DocumentIntakeProcessingSteps.tsx`
- `rental/components/documents/DocumentIntakeUploadZone.tsx` (verify prop-only)
- `rental/hooks/useDocumentIntakeFlow.ts` (validation message builder only — or extract to i18n helper)
- `rental/components/documents/document-extraction.shared.ts` (status labels + type labels + field label adapter)
- Child panels already using `t()` — verify zero regressions

Remove `VehicleDocumentUploadDrawer.tsx` from P22 allowlist when P260 lands.

### Production paths expected to change

| File | Class |
|------|-------|
| `VehicleDocumentUploadDrawer.tsx` | primary presentation |
| `DocumentExtractionFlowStatus.tsx` | shared presentation |
| `DocumentUploadDuplicatePanel.tsx` | shared presentation |
| `DocumentIntakeProcessingSteps.tsx` | shared presentation |
| `document-extraction.shared.ts` | adapter |
| `useDocumentIntakeFlow.ts` | hook (validation messages → i18n helper) |
| `rental-vehicle-documents-upload-localization.test.tsx` (new) | tests |
| `rental.vehicleDocuments.{en,de}.ts` or `docUpload.*` extensions | dictionary |
| `hardcoded-copy-guard.test.ts` | governance (P260 enforce-clean entry) |

**Backend/hook API changes: ZERO expected.**

### Drawer state (same-mount contract)

| State | Owner | Preserve on locale? |
|-------|-------|---------------------|
| `open` | DocumentsView | YES |
| `pendingFileRef` / selected file | hook ref | YES (File identity) |
| `documentType` / `confirmedDocType` | hook | YES |
| `flow` | hook | YES |
| `duplicateBlocked` / reason textarea | hook + panel local | YES |
| `editedFields` | hook | YES |
| `extractionId` | hook | YES |
| `processingStartedAt` | hook | YES |

### File object identity

`pendingFileRef` holds `File` across duplicate_blocked → reupload. Locale switch must not clear ref or re-open file picker. No `key={locale}` on drawer or upload zone.

### Polling / locale side-effect

`startPolling` deps: `[applyRecord, canUseOrgScope, fetchExtractionRecord, pollThroughApply, stopPolling, vehicleId]` — **no `t` or locale**.  
`applyRecord` uses `locale` only for `buildReviewFields` — must not restart poll on locale change.

**Locale side-effect contract:** upload=0, retry=0, duplicate=0, confirm=0, reextract=0 on pure locale switch.

### Close / cancel / success semantics

| Event | Behavior |
|-------|----------|
| Close drawer | `onOpenChange(false)` → `setDrawer(null)`; drawer `useEffect` calls `handleReset()` |
| Cancel (duplicate/failed) | `handleReset()` — clears file ref, stops poll |
| Upload success | `onComplete()` → `DocumentsView.reload()`; drawer may show done state before close |
| Locale switch | must NOT trigger reset/close/upload |

### P259 overview interaction

Success path: `onComplete={() => void reload()}` on drawer — refetches vehicle file summary only. **Do not modify P259 display adapters.**

---

## Mutation freeze matrix

| Action | Locale side-effect allowed? | Loading state |
|--------|----------------------------|---------------|
| File select | NO | `validating` → `uploading` |
| Upload | NO | `uploading` |
| Authorized reupload | NO | `uploading` |
| Retry | NO | `retrying` |
| Set type / reextract | NO | `retrying` |
| Confirm | NO | `applying` |
| Retry failed actions | NO | `applyRetryPending` |
| Poll tick | YES (read-only) | — |
| Reset | NO | → `idle` |

---

## Test strategy summary

### Presentation
DE/EN for all host chrome; machine status labels; validation copy; a11y; unknown machine fallback; raw fixtures preserved.

### Same-mount (mandatory)
One `LanguageProvider` root; open drawer once; select category context (if wired later); mock file; DE→EN→DE; `mount count = 1`; File identity preserved; no mutation callbacks on locale switch.

### Real hook (mandatory per mutation)
Extend `useDocumentIntakeFlow.test.ts` / contract tests — assert endpoint, method, payload, IDs, file, category machine, reupload reason.

### Failure paths
Validation fail, upload fail, duplicate_blocked, business duplicate warning, extraction fail, retry, confirm blocked, close during processing.

### Locale side-effects
Instrument API mocks; locale switch must not increment mutation counters.

### P259 regression
Overview remains localized; category order; timeline order; raw overview data unchanged.

---

## Collision / drift

### Main drift on P260 paths

| Classification | Notes |
|----------------|-------|
| LOW–MEDIUM | 15 files differ; mostly styling tokens, not upload logic |

### Active PR collision

| PR area | Collision on P260 paths |
|---------|-------------------------|
| Battery V2 (#1389, #1393) | **NONE** |
| Energy events (#1395) | **NONE** |
| Trip detection audit (#1396) | **NONE** |
| P259 audits (#1392, #1394) | **NONE** (audit-only) |

**Collision: NONE**

---

## Progress update (#1388 methodology)

| Metric | Pre-P259 (#1388) | Post-P259 (now) |
|--------|------------------|-----------------|
| Active mounted Rental surfaces | 37 | 37 |
| Fully covered (0 debt) | 29 | **30** (+documents overview) |
| **Coverage %** | 78.4% | **81.1%** |
| Rental scanner | 308 | **285** |
| Dead legacy billing | 20 | 20 |
| Active actionable debt | 288 | **265** |
| Vehicle Documents debt | 30 | **8** (upload subtree only) |
| **Est. debt cleared %** | ~52% | **~59%** |

### Documents completion gate

| Question | Answer |
|----------|--------|
| P260 completes ACTIVE MOUNTED vehicle documents? | **YES** (drawer + shared intake stack) |
| Remaining after P260 | `LegalDocumentsTab.tsx` (1 finding) — **unrelated** to vehicle detail documents |

### P261 forecast (top 3)

1. **Data Analyse diagnostics** (`DataAnalyseView` — 32 debt) — #1388 likely pick
2. **Vehicle Damages** (`damages/` — 91 debt)
3. **Users & Roles** (`users-roles/` — 67 debt)

**Likely P261:** Data Analyse diagnostics

---

## Final verdict

**A — GO — P2.2.60 COMPLETE UPLOAD / EXTRACTION FLOW**

P2.2.60: Vehicle Documents Upload / Extraction Flow (drawer mount + shared `useDocumentIntakeFlow` presentation stack)

BASELINE: `2586c202564f8b10c0c48b5717ea8bf339138da1`

CAMPAIGN: RENTAL

P216–P259: FROZEN

VEHICLE DOCUMENTS OVERVIEW / LIST: 100% COMPLETE

ACTIVE MOUNTED RENTAL COVERAGE: 81.1%

ACTIONABLE PRESENTATION DEBT CLEARED: ~59%

PROJECTED NEW KEYS: 60 / 90–110 / 160+

DOCUMENTS COMPLETION AFTER P260: YES

LIKELY P261: Data Analyse diagnostics

IMPLEMENTATION NOT STARTED.
