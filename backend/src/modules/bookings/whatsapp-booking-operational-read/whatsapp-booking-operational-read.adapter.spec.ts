import { WhatsAppBookingOperationalReadAdapter } from './whatsapp-booking-operational-read.adapter';
import type { BookingsService } from '../bookings.service';

describe('WhatsAppBookingOperationalReadAdapter', () => {
  const findDetail = jest.fn();
  const bookingsService = { findDetail } as unknown as BookingsService;
  const adapter = new WhatsAppBookingOperationalReadAdapter(bookingsService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates findDetail with organizationId and bookingId', async () => {
    findDetail.mockResolvedValue({
      core: {
        bookingId: 'b1',
        bookingNumber: 'BN-1',
        organizationId: 'org-a',
        status: 'CONFIRMED',
        statusEnum: 'CONFIRMED',
        startDate: '2026-01-01',
        endDate: '2026-01-10',
        pickupStationName: 'S1',
        returnStationName: 'S2',
      },
      stations: { pickup: null, return: null, actualPickup: null, actualReturn: null, isOneWayRental: false, hasPickupDeviation: false, hasReturnDeviation: false },
      customer: { customerId: 'c1', fullName: 'Test', phone: '+491', openInvoiceCount: 0, openFineCount: 0, noShowCount: 0, email: null, customerStatus: null, identityStatus: null, licenseStatus: null, riskLevel: null },
      vehicle: { vehicleId: 'v1', displayName: 'VW Golf' },
      finance: { depositStatus: null, paymentStatus: 'OPEN', depositAmountCents: null, openAmountCents: 100, basePriceCents: null, extrasPriceCents: null, discountAmountCents: null, taxRate: null, taxAmountCents: null, grossAmountCents: null, paidAmountCents: null, invoiceStatus: null, finalInvoiceStatus: null, additionalChargesCents: null, refundAmountCents: null, retainedDepositAmountCents: null, computed: true },
      documents: { bundleStatus: 'OK', legalMissing: [], warnings: [], slots: [], completenessStatus: null, legalTermsAttached: false, legalWithdrawalAttached: false, legalPrivacyAttached: false },
      tasks: { openCount: 0, overdueCount: 0, completedCount: 0, nextDueAt: null, items: [] },
      handover: { pickup: null, return: null },
    } as never);

    const read = await adapter.getOperationalRead('org-a', 'b1');

    expect(findDetail).toHaveBeenCalledWith('org-a', 'b1');
    expect(read?.core.bookingNumber).toBe('BN-1');
    expect(read?.customer.phone).toBe('+491');
    expect(read?.vehicle?.vehicleId).toBe('v1');
  });

  it('returns null when findDetail returns null', async () => {
    findDetail.mockResolvedValue(null);
    await expect(adapter.getOperationalRead('org-a', 'foreign')).resolves.toBeNull();
  });
});