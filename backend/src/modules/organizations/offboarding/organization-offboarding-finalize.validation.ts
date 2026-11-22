import { BadRequestException } from '@nestjs/common';
import {
  OFFBOARDING_FINALIZATION_CONFIRM_VALUE,
  ORGANIZATION_OFFBOARDING_FINALIZATION_CONFIRMATION_CODE,
} from './organization-offboarding-finalization.policy';

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export type OrganizationOffboardFinalizeRequest = {
  jobId: string;
  idempotencyKey: string;
  confirmFinalization: typeof OFFBOARDING_FINALIZATION_CONFIRM_VALUE;
};

export function parseOrganizationOffboardingFinalizeBody(body: unknown): OrganizationOffboardFinalizeRequest {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException({
      code: 'ORGANIZATION_OFFBOARDING_INVALID_REQUEST',
      message: 'Request body must be a JSON object',
    });
  }
  const record = body as Record<string, unknown>;
  const allowed = new Set(['jobId', 'idempotencyKey', 'confirmFinalization']);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new BadRequestException({
        code: 'ORGANIZATION_OFFBOARDING_INVALID_REQUEST',
        message: `Unknown field: ${key}`,
      });
    }
  }

  const rawJobId = record.jobId;
  if (typeof rawJobId !== 'string' || rawJobId.trim().length < 1) {
    throw new BadRequestException({
      code: 'ORGANIZATION_OFFBOARDING_INVALID_REQUEST',
      message: 'jobId is required',
    });
  }

  const rawKey = record.idempotencyKey;
  if (typeof rawKey !== 'string') {
    throw new BadRequestException({
      code: 'ORGANIZATION_OFFBOARDING_INVALID_REQUEST',
      message: 'idempotencyKey is required',
    });
  }
  const idempotencyKey = rawKey.trim();
  if (idempotencyKey.length < 1 || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new BadRequestException({
      code: 'ORGANIZATION_OFFBOARDING_INVALID_REQUEST',
      message: 'idempotencyKey is invalid',
    });
  }

  if (record.confirmFinalization !== OFFBOARDING_FINALIZATION_CONFIRM_VALUE) {
    throw new BadRequestException({
      code: ORGANIZATION_OFFBOARDING_FINALIZATION_CONFIRMATION_CODE,
      message: 'Explicit finalization confirmation is required',
    });
  }

  return {
    jobId: rawJobId.trim(),
    idempotencyKey,
    confirmFinalization: OFFBOARDING_FINALIZATION_CONFIRM_VALUE,
  };
}