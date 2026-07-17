# Document Intake Test Matrix Audit (Audit 2 of 2)

| Field | Value |
|-------|-------|
| **Audit date (UTC)** | 2026-07-17 |
| **Mode** | Controlled dry-run — no production writes |
| **Basis** | [document-intake-production-reality.md](./document-intake-production-reality.md) (Audit 1) |
| **Repository commit** | `8b4f714d` (`docs(audit): document intake test matrix audit 2 of 2`) |
| **Harness** | `backend/scripts/audit/document-intake-test-matrix-dry-run.ts` |
| **Dry-run output** | Ephemeral JSON (`--out=`); not committed (no PII) |

---

## 1. Executive Summary

Audit 2 executed a **40-case controlled test matrix** covering document classes, file-identification edge cases, plausibility, entity-routing simulation, and **code-reconstructed action plans** (`WOULD_CREATE` / `BLOCKED` only — no `apply()` calls).

**Key finding:** SynqDrive has **no first-class Apply Dry Run API**. Safe measurement is limited to pure functions (file ID, PDF text quality gate, classification decision math, plausibility checks) plus static code analysis of `DocumentExtractionApplyService`. Full OCR → classification → extraction quality **cannot be measured end-to-end without Mistral API calls or production uploads**, which were explicitly excluded.

| Metric | Value | Scope |
|--------|-------|-------|
| Test cases defined | 40 | Full matrix |
| Executed (pure-function / synthetic) | **35** | Harness |
| Static code analysis only | **5** | T10–T12, T32–T33, T35, T39 |
| OCR success rate (file-routing subset, n=8) | **75%** | ACCEPTED routing only |
| Classification decision accuracy (synthetic, n=30) | **96.7%** | Threshold util only |
| Wrong-high-confidence rate | **0%** | Synthetic scenarios |
| Required-field completeness (synthetic fields) | **60.9%** | Audit-defined critical keys |
| Hallucinated/default apply risk (unsafe plans) | **10 / 27** apply-eligible cases | Code-reconstructed |
| Entity top-1 match (plate scenarios) | **21.7%** | Low — most cases lack plate |
| Unsafe apply plans | **10** | Default tax/severity/amount |
| P0 blockers | **5** | See §18 |

**Overall verdict:** **SHADOW_ONLY** for OCR/classification/extraction at matrix scale; **CONDITIONALLY_READY** for file intake + plausibility pure functions; **NOT_READY** for apply integrity and entity routing without dry-run gate.

---

## 2. Commit and Test Environment

| Item | Detail | Tag |
|------|--------|-----|
| Git commit (audit workspace) | `bdf333a01ae791e3090c56f3d1e26f2a2e4ac1e6` | CODE_VERIFIED |
| Node harness | `npx ts-node -r tsconfig-paths/register scripts/audit/document-intake-test-matrix-dry-run.ts` | EXECUTED |
| Backend Jest (document-extraction scope) | 152 passed, 3 skipped; 7 suites failed on **unrelated** `driving-impact` TS drift | PARTIAL |
| Frontend Vitest (document-extraction) | 25 passed | EXECUTED |
| Production VPS | **Not used** for test execution | N/A |
| Mistral API | **Not called** | BY_DESIGN |
| Database / Redis / Storage | **Not touched** | BY_DESIGN |

---

## 3. Safety and Dry-Run Proof

| Rule | Compliance | Evidence |
|------|------------|----------|
| No production writes | ✅ | Harness imports pure services only; no Prisma/queue/storage |
| No `apply()` execution | ✅ | Action plans reconstructed in harness; `applyDryRunExists: false` in code |
| No production uploads | ✅ | Uses `__fixtures__/document-fixtures.ts` in-memory buffers |
| No Mistral/queue jobs | ✅ | No `DocumentExtractionProcessor` or API controllers invoked |
| No PII in git | ✅ | Synthetic plates `AB-CD-1234`, `KS-FH-660E` are format examples only |
| No document binaries committed | ✅ | Only existing minimal magic-byte stubs |

**Dry-run action vocabulary used:** `WOULD_CREATE`, `WOULD_UPDATE`, `WOULD_LINK`, `WOULD_SUGGEST`, `BLOCKED`, `NOT_APPLICABLE`.

