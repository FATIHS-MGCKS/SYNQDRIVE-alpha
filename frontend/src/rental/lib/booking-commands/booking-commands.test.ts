import { describe, expect, it } from 'vitest';
import type { BookingDetailDto } from '../../lib/api';
import {
  bookingEditBaselineFromDetail,
  bookingEditFormFromBaseline,
  buildBookingUpdateCommand,
  formatBookingMutationError,
  validateBookingEditForm,
} from './index';

function detailFixture(overrides?: Partial<BookingDetailDto['core']>): BookingDetailDto {
  return {
    core: {
      bookingId: 'b1',
      bookingNumber: 'BK-001',
      organizationId: 'org-1',
      status: 'Confirmed',
      statusEnum: 'CONFIRMED',
      startDate: '2026-07-10T08:00:00.000Z',
      endDate: '2026-07-12T18:00:00.000Z',
      pickupStationId: 'sta-pickup',
      returnStationId: 'sta-pickup',
      pickupStationName: 'Hamburg',
      returnStationName: 'Hamburg',
      notes: 'Initial note',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      cancelledAt: null,
      completedAt: null,
      kmIncluded: 300,
      kmDriven: null,
      insuranceOptions: ['Vollkasko'],
      extras: [],
      currency: 'EUR',
      isOneWayRental: false,
      pickupAddressOverride: null,
      returnAddressOverride: null,
      ...overrides,
    },
    stations: { pickup: null, return: null, actualPickup: null, actualReturn: null, isOneWayRental: false, hasPickupDeviation: false, hasReturnDeviation: false },
    customer: {
      customerId: 'cust-1',
      fullName: 'Max Mustermann',
      email: null,
      phone: null,
      customerStatus: null,
      identityStatus: null,
      licenseStatus: null,
      riskLevel: null,
      openInvoiceCount: 0,
      openFineCount: 0,
      noShowCount: 0,
    },
    vehicle: {
      vehicleId: 'veh-1',
      displayName: 'BMW 320',
      licensePlate: 'HH-AB-123',
      vin: null,
      make: 'BMW',
      model: '320',
      year: 2024,
      vehicleStatus: 'AVAILABLE',
      rentalBlocked: false,
      blockingReasons: [],
      odometerKm: null,
      fuelPercent: null,
      evSoc: null,
    },
    finance: {
      basePriceCents: 10000,
      extrasPriceCents: 0,
      discountAmountCents: 0,
      depositAmountCents: 50000,
      depositStatus: null,
      taxRate: null,
      taxAmountCents: null,
      grossAmountCents: 10000,
      paidAmountCents: 0,
      openAmountCents: 10000,
      paymentStatus: 'open',
      invoiceStatus: 'missing',
      finalInvoiceStatus: null,
    },
    handover: { pickup: null, return: null },
    health: { rentalBlocked: false, blockingReasons: [], modules: {} as never },
    documents: { legalTermsAttached: true, legalWithdrawalAttached: true, bundle: null },
    eligibility: null,
    tasks: [],
    timeline: [],
    misuse: [],
    drivingAnalysis: null,
  } as BookingDetailDto;
}

describe('booking-edit validation', () => {
  it('rejects end before start', () => {
    const result = validateBookingEditForm({
      startLocal: '2026-07-12T10:00',
      endLocal: '2026-07-10T10:00',
      notes: '',
      kmIncluded: '',
      pickupStationId: 'sta-1',
      returnStationId: 'sta-1',
      sameReturnStation: true,
    });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors?.endLocal).toBeTruthy();
  });
});

describe('buildBookingUpdateCommand', () => {
  it('builds diff-only patch for detail edit path', () => {
    const detail = detailFixture();
    const baseline = bookingEditBaselineFromDetail(detail);
    const form = bookingEditFormFromBaseline(baseline);
    form.notes = 'Updated note';

    const command = buildBookingUpdateCommand(baseline, form);
    expect(command.ok).toBe(true);
    if (!command.ok) return;
    expect(command.patch).toEqual({ notes: 'Updated note' });
    expect(command.changedFields).toEqual(['notes']);
  });

  it('includes vehicle connect only when allowed', () => {
    const detail = detailFixture();
    const baseline = bookingEditBaselineFromDetail(detail);
    const form = bookingEditFormFromBaseline(baseline);
    form.vehicleId = 'veh-2';

    const blocked = buildBookingUpdateCommand(baseline, form);
    expect(blocked.ok).toBe(false);

    const allowed = buildBookingUpdateCommand(baseline, form, { allowVehicleChange: true });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(allowed.patch.vehicle).toEqual({ connect: { id: 'veh-2' } });
  });

  it('never includes financial or status fields', () => {
    const detail = detailFixture();
    const baseline = bookingEditBaselineFromDetail(detail);
    const form = bookingEditFormFromBaseline(baseline);
    form.notes = 'x';
    form.paymentIntentLabel = 'Paid';

    const command = buildBookingUpdateCommand(baseline, form);
    expect(command.ok).toBe(true);
    if (!command.ok) return;
    expect(command.patch).not.toHaveProperty('status');
    expect(command.patch).not.toHaveProperty('totalPriceCents');
    expect(command.patch).not.toHaveProperty('paymentIntentLabel');
  });
});

describe('formatBookingMutationError', () => {
  it('maps version conflict messages', () => {
    const view = formatBookingMutationError(new Error('[CONFLICT] Booking was changed concurrently'));
    expect(view.kind).toBe('version_conflict');
  });

  it('maps permission denied messages', () => {
    const view = formatBookingMutationError(new Error('403 Forbidden — permission denied'));
    expect(view.kind).toBe('permission_denied');
  });

  it('maps overlap conflicts', () => {
    const view = formatBookingMutationError(new Error('VEHICLE_BOOKING_OVERLAP'));
    expect(view.kind).toBe('overlap');
  });
});
