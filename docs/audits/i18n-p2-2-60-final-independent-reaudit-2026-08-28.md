# P2.2.60 — Vehicle Documents Upload / Extraction Final Independent Re-Audit

**Date:** 2026-08-28  
**Auditor mode:** Strict read-only merge certification  
**Implementation PR:** #1400 (Draft, unmerged)  
**Pre-flight:** PR #1397 (audit-only, not merged)  
**Reassessment:** PR #1402 (audit-only, not merged; verdict B — key reduction required)  
**Branch audited:** `cursor/p2260-documents-upload-extraction-i18n-3c10`  
**Baseline:** `2586c202564f8b10c0c48b5717ea8bf339138da1` (P2.2.59 merge)  
**Initial implementation HEAD:** `91e6034ee86a2c8de8a025854d85e687316fbf41`  
**Corrected final HEAD:** `5a350e4856a7262b07e4c2cde2bd53660854abd6`

---

## 157-KEY EXCEPTION CERTIFICATION

| Metric | Independent result |
|--------|-------------------|
| Baseline EN/DE | 9082 |
| Final EN/DE | **9239** |
| P260 new keys | **157** (verified: `rental.documentIntake.en.ts` line count + git diff `+` key lines) |
| Parity | **100%** |
| Orphans | **0** |
| Unused | **0** |
| Duplicates | **0** |

**Verdict:** **157-KEY EXCEPTION JUSTIFIED**

Rationale: All 157 keys serve the production-mounted upload/extraction stack (drawer chrome, duplicate panel, flow status, validation, host errors, semantically distinct classification labels, extraction field labels). Eight exact-reuse duplicates from reassessment #1402 were removed. No further exact canonical reuse misses were found. Six semantically distinct classification keys (TIRE, BRAKE, BATTERY, FINE, TUV_REPORT, VEHICLE_CONDITION) correctly remain dedicated. Count is below the 160-key pre-flight hard stop.

---

## CONFIRM PAYLOAD LOCALE CERTIFICATION

**Test:** `frontend/src/rental/hooks/useDocumentIntakeFlow.p260-locale-mutation.test.ts`  
**Quality:** **STRONG** — real `renderHook(useDocumentIntakeFlow)` with same-mount `rerender({ locale })`; captures `confirmDocumentExtraction` mock calls (not helper-only).

| Step | Locale | Input date | `confirmedData.eventDate` |
|------|--------|------------|---------------------------|
| 1 | DE | `01.02.2026` | `2026-02-01` |
| 2 | EN (after switch) | `01/02/2026` | `2026-01-02` |
| 3 | DE (after switch back) | `01.02.2026` | `2026-02-01` |

**Date fixture asymmetry independently proven** via `parseDisplayDateToIso`:
- DE `01.02.2026` → `2026-02-01`
- EN `01/02/2026` → `2026-01-02`

**Exact confirm contract asserted:**
- Endpoint: `api.vehicleIntelligence.confirmDocumentExtraction`
- Method: POST `/vehicles/{vehicleId}/document-extractions/{extractionId}/confirm`
- Vehicle ID: `veh-p260`
- Extraction ID: `ext-p260`
- `actionPlanFingerprint`: `action-plan-fingerprint-p260` (stable across locale switches)
- No translated labels in payload

**Verdict:** **PASS** — `localeRef.current` is current at confirm time; behavioral payload is authoritative.

---

## POLLING LIFECYCLE CERTIFICATION

**Test:** same file, `does not restart polling lifecycle when locale changes during active polling`  
**Quality:** **STRONG** — mocks `createExtractionPoller`, counts lifecycle `creates`/`stops`, distinguishes restart from continuation.

| Metric | Before DE→EN→DE | After DE→EN→DE |
|--------|-----------------|----------------|
| `pollerLifecycle.creates` | 1 | 1 |
| `pollerLifecycle.stops` | 0 | 0 |
| Locale-triggered restarts | — | **0** |

Normal poll tick (`onRecord` callback) continues and transitions flow to `ready` without new poller creation.

**Production semantics:** Correction delta did not modify `useDocumentIntakeFlow.ts` polling logic. Baseline→final changes: `localeRef` + `applyRecord`/`buildReviewFields` use `localeRef.current` to prevent locale-driven effect churn. Interval/termination/backoff unchanged.

**Verdict:** **PASS**

---

## SHARED CALLER CERTIFICATION

