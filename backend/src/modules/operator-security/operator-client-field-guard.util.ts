import { BadRequestException } from '@nestjs/common';

/** Server-owned identity / lifecycle fields that must never be client-supplied. */
export const OPERATOR_FORBIDDEN_BODY_FIELDS = [
  'organizationId',
  'orgId',
  'userId',
  'createdByUserId',
  'updatedByUserId',
  'performedByUserId',
  'performedByName',
  'bookingId',
  'vehicleId',
  'kind',
  'id',
  'createdAt',
  'updatedAt',
  'status',
  'paymentStatus',
] as const;

export function assertNoForbiddenOperatorBodyFields(
  body: unknown,
  extraForbidden: string[] = [],
): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  const forbidden = new Set<string>([
    ...OPERATOR_FORBIDDEN_BODY_FIELDS,
    ...extraForbidden,
  ]);
  for (const key of Object.keys(body as Record<string, unknown>)) {
    if (forbidden.has(key)) {
      throw new BadRequestException(`Field "${key}" must not be supplied by client`);
    }
  }
}
