import type { DocumentClassificationLlmResponse } from '@modules/ai/documents/document-classification.types';
import type { ApplyDocumentExtractionType } from '../../document-extraction.schemas';
import type { DocumentCategory, DocumentSubtype } from '../../document-taxonomy.types';

export const DOCUMENT_INTAKE_GOLDEN_CORPUS_VERSION = '1.0.0' as const;

export type GoldenCorpusExtractionMock = {
  documentType: ApplyDocumentExtractionType;
  fields: Record<string, unknown>;
  recommendedHumanReviewNotes?: string[];
};

export type DocumentIntakeGoldenCase = {
  id: string;
  label: string;
  documentType: ApplyDocumentExtractionType;
  expectedCategory: DocumentCategory;
  expectedSubtype: DocumentSubtype;
  ocrText: string;
  classificationMock: DocumentClassificationLlmResponse;
  extractionMock: GoldenCorpusExtractionMock;
  expectedFieldKeys: readonly string[];
  mistralModel: string;
  synthetic: true;
  privacySafe: true;
};
