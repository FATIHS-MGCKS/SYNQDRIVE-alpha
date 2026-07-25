import { createHash } from 'crypto';
import type {
  ComplaintSource,
  TechnicalObservationAffectedArea,
  TechnicalObservationCategory,
} from '@prisma/client';

const ACTIVE_COMPLAINT_STATUSES = [
  'ACTIVE',
  'OPEN',
  'IN_REVIEW',
  'CONFIRMED',
  'NEW',
] as const;

export { ACTIVE_COMPLAINT_STATUSES };

/**
 * Stable dedupe key for manual/system complaint creates (VW-F-025).
 */
export function buildComplaintCreateDedupeKey(input: {
  vehicleId: string;
  source: ComplaintSource | string;
  category?: TechnicalObservationCategory | null;
  affectedArea?: TechnicalObservationAffectedArea | null;
  description: string;
}): string {
  const normalizedDescription = input.description.trim().toLowerCase().replace(/\s+/g, ' ');
  const fingerprint = createHash('sha256')
    .update(
      [
        input.vehicleId,
        input.source,
        input.category ?? '',
        input.affectedArea ?? '',
        normalizedDescription,
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 16);

  return `complaint:${input.vehicleId}:${input.source}:${fingerprint}`;
}