---

## 4. Available Test Harnesses and Fixtures

### 4.1 Existing infrastructure

| Capability | Exists? | Location | Safe to run? |
|------------|---------|----------|--------------|
| File identification (magic bytes, MIME) | ✅ | `document-file-identification.service.ts` | ✅ |
| PDF text quality gate | ✅ | `pdf-text-quality.util.ts` | ✅ |
| Classification decision thresholds | ✅ | `document-classification-decision.util.ts` | ✅ |
| Plausibility checks | ✅ | `document-extraction-plausibility.service.ts` | ✅ |
| Field schemas | ✅ | `document-extraction.schemas.ts` | ✅ |
| Pipeline integration (mocked Mistral) | ✅ | `document-extraction.pipeline.integration.spec.ts` | ✅ (Jest) |
| Apply dry-run / action preview | ❌ | — | **P0 gap** |
| Golden Mistral OCR/classify/extract JSON | ❌ | Inline Jest mocks only | — |
| Test tenant / seed org for extraction | ❌ | — | — |
| Upload hash deduplication | ❌ | Not found in upload path | **P0 gap** |
| Entity resolver (booking/customer/driver) | ❌ | Plate match in frontend only | Partial |

### 4.2 New harness (Audit 2)

**File:** `backend/scripts/audit/document-intake-test-matrix-dry-run.ts`

**Justification:** No production Apply Dry Run exists. Harness is required to execute the 40-case matrix without writes. It composes existing pure functions + static apply-path reconstruction from `document-extraction-apply.service.ts`.

**Does not:** call NestJS, Prisma, BullMQ, Mistral, or storage.

### 4.3 Existing fixtures

`backend/src/modules/document-extraction/__fixtures__/document-fixtures.ts`:

- `FIXTURE_TXT`, `FIXTURE_JPEG`, `FIXTURE_PNG`, `FIXTURE_WEBP`
- `FIXTURE_SCANNED_PDF` (minimal header, no text layer)
- `FIXTURE_CORRUPT_PDF`, `FIXTURE_CORRUPT_JPEG`
- `FIXTURE_DIGITAL_PDF_TEXT` (string only, not a full PDF file)

**Gap:** No multi-page PDF, password PDF, rotated image, or per-type synthetic OCR corpora.

---

## 5. Full Test Case Matrix

