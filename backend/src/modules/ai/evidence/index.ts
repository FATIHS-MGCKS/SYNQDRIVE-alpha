export {
  AI_EVIDENCE_AVAILABILITY,
  AI_EVIDENCE_CONFIDENCE,
  AI_EVIDENCE_FACT_KINDS,
  AI_EVIDENCE_FRESHNESS,
  AI_EVIDENCE_REASON_CODES,
  AI_EVIDENCE_SENSITIVITY,
  AI_EVIDENCE_SOURCES,
  AI_EVIDENCE_SOURCE_ENTITY_KINDS,
} from './ai-evidence.enums';
export type {
  AiEvidenceAvailability,
  AiEvidenceConfidence,
  AiEvidenceFactKind,
  AiEvidenceFreshness,
  AiEvidenceReasonCode,
  AiEvidenceSensitivity,
  AiEvidenceSource,
  AiEvidenceSourceEntityKind,
} from './ai-evidence.enums';

export type {
  AiEvidence,
  AiEvidencePrimitive,
  AiEvidenceSourceEntity,
  AiEvidenceValidationIssue,
  AiEvidenceValidationOptions,
  AiEvidenceValidationResult,
  AiEvidenceValue,
} from './ai-evidence.types';

export {
  createCalculatedAiEvidence,
  createObservedAiEvidence,
  createPermissionDeniedAiEvidence,
  createStaleObservedAiEvidence,
  createStaticAiEvidence,
  createUnavailableAiEvidence,
} from './ai-evidence.factory';
export type { CreateAiEvidenceBaseInput } from './ai-evidence.factory';

export {
  AiEvidenceBatchDto,
  AiEvidenceDto,
  AiEvidenceSourceEntityDto,
  validateAiEvidenceDto,
} from './ai-evidence.dto';
export type { AiEvidenceDtoValue } from './ai-evidence.dto';

export {
  parseAiEvidenceJson,
  serializeAiEvidenceForLlm,
  toAiEvidenceJson,
} from './ai-evidence.serialization';

export {
  assertValidAiEvidence,
  containsLikelyRawPii,
  isAiEvidenceEnumValue,
  isRedactedAiEvidenceValue,
  parseAiEvidenceIsoTimestampMs,
  validateAiEvidence,
} from './ai-evidence.validation';
