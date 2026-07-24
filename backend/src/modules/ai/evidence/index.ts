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

export {
  AI_EVIDENCE_TELEMETRY_SEMANTICS,
  TELEMETRY_FRESH_THRESHOLD_MS,
  TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS,
  TELEMETRY_STANDBY_THRESHOLD_MS,
} from './ai-evidence-telemetry.enums';
export type {
  AiEvidenceTelemetrySemantics,
  TelemetryFreshness,
} from './ai-evidence-telemetry.enums';

export type {
  AiTelemetryLiveHints,
  AiTelemetrySemanticsMappingRow,
  MapTelemetryToAiEvidenceInput,
  MappedTelemetryAiSemantics,
} from './ai-evidence-telemetry.types';

export {
  AI_TELEMETRY_SEMANTICS_MAPPING_TABLE,
  hasAiTelemetryFreshLiveHint,
  mapCanonicalTelemetryFreshnessToSemantics,
  mapDashboardTelemetryStateToSemantics,
  mapTelemetryToAiEvidenceSemantics,
} from './ai-evidence-telemetry.mapper';

export {
  AI_DOMAIN_AUDIT_EVENTS,
  AI_DOMAIN_ERROR_CODES,
  AI_DOMAIN_ERROR_RETRY_POLICY,
  AI_DOMAIN_ERROR_SEVERITY,
  AI_DOMAIN_HTTP_STATUS,
} from './ai-domain-error.enums';
export type {
  AiDomainAuditEvent,
  AiDomainErrorCode,
  AiDomainErrorRetryPolicy,
  AiDomainErrorSeverity,
  AiDomainHttpStatus,
} from './ai-domain-error.enums';

export {
  AI_DOMAIN_ERROR_CATALOG,
  describeAiDomainErrorCode,
  getAiDomainErrorCatalogEntry,
  isAiDomainAuditEvent,
  isAiDomainErrorCode,
  listAiDomainErrorCatalogEntries,
} from './ai-domain-error.catalog';

export {
  AI_DOMAIN_ERROR_FACTORIES,
  buildAiDomainQueryOutcome,
  buildPartialAiDomainQueryOutcome,
  createAiDomainError,
  createDataNotAvailableError,
  createDataTooOldError,
  createDomainStatusInconsistentError,
  createIntegrationNotConnectedError,
  createIntegrationTemporarilyUnavailableError,
  createInternalProcessingFailedError,
  createInvalidInputError,
  createPermissionDeniedError,
  createRoleRestrictedError,
  createSignalNotSupportedError,
  createTimeoutError,
  createVehicleAmbiguousError,
  createVehicleNotFoundError,
  resolveSecureVehicleAccessError,
  toAiDomainQueryOutcomeForLlm,
} from './ai-domain-error.factory';

export {
  assertNoDiagnosticsInPublicView,
  mapEvidenceReasonCodeToDomainErrorCode,
  redactForeignOrganizationReferences,
  sanitizeAiDomainDiagnosticText,
  sanitizeInternalThrowable,
  serializeAiDomainErrorForLlm,
  serializeAiDomainErrorsForLlm,
  toAiDomainErrorApiView,
  toAiDomainErrorAuditPayload,
  toAiDomainErrorPublicView,
} from './ai-domain-error.serialization';

export type {
  AiDomainError,
  AiDomainErrorApiView,
  AiDomainErrorDiagnostics,
  AiDomainErrorPublicView,
  AiDomainQueryOutcome,
  CreateAiDomainErrorInput,
  AiDomainErrorCatalogEntry,
} from './ai-domain-error.types';