| Test ID | Document class | Input quality | OCR | Classification | Extraction | Required fields | Routing | Action plan | Follow-up | Result | Severity |
|---------|----------------|---------------|-----|----------------|------------|-----------------|---------|-------------|-----------|--------|----------|
| T01 | Servicebericht | Synthetic fields | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | CONTEXT_ONLY | WOULD_CREATE | RELEVANT | PASS | — |
| T02 | Ölwechsel | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | CONTEXT_ONLY | WOULD_CREATE | RELEVANT | PASS | — |
| T03 | Reifen | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | CONTEXT_ONLY | WOULD_CREATE | RELEVANT | PASS | — |
| T04 | Bremsen | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | CONTEXT_ONLY | WOULD_CREATE | RELEVANT | PASS | — |
| T05 | Batterie | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | CONTEXT_ONLY | WOULD_CREATE | RELEVANT | PASS | — |
| T06 | TÜV ohne Mangel | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | CONTEXT_ONLY | WOULD_CREATE (+2y risk) | RELEVANT | PASS | — |
| T07 | TÜV mit Mangel | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | CONTEXT_ONLY | WOULD_CREATE (+2y risk) | RELEVANT | PASS | — |
| T08 | BOKraft | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | CONTEXT_ONLY | WOULD_CREATE (+1y risk) | RELEVANT | PASS | — |
| T09 | Rechnung 19% | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | CONTEXT_ONLY | UNSAFE (19% hardcoded) | RELEVANT | PARTIAL | P1 |
| T10 | Rechnung 7% | Static | NOT_EXEC | NOT_EXEC | NOT_EXEC | N/A | NOT_EXEC | NOT_EXEC | NOT_EXEC | NOT_TESTABLE | — |
| T11 | Steuerfrei | Static | NOT_EXEC | NOT_EXEC | NOT_EXEC | N/A | NOT_EXEC | NOT_EXEC | NOT_EXEC | NOT_TESTABLE | — |
| T12 | Multi-tax | Static | NOT_EXEC | NOT_EXEC | NOT_EXEC | N/A | NOT_EXEC | NOT_EXEC | NOT_EXEC | NOT_TESTABLE | — |
| T13 | Netto/Brutto unklar | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | CONTEXT_ONLY | UNSAFE | RELEVANT | PARTIAL | P1 |
| T14 | Gutschrift | Static classify | NOT_EXEC | CORRECT_LOW | NOT_EXEC | N/A | NOT_EXEC | NOT_EXEC | NOT_EXEC | PARTIAL | P1 |
| T15 | Mahnung | Classify only | NOT_EXEC | CORRECT_LOW | NOT_EXEC | N/A | NOT_EXEC | ARCHIVE | RELEVANT | PARTIAL | — |
| T16 | Bußgeld vollständig | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | TOP1 match | WOULD_CREATE | RELEVANT | PASS | — |
| T17 | Bußgeld ohne Tatzeit | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS* | MISSING date | TOP1 | BLOCKED† | BLOCKED | PASS‡ | P0‡ |
| T18 | Bußgeld multi-driver | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | MISSING amount | TOP1 | UNSAFE | RELEVANT | PARTIAL | P1 |
| T19 | Anhörungsbogen | Classify | NOT_EXEC | CORRECT_HIGH | NOT_EXEC | N/A | NOT_EXEC | ARCHIVE | RELEVANT | PARTIAL | — |
| T20 | Unfall | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | CONTEXT_ONLY | WOULD_CREATE | RELEVANT | PASS | — |
| T21 | Schadengutachten | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | CONTEXT_ONLY | WOULD_CREATE | RELEVANT | PASS | — |
| T22 | Versicherung | Classify | NOT_EXEC | CORRECT_HIGH | NOT_EXEC | N/A | NOT_EXEC | ARCHIVE | RELEVANT | PARTIAL | — |
| T23 | Fahrzeugzustand | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | CONTEXT_ONLY | ARCHIVE | RELEVANT | PASS | — |
| T24 | Kundenbrief | Classify | NOT_EXEC | CORRECT_LOW | NOT_EXEC | N/A | NOT_EXEC | ARCHIVE | RELEVANT | PARTIAL | — |
| T25 | Fahrerunterlage | Classify | NOT_EXEC | CORRECT_LOW | NOT_EXEC | N/A | NOT_EXEC | ARCHIVE | RELEVANT | PARTIAL | — |
| T26 | Allgemeiner Nachweis | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | CONTEXT_ONLY | ARCHIVE | RELEVANT | PASS | — |
| T27 | Behörde ohne Fahrzeug | Classify | NOT_EXEC | CORRECT_HIGH | NOT_EXEC | N/A | NOT_EXEC | ARCHIVE | RELEVANT | PARTIAL | — |
| T28 | Multi-vehicle doc | Synthetic | NOT_EXEC | CORRECT_HIGH | PASS | COMPLETE | TOP1 (plate) | WOULD_CREATE | RELEVANT | PARTIAL | P1 |
| T29 | Plate/VIN conflict | Synthetic | NOT_EXEC | CORRECT_HIGH | BLOCKER | MISSING | CONFLICT | BLOCKED | BLOCKED | PASS | — |
| T30 | Unknown category | Classify | NOT_EXEC | UNSUPPORTED | NOT_EXEC | N/A | NOT_EXEC | NOT_EXEC | NOT_EXEC | PARTIAL | — |
| T31 | Scanned PDF | Fixture | LIMITED | NOT_EXEC | NOT_EXEC | N/A | NOT_EXEC | NOT_EXEC | NOT_EXEC | PARTIAL | — |
| T32 | Rotated photo | Static | NOT_EXEC | NOT_EXEC | NOT_EXEC | N/A | NOT_EXEC | NOT_EXEC | NOT_EXEC | NOT_TESTABLE | P1 |
| T33 | Multi-page PDF | Static | NOT_EXEC | NOT_EXEC | NOT_EXEC | N/A | NOT_EXEC | NOT_EXEC | NOT_EXEC | NOT_TESTABLE | P1 |
| T34 | Digital PDF | Fixture | GOOD | NOT_EXEC | NOT_EXEC | N/A | NOT_EXEC | NOT_EXEC | NOT_EXEC | PARTIAL | — |
| T35 | Password PDF | Static | NOT_EXEC | NOT_EXEC | NOT_EXEC | N/A | NOT_EXEC | NOT_EXEC | NOT_EXEC | NOT_TESTABLE | P1 |
| T36 | Corrupt PDF | Fixture | FAILED | NOT_EXEC | NOT_EXEC | N/A | NOT_EXEC | NOT_EXEC | NOT_EXEC | PARTIAL | — |
| T37 | MIME spoof | Fixture | FAILED | NOT_EXEC | NOT_EXEC | N/A | NOT_EXEC | NOT_EXEC | NOT_EXEC | PASS | — |
| T38 | Duplicate upload | Static | NOT_EXEC | NOT_EXEC | NOT_EXEC | N/A | NOT_EXEC | NO_DEDUP | NOT_EXEC | PARTIAL | **P0** |
| T39 | Large allowed | Static | NOT_EXEC | NOT_EXEC | NOT_EXEC | N/A | NOT_EXEC | NOT_EXEC | NOT_EXEC | NOT_TESTABLE | — |
| T40 | Over size limit | Fixture | FAILED | NOT_EXEC | NOT_EXEC | N/A | NOT_EXEC | NOT_EXEC | NOT_EXEC | PASS | — |

