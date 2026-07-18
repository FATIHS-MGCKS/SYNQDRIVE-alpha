import type { ApplyDocumentExtractionType, FieldDef } from './document-extraction.schemas';
import type { DocumentSubtype } from './document-taxonomy.types';
import type {
  DocumentFieldProvenanceRegistry,
} from './document-field-provenance.types';

export const DOCUMENT_STRUCTURED_EXTRACTION_VERSION = '1.0.0' as const;

export type StructuredExtractionTrigger = 'auto' | 'type_change' | 'reextract';

export type StructuredFieldProvenance = 'llm' | 'merged' | 'missing' | 'conflict';

export type StructuredFieldValue = {
  key: string;
  raw: unknown;
  normalized: unknown;
  confidence: number | null;
  sourcePages: number[];
  provenance: StructuredFieldProvenance;
  conflict: boolean;
};

export type StructuredExtractionRun = {
  runId: string;
  contractVersion: typeof DOCUMENT_STRUCTURED_EXTRACTION_VERSION;
  schemaVersion: string;
  documentSubtype: DocumentSubtype | null;
  legacyDocumentType: ApplyDocumentExtractionType;
  trigger: StructuredExtractionTrigger;
  startedAt: string;
  completedAt: string;
  provider: string | null;
  modelVersion: string | null;
  fieldCount: number;
  missingFieldCount: number;
  conflictCount: number;
};

export type StructuredExtractionPayload = {
  contractVersion: typeof DOCUMENT_STRUCTURED_EXTRACTION_VERSION;
  schemaVersion: string;
  documentSubtype: DocumentSubtype | null;
  legacyDocumentType: ApplyDocumentExtractionType;
  fields: StructuredFieldValue[];
  missingFields: string[];
  conflicts: string[];
  normalizedFlat: Record<string, unknown>;
};

export type SupersededStructuredExtractionRun = {
  run: StructuredExtractionRun;
  structuredExtraction: StructuredExtractionPayload;
  extractedData: Record<string, unknown>;
  fieldProvenance?: DocumentFieldProvenanceRegistry | null;
  supersededAt: string;
  supersededReason: 'type_change' | 'reextract';
  previousDocumentType: string | null;
  nextDocumentType: string;
};

export type ResolvedExtractionSchema = {
  legacyDocumentType: ApplyDocumentExtractionType;
  documentSubtype: DocumentSubtype | null;
  schemaVersion: string;
  fields: FieldDef[];
  requiredFields: readonly string[];
};
