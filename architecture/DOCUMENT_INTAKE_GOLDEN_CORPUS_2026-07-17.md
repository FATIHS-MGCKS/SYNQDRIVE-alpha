# Document Intake Golden Fixture Corpus (V4.9.639)

**Date:** 2026-07-17  
**Scope:** Privacy-safe synthetic golden corpus for classification and extraction regression (no live Mistral API)

## Goal

Provide a versioned, text-only golden fixture corpus covering all major document intake classes with saved Mistral mock responses for CI regression without API cost or real customer documents.

## Corpus version

`DOCUMENT_INTAKE_GOLDEN_CORPUS_VERSION = 1.0.0`

## Privacy rules

- **Synthetic or fully anonymized** OCR text only
- **No real customer documents** or production PII
- Fictional entities: `SynqDrive Demo GmbH`, plates `M-SY 10xx`, demo authorities/vendors
- **No binary files** — textual OCR fixtures suffice
- Each case marked `synthetic: true`, `privacySafe: true`

## Covered document classes (19 cases)

| Case ID | Class | Legacy type | Expected subtype |
|---------|-------|-------------|------------------|
| `golden-service-001` | Service | SERVICE | SERVICE_REPORT |
| `golden-tire-001` | Tire | TIRE | SERVICE_REPORT |
| `golden-brake-001` | Brake | BRAKE | SERVICE_REPORT |
| `golden-battery-001` | Battery | BATTERY | SERVICE_REPORT |
| `golden-tuv-001` | TÜV | TUV_REPORT | TUV_REPORT |
| `golden-bokraft-001` | BOKraft | BOKRAFT_REPORT | BOKRAFT_REPORT |
| `golden-invoice-19-001` | Invoice 19% | INVOICE | INVOICE |
| `golden-invoice-7-001` | Invoice 7% | INVOICE | INVOICE |
| `golden-invoice-tax-free-001` | Tax-free invoice | INVOICE | INVOICE |
| `golden-invoice-multi-rate-001` | Multi-rate invoice | INVOICE | INVOICE |
| `golden-credit-note-001` | Credit note | INVOICE | CREDIT_NOTE |
| `golden-reminder-001` | Reminder | INVOICE | REMINDER |
| `golden-fine-001` | Fine | FINE | FINE_NOTICE |
| `golden-driver-ident-001` | Driver identification | OTHER | DRIVER_IDENTIFICATION_REQUEST |
| `golden-damage-001` | Damage | DAMAGE | DAMAGE_REPORT |
| `golden-accident-001` | Accident | ACCIDENT | ACCIDENT_REPORT |
| `golden-insurance-letter-001` | Insurance letter | OTHER | INSURANCE_LETTER |
| `golden-general-letter-001` | General letter | OTHER | CUSTOMER_CORRESPONDENCE |
| `golden-unknown-001` | Unknown | OTHER | OTHER |

## Per-case shape (`DocumentIntakeGoldenCase`)

| Property | Description |
|----------|-------------|
| `ocrText` | Synthetic OCR markdown/text |
| `classificationMock` | Saved Mistral classification JSON (`DocumentClassificationLlmResponse`) |
| `extractionMock` | Saved Mistral extraction JSON (`documentType` + `fields`) |
| `expectedCategory` / `expectedSubtype` | Taxonomy contract expectations |
| `expectedFieldKeys` | Required extracted field keys for regression |
| `mistralModel` | Model id used in mocks |

## Loader utilities

`document-intake-golden-corpus.util.ts`:

- `listGoldenCorpusCases()` / `getGoldenCorpusCase(id)`
- `makeGoldenOcrResult()` — OCR page blocks from text
- `makeGoldenClassificationResult()` — full classification pipeline mock
- `makeGoldenExtractionResult()` — extraction service mock
- `makeGoldenLlmClassificationJson()` / `makeGoldenLlmExtractionJson()` — `completeJson` mocks
- `assertGoldenCaseFieldExpectations()` / `assertGoldenCaseClassificationExpectations()`

Test helpers: `makeGoldenCorpusPipelineMocks(caseId)` in `document-extraction-test.helpers.ts`.

## Test matrix integration

`backend/scripts/audit/document-intake-test-matrix-dry-run.ts` runs all golden cases after the legacy T01–T40 matrix:

- Validates taxonomy + field expectations
- Reports `mistralMockFixtures: true` and `goldenCorpusVersion`
- No Mistral API calls

## Tests

- `document-intake-golden-corpus.spec.ts` — 19 parameterized regression cases + privacy guards
- Reuses existing field fixtures (`document-*-fixtures.ts`) for extraction payloads

## Versioning

Bump `DOCUMENT_INTAKE_GOLDEN_CORPUS_VERSION` when adding cases or changing mock contracts. Corpus cases are immutable by id — new scenarios get new ids.

## Key modules

| Module | Role |
|--------|------|
| `__fixtures__/golden/document-intake-golden-corpus.ts` | Corpus definitions |
| `__fixtures__/golden/document-intake-golden-corpus.types.ts` | Contract types |
| `document-intake-golden-corpus.util.ts` | Loaders and assertions |
| `document-reminder-fixtures.ts` | Reminder field payloads |
| `document-driver-ident-fixtures.ts` | Driver identification payloads |
