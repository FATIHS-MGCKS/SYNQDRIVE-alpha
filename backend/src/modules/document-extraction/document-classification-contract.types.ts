import type { ApplyDocumentExtractionType } from './document-extraction.schemas';
import type { DocumentCategory, DocumentSubtype } from './document-taxonomy.types';

export const DOCUMENT_CLASSIFICATION_CONTRACT_VERSION = '2.0.0' as const;

export const CLASSIFICATION_IDENTIFIER_TYPES = [
  'invoice_number',
  'reference_number',
  'fine_number',
  'license_plate',
  'vin',
  'customer_number',
  'tax_id',
  'iban',
  'booking_reference',
  'other',
] as const;

export type ClassificationIdentifierType = (typeof CLASSIFICATION_IDENTIFIER_TYPES)[number];

export type ClassificationDetectedIdentifier = {
  identifierType: ClassificationIdentifierType;
  value: string;
  evidencePage?: number | null;
};

export type ClassificationAlternativeCandidate = {
  category: DocumentCategory;
  subtype: DocumentSubtype;
  confidence: number;
  legacyDocumentType: ApplyDocumentExtractionType;
  rationale?: string | null;
};

export type DocumentClassificationContract = {
  contractVersion: typeof DOCUMENT_CLASSIFICATION_CONTRACT_VERSION;
  category: DocumentCategory | null;
  subtype: DocumentSubtype | null;
  confidence: number;
  alternatives: ClassificationAlternativeCandidate[];
  rationale: string;
  evidencePages: number[];
  detectedIdentifiers: ClassificationDetectedIdentifier[];
  modelVersion: string | null;
  taxonomyVersion: string | null;
  legacyDocumentType: ApplyDocumentExtractionType | null;
  detectedDocumentType: ApplyDocumentExtractionType | typeof import('@modules/ai/documents/document-classification.types').CLASSIFICATION_UNKNOWN;
};

export type ClassificationPipelinePayload = DocumentClassificationContract & {
  provider: string;
  hasSuggestion: boolean;
  processingDurationMs: number;
  decisionAction: 'AUTO_CONTINUE' | 'AWAIT_USER';
};
