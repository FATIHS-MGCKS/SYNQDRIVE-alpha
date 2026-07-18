import type { DocumentPageBlock } from './document-page.types';
import { buildDocumentClassificationContract } from './document-classification-taxonomy.util';
import { SUPPORTED_DOCUMENT_TYPES } from './document-extraction.schemas';
import {
  DOCUMENT_INTAKE_GOLDEN_CORPUS,
  GOLDEN_CORPUS_BY_ID,
  DOCUMENT_INTAKE_GOLDEN_CORPUS_VERSION,
} from './__fixtures__/golden/document-intake-golden-corpus';
import type { DocumentIntakeGoldenCase } from './__fixtures__/golden/document-intake-golden-corpus.types';

export { DOCUMENT_INTAKE_GOLDEN_CORPUS, GOLDEN_CORPUS_BY_ID, DOCUMENT_INTAKE_GOLDEN_CORPUS_VERSION };
export type { DocumentIntakeGoldenCase };

export function listGoldenCorpusCases(): readonly DocumentIntakeGoldenCase[] {
  return DOCUMENT_INTAKE_GOLDEN_CORPUS;
}

export function getGoldenCorpusCase(id: string): DocumentIntakeGoldenCase | undefined {
  return GOLDEN_CORPUS_BY_ID[id];
}

export function makeGoldenOcrPages(goldenCase: DocumentIntakeGoldenCase): DocumentPageBlock[] {
  return [
    {
      pageNumber: 1,
      text: goldenCase.ocrText,
      sourceMethod: 'OCR',
      hasReliablePageBoundaries: true,
    },
  ];
}

export function makeGoldenOcrResult(goldenCase: DocumentIntakeGoldenCase) {
  const pages = makeGoldenOcrPages(goldenCase);
  return {
    normalizedMarkdown: `--- PAGE 1 ---\n${goldenCase.ocrText}`,
    pageCount: 1,
    provider: 'mistral',
    model: 'mistral-ocr-latest',
    pages: pages.map((page, index) => ({
      pageIndex: index,
      pageNumber: page.pageNumber,
      markdown: page.text ?? '',
    })),
    sourceMethod: 'OCR' as const,
    pagesBlocks: pages,
  };
}

export function makeGoldenClassificationResult(goldenCase: DocumentIntakeGoldenCase) {
  const contract = buildDocumentClassificationContract({
    raw: goldenCase.classificationMock,
    allowed: SUPPORTED_DOCUMENT_TYPES,
    maxPage: 1,
    modelVersion: goldenCase.mistralModel,
  });
  return {
    success: true,
    detectedDocumentType: contract.detectedDocumentType,
    confidence: contract.confidence,
    rationale: contract.rationale,
    sourcePages: contract.evidencePages,
    provider: 'mistral',
    model: goldenCase.mistralModel,
    processingDurationMs: 12,
    documentCategory: contract.category,
    documentSubtype: contract.subtype,
    taxonomyVersion: contract.taxonomyVersion,
    category: contract.category,
    subtype: contract.subtype,
    alternatives: contract.alternatives,
    evidencePages: contract.evidencePages,
    detectedIdentifiers: contract.detectedIdentifiers,
    modelVersion: contract.modelVersion,
    contractVersion: contract.contractVersion,
    contract,
  };
}

export function makeGoldenExtractionResult(goldenCase: DocumentIntakeGoldenCase) {
  return {
    success: true,
    fields: goldenCase.extractionMock.fields,
    documentType: goldenCase.extractionMock.documentType,
    recommendedHumanReviewNotes: goldenCase.extractionMock.recommendedHumanReviewNotes ?? [],
    providerId: 'mistral',
    modelId: goldenCase.mistralModel,
    processingDurationMs: 18,
  };
}

export function makeGoldenLlmClassificationJson(goldenCase: DocumentIntakeGoldenCase) {
  return {
    data: goldenCase.classificationMock,
    model: goldenCase.mistralModel,
  };
}

export function makeGoldenLlmExtractionJson(goldenCase: DocumentIntakeGoldenCase) {
  return {
    data: {
      documentType: goldenCase.extractionMock.documentType,
      fields: goldenCase.extractionMock.fields,
      recommendedHumanReviewNotes: goldenCase.extractionMock.recommendedHumanReviewNotes ?? [],
    },
    model: goldenCase.mistralModel,
  };
}

function readNestedField(source: Record<string, unknown>, key: string): unknown {
  if (!key.includes('.')) return source[key];
  const [parent, child] = key.split('.');
  const obj = source[parent];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  return (obj as Record<string, unknown>)[child];
}

export function assertGoldenCaseFieldExpectations(goldenCase: DocumentIntakeGoldenCase): void {
  for (const key of goldenCase.expectedFieldKeys) {
    const value = readNestedField(goldenCase.extractionMock.fields, key);
    if (value == null || value === '') {
      throw new Error(`Golden case ${goldenCase.id} missing expected field ${key}`);
    }
  }
}

export function assertGoldenCaseClassificationExpectations(goldenCase: DocumentIntakeGoldenCase): void {
  const contract = buildDocumentClassificationContract({
    raw: goldenCase.classificationMock,
    allowed: SUPPORTED_DOCUMENT_TYPES,
    maxPage: 1,
    modelVersion: goldenCase.mistralModel,
  });
  if (contract.category !== goldenCase.expectedCategory) {
    throw new Error(
      `Golden case ${goldenCase.id} category mismatch: expected ${goldenCase.expectedCategory}, got ${contract.category}`,
    );
  }
  if (contract.subtype !== goldenCase.expectedSubtype) {
    throw new Error(
      `Golden case ${goldenCase.id} subtype mismatch: expected ${goldenCase.expectedSubtype}, got ${contract.subtype}`,
    );
  }
}
