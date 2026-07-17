import type { DocumentClassificationResult } from '@modules/ai/documents/document-classification.types';
import { CLASSIFICATION_UNKNOWN } from '@modules/ai/documents/document-classification.types';
import type {
  ClassificationPipelinePayload,
  DocumentClassificationContract,
} from './document-classification-contract.types';
import { DOCUMENT_CLASSIFICATION_CONTRACT_VERSION } from './document-classification-contract.types';
import type { ClassificationDecision } from './document-classification-decision.util';

export function buildClassificationPipelinePayload(input: {
  classificationResult: DocumentClassificationResult;
  decision: ClassificationDecision;
}): ClassificationPipelinePayload {
  const contract = input.classificationResult.contract;
  return {
    ...contract,
    provider: input.classificationResult.provider,
    hasSuggestion: input.decision.hasSuggestion,
    processingDurationMs: input.classificationResult.processingDurationMs,
    decisionAction: input.decision.action,
  };
}

/** Stored shape in plausibility.classification — contract fields plus pipeline metadata. */
export function buildStoredClassificationPayload(
  payload: ClassificationPipelinePayload,
): Record<string, unknown> {
  return {
    contractVersion: payload.contractVersion,
    category: payload.category,
    subtype: payload.subtype,
    confidence: payload.confidence,
    alternatives: payload.alternatives,
    rationale: payload.rationale,
    evidencePages: payload.evidencePages,
    detectedIdentifiers: payload.detectedIdentifiers,
    modelVersion: payload.modelVersion,
    taxonomyVersion: payload.taxonomyVersion,
    legacyDocumentType: payload.legacyDocumentType,
    detectedDocumentType: payload.detectedDocumentType,
    provider: payload.provider,
    hasSuggestion: payload.hasSuggestion,
    processingDurationMs: payload.processingDurationMs,
    decisionAction: payload.decisionAction,
    // Legacy aliases for existing readers
    documentCategory: payload.category,
    documentSubtype: payload.subtype,
    sourcePages: payload.evidencePages,
    model: payload.modelVersion,
  };
}

export function emptyClassificationContract(
  overrides: Partial<DocumentClassificationContract> = {},
): DocumentClassificationContract {
  return {
    contractVersion: DOCUMENT_CLASSIFICATION_CONTRACT_VERSION,
    category: null,
    subtype: null,
    confidence: 0,
    alternatives: [],
    rationale: '',
    evidencePages: [],
    detectedIdentifiers: [],
    modelVersion: null,
    taxonomyVersion: null,
    legacyDocumentType: null,
    detectedDocumentType: CLASSIFICATION_UNKNOWN,
    ...overrides,
  };
}