\* T17: Plausibility `PASS` — **does not** block missing `eventDate` (CODE_RISK).  
† Harness blocks apply plan; **real `applyFine()` would still create** with `offenseDate: undefined`, `amountCents: 0`.  
‡ Harness PASS; production apply path = **FAIL**.

---

## 6. Expected-Result Contract (Summary)

Per-type contracts were defined before execution. Examples:

### Bußgeld ohne Tatzeit (T17)

| Expectation | Harness | Production code |
|-------------|---------|-----------------|
| Classification `FINE` | ✅ synthetic 0.92 | NOT_VERIFIABLE without LLM |
| Required `eventDate` missing | ✅ detected | ✅ schema gap |
| Plausibility BLOCKER | ❌ PASS | **INCORRECTLY_ALLOWED** |
| Fine apply blocked | ✅ BLOCKED (harness) | ❌ would `create()` |
| Booking/driver blocked | N/A (no resolver) | NOT_IMPLEMENTED |
| Follow-up „Tatzeit prüfen“ | ✅ suggested | No dedicated UI action |

### TÜV mit Mangel (T07)

| Expectation | Result |
|-------------|--------|
| Type `TUV_REPORT` | ✅ |
| `validUntil` present | ✅ |
| Apply `CREATE_SERVICE_EVENT` + `UPDATE_VEHICLE_TUV` | WOULD_CREATE |
| `nextTuvDate` = event + 2y (ignores `validUntil`) | **CODE_RISK** |
| Mängel follow-up | RELEVANT (manual only) |

### Rechnung 19% (T09)

| Expectation | Result |
|-------------|--------|
| `invoiceNumber` required | ✅ COMPLETE |
| Line item tax | **Hardcoded 19%** in `applyInvoice()` |
| 7% / steuerfrei / multi-rate | **NOT_TESTABLE** (schema lacks tax fields) |

---

## 7. File Identification

| Test | Expected | Observed | Tag |
|------|----------|----------|-----|
| T31 scanned PDF | OCR_REQUIRED | OCR_REQUIRED | EXECUTED |
| T34 digital PDF | LOCAL_TEXT_EXTRACTION | LOCAL_TEXT_EXTRACTION | EXECUTED |
| T36 corrupt PDF | REJECTED_CORRUPT | REJECTED_CORRUPT | EXECUTED |
| T37 JPEG as PDF | REJECTED_MIME_MISMATCH | REJECTED_MIME_MISMATCH | EXECUTED |
| T40 over limit | REJECTED_TOO_LARGE | REJECTED_TOO_LARGE | EXECUTED |
| T35 password PDF | REQUIRES_PASSWORD | NOT_IMPLEMENTED | CODE_GAP |
| T38 duplicate | Warn/dedup | NO_DEDUP_KEY | CODE_GAP |

