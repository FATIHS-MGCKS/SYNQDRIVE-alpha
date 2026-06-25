import type { ManualPickupCheckDto } from '../../lib/api';

export type OperatorPickupCheckFormState = Omit<
  ManualPickupCheckDto,
  'customerId' | 'bookingId'
>;

export function buildManualPickupCheckPayload(
  input: ManualPickupCheckDto,
): ManualPickupCheckDto {
  const notes = input.notes?.trim();
  return {
    ...input,
    notes: notes || undefined,
  };
}