| Caller | Adaptation | Regression |
|--------|------------|------------|
| `DocumentUploadView` / `useDocumentUploadPage` | Shared resolvers via hook boundary | `document-upload-page.test.tsx` PASS |
| `OperatorAiUploadFlow` | `documentExtraction.type.*` / `classification.AUTO` keys only | `document-upload-ui-coverage.test.ts` PASS |
| `VehicleDocumentUploadDrawer` | Full P260 stack | Localization + same-mount tests PASS |

**Operator safety:** No Rental-only `vehicle.documents.*` leakage into operator flow. Shared namespaces `docUpload.*` / `documentExtraction.*` remain generic.

**Verdict:** **PASS** — presentation adaptation only; no mutation semantic regression.

---

## ENFORCE-CLEAN BOUNDARY CERTIFICATION

**Final P260 exact paths (16):**

1. `rental/components/documents/VehicleDocumentUploadDrawer.tsx`
2. `rental/components/documents/DocumentIntakeUploadZone.tsx`
3. `rental/components/documents/DocumentExtractionFlowStatus.tsx`
4. `rental/components/documents/DocumentUploadDuplicatePanel.tsx`
5. `rental/components/documents/DocumentIntakeProcessingSteps.tsx`
6. `rental/components/documents/DocumentClassificationResultPanel.tsx`
7. `rental/components/documents/DocumentExtractionReviewPanel.tsx`
8. `rental/components/documents/DocumentApplyResultPanel.tsx`
9. `rental/components/documents/DocumentFollowUpSuggestionsPanel.tsx`
10. `rental/components/documents/DocumentEntityReview.tsx`
11. `rental/components/documents/DocumentSchemaFieldReview.tsx`
12. `rental/components/documents/DocumentActionPlanReview.tsx`
13. `rental/lib/document-intake-i18n.ts`
14. `rental/hooks/useDocumentIntakeFlow.ts`
15. `rental/hooks/useDocumentUploadPage.ts`
16. `rental/components/documents/document-extraction.shared.ts`

**P260 enforce-clean findings:** **0**  
**P22 allowlist:** `VehicleDocumentUploadDrawer` **not** in P22 allowlist (confirmed in `i18n-hardcoded-scan.mjs` P22 set).  
**OperatorAiUploadFlow.tsx:** Intentionally excluded — pre-existing unrelated operator German literals outside vehicle-documents mount path; not broadened into P260 scope.

**Verdict:** **BOUNDARY SUFFICIENT**

---

## ACTIVE VEHICLE DOCUMENTS COMPLETION

| Surface | Status |
|---------|--------|
| Vehicle Documents Overview/List (P259) | Clean — zero diff from baseline on `DocumentsView` / P259 tests |
| Vehicle Documents Upload/Extraction (P260) | Clean — 16-path enforce-clean = 0 findings |
| **Active mounted Vehicle Documents** | **100% i18n-clean** |

Excluded: `LegalDocumentsTab`, `DocumentArchivePanel`, `DocumentReviewInboxPanel` (out of P260 mount scope).

---

## Topology

| Check | Result |
|-------|--------|
| PR #1400 open | YES |
| Draft | YES |
| Merged | NO |
| Mergeable | MERGEABLE |
| Base OID | `2586c202564f8b10c0c48b5717ea8bf339138da1` |
| HEAD OID | `5a350e4856a7262b07e4c2cde2bd53660854abd6` |
| Commit count (baseline→HEAD) | **2** |
| Chain | `2586c202` → `91e6034e` → `5a350e48` |
| #1397 ancestry | NO |
| #1402 ancestry | NO |

---

## Exact 8 Reuse Fixes (verified absent)

Removed keys confirmed absent from `rental.documentIntake.{en,de}.ts`:
- `documentExtraction.classification.SERVICE|OIL_CHANGE|BOKRAFT_REPORT|INVOICE|DAMAGE|ACCIDENT|OTHER`
- `docUpload.extractionField.description`

Canonical reuse via `resolveDocumentTypeLabel` + `resolveExtractionFieldLabel`.

---

## Mutation / Payload Freeze

Endpoints, HTTP methods, and payload field shapes unchanged across upload/reupload/retry/set-type/reextract/confirm/schema-review paths. Presentation-only changes: `validationErrorCode`, `hostErrorKey`, `localeRef`, resolver wiring.

