/** Synthetic confirmed-data fixtures for FINE / Anhörungsbogen tests. */

export const FINE_PAYMENT_NOTICE_COMPLETE = {
  noticeType: 'PAYMENT_NOTICE',
  licensePlate: 'KS-FH-660E',
  offenseDateTime: '2025-10-24T14:35:00',
  issuingAuthority: 'Stadt Kassel',
  referenceNumber: 'REF-2025-991',
  offenseType: 'Parkverstoß',
  offenseDescription: 'Parken ohne Parkschein',
  location: 'Wilhelmshöher Allee',
  amountCents: 1750,
  feeBreakdown: 'Parkgebühr: 17,50 EUR',
  dueDate: '2025-11-24',
} as const;

export const FINE_HEARING_FORM_COMPLETE = {
  noticeType: 'HEARING_FORM',
  licensePlate: 'KS-FH-660E',
  offenseDateTime: '2025-10-24T16:10:00',
  issuingAuthority: 'Stadt Kassel',
  referenceNumber: 'ANH-2025-44',
  offenseDescription: 'Geschwindigkeitsüberschreitung innerorts',
  location: 'A49',
  responseDeadline: '2025-11-10',
} as const;

export const FINE_PAYMENT_NOTICE_MISSING_AUTHORITY = {
  ...FINE_PAYMENT_NOTICE_COMPLETE,
  issuingAuthority: '',
  referenceNumber: 'REF-2025-991',
} as const;

export const FINE_PAYMENT_NOTICE_INVALID_DUE_DATE = {
  ...FINE_PAYMENT_NOTICE_COMPLETE,
  offenseDateTime: '2025-10-24T14:35:00',
  dueDate: '2025-10-20',
} as const;

export const FINE_PAYMENT_NOTICE_PLATE_MISMATCH = {
  ...FINE_PAYMENT_NOTICE_COMPLETE,
  licensePlate: 'B-XY-9999',
} as const;

export const FINE_PAYMENT_NOTICE_NO_OFFENSE_TIME = {
  noticeType: 'PAYMENT_NOTICE',
  licensePlate: 'KS-FH-660E',
  offenseDateTime: '2025-10-24',
  issuingAuthority: 'Stadt Kassel',
  referenceNumber: 'REF-2025-991',
  offenseDescription: 'Parkverstoß',
  amountCents: 1750,
} as const;
