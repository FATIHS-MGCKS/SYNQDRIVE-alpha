import { BadRequestException } from '@nestjs/common';
import type { OrganizationOffboardPrepareRequest } from './organization-offboarding.types';

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_NOTE_LENGTH = 2000;

function assertPlainObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException({
      code: 'ORGANIZATION_OFFBOARDING_INVALID_REQUEST',
      message: 'Request body must be a JSON object',
    });
  }
  return body as Record<string, unknown>;
}

export function parseOrganizationOffboardingPrepareBody(
  body: unknown,
): OrganizationOffboardPrepareRequest {
  const record = assertPlainObject(body);
  const allowed = new Set(['idempotencyKey', 'note']);
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

  let note: string | undefined;
  if (record.note !== undefined && record.note !== null) {
    if (typeof record.note !== 'string') {
      throw new BadRequestException({
        code: 'ORGANIZATION_OFFBOARDING_INVALID_REQUEST',
        message: 'note must be a string',
      });
    }
    const trimmed = record.note.trim();
    if (trimmed.length > MAX_NOTE_LENGTH) {
      throw new BadRequestException({
        code: 'ORGANIZATION_OFFBOARDING_INVALID_REQUEST',
        message: 'note is too long',
      });
    }
    if (trimmed.length > 0) {
      note = trimmed;
    }
  }

  return { idempotencyKey, note };
}