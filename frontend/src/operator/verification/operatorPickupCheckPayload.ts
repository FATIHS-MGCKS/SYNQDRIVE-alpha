import type { ManualPickupCheckDto } from '../../lib/api';

export type OperatorPickupCheckFormState = Omit<
  ManualPickupCheckDto,
  'customerId' | 'bookingId'
>;

export type OperatorPickupCheckFieldKey = keyof Omit<OperatorPickupCheckFormState, 'notes'>;

export const DEFAULT_OPERATOR_PICKUP_CHECK_FORM: OperatorPickupCheckFormState = {
  idDocumentSeen: false,
  idNameMatchesBooking: false,
  idDateOfBirthChecked: false,
  minimumAgePassed: false,
  drivingLicenseSeen: false,
  licenseNameMatchesBooking: false,
  licenseClassValid: false,
  licenseNotExpired: false,
  minimumLicenseDurationPassed: true,
  notes: '',
};

export function buildManualPickupCheckPayload(
  input: ManualPickupCheckDto,
): ManualPickupCheckDto {
  const notes = input.notes?.trim();
  return {
    ...input,
    notes: notes || undefined,
  };
}
