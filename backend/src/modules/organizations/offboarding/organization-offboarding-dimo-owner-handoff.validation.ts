import { BadRequestException } from '@nestjs/common';

export type ParsedDimoOwnerHandoffBody = {
  idempotencyKey: string;
  vehicleIds?: string[];
};

export function parseOrganizationDimoOwnerHandoffBody(body: unknown): ParsedDimoOwnerHandoffBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object');
  }
  const record = body as Record<string, unknown>;
  const idempotencyKey = record.idempotencyKey;
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8) {
    throw new BadRequestException('idempotencyKey must be a string with at least 8 characters');
  }
  const vehicleIds = record.vehicleIds;
  if (vehicleIds === undefined) {
    return { idempotencyKey: idempotencyKey.trim() };
  }
  if (!Array.isArray(vehicleIds) || vehicleIds.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new BadRequestException('vehicleIds must be an array of non-empty strings when provided');
  }
  return { idempotencyKey: idempotencyKey.trim(), vehicleIds: vehicleIds.map((id) => id.trim()) };
}