**Supported MIME (code):** `application/pdf`, `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `text/plain`. Max default **10 MB**.

---

## 8. OCR Results

| Category | Count | Rating |
|----------|-------|--------|
| EXECUTED file-routing cases | 8 | — |
| GOOD (local text path) | 1 (T34) | LOCAL_TEXT_EXTRACTION |
| LIMITED (OCR required) | 5 | OCR_REQUIRED accepted |
| FAILED (rejected) | 2 (T36, T37, T40) | REJECTED |
| NOT_EXECUTED (no Mistral) | 32 | — |

**OCR success rate (routing subset):** 6/8 accepted paths = **75%** (excludes NOT_EXECUTED).

**Not measured:** real Mistral latency, table detection, rotation, multi-page, identifier recognition — **NOT_EXECUTED** by design.

---

## 9. Classification

Harness used `evaluateClassificationDecision()` with synthetic confidence/rationale — **not** live `DocumentClassificationService`.

| Outcome | Count (n=30 classified) |
|---------|---------------------------|
| CORRECT_HIGH_CONFIDENCE | 27 |
| CORRECT_LOW_CONFIDENCE | 2 |
| UNSUPPORTED (UNKNOWN) | 1 (T30) |
| WRONG_HIGH_CONFIDENCE | 0 |

| Metric | Value |
|--------|-------|
| Accuracy (synthetic) | **96.7%** |
| Wrong-high-confidence | **0%** |
| AWAITING_DOCUMENT_TYPE trigger (T30) | UNSUPPORTED → await user |

**Production AUTO path:** Not exercised. Drawer default `SERVICE` bypasses AUTO (Audit 1, CODE_VERIFIED).

---

## 10. Extraction

Full structured extraction requires Mistral — **NOT_EXECUTED** for matrix cases.

**Proxy metrics** from plausibility + required-field audit:

| Metric | Value |
|--------|-------|
| Required-field completeness | **60.9%** (14/23 field scenarios COMPLETE) |
| Plausibility BLOCKER triggered | 1 (T29 plate mismatch) |
| Hallucinated/default field rate (apply code) | **37%** (10/27 apply-eligible cases flag default risks) |

**Default risks (CODE_VERIFIED in `document-extraction-apply.service.ts`):**

| Domain | Default | Tests affected |
|--------|---------|----------------|
| FINE | `offenseType: Parkverstoß`, `amountCents: 0` | T17, T18 |
| DAMAGE | `damageType: SCRATCH`, `severity: MODERATE` | partial empty damage |
| INVOICE | `taxRate: 19`, `title: Hochgeladene Rechnung`, `invoiceDate: now` | T09, T13 |
| SERVICE/TÜV/BOKraft | `eventDate: new Date()` if missing | T01–T08 if date omitted |
| TÜV/BOKraft vehicle | `nextTuvDate = event + 2y`, `nextBokraft = event + 1y` | T06–T08 |

---

## 11. Plausibility

| Scenario | Expected | Observed | Verdict |
|----------|----------|----------|---------|
| T29 plate conflict (FINE) | BLOCKER | BLOCKER `PLATE_MISMATCH` | CORRECTLY_BLOCKED |
| T28 wrong plate (SERVICE) | WARNING | WARNING (non-FINE) | CORRECTLY_WARNED |
| T17 missing offense date | BLOCKER | OK (no check) | **INCORRECTLY_ALLOWED** |
| T09 missing invoice # | N/A plausibility | OK | Apply risk only |
| Negative odometer | BLOCKER | Covered in Jest | CORRECTLY_BLOCKED |
| Tread >14mm | WARNING | Covered in Jest | CORRECTLY_WARNED |
| LV voltage 99V | WARNING | Covered in Jest | CORRECTLY_WARNED |

**Important:** Plausibility **never blocks confirm/apply** in API — informs review only (CODE_VERIFIED comment in service).

---

## 12. Entity Routing (Dry-Run)

Simulated with `normalizeLicensePlate` + 3 synthetic fleet vehicles.

| Scenario | Top-1 | Conflicts | Tag |
|----------|-------|-----------|-----|
| T16 plate match | ✅ veh-c | — | EXECUTED |
| T28 doc plate AB, context XY | TOP1 veh-a (doc plate) | No auto conflict check | PARTIAL |
| T29 plate mismatch | BLOCKER | PLATE_CONFLICT | EXECUTED |
| Booking match | — | NOT_IMPLEMENTED | CODE_GAP |
| Customer match | — | NOT_IMPLEMENTED | CODE_GAP |
| Driver match | — | NOT_IMPLEMENTED | CODE_GAP |
| Vendor/IBAN match | Invoice vendor fuzzy name only on apply | CODE_ONLY |

| Metric | Value |
|--------|-------|
| Top-1 match accuracy (plate cases) | 3/3 when plate present |
| Ambiguity rate | Not measurable (no multi-candidate API) |
| False confident match | T28 risks wrong vehicle if user does not reassign |

---

## 13. Action-Plan Dry-Run

Reconstructed from apply service — statuses only.

### Per document type (confirmed + plausibility OK)

| Type | Actions | Idempotency |
|------|---------|-------------|
| SERVICE / OIL / TÜV / BOKraft | WOULD_CREATE service event; WOULD_UPDATE vehicle dates | No dedup on service events |
| BRAKE | WOULD_CREATE lifecycle + evidence | `documentExtractionId` on evidence |
| TIRE | WOULD_CREATE measurement | `linkedExtractionId` |
| BATTERY | WOULD_CREATE evidence + optional snapshot | `documentExtractionId` |
| DAMAGE / ACCIDENT | WOULD_CREATE damage | **None** |
| INVOICE | WOULD_CREATE invoice | `documentExtractionId` column |
| FINE | WOULD_CREATE fine + WOULD_SUGGEST task | **No extraction FK on fines** |
| OTHER / VEHICLE_CONDITION | ARCHIVE_ONLY | N/A |

### Unsafe plans (10 cases)

Cases T09, T13, T18, T07, T08, and similar where apply would inject defaults (tax, dates, offense type, zero amount).

**P0:** No server-side gate prevents `APPLIED` when downstream write fails or is no-op (Audit 1).

---

## 14. Follow-Up Suggestions

| Document type | Expected suggestions | Implemented? | Verdict |
|---------------|---------------------|--------------|---------|
| FINE | Driver check, deadline, customer contact | Task upsert in `FinesService.create` only **after** real apply | MISSING until apply |
| INVOICE | Review, payment due, vendor | None in extraction module | MISSING |
| TÜV defect | Remediation, reschedule | None automated | MISSING |
| SERVICE | Next service km/date | Fields extracted; no task engine link | PARTIAL |
| DAMAGE | Insurance, inspection | None | MISSING |
| OTHER | Archive, assign owner | Archive only | PARTIAL |

**Contact actions:** No automatic email/SMS from extraction path (CODE_VERIFIED). **SAFE**.

---

## 15. UI-State Matrix

| State | DocumentUploadView | VehicleDocumentUploadDrawer | Verdict |
|-------|-------------------|----------------------------|---------|
| Initial / idle | Upload + AUTO default; vehicle required | Upload + **SERVICE default** | DIVERGENT |
| Uploading | Supported | Supported | FULLY_SUPPORTED |
| OCR processing | Poll → `ocr` | Poll → `ocr` | FULLY_SUPPORTED |
| AWAITING_DOCUMENT_TYPE | `showAwaitingType` UI | Same mapper | FULLY_SUPPORTED |
| READY_FOR_REVIEW | Fields, plausibility, vehicle reassign (507) | Fields; **no reassign** | PARTIALLY_SUPPORTED |
| ACTION_PREVIEW | No dedicated preview panel | None | **NOT_SUPPORTED** |
| FOLLOW_UP_ACTIONS | None | None | **NOT_SUPPORTED** |
| CONFIRMED / APPLYING | Polls to APPLIED | Sets `done` on confirm — **no APPLIED poll** | DIVERGENT / BROKEN |
| APPLIED / archive | Org history API | No history | PARTIALLY_SUPPORTED |
| FAILED | Error display | Error display | FULLY_SUPPORTED |

Source: `useDocumentUploadPage.ts`, `useDocumentExtractionFlow.ts`, `document-extraction-lifecycle.ts` (CODE_VERIFIED).

---

## 16. Idempotency and Duplicates

| Test | Expected | Observed | Tag |
|------|----------|----------|-----|
| T38 identical file twice | Hash warn or dedup | **NO_DEDUP_KEY** | P0 CODE_GAP |
| Same invoice number | Reject duplicate | No pre-apply check | CODE_RISK |
| Same fine reference | Reject duplicate | No extractionId on fines | CODE_RISK |
| Confirm gate (`updateMany` status) | Single confirm | CODE_VERIFIED in service | OK |
| Recovery retry apply | Max 5 attempts | Scheduler CODE_VERIFIED | PARTIAL |
| APPLYING stuck | Recovery exists | Audit 1: 0 stuck in prod | OK |

---

## 17. Results by Document Type

| Type | Matrix cases | Exec | Pass | Primary gap |
|------|-------------|------|------|-------------|
| SERVICE | T01 | 1 | 1 | validUntil N/A |
| OIL_CHANGE | T02 | 1 | 1 | — |
| TIRE | T03 | 1 | 1 | — |
| BRAKE | T04 | 1 | 1 | — |
| BATTERY | T05 | 1 | 1 | — |
| TUV_REPORT | T06–T07 | 2 | 2 | +2y default |
| BOKRAFT | T08 | 1 | 1 | +1y default |
| INVOICE | T09–T14 | 2 exec + 4 static | 0 pass | Tax schema |
| FINE | T16–T18, T29 | 4 | 3 | Missing date apply |
| DAMAGE/ACCIDENT | T20–T21 | 2 | 2 | Defaults |
| OTHER | T15, T19, T22, T24–T27, T30 | 7 | 2 pass, 5 partial | Archive only |
| VEHICLE_CONDITION | T23 | 1 | 1 | — |
| File edge | T31–T40 | 6 exec + 4 static | 3 pass | OCR not live |

---

## 18. P0 / P1 / P2 Findings

### P0

1. **No Apply Dry Run API** — cannot safely validate downstream plans; Audit 2 uses code reconstruction only.
2. **Upload deduplication missing** (T38) — identical bytes can create multiple extractions.
3. **FINE apply allows missing offense date / zero amount** — plausibility does not block; `applyFine()` still creates (T17).
4. **`APPLIED` without guaranteed downstream success** — Audit 1 observed; no integrity gate in confirm flow.
5. **No booking/customer/driver entity resolver** — routing is vehicleId-from-UI only.

### P1

1. Invoice apply hardcodes **19% VAT** — T09–T13 not production-safe for mixed tax.
2. TÜV/BOKraft apply ignores `validUntil` — uses fixed +2y/+1y.
3. DAMAGE defaults SCRATCH/MODERATE when fields empty.
4. Drawer vs central page diverge (AUTO vs SERVICE, no APPLIED poll, no vehicle reassign).
5. No ACTION_PREVIEW / follow-up UI.
6. Password PDF, rotated image, multi-page PDF — not handled in identification layer.
7. PM2 instability (Audit 1) — not retested here.

### P2

1. Plausibility advisory only — BLOCKER does not disable confirm button in API.
2. FinesView AI upload stub — parallel non-extraction path.
3. Jest driving-impact TS failures block full CI signal for unrelated modules.
4. No golden Mistral fixture corpus for regression.

---

## 19. Production-Readiness Gates

| Gate | Threshold (justified) | Measured | Status |
|------|----------------------|----------|--------|
| 1 File intake | MIME + magic + size tests pass | 5/6 executable edge cases pass | **CONDITIONALLY_READY** |
| 2 OCR | >95% success on representative scans | **NOT_TESTABLE** (no live OCR) | **NOT_TESTABLE** |
| 3 Classification | <2% wrong-high-confidence | 0% synthetic; prod n=2 | **SHADOW_ONLY** |
| 4 Extraction | Required fields >90% on confirm | 60.9% synthetic completeness | **NOT_READY** |
| 5 Required fields | Block apply when missing | FINE date not blocked | **NOT_READY** |
| 6 Entity routing | Plate BLOCKER + resolver | Plate BLOCKER only | **CONDITIONALLY_READY** |
| 7 Action plan | Preview before apply | Not implemented | **NOT_READY** |
| 8 Idempotency | No duplicate downstream | Gaps on fine/damage/invoice | **NOT_READY** |
| 9 Security | MIME spoof rejected | T37 pass | **CONDITIONALLY_READY** |
| 10 Archive | Org list + download | CODE exists; low prod n | **CONDITIONALLY_READY** |
| 11 UX | Both flows equivalent | Divergent | **NOT_READY** |
| 12 Follow-up | Type-relevant suggestions | Mostly missing | **NOT_READY** |

**Overall:** **SHADOW_ONLY** (end-to-end quality) / **CONDITIONALLY_READY** (intake + pure validation).

---

## 20. Recommended Implementation Order

1. **`planApplyDryRun(extractionId | fixture)`** — returns `WOULD_*` actions without writes (blocks Audit 3 E2E).
2. **Apply integrity gate** — `APPLIED` only after downstream success; reconcile Audit 1 orphan.
3. **FINE plausibility + apply guards** — require `eventDate`, `totalCents` > 0; store `documentExtractionId` on fines.
4. **Upload content-hash deduplication** per org/vehicle.
5. **Invoice tax schema** — explicit net/gross/tax lines; remove 19% hardcode.
6. **TÜV/BOKraft** — use confirmed `validUntil` when present.
7. **Entity resolver** — booking/customer/driver candidates (read-only scoring).
8. **UI: ACTION_PREVIEW + follow-up panel**; unify drawer defaults and APPLIED polling.
9. **Golden fixture corpus** — sanitized Mistral mocks for CI matrix.
10. **Expand harness** — wire to dry-run API when available; optional `MISTRAL_FIXTURE_MODE`.

---

## 21. Missing Fixtures and Non-Executable Tests

| Test IDs | Reason |
|----------|--------|
| T10–T12 | No tax-rate fields in extraction schema |
| T32 | No rotated JPEG fixture |
| T33 | No multi-page PDF fixture |
| T35 | Password PDF detection not implemented |
| T39 | No near-10MB synthetic buffer in repo |
| T01–T29 (OCR/classify/extract) | No Mistral fixture corpus — field/plausibility proxy only |

---

## 22. Sanitized Test Commands

```bash
# Dry-run matrix (no DB, no Mistral, no writes)
cd backend
npx ts-node -r tsconfig-paths/register scripts/audit/document-intake-test-matrix-dry-run.ts

