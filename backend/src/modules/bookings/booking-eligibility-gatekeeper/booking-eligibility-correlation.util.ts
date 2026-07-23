import { createHash, randomUUID } from 'crypto';

export type BookingEligibilityCommandKind =
  | 'preview'
  | 'create'
  | 'update'
  | 'confirm'
  | 'pickup';

export type BookingEligibilityCorrelationIds = {
  evaluationId: string;
  commandId: string;
  transitionId: string;
  auditEventId: string;
};

export function buildBookingEligibilityCorrelationIds(input: {
  organizationId: string;
  bookingId?: string | null;
  command: BookingEligibilityCommandKind;
  parentCommandId?: string | null;
}): BookingEligibilityCorrelationIds {
  const evaluationId = `elig-eval:${randomUUID()}`;
  const bookingKey = input.bookingId?.trim() || 'no-booking';
  const orgDigest = createHash('sha256')
    .update(input.organizationId)
    .digest('hex')
    .slice(0, 12);
  const commandId =
    input.parentCommandId?.trim() ||
    `elig-cmd:${input.command}:${orgDigest}:${bookingKey}:${randomUUID()}`;
  const transitionId = `elig-xn:${input.command}:${orgDigest}:${bookingKey}:${randomUUID()}`;
  const auditEventId = `elig-audit:${evaluationId}`;

  return {
    evaluationId,
    commandId,
    transitionId,
    auditEventId,
  };
}
