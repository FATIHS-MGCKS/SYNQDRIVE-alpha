import type { DrivingEvidenceSourceType } from '@prisma/client';
import {
  DRIVING_EVIDENCE_CONTRACT_VERSION,
  DRIVING_EVIDENCE_MAX_CONTEXT_BYTES,
  type CreateDrivingEvidenceInput,
  type DrivingEvidenceContext,
  type DrivingEvidenceSourceEntity,
  type DrivingEvidenceValidationIssue,
  type DrivingEvidenceValidationResult,
  type NormalizedDrivingEvidenceCreate,
} from './driving-evidence.types';

const FORBIDDEN_CONTEXT_KEYS = new Set([
  'rawpayload',
  'raw_payload',
  'providerpayload',
  'provider_payload',
  'metadatajson',
  'metadata_json',
  'rawresponse',
  'raw_response',
  'graphqlresponse',
  'webhookbody',
  'webhook_body',
  'fullpayload',
  'full_payload',
]);

const CONTEXT_ONLY_SOURCE_TYPES: ReadonlySet<DrivingEvidenceSourceType> = new Set(['CONTEXT_SIGNAL']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateSourceEntity(entity: DrivingEvidenceSourceEntity): boolean {
  return isNonEmptyString(entity.table) && isNonEmptyString(entity.id);
}

function collectForbiddenKeys(value: unknown, path = ''): string[] {
  if (value == null || typeof value !== 'object') {
    return [];
  }
  const hits: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (FORBIDDEN_CONTEXT_KEYS.has(normalized)) {
      hits.push(path ? `${path}.${key}` : key);
    }
    hits.push(...collectForbiddenKeys(nested, path ? `${path}.${key}` : key));
  }
  return hits;
}

function contextByteLength(context: DrivingEvidenceContext): number {
  return Buffer.byteLength(JSON.stringify(context), 'utf8');
}

/**
 * Whether this evidence row may alone support opening or strengthening a misuse case.
 * CONTEXT_SIGNAL rows require corroborating non-context evidence.
 */
export function canAloneSupportMisuseCase(sourceType: DrivingEvidenceSourceType): boolean {
  return !CONTEXT_ONLY_SOURCE_TYPES.has(sourceType);
}

/**
 * Pure contract validation — no Nest DI, no persistence.
 */
export function validateDrivingEvidenceContract(
  input: CreateDrivingEvidenceInput,
): DrivingEvidenceValidationResult {
  const issues: DrivingEvidenceValidationIssue[] = [];

  if (!isNonEmptyString(input.idempotencyKey)) {
    issues.push({
      code: 'MISSING_IDEMPOTENCY_KEY',
      message: 'idempotencyKey is required for tenant-safe deduplication',
    });
  }

  if (!validateSourceEntity(input.sourceEntity)) {
    issues.push({
      code: 'INVALID_SOURCE_ENTITY',
      message: 'sourceEntity requires non-empty table and id',
    });
  }

  if (input.confidence != null && (input.confidence < 0 || input.confidence > 1)) {
    issues.push({
      code: 'INVALID_CONFIDENCE',
      message: 'confidence must be between 0 and 1 when set',
    });
  }

  const forbiddenInEntity = collectForbiddenKeys(input.sourceEntity);
  const forbiddenInContext = collectForbiddenKeys(input.context ?? {});
  for (const field of [...forbiddenInEntity, ...forbiddenInContext]) {
    issues.push({
      code: 'FORBIDDEN_PAYLOAD_FIELD',
      message: `Full provider payloads are not allowed (${field})`,
    });
  }

  if (input.context && contextByteLength(input.context) > DRIVING_EVIDENCE_MAX_CONTEXT_BYTES) {
    issues.push({
      code: 'CONTEXT_TOO_LARGE',
      message: `context exceeds ${DRIVING_EVIDENCE_MAX_CONTEXT_BYTES} bytes`,
    });
  }

  if (
    input.sourceType === 'MEASURED_SIGNAL' &&
    (input.context?.measurementKind === 'estimated' ||
      input.context?.dataOrigin === 'estimated' ||
      input.context?.isEstimated === true)
  ) {
    issues.push({
      code: 'ESTIMATED_MARKED_AS_MEASURED',
      message: 'Estimated data cannot be stored as MEASURED_SIGNAL',
    });
  }

  if (
    input.sourceType === 'MEASURED_SIGNAL' &&
    (input.context?.providerClassified === true ||
      input.context?.classificationOrigin === 'provider' ||
      input.sourceEntity.kind?.toLowerCase().includes('provider_classified'))
  ) {
    issues.push({
      code: 'PROVIDER_CLASSIFICATION_HIDDEN',
      message: 'Provider-classified events must use PROVIDER_CLASSIFIED_EVENT, not MEASURED_SIGNAL',
    });
  }

  if (
    input.sourceType !== 'PROVIDER_CLASSIFIED_EVENT' &&
    input.context?.classificationOrigin === 'provider_native'
  ) {
    issues.push({
      code: 'PROVIDER_CLASSIFICATION_HIDDEN',
      message: 'Provider-native classification must use PROVIDER_CLASSIFIED_EVENT sourceType',
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    misuseCaseEligible: canAloneSupportMisuseCase(input.sourceType),
  };
}

export function normalizeDrivingEvidenceCreate(
  input: CreateDrivingEvidenceInput,
): NormalizedDrivingEvidenceCreate {
  const validation = validateDrivingEvidenceContract(input);
  if (!validation.ok) {
    throw new Error(
      validation.issues.map((issue) => `${issue.code}: ${issue.message}`).join('; '),
    );
  }

  return {
    ...input,
    misuseCaseEligible: validation.misuseCaseEligible,
    contractVersion: DRIVING_EVIDENCE_CONTRACT_VERSION,
  };
}
