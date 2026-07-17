import { buildDocumentClassificationContract } from './document-classification-taxonomy.util';
import { SUPPORTED_DOCUMENT_TYPES } from './document-extraction.schemas';
import {
  assertGoldenCaseClassificationExpectations,
  assertGoldenCaseFieldExpectations,
  DOCUMENT_INTAKE_GOLDEN_CORPUS,
  DOCUMENT_INTAKE_GOLDEN_CORPUS_VERSION,
  listGoldenCorpusCases,
  makeGoldenClassificationResult,
  makeGoldenExtractionResult,
  makeGoldenLlmClassificationJson,
  makeGoldenLlmExtractionJson,
  makeGoldenOcrPages,
  makeGoldenOcrResult,
} from './document-intake-golden-corpus.util';
import type { DocumentIntakeGoldenCase } from './__fixtures__/golden/document-intake-golden-corpus.types';

const REQUIRED_GOLDEN_LABELS = [
  'Service',
  'Tire',
  'Brake',
  'Battery',
  'TÜV',
  'BOKraft',
  'Invoice 19',
  'Invoice 7',
  'tax-free',
  'multi-rate',
  'Credit Note',
  'Reminder',
  'Fine',
  'Driver Identification',
  'Damage',
  'Accident',
  'Insurance Letter',
  'General customer',
  'Unknown',
] as const;

describe('document-intake-golden-corpus', () => {
  it('exposes a versioned privacy-safe corpus', () => {
    expect(DOCUMENT_INTAKE_GOLDEN_CORPUS_VERSION).toBe('1.0.0');
    expect(listGoldenCorpusCases().length).toBeGreaterThanOrEqual(19);
    for (const entry of DOCUMENT_INTAKE_GOLDEN_CORPUS) {
      expect(entry.synthetic).toBe(true);
      expect(entry.privacySafe).toBe(true);
      expect(entry.ocrText.length).toBeGreaterThan(20);
      expect(entry.ocrText.length).toBeLessThan(4000);
    }
  });

  it('covers the required document classes', () => {
    const corpusText = DOCUMENT_INTAKE_GOLDEN_CORPUS.map(
      (entry: DocumentIntakeGoldenCase) => `${entry.id} ${entry.label}`,
    ).join('\n');
    for (const label of REQUIRED_GOLDEN_LABELS) {
      expect(corpusText.toLowerCase()).toContain(label.toLowerCase());
    }
  });

  it.each(
    DOCUMENT_INTAKE_GOLDEN_CORPUS.map((entry: DocumentIntakeGoldenCase) => [entry.id, entry] as const),
  )(
    'golden case %s matches expected taxonomy and fields',
    (_id, goldenCase) => {
      assertGoldenCaseFieldExpectations(goldenCase);
      assertGoldenCaseClassificationExpectations(goldenCase);

      const contract = buildDocumentClassificationContract({
        raw: goldenCase.classificationMock,
        allowed: SUPPORTED_DOCUMENT_TYPES,
        maxPage: 1,
        modelVersion: goldenCase.mistralModel,
      });
      expect(contract.category).toBe(goldenCase.expectedCategory);
      expect(contract.subtype).toBe(goldenCase.expectedSubtype);
    },
  );

  it('provides Mistral mock payloads without live API calls', () => {
    const sample = DOCUMENT_INTAKE_GOLDEN_CORPUS[0]!;
    expect(makeGoldenLlmClassificationJson(sample).data.documentSubtype).toBeTruthy();
    expect(makeGoldenLlmExtractionJson(sample).data.fields).toBeTruthy();
    expect(makeGoldenClassificationResult(sample).contract).toBeTruthy();
    expect(makeGoldenExtractionResult(sample).fields).toEqual(sample.extractionMock.fields);
    expect(makeGoldenOcrResult(sample).pagesBlocks).toHaveLength(1);
    expect(makeGoldenOcrPages(sample)[0]?.text).toBe(sample.ocrText);
  });

  it('uses only synthetic anonymized OCR text', () => {
    const forbiddenPatterns = [
      /@gmail\.com/i,
      /@yahoo\./i,
      /mustermann/i,
      /\+49\s*1[567]\d/i,
    ];
    for (const entry of DOCUMENT_INTAKE_GOLDEN_CORPUS) {
      for (const pattern of forbiddenPatterns) {
        expect(entry.ocrText).not.toMatch(pattern);
      }
      expect(entry.ocrText).toMatch(/SynqDrive Demo|Demo GmbH|Demo AG|M-SY/i);
    }
  });
});
