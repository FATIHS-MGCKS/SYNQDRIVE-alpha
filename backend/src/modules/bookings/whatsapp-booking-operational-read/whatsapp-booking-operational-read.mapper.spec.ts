import { mapBookingDetailToWhatsAppOperationalRead } from './whatsapp-booking-operational-read.mapper';
import type { BookingDetailDto } from '../booking-detail.types';

describe('mapBookingDetailToWhatsAppOperationalRead — field parity', () => {
  const baseDetail: BookingDetailDto = {
    core: {
      bookingId: 'b1',
      bookingNumber: 'BN-42',
      organizationId: 'org-x',
      status: 'CONFIRMED',
      statusEnum: 'CONFIRMED',
      startDate: '2026-04-01',
      endDate: '2026-04-07',
      pickupStationName: 'Berlin',
      returnStationName: 'Hamburg',
    },
    stations: {
      pickup: {
        stationId: 'st-p',
        name: 'Berlin Central',
        address: 'Str. 1',
        handoverInstructions: 'Ring bell',
        returnInstructions: null,
      },
      return: {
        stationId: 'st-r',
        name: 'Hamburg Port',
        address: null,
        handoverInstructions: null,
        returnInstructions: 'Leave keys in box',
      },
      actualPickup: null,
      actualReturn: null,
      isOneWayRental: true,
      hasPickupDeviation: false,
      hasReturnDeviation: false,
    },
    customer: {
      customerId: 'c1',
      fullName: 'Ada Lovelace',
      phone: '+491701',
      email: 'ada@example.com',
      openInvoiceCount: 2,
      openFineCount: 0,
      noShowCount: 0,
      customerStatus: null,
      identityStatus: null,
      licenseStatus: null,
      riskLevel: null,
    },
    vehicle: { vehicleId: 'v1', displayName: 'ID.3' },
    finance: {
      depositStatus: null,
      paymentStatus: 'PARTIAL',
      depositAmountCents: null,
      openAmountCents: 5000,
      basePriceCents: null,
      extrasPriceCents: null,
      discountAmountCents: null,
      taxRate: null,
      taxAmountCents: null,
      grossAmountCents: null,
      paidAmountCents: null,
      invoiceStatus: null,
      finalInvoiceStatus: null,
      additionalChargesCents: null,
      refundAmountCents: null,
      retainedDepositAmountCents: null,
      computed: true,
    },
    documents: {
      bundleStatus: 'INCOMPLETE',
      legalMissing: ['LICENSE'],
      warnings: ['expiring'],
      slots: [
        { documentType: 'CONTRACT', status: 'missing' },
        { documentType: 'ID', status: 'ok' },
      ],
      completenessStatus: null,
      legalTermsAttached: false,
      legalWithdrawalAttached: false,
      legalPrivacyAttached: false,
    },
    tasks: {
      openCount: 3,
      overdueCount: 1,
      completedCount: 0,
      nextDueAt: null,
      items: Array.from({ length: 7 }, (_, i) => ({
        id: `t${i}`,
        title: `Task ${i}`,
        status: 'OPEN',
        priority: 'NORMAL',
        dueAt: null,
      })),
    },
    handover: {
      pickup: { completedAt: '2026-04-01T10:00:00.000Z' },
      return: null,
    },
  } as BookingDetailDto;

  it('maps fields used by WhatsApp consumers and omits unused customer PII', () => {
    const read = mapBookingDetailToWhatsAppOperationalRead(baseDetail);

    expect(read.core.bookingNumber).toBe('BN-42');
    expect(read.finance.depositStatus).toBeNull();
    expect(read.finance.paymentStatus).toBe('PARTIAL');
    expect(read.customer.phone).toBe('+491701');
    expect(read.customer).not.toHaveProperty('email');
    expect(read.stations.pickup?.handoverInstructions).toBe('Ring bell');
    expect(read.stations.return?.returnInstructions).toBe('Leave keys in box');
    expect(read.documents.legalMissing).toEqual(['LICENSE']);
    expect(read.handover.pickup?.completedAt).toBe('2026-04-01T10:00:00.000Z');
    expect(read.handover.return).toBeNull();
    expect(read.tasks.items).toHaveLength(5);
    expect(read.tasks.items[0].id).toBe('t0');
  });

  it('preserves nullable vehicle and stations', () => {
    const read = mapBookingDetailToWhatsAppOperationalRead({
      ...baseDetail,
      vehicle: {
        ...baseDetail.vehicle,
        vehicleId: '',
      },
      stations: {
        ...baseDetail.stations,
        pickup: null,
        return: null,
      },
    });

    expect(read.vehicle).toBeNull();
    expect(read.stations.pickup).toBeNull();
    expect(read.stations.return).toBeNull();
  });
});