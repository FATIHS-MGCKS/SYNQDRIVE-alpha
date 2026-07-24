import {
  AI_EVIDENCE_AVAILABILITY,
  AI_EVIDENCE_CONFIDENCE,
  AI_EVIDENCE_FACT_KINDS,
  AI_EVIDENCE_FRESHNESS,
  AI_EVIDENCE_REASON_CODES,
  AI_EVIDENCE_SENSITIVITY,
  AI_EVIDENCE_SOURCES,
  AI_EVIDENCE_SOURCE_ENTITY_KINDS,
  type AiEvidenceReasonCode,
} from './ai-evidence.enums';
import type {
  AiEvidence,
  AiEvidenceValidationIssue,
  AiEvidenceValidationOptions,
  AiEvidenceValidationResult,
  AiEvidenceValue,
} from './ai-evidence.types';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STALE_FRESHNESS = new Set(['signal_delayed', 'offline', 'no_signal']);

const PII_SENSITIVITY = new Set(['pii', 'restricted']);

/** Values considered redacted for LLM export. */
const REDACTED_STRING_MARKERS = ['[REDACTED]', '***'] as const;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/;

export function parseAiEvidenceIsoTimestampMs(
  value: string | null | undefined,
): number | null {
  if (value == null || value === '') return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return ms;
}

export function isAiEvidenceEnumValue<T extends string>(
  values: readonly T[],
  candidate: string,
): candidate is T {
  return (values as readonly string[]).includes(candidate);
}

function issue(
  path: string,
  code: AiEvidenceReasonCode,
  message: string,
): AiEvidenceValidationIssue {
  return { path, code, message };
}

export function containsLikelyRawPii(value: AiEvidenceValue): boolean {
  if (value == null) return false;
  if (typeof value === 'string') {
    if (REDACTED_STRING_MARKERS.some((m) => value.includes(m))) return false;
    return EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsLikelyRawPii(entry));
  }
  if (typeof value === 'object') {
    return Object.values(value).some((entry) => containsLikelyRawPii(entry));
  }
  return false;
}

export function isRedactedAiEvidenceValue(value: AiEvidenceValue): boolean {
  if (value == null) return true;
  if (typeof value === 'string') {
    return REDACTED_STRING_MARKERS.some((m) => value.includes(m));
  }
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((entry) => isRedactedAiEvidenceValue(entry));
  }
  if (typeof value === 'object') {
    const entries = Object.values(value);
    return (
      entries.length === 0 ||
      entries.every((entry) => isRedactedAiEvidenceValue(entry))
    );
  }
  return false;
}

function validateStructuralEnums(evidence: AiEvidence, issues: AiEvidenceValidationIssue[]): void {
  if (!isAiEvidenceEnumValue(AI_EVIDENCE_SOURCES, evidence.source)) {
    issues.push(issue('source', 'validation_failed', `Invalid source: ${evidence.source}`));
  }
  if (!isAiEvidenceEnumValue(AI_EVIDENCE_FRESHNESS, evidence.freshness)) {
    issues.push(
      issue('freshness', 'validation_failed', `Invalid freshness: ${evidence.freshness}`),
    );
  }
  if (!isAiEvidenceEnumValue(AI_EVIDENCE_AVAILABILITY, evidence.availability)) {
    issues.push(
      issue(
        'availability',
        'validation_failed',
        `Invalid availability: ${evidence.availability}`,
      ),
    );
  }
  if (!isAiEvidenceEnumValue(AI_EVIDENCE_CONFIDENCE, evidence.confidence)) {
    issues.push(
      issue('confidence', 'validation_failed', `Invalid confidence: ${evidence.confidence}`),
    );
  }
  if (!isAiEvidenceEnumValue(AI_EVIDENCE_SENSITIVITY, evidence.sensitivity)) {
    issues.push(
      issue('sensitivity', 'validation_failed', `Invalid sensitivity: ${evidence.sensitivity}`),
    );
  }
  if (!isAiEvidenceEnumValue(AI_EVIDENCE_FACT_KINDS, evidence.factKind)) {
    issues.push(
      issue('factKind', 'validation_failed', `Invalid factKind: ${evidence.factKind}`),
    );
  }
  if (!isAiEvidenceEnumValue(AI_EVIDENCE_REASON_CODES, evidence.reasonCode)) {
    issues.push(
      issue('reasonCode', 'validation_failed', `Invalid reasonCode: ${evidence.reasonCode}`),
    );
  }
  if (
    !isAiEvidenceEnumValue(
      AI_EVIDENCE_SOURCE_ENTITY_KINDS,
      evidence.sourceEntity.kind,
    )
  ) {
    issues.push(
      issue(
        'sourceEntity.kind',
        'validation_failed',
        `Invalid sourceEntity.kind: ${evidence.sourceEntity.kind}`,
      ),
    );
  }
}

function validateTenantAndEntity(evidence: AiEvidence, issues: AiEvidenceValidationIssue[]): void {
  if (!evidence.tenantId || evidence.tenantId.trim() === '') {
    issues.push(issue('tenantId', 'invalid_tenant', 'tenantId is required'));
  } else if (!UUID_V4_PATTERN.test(evidence.tenantId)) {
    issues.push(issue('tenantId', 'invalid_tenant', 'tenantId must be a valid UUID'));
  }

  if (!evidence.entityId || evidence.entityId.trim() === '') {
    issues.push(issue('entityId', 'validation_failed', 'entityId is required'));
  }
}

