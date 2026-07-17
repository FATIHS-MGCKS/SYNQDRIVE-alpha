import { ApplyDocumentExtractionType, isApplyDocumentType } from './document-extraction.schemas';
import { CLASSIFICATION_UNKNOWN } from '@modules/ai/documents/document-classification.types';
import type { ClassificationAlternativeCandidate } from './document-classification-contract.types';
import type { DocumentCategory, DocumentSubtype } from './document-taxonomy.types';
import {
  hasCompetingAlternativeCandidates,
  isGeneralCorrespondenceForcedAsService,
  isUnclearClassificationSubtype,
} from './document-classification-taxonomy.util';

export interface ClassificationThresholds {
  autoContinueMinConfidence: number;
  suggestionMinConfidence: number;
}

export type ClassificationDecision =
  | {
      action: 'AUTO_CONTINUE';
      effectiveType: ApplyDocumentExtractionType;
      detectedType: ApplyDocumentExtractionType;
      confidence: number;
      hasSuggestion: true;
    }
  | {
      action: 'AWAIT_USER';
      effectiveType: null;
      detectedType: ApplyDocumentExtractionType | null;
      confidence: number | null;
      hasSuggestion: boolean;
    };

export interface ClassificationDecisionInput {
  detectedDocumentType: string;
  confidence: number;
  rationale: string;
  allowedDocumentTypes: readonly ApplyDocumentExtractionType[];
  thresholds: ClassificationThresholds;
  category?: DocumentCategory | null;
  subtype?: DocumentSubtype | null;
  legacyDocumentType?: ApplyDocumentExtractionType | null;
  alternatives?: ClassificationAlternativeCandidate[];
}

function hasEvidenceRationale(rationale: string): boolean {
  const trimmed = rationale.trim();
  if (trimmed.length < 12) return false;
  const lower = trimmed.toLowerCase();
  if (lower === 'unknown' || lower === 'unclear' || lower === 'not sure') return false;
  return true;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function evaluateLegacyDecision(
  input: ClassificationDecisionInput,
  confidence: number,
  rationaleOk: boolean,
): ClassificationDecision {
  const allowed = new Set(input.allowedDocumentTypes);

  const isUnknown =
    input.detectedDocumentType === CLASSIFICATION_UNKNOWN ||
    !isApplyDocumentType(input.detectedDocumentType) ||
    !allowed.has(input.detectedDocumentType as ApplyDocumentExtractionType);

  if (isUnknown || !rationaleOk) {
    return {
      action: 'AWAIT_USER',
      effectiveType: null,
      detectedType: null,
      confidence: isUnknown ? confidence : null,
      hasSuggestion: false,
    };
  }

  const detectedType = input.detectedDocumentType as ApplyDocumentExtractionType;

  if (confidence >= input.thresholds.autoContinueMinConfidence && rationaleOk) {
    return {
      action: 'AUTO_CONTINUE',
      effectiveType: detectedType,
      detectedType,
      confidence,
      hasSuggestion: true,
    };
  }

  if (confidence >= input.thresholds.suggestionMinConfidence && rationaleOk) {
    return {
      action: 'AWAIT_USER',
      effectiveType: null,
      detectedType,
      confidence,
      hasSuggestion: true,
    };
  }

  return {
    action: 'AWAIT_USER',
    effectiveType: null,
    detectedType: null,
    confidence: null,
    hasSuggestion: false,
  };
}

export function evaluateClassificationDecision(
  input: ClassificationDecisionInput,
): ClassificationDecision {
  const confidence = clampConfidence(input.confidence);
  const rationaleOk = hasEvidenceRationale(input.rationale);
  const alternatives = input.alternatives ?? [];
  const subtype = input.subtype ?? null;
  const category = input.category ?? null;
  const legacyDocumentType = input.legacyDocumentType ?? null;

  const legacyDecision = evaluateLegacyDecision(input, confidence, rationaleOk);

  const hasTaxonomyContext =
    category != null || subtype != null || alternatives.length > 0;

  if (!hasTaxonomyContext) {
    return legacyDecision;
  }

  const taxonomyAwaitReason =
    isUnclearClassificationSubtype(
      subtype,
      confidence,
      input.thresholds.suggestionMinConfidence,
    ) ||
    isGeneralCorrespondenceForcedAsService({
      category,
      subtype,
      legacyDocumentType,
      rationale: input.rationale,
      alternatives,
    }) ||
    (legacyDecision.action === 'AUTO_CONTINUE' &&
      hasCompetingAlternativeCandidates(confidence, alternatives, subtype));

  if (taxonomyAwaitReason) {
    const hasSuggestion =
      legacyDecision.hasSuggestion ||
      (subtype != null && confidence >= input.thresholds.suggestionMinConfidence && rationaleOk);

    return {
      action: 'AWAIT_USER',
      effectiveType: null,
      detectedType: legacyDecision.detectedType,
      confidence: hasSuggestion ? confidence : legacyDecision.confidence,
      hasSuggestion,
    };
  }

  return legacyDecision;
}
