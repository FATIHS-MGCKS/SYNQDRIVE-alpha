import {
  buildOperatorBookingContext,
  mapOperatorCustomerSearchRow,
} from './operator-data.mapper';
import type { BookingDetailDto } from '@modules/bookings/booking-detail.types';

describe('operator-data.mapper', () => {
  const detail = {
    core: {
      bookingId: 'booking-1',
      bookingNumber: 'B-100',
      status: 'CONFIRMED',
      statusEnum: 'CONFIRMED',
      startDate: '2026-07-25T08:00:00.000Z',
      endDate: '2026-07-28T18:00:00.000Z',
      pickupStationId: 's1',
      returnStationId: 's2',
      kmIncluded: 500,
    },
    customer: {
      customerId: 'customer-1',
      fullName: 'Max Mustermann',
      email: 'max@example.com',
      phone: '+491701234567',
      identityStatus: 'VERIFIED',
      licenseStatus: 'VERIFIED',
      riskLevel: 'HIGH',
      openInvoiceCount: 3,
      openFineCount: 1,
      noShowCount: 2,
      customerStatus: 'ACTIVE',
    },
    vehicle: {
      vehicleId: 'vehicle-1',
      displayName: 'VW Golf',
      licensePlate: 'M-AB 123',
      odometerKm: 12000,
      fuelPercent: 80,
      evSoc: null,
    },
    stations: {
      pickup: { stationId: 's1', name: 'Berlin', handoverInstructions: null },
      return: { stationId: 's2', name: 'Munich', returnInstructions: null },
    },
    handover: { pickup: null, return: null },
    health: { rentalBlocked: false, blockingReasons: [] },
    documents: {
      slots: [
        {
          documentType: 'RENTAL_CONTRACT',
          status: 'generated',
          available: true,
          documentId: 'doc-1',
          required: true,
          generatedAt: null,
          signedAt: null,
          missingReason: null,
        },
      ],
    },
  } as unknown as BookingDetailDto;

  it('masks customer display name for worker context', () => {
    const ctx = buildOperatorBookingContext('PICKUP', detail, {
      canViewFullDocuments: false,
      customerDocuments: [],
      canStartPickup: true,
      canStartReturn: false,
    });
    expect(ctx.customer.displayName).toBe('Max M.');
    expect(ctx.customer.emailMasked).toBeNull();
    expect(ctx.customer.phoneMasked).toBeNull();
    expect(ctx.bookingDocumentSlots[0].documentId).toBeNull();
    expect((ctx as { customer: { riskLevel?: string } }).customer.riskLevel).toBeUndefined();
  });

  it('exposes document id only for authorized viewers', () => {
    const ctx = buildOperatorBookingContext('DOCUMENT_CHECK', detail, {
      canViewFullDocuments: true,
      customerDocuments: [],
      canStartPickup: true,
      canStartReturn: false,
    });
    expect(ctx.bookingDocumentSlots[0].documentId).toBe('doc-1');
    expect(ctx.customer.displayName).toBe('Max Mustermann');
  });

  it('minimizes customer search rows', () => {
    const row = mapOperatorCustomerSearchRow({
      id: 'customer-1',
      firstName: 'Max',
      lastName: 'Mustermann',
      email: 'max@example.com',
      phone: '+491701234567',
      identityStatus: 'VERIFIED',
      licenseStatus: 'VERIFIED',
      address: 'Secret Street 1',
      dateOfBirth: '1990-01-01',
      notes: 'private',
    });
    expect(row.displayName).toBe('Max M.');
    expect(row.emailMasked).toContain('***');
    expect(row).not.toHaveProperty('address');
    expect(row).not.toHaveProperty('notes');
  });
});