function validateFactKindTimestamps(
  evidence: AiEvidence,
  issues: AiEvidenceValidationIssue[],
): void {
  const observedMs = parseAiEvidenceIsoTimestampMs(evidence.observedAt);
  const calculatedMs = parseAiEvidenceIsoTimestampMs(evidence.calculatedAt);

  if (evidence.factKind === 'observed') {
    const observationRequired =
      evidence.availability === 'available' || evidence.availability === 'partial';
    if (observationRequired && observedMs == null) {
      issues.push(
        issue(
          'observedAt',
          'validation_failed',
          'observedAt is required for available observed facts',
        ),
      );
    }
    if (evidence.calculatedAt != null) {
      issues.push(
        issue(
          'calculatedAt',
          'validation_failed',
          'calculatedAt must be null for observed facts',
        ),
      );
    }
  }

  if (evidence.factKind === 'calculated') {
    if (calculatedMs == null) {
      issues.push(
        issue(
          'calculatedAt',
          'validation_failed',
          'calculatedAt is required for calculated facts',
        ),
      );
    }
  }

  if (evidence.factKind === 'static') {
    if (evidence.observedAt != null) {
      issues.push(
        issue(
          'observedAt',
          'validation_failed',
          'observedAt must be null for static facts',
        ),
      );
    }
    if (evidence.calculatedAt != null) {
      issues.push(
        issue(
          'calculatedAt',
          'validation_failed',
          'calculatedAt must be null for static facts',
        ),
      );
    }
    if (evidence.freshness !== 'not_applicable') {
      issues.push(
        issue(
          'freshness',
          'validation_failed',
          'static facts must use freshness not_applicable',
        ),
      );
    }
  }

  if (
    observedMs != null &&
    calculatedMs != null &&
    calculatedMs < observedMs
  ) {
    issues.push(
      issue(
        'calculatedAt',
        'timestamp_inconsistent',
        'calculatedAt must not be earlier than observedAt',
      ),
    );
  }
}

function validateAvailabilitySemantics(
  evidence: AiEvidence,
  issues: AiEvidenceValidationIssue[],
): void {
  if (evidence.availability === 'unavailable') {
    if (evidence.value !== null) {
      issues.push(
        issue(
          'value',
          'data_unavailable',
          'unavailable evidence must have null value',
        ),
      );
    }
    if (
      evidence.reasonCode !== 'data_unavailable' &&
      evidence.reasonCode !== 'entity_not_found' &&
      evidence.reasonCode !== 'pipeline_failure'
    ) {
      issues.push(
        issue(
          'reasonCode',
          'data_unavailable',
          'unavailable evidence requires an unavailable reason code',
        ),
      );
    }
  }

  if (evidence.availability === 'permission_denied') {
    if (evidence.reasonCode !== 'permission_denied') {
      issues.push(
        issue(
          'reasonCode',
          'permission_denied',
          'permission_denied availability requires reasonCode permission_denied',
        ),
      );
    }
    if (evidence.value !== null && !isRedactedAiEvidenceValue(evidence.value)) {
      issues.push(
        issue(
          'value',
          'permission_denied',
          'permission_denied evidence must not expose raw values',
        ),
      );
    }
  }

  if (evidence.availability === 'partial' && evidence.reasonCode === 'ok') {
    issues.push(
      issue(
        'reasonCode',
        'partial_data',
        'partial availability should not use reasonCode ok',
      ),
    );
  }

  if (
    evidence.availability === 'available' &&
    evidence.reasonCode === 'ok' &&
    STALE_FRESHNESS.has(evidence.freshness)
  ) {
    issues.push(
      issue(
        'freshness',
        'stale_data',
        'stale freshness cannot be combined with available/ok without partial or stale reason',
      ),
    );
  }
}

function validateSensitivityForLlm(
  evidence: AiEvidence,
  issues: AiEvidenceValidationIssue[],
): void {
  if (!PII_SENSITIVITY.has(evidence.sensitivity)) return;

  if (containsLikelyRawPii(evidence.value)) {
    issues.push(
      issue(
        'value',
        'sensitivity_redacted',
        'PII/restricted evidence must not embed raw personal data for LLM export',
      ),
    );
  }
}

function validateWarnings(evidence: AiEvidence, issues: AiEvidenceValidationIssue[]): void {
  if (!Array.isArray(evidence.warnings)) {
    issues.push(issue('warnings', 'validation_failed', 'warnings must be an array'));
    return;
  }
  for (let i = 0; i < evidence.warnings.length; i++) {
    if (typeof evidence.warnings[i] !== 'string') {
      issues.push(
        issue(`warnings[${i}]`, 'validation_failed', 'warning entries must be strings'),
      );
    }
  }
}

/**
 * Validates a fully constructed {@link AiEvidence} record.
 * Use at tool boundaries before persisting or serializing for the LLM.
 */
export function validateAiEvidence(
  evidence: AiEvidence,
  options: AiEvidenceValidationOptions = {},
): AiEvidenceValidationResult {
  const issues: AiEvidenceValidationIssue[] = [];

  validateStructuralEnums(evidence, issues);
  validateTenantAndEntity(evidence, issues);
  validateWarnings(evidence, issues);
  validateFactKindTimestamps(evidence, issues);
  validateAvailabilitySemantics(evidence, issues);

  if (options.forLlm) {
    validateSensitivityForLlm(evidence, issues);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function assertValidAiEvidence(
  evidence: AiEvidence,
  options?: AiEvidenceValidationOptions,
): void {
  const result = validateAiEvidence(evidence, options);
  if (!result.valid) {
    const summary = result.issues.map((i) => `${i.path}: ${i.message}`).join('; ');
    throw new Error(`Invalid AI evidence: ${summary}`);
  }
}
