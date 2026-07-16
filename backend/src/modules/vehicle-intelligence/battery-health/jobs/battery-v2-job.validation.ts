import {
  BATTERY_V2_JOB_MODEL_VERSIONS,
  BATTERY_V2_JOB_TYPES,
  type BatteryV2JobAttemptContext,
  type BatteryV2JobPayload,
  type BatteryV2JobPayloadBase,
  type BatteryV2JobType,
} from './battery-v2-job.types';

export class BatteryV2JobValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'BatteryV2JobValidationError';
  }
}

const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CUID_LIKE = /^c[a-z0-9]{24,}$/i;

/** Keys that must never appear in job payloads (PII / free-text). */
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'email',
  'phone',
  'driverName',
  'customerName',
  'licensePlate',
  'plate',
  'vin',
  'notes',
  'description',
  'firstName',
  'lastName',
  'address',
]);

function isNonEmptyString(value: unknown, maxLen = 128): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLen;
}

function isEntityId(value: unknown): value is string {
  if (!isNonEmptyString(value, 128)) return false;
  return UUID_LIKE.test(value) || CUID_LIKE.test(value) || /^[a-z0-9:_-]{8,128}$/i.test(value);
}

function parseIsoDate(value: unknown, field: string): string {
  if (!isNonEmptyString(value, 64)) {
    throw new BatteryV2JobValidationError(`${field} must be a non-empty ISO timestamp`, field);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BatteryV2JobValidationError(`${field} must be a valid ISO timestamp`, field);
  }
  return parsed.toISOString();
}

function assertNoForbiddenKeys(value: unknown, path = 'payload'): void {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
      throw new BatteryV2JobValidationError(
        `Forbidden field "${key}" — Battery V2 payloads must not contain PII`,
        key,
      );
    }
    assertNoForbiddenKeys(nested, `${path}.${key}`);
  }
}

function validateAttemptContext(value: unknown): BatteryV2JobAttemptContext {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BatteryV2JobValidationError('attemptContext is required', 'attemptContext');
  }
  const ctx = value as Record<string, unknown>;
  const attemptNumber = ctx.attemptNumber;
  const maxAttempts = ctx.maxAttempts;
  if (typeof attemptNumber !== 'number' || !Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new BatteryV2JobValidationError(
      'attemptContext.attemptNumber must be a positive integer',
      'attemptContext.attemptNumber',
    );
  }
  if (typeof maxAttempts !== 'number' || !Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new BatteryV2JobValidationError(
      'attemptContext.maxAttempts must be a positive integer',
      'attemptContext.maxAttempts',
    );
  }
  if (attemptNumber > maxAttempts) {
    throw new BatteryV2JobValidationError(
      'attemptContext.attemptNumber cannot exceed maxAttempts',
      'attemptContext.attemptNumber',
    );
  }
  const enqueuedAt = parseIsoDate(ctx.enqueuedAt, 'attemptContext.enqueuedAt');
  const previousFailureCode =
    ctx.previousFailureCode == null
      ? null
      : isNonEmptyString(ctx.previousFailureCode, 64)
        ? ctx.previousFailureCode
        : (() => {
            throw new BatteryV2JobValidationError(
              'attemptContext.previousFailureCode must be null or a short string',
              'attemptContext.previousFailureCode',
            );
          })();

  return {
    attemptNumber,
    maxAttempts,
    enqueuedAt,
    previousFailureCode,
  };
}

