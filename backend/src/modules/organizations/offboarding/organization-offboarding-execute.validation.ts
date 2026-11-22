import { BadRequestException } from '@nestjs/common';
import {
  OFFBOARDING_EXECUTION_CONFIRM_VALUE,
  ORGANIZATION_OFFBOARDING_EXECUTION_CONFIRMATION_CODE,
} from './organization-offboarding-execution.policy';

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export type OrganizationOffboardExecuteRequest = {
  idempotencyKey: string;
  confirmExecution: typeof OFFBOARDING_EXECUTION_CONFIRM_VALUE;
};

export function parseOrganizationOffboardingExecuteBody(body: unknown): OrganizationOffboardExecuteRequest {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException({
      code: 'ORGANIZATION_OFFBOARDING_INVALID_REQUEST',
      message: 'Request body must be a JSON object',
    });
  }
  const record = body as Record<string, unknown>;
  const allowed = new Set(['idempotencyKey', 'confirmExecution']);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new BadRequestException({
        code: 'ORGANIZATION_OFFBOARDING_INVALID_REQUEST',
        message: `Unknown field: ${key}`,
      });
    }
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

  if (record.confirmExecution !== OFFBOARDING_EXECUTION_CONFIRM_VALUE) {
    throw new BadRequestException({
      code: ORGANIZATION_OFFBOARDING_EXECUTION_CONFIRMATION_CODE,
      message: 'Explicit execution confirmation is required',
    });
  }

  return { idempotencyKey, confirmExecution: OFFBOARDING_EXECUTION_CONFIRM_VALUE };
}