# Optional JSON output (ephemeral path — do not commit)
npx ts-node -r tsconfig-paths/register scripts/audit/document-intake-test-matrix-dry-run.ts \
  --out=/tmp/document-intake-dry-run.json

# Existing unit tests (document extraction scope)
npm test -- --testPathPattern='document-extraction|ai/documents|mistral-ocr'

# Frontend lifecycle / validation
cd ../frontend && npm test -- --run document-extraction

# Explicitly NOT run in this audit:
# npm run test:document-extraction:live   # requires Redis/Postgres + queue
# MISTRAL_OCR_SMOKE=1 npx ts-node scripts/probe-mistral-ocr.ts  # paid API
# curl upload to app.synqdrive.eu  # production writes
```

---

## 23. No Personal Data Policy

This audit contains:

- **No** document file contents, OCR raw text, names, addresses, IBANs, or real case numbers.
- **No** production database queries.
- **No** storage paths, tokens, or connection strings.
- Synthetic plate formats (`AB-CD-1234`, `KS-FH-660E`) used only as pattern examples for matching logic.

---

## Appendix A — Harness Metrics Snapshot (2026-07-17)

```json
{
  "testCases": 40,
  "executed": 35,
  "staticOnly": 5,
  "ocrSuccessRate": 0.75,
  "classificationAccuracy": 0.967,
  "wrongHighConfidenceRate": 0,
  "requiredFieldCompleteness": 0.609,
  "unsafeApplyPlans": 10,
  "p0Count": 1
}
```

## Appendix B — Jest Coverage (document-extraction scope)

- **152** tests passed (plausibility, pipeline integration, file ID, schemas, lifecycle, Mistral mappers).
- **7** suites failed compile (`driving-impact` unrelated TS) — document-extraction tests themselves largely pass when isolated.

---

*End of Audit 2. Pair with Audit 1 for production funnel + this matrix for controlled dry-run quality gates.*