**Frozen product semantics:**
- `categoryId` — prop present, unconsumed
- `initialDocType` — `'AUTO'`
- `UPLOAD_TARGET_UNAVAILABLE` — internal sentinel preserved
- Error ownership — `Error.message` raw; non-Error → host fallback; `actionPlanBlockedReason` raw precedence

---

## Scanner Accounting

| Metric | Value |
|--------|-------|
| Global | **1375** |
| Rental | **278** |
| Visible reduction (pre-P260 global 1382) | **7** |
| Scanner weakening | **NO** |
| Category E | **0** |

---

## Test Execution (independent)

| Suite | Result |
|-------|--------|
| P260 localization (11) | PASS |
| P260 confirm-locale (2) | PASS |
| P260 hook contract (9) | PASS |
| P259 regression (14) | PASS |
| Shared callers (32) | PASS |
| `npm run i18n:check` | PASS |
| `npm run check:surface` | PASS |
| `npx tsc -b --noEmit` | PASS |
| `npm run build` | PASS |
| `git diff --check` baseline→HEAD | PASS (zero output) |
| `git diff --check` correction delta | PASS (zero output) |

---

## CI Triage (HEAD `5a350e485`)

| Failure | Classification |
|---------|----------------|
| Backend unit tests (vehicle-detail status-patch TS2345) | **Pre-existing / unrelated** |
| Playwright E2E Vehicle Detail | **Pre-existing / unrelated** |
| Typecheck (one workflow run) | **Infrastructure flake** — passes locally on audited HEAD |
| Frontend component tests, Production build, Lint | **PASS** |

**P260-caused required failures:** **0**

---

## Real Hook Test Quality

| Mutation | Classification |
|----------|----------------|
| upload | BEHAVIORAL HOOK MOCK (mutation counters) + SOURCE INSPECTION |
| reupload | SOURCE INSPECTION |
| retry | SOURCE INSPECTION |
| set type | SOURCE INSPECTION |
| reextract | SOURCE INSPECTION |
| confirm | **REAL ENDPOINT-FACING** |
| retry failed actions | SOURCE INSPECTION |

---

## Non-Blocking Observations

1. **File object identity:** Same-mount drawer test preserves drawer open state, reupload reason, and zero mutation deltas, but does not explicitly assert `pendingFileRef.current === testFile` after DE→EN→DE. Production semantics preserve `pendingFileRef` across locale switch; indirect evidence only.
2. **ArchitekturView.tsx** in-app architecture card still references +165 keys / 13 enforce-clean paths (stale; authoritative docs and scanner governance are correct at +157 / 16 paths).

---

## P261 Candidate Ranking (repository truth)

| Rank | Target | Rental scanner signal |
|------|--------|----------------------|
| 1 | **Data Analyse** (`DataAnalyseView.tsx`) | TITLE debt `"Data Analyse"` |
| 2 | **Vehicle Damages** (`DamagesView.tsx`) | Multiple TEXT/TITLE findings |
| 3 | **Users & Roles** (`users-roles/UsersTab.tsx`) | Multiple LABEL/TEXT findings |

**Likely P2.2.61:** Data Analyse diagnostics surface.

---

## Claim Reconciliation

| Claim | #1400 claim | Independent | PASS/FAIL |
|-------|-------------|-------------|-----------|
| 2 commits | 2 | 2 | PASS |
| Direct P259 ancestry | yes | yes | PASS |
| 157 keys | 157 | 157 | PASS |
| 9239/9239 | 9239/9239 | 9239/9239 | PASS |
| Scanner 1375/278 | 1375/278 | 1375/278 | PASS |
| P260 enforce-clean = 0 | 0 | 0 | PASS |
| 8 exact reuse fixes | 8 | 8 | PASS |
| Confirm-locale proof | PASS | STRONG behavioral | PASS |
| Polling stability proof | PASS | STRONG behavioral | PASS |
| Raw ownership | preserved | preserved | PASS |
| Shared caller safety | yes | yes | PASS |
| Boundary completeness | 16 paths | 16 paths, 0 findings | PASS |
| Category E | 0 | 0 | PASS |
| Active Documents complete | yes | yes | PASS |
| Checks/build/diff-check | PASS | PASS | PASS |

---

## Final Verdict

**B — READY WITH NON-BLOCKING OBSERVATIONS**

All merge-critical gates pass. File object identity lacks explicit behavioral assertion; ArchitekturView in-app card is stale. Neither blocks P2.2.60 freeze.