function validateBasePayload(raw: unknown): BatteryV2JobPayloadBase {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BatteryV2JobValidationError('payload must be an object');
  }
  assertNoForbiddenKeys(raw);

  const data = raw as Record<string, unknown>;

  if (!isEntityId(data.organizationId)) {
    throw new BatteryV2JobValidationError('organizationId is required', 'organizationId');
  }
  if (!isEntityId(data.vehicleId)) {
    throw new BatteryV2JobValidationError('vehicleId is required', 'vehicleId');
  }
  if (!isNonEmptyString(data.idempotencyKey, 256)) {
    throw new BatteryV2JobValidationError('idempotencyKey is required', 'idempotencyKey');
  }
  if (!isNonEmptyString(data.correlationId, 128)) {
    throw new BatteryV2JobValidationError('correlationId is required', 'correlationId');
  }

  const modelVersion = data.modelVersion;
  if (
    typeof modelVersion !== 'string' ||
    !(BATTERY_V2_JOB_MODEL_VERSIONS as readonly string[]).includes(modelVersion)
  ) {
    throw new BatteryV2JobValidationError(
      `modelVersion must be one of: ${BATTERY_V2_JOB_MODEL_VERSIONS.join(', ')}`,
      'modelVersion',
    );
  }

  const requestedAt = parseIsoDate(data.requestedAt, 'requestedAt');
  const attemptContext = validateAttemptContext(data.attemptContext);

  let sourceEntityId: string | null | undefined;
  if (data.sourceEntityId !== undefined && data.sourceEntityId !== null) {
    if (!isEntityId(data.sourceEntityId)) {
      throw new BatteryV2JobValidationError(
        'sourceEntityId must be a valid entity id when provided',
        'sourceEntityId',
      );
    }
    sourceEntityId = data.sourceEntityId;
  }

  return {
    organizationId: data.organizationId,
    vehicleId: data.vehicleId,
    idempotencyKey: data.idempotencyKey.trim(),
    sourceEntityId: sourceEntityId ?? null,
    requestedAt,
    modelVersion: modelVersion as BatteryV2JobPayloadBase['modelVersion'],
    correlationId: data.correlationId.trim(),
    attemptContext,
  };
}

export function isBatteryV2JobType(value: unknown): value is BatteryV2JobType {
  return (
    typeof value === 'string' &&
    (BATTERY_V2_JOB_TYPES as readonly string[]).includes(value)
  );
}

export function validateBatteryV2JobPayload<T extends BatteryV2JobType>(
  jobType: T,
  raw: unknown,
): BatteryV2JobPayload<T> {
  if (!isBatteryV2JobType(jobType)) {
    throw new BatteryV2JobValidationError(`Unknown job type: ${String(jobType)}`, 'jobType');
  }

  const base = validateBasePayload(raw);
  const data = raw as Record<string, unknown>;

  switch (jobType) {
    case 'BATTERY_REST_TARGET_EVALUATE': {
      let restWindowStartedAt: string | null | undefined;
      if (data.restWindowStartedAt !== undefined && data.restWindowStartedAt !== null) {
        restWindowStartedAt = parseIsoDate(
          data.restWindowStartedAt,
          'restWindowStartedAt',
        );
      }
      return { ...base, restWindowStartedAt: restWindowStartedAt ?? null } as BatteryV2JobPayload<T>;
    }
    case 'BATTERY_START_PROXY_EXTRACT': {
      let tripId: string | null | undefined;
      if (data.tripId !== undefined && data.tripId !== null) {
        if (!isEntityId(data.tripId)) {
          throw new BatteryV2JobValidationError('tripId must be a valid entity id', 'tripId');
        }
        tripId = data.tripId;
      }
      return { ...base, tripId: tripId ?? null } as BatteryV2JobPayload<T>;
    }
    default:
      return base as BatteryV2JobPayload<T>;
  }
}

export function buildBatteryV2AttemptContext(input: {
  attemptNumber?: number;
  maxAttempts: number;
  enqueuedAt?: Date;
  previousFailureCode?: string | null;
}): BatteryV2JobAttemptContext {
  return {
    attemptNumber: input.attemptNumber ?? 1,
    maxAttempts: input.maxAttempts,
    enqueuedAt: (input.enqueuedAt ?? new Date()).toISOString(),
    previousFailureCode: input.previousFailureCode ?? null,
  };
}
