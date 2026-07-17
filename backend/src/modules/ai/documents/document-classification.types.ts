import { ApplyDocumentExtractionType } from '@modules/document-extraction/document-extraction.schemas';
import type {
  ClassificationAlternativeCandidate,
  ClassificationDetectedIdentifier,
  DocumentClassificationContract,
} from '@modules/document-extraction/document-classification-contract.types';
import type { DocumentCategory, DocumentSubtype } from '@modules/document-extraction/document-taxonomy.types';

/** Classification sentinel when the model cannot map to a supported type. */
export const CLASSIFICATION_UNKNOWN = 'UNKNOWN' as const;

export type ClassificationDetectedType =
  | ApplyDocumentExtractionType
  | typeof CLASSIFICATION_UNKNOWN;

export interface DocumentClassificationPageMeta {
  pageNumber: number | null;
  charCount: number;
  /** Page text for page-aware classification sampling (optional). */
  text?: string;
}

export interface DocumentClassificationInput {
  /** Normalized document text or representative excerpt. */
  documentText: string;
  allowedDocumentTypes: readonly ApplyDocumentExtractionType[];
  pages?: DocumentClassificationPageMeta[];
  pageBoundaryReliable?: boolean;
}

export type ClassificationAlternativeLlmCandidate = {
  documentCategory: string;
  documentSubtype: string;
  confidence: number;
  rationale?: string | null;
};

export interface DocumentClassificationLlmResponse {
  detectedDocumentType: ClassificationDetectedType;
  documentCategory?: string | null;
  documentSubtype?: string | null;
  confidence: number;
  rationale: string;
  sourcePages: number[] | null;
  alternatives?: ClassificationAlternativeLlmCandidate[] | null;
  detectedIdentifiers?: Array<{
    identifierType: string;
    value: string;
    evidencePage?: number | null;
  }> | null;
}

export interface DocumentClassificationResult {
  success: boolean;
  detectedDocumentType: ClassificationDetectedType;
  confidence: number;
  rationale: string;
  sourcePages: number[];
  provider: string;
  model: string;
  processingDurationMs: number;
  documentCategory: DocumentCategory | null;
  documentSubtype: DocumentSubtype | null;
  taxonomyVersion: string | null;
  category: DocumentCategory | null;
  subtype: DocumentSubtype | null;
  alternatives: ClassificationAlternativeCandidate[];
  evidencePages: number[];
  detectedIdentifiers: ClassificationDetectedIdentifier[];
  modelVersion: string | null;
  contractVersion: string | null;
  contract: DocumentClassificationContract;
  error?: string;
}
