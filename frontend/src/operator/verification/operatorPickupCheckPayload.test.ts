import { describe, expect, it, vi, beforeEach } from 'vitest';

const submitManualPickupCheck = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    customerVerification: {
      submitManualPickupCheck: (...args: unknown[]) => submitManualPickupCheck(...args),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { buildManualPickupCheckPayload } from './operatorPickupCheckPayload';

describe('Operator manual pickup check payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds correct API payload for full checklist', () => {
    const payload = buildManualPickupCheckPayload({
      customerId: 'cust-1',
      bookingId: 'book-1',
      idDocumentSeen: true,
      idNameMatchesBooking: true,
      idDateOfBirthChecked: true,
      minimumAgePassed: true,
      drivingLicenseSeen: true,
      licenseNameMatchesBooking: true,
      licenseClassValid: true,
      licenseNotExpired: true,
      minimumLicenseDurationPassed: true,
      notes: 'Alles geprüft',
    });

    expect(payload).toEqual({
      customerId: 'cust-1',
      bookingId: 'book-1',
      idDocumentSeen: true,
      idNameMatchesBooking: true,
      idDateOfBirthChecked: true,
      minimumAgePassed: true,
      drivingLicenseSeen: true,
      licenseNameMatchesBooking: true,
      licenseClassValid: true,
      licenseNotExpired: true,
      minimumLicenseDurationPassed: true,
      notes: 'Alles geprüft',
    });
  });

  it('omits empty notes', () => {
    const payload = buildManualPickupCheckPayload({
      customerId: 'cust-1',
      bookingId: 'book-1',
      idDocumentSeen: true,
      idNameMatchesBooking: true,
      idDateOfBirthChecked: true,
      minimumAgePassed: true,
      drivingLicenseSeen: false,
      licenseNameMatchesBooking: false,
      licenseClassValid: false,
      licenseNotExpired: false,
      notes: '   ',
    });

    expect(payload.notes).toBeUndefined();
  });
});
