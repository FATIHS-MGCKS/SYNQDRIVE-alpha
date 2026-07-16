import type { DrivingIntelligenceJobType } from '@prisma/client';
import {
  DRIVING_INTELLIGENCE_JOB_TYPES,
  type DrivingIntelligenceJobPayload,
  type DrivingIntelligenceJobValidationResult,
  type EnqueueDrivingIntelligenceJobInput,
  type NormalizedDrivingIntelligenceJobPayload,
} from './driving-intelligence-jobs.types';

const JOB_TYPE_SET = new Set<string>(DRIVING_INTELLIGENCE_JOB_TYPES);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeOptionalId(value: unknown): string | null {
  if (value == null || value === '') return null;
  return isNonEmptyString(value) ? value.trim() : null;
}

function normalizeRequestedAt(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

function validatePayloadFields(
  input: DrivingIntelligenceJobPayload,
): DrivingIntelligenceJobValidationResult {
  const issues: { code: string; message: string }[] = [];

  if (!isNonEmptyString(input.organizationId)) {
    issues.push({ code: 'MISSING_ORGANIZATION_ID', message: 'organizationId is required' });
  }
  if (!isNonEmptyString(input.vehicleId)) {
    issues.push({ code: 'MISSING_VEHICLE_ID', message: 'vehicleId is required' });
  }
  if (!isNonEmptyString(input.analysisRunId)) {
    issues.push({ code: 'MISSING_ANALYSIS_RUN_ID', message: 'analysisRunId is required' });
  }
  if (!isNonEmptyString(input.modelVersion)) {
    issues.push({ code: 'MISSING_MODEL_VERSION', message: 'modelVersion is required' });
  }
  if (!isNonEmptyString(input.idempotencyKey)) {
    issues.push({
      code: 'MISSING_IDEMPOTENCY_KEY',
      message: 'idempotencyKey is required for tenant-safe deduplication',
    });
  }
  if (!isNonEmptyString(input.correlationId)) {
    issues.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required' });
  }

  const requestedAt = normalizeRequestedAt(input.requestedAt);
  if (!requestedAt) {
    issues.push({ code: 'INVALID_REQUESTED_AT', message: 'requestedAt must be a valid ISO date' });
  }

  const tripId = normalizeOptionalId(input.tripId);
  if (input.tripId != null && input.tripId !== '' && tripId == null) {
    issues.push({ code: 'INVALID_TRIP_ID', message: 'tripId must be a non-empty string when provided' });
  }

  const bookingId = normalizeOptionalId(input.bookingId);
  if (input.bookingId != null && input.bookingId !== '' && bookingId == null) {
    issues.push({
      code: 'INVALID_BOOKING_ID',
      message: 'bookingId must be a non-empty string when provided',
    });
  }

  if (issues.length > 0 || !requestedAt) {
    return { ok: false, issues };
  }

  const normalized: NormalizedDrivingIntelligenceJobPayload = {
    organizationId: input.organizationId.trim(),
    vehicleId: input.vehicleId.trim(),
    tripId,
    bookingId,
    analysisRunId: input.analysisRunId.trim(),
    modelVersion: input.modelVersion.trim(),
    idempotencyKey: input.idempotencyKey.trim(),
    correlationId: input.correlationId.trim(),
    requestedAt,
  };

  return { ok: true, normalized };
}

/**
 * Pure contract validation — no Nest DI, no persistence.
 */
export function validateDrivingIntelligenceJobPayload(
  input: DrivingIntelligenceJobPayload,
): DrivingIntelligenceJobValidationResult {
  return validatePayloadFields(input);
}

export function validateEnqueueDrivingIntelligenceJobInput(
  input: EnqueueDrivingIntelligenceJobInput,
): DrivingIntelligenceJobValidationResult & { jobType?: DrivingIntelligenceJobType } {
  if (!isNonEmptyString(input.jobType) || !JOB_TYPE_SET.has(input.jobType)) {
    return {
      ok: false,
      issues: [
        {
          code: 'INVALID_JOB_TYPE',
          message: `jobType must be one of: ${DRIVING_INTELLIGENCE_JOB_TYPES.join(', ')}`,
        },
      ],
    };
  }

  const payloadResult = validatePayloadFields(input);
  if (!payloadResult.ok) {
    return payloadResult;
  }

  return { ok: true, normalized: payloadResult.normalized, jobType: input.jobType };
}

export function buildBullJobId(persistentJobId: string): string {
  return `di-${persistentJobId}`;
}
