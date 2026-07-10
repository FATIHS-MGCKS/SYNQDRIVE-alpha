import { ApplyDocumentExtractionType, isApplyDocumentType } from './document-extraction.schemas';
import { CLASSIFICATION_UNKNOWN } from '@modules/ai/documents/document-classification.types';

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

export function evaluateClassificationDecision(
  input: ClassificationDecisionInput,
): ClassificationDecision {
  const confidence = clampConfidence(input.confidence);
  const rationaleOk = hasEvidenceRationale(input.rationale);
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
