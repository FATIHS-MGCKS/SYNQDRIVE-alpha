import type { DocumentPageBlock } from '@modules/document-extraction/document-page.types';
import type { FieldExtractionEvidence } from './document-extraction-merge.service';
import type { DocumentChunkingResult } from './document-chunking.types';

/** Field descriptor for document extraction prompts/schemas. */
export interface DocumentAiField {
  key: string;
  label: string;
  type: string;
  enumValues?: string[];
}

export interface DocumentAiVehicleContext {
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  fuelType?: string;
  licensePlate?: string;
  lastKnownOdometerKm?: number;
}

export interface DocumentAiStructuredInput {
  text: string;
  pages: DocumentPageBlock[];
  pageBoundaryReliable: boolean;
}

export interface DocumentAiExtractInput {
  organizationId?: string;
  documentId?: string;
  documentType: string;
  fields: DocumentAiField[];
  /** @deprecated Prefer documentContent — kept for backward compatibility in tests. */
  rawText?: string;
  documentContent?: DocumentAiStructuredInput;
  vehicleContext?: DocumentAiVehicleContext;
  /** When present, vehicle has DIMO telemetry linkage (context flag only). */
  dimoTokenId?: number;
}

export interface DocumentAiExtractionChunkMetadata {
  chunkCount: number;
  totalPages: number;
  totalChars: number;
  limitExceeded: boolean;
  limitCode?: string;
  uncoveredPageNumbers: number[];
  durationMs: number;
}

export interface DocumentAiExtractResult {
  success: boolean;
  fields: Record<string, unknown>;
  recommendedHumanReviewNotes: string[];
  dimoContextAvailable: boolean;
  providerId?: string;
  modelId?: string;
  error?: string;
  fieldEvidence?: FieldExtractionEvidence[];
  extractionConflicts?: FieldExtractionEvidence[];
  chunking?: DocumentAiExtractionChunkMetadata;
}

export interface DocumentAiExtractionResponse {
  documentType: string;
  fields: Record<string, unknown>;
  recommendedHumanReviewNotes?: string[];
}

export type { DocumentChunkingResult };
