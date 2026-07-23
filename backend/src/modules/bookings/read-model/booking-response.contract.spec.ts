import {
  BOOKING_DETAIL_FORBIDDEN_FIELDS,
  BOOKING_LIST_FORBIDDEN_FIELDS,
  BOOKING_PAYMENT_FORBIDDEN_FIELDS,
  collectForbiddenFields,
  estimateJsonBytes,
  mapBookingCalendarItem,
  mapBookingListItem,
  mapHandoverProtocolToSummary,
  toLegacyListRowCompat,
} from './booking-response.mapper';
import type { HandoverProtocolDto } from '../handover.types';
import { BookingDetailProjectionService } from './booking-detail-projection.service';
import { resolveBookingReadProjectionContext } from './booking-read-projection.context';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import type { BookingPaymentCardSectionDto } from '../dto/response/booking-payment-card-section.dto';

const FULL_HANDOVER_PROTOCOL: HandoverProtocolDto = {
  id: 'proto-1',
  bookingId: 'bk-1',
  vehicleId: 'veh-1',
  kind: 'PICKUP',
  performedAt: '2026-07-23T10:00:00.000Z',
  performedByUserId: 'user-1',
  performedByName: 'Operator',
  odometerKm: 12000,
  fuelPercent: 80,
  fuelFull: false,
  exteriorClean: true,
  interiorClean: true,
  tiresSeasonOk: true,
  warningLightsOn: false,
  warningLightsNotes: null,
  notes: 'internal note',
  customerSignatureName: 'Customer',
  staffSignatureName: 'Staff',
  customerSignature: {
    signaturePresent: true,
    signedAt: '2026-07-23T10:00:00.000Z',
    signatureReferenceId: 'sig-1',
  },
  staffSignature: {
    signaturePresent: true,
    signedAt: '2026-07-23T10:00:00.000Z',
    signatureReferenceId: 'sig-2',
  },
  protocolCompleted: true,
  documentsAcknowledged: true,
  damageIds: ['dmg-1', 'dmg-2'],
  createdAt: '2026-07-23T10:00:00.000Z',
  updatedAt: '2026-07-23T10:00:00.000Z',
};

describe('booking response contract', () => {
  const projection = new BookingDetailProjectionService();

  it('list projection excludes forbidden sensitive fields', () => {
    const listItem = mapBookingListItem({
      booking: {
        id: 'bk-1',
        vehicleId: 'veh-1',
        customerId: 'cust-1',
        pickupStationId: 'st-1',
        returnStationId: 'st-2',
        startDate: new Date('2026-07-24T08:00:00.000Z'),
        endDate: new Date('2026-07-26T18:00:00.000Z'),
        status: 'CONFIRMED',
        totalPriceCents: 25000,
        currency: 'EUR',
        kmIncluded: 500,
        kmDriven: 0,
        isOneWayRental: false,
        actualPickupStationId: null,
        actualReturnStationId: null,
        customer: { firstName: 'Max', lastName: 'Muster' },
        vehicle: {
          vehicleName: 'Golf',
          make: 'VW',
          model: 'Golf',
          licensePlate: 'B-AB 123',
        },
      },
      stationMap: new Map([
        ['st-1', 'Berlin'],
        ['st-2', 'Munich'],
      ]),
      pickup: FULL_HANDOVER_PROTOCOL,
      returnProtocol: null,
    });

    const payload = toLegacyListRowCompat(listItem);
    const forbidden = collectForbiddenFields(payload, BOOKING_LIST_FORBIDDEN_FIELDS);
    expect(forbidden).toEqual([]);
    expect(JSON.stringify(payload)).not.toMatch(/customerSignatureDataUrl|objectKey|stripePaymentIntentId/i);
  });

  it('list payload is measurably smaller than full handover protocol embed', () => {
    const legacyHeavyProtocol = FULL_HANDOVER_PROTOCOL;
    const leanProtocol = toLegacyListRowCompat(
      mapBookingListItem({
        booking: {
          id: 'bk-1',
          vehicleId: 'veh-1',
          customerId: 'cust-1',
          pickupStationId: null,
          returnStationId: null,
          startDate: new Date(),
          endDate: new Date(),
          status: 'CONFIRMED',
          totalPriceCents: 1000,
          currency: 'EUR',
          kmIncluded: 0,
          kmDriven: 0,
          isOneWayRental: false,
          actualPickupStationId: null,
          actualReturnStationId: null,
          customer: { firstName: 'A', lastName: 'B' },
          vehicle: { make: 'VW', model: 'Golf', licensePlate: 'X' },
        },
        stationMap: new Map(),
        pickup: FULL_HANDOVER_PROTOCOL,
        returnProtocol: null,
      }),
    ).pickupProtocol;

    expect(estimateJsonBytes(leanProtocol)).toBeLessThan(
      estimateJsonBytes(legacyHeavyProtocol),
    );
    expect(mapHandoverProtocolToSummary(FULL_HANDOVER_PROTOCOL)?.damageCount).toBe(2);
  });

  it('detail projection redacts finance and eligibility without permissions', () => {
    const ctx = resolveBookingReadProjectionContext({
      actor: { id: 'u-1', membershipRole: 'EMPLOYEE' },
      permissions: normalizeMembershipPermissions({ bookings: { read: true, write: false } }),
    });

    const redacted = projection.applyDetailProjection(
      {
        core: {
          bookingId: 'bk-1',
          bookingNumber: 'BK-000001',
          status: 'Active',
          statusEnum: 'ACTIVE',
          startDate: '2026-07-24T08:00:00.000Z',
          endDate: '2026-07-26T18:00:00.000Z',
          pickupStationId: null,
          returnStationId: null,
          pickupStationName: null,
          returnStationName: null,
          notes: null,
          createdAt: '2026-07-23T08:00:00.000Z',
          updatedAt: '2026-07-23T08:00:00.000Z',
          cancelledAt: null,
          completedAt: null,
          kmIncluded: 500,
          kmDriven: 0,
          insuranceOptions: [],
          extras: [],
          currency: 'EUR',
          isOneWayRental: false,
          pickupAddressOverride: null,
          returnAddressOverride: null,
        },
        stations: {
          pickup: null,
          return: null,
          actualPickup: null,
          actualReturn: null,
          isOneWayRental: false,
          hasPickupDeviation: false,
          hasReturnDeviation: false,
        },
        customer: {
          customerId: 'cust-1',
          fullName: 'Max Muster',
          email: 'max@example.com',
          phone: '+491234',
          customerStatus: 'ACTIVE',
          identityStatus: 'VERIFIED',
          licenseStatus: 'VERIFIED',
          riskLevel: 'LOW',
          openInvoiceCount: 1,
          openFineCount: 0,
          noShowCount: 0,
        },
        vehicle: {
          vehicleId: 'veh-1',
          displayName: 'Golf',
          licensePlate: 'B-AB 123',
          vin: null,
          make: 'VW',
          model: 'Golf',
          year: 2024,
          vehicleStatus: 'AVAILABLE',
          rentalBlocked: false,
          blockingReasons: [],
          odometerKm: 1000,
          fuelPercent: null,
          evSoc: null,
        },
        finance: {
          basePriceCents: 10000,
          extrasPriceCents: 0,
          discountAmountCents: null,
          depositAmountCents: 50000,
          depositStatus: 'HELD',
          taxRate: null,
          taxAmountCents: null,
          grossAmountCents: 10000,
          paidAmountCents: 0,
          openAmountCents: 10000,
          paymentStatus: 'OPEN',
          invoiceStatus: null,
          finalInvoiceStatus: null,
          additionalChargesCents: null,
          refundAmountCents: null,
          retainedDepositAmountCents: null,
          computed: true,
        },
        documents: {
          bundleStatus: null,
          completenessStatus: null,
          legalTermsAttached: false,
          legalWithdrawalAttached: false,
          legalPrivacyAttached: false,
          legalMissing: [],
          warnings: [],
          slots: [],
        },
        handover: { pickup: null, return: null },
        tasks: {
          openCount: 0,
          overdueCount: 0,
          completedCount: 0,
          nextDueAt: null,
          items: [],
        },
        health: {
          rentalBlocked: false,
          blockingReasons: [],
          overallState: null,
          criticalWarnings: [],
          warningWarnings: [],
        },
        usage: {
          drivingStressScore: null,
          stressLevel: null,
          drivingEventsCount: null,
          abuseDetectionCount: null,
          misuseCaseCount: 0,
          hasAnalysis: false,
        },
        eligibility: {
          canCreatePendingBooking: true,
          canConfirmBooking: true,
          canStartRental: true,
          blockingReasons: [],
          warnings: [],
          requiredActions: [],
        },
        rentalEligibility: {
          status: 'ALLOWED',
          allowed: true,
          stage: 'PREVIEW',
          blockingReasons: [],
          warnings: [],
          missingFields: [],
          engineVersion: 'v1',
          evaluatedAt: '2026-07-23T08:00:00.000Z',
          rentalRulesStatus: null,
        },
        audit: { items: [{ id: 'a1', action: 'CREATE', description: 'created', createdAt: '2026-07-23T08:00:00.000Z', actorName: null }] },
        activity: [],
        payments: null,
      },
      ctx,
    );

    expect(redacted.finance).toBeNull();
    expect(redacted.rentalEligibility).toBeNull();
    expect(redacted.audit.items).toEqual([]);
    expect(redacted.customer?.email).toBeNull();
    const forbidden = collectForbiddenFields(redacted, BOOKING_DETAIL_FORBIDDEN_FIELDS);
    expect(forbidden).toEqual([]);
  });

  it('calendar projection omits finance and list-only fields', () => {
    const listItem = mapBookingListItem({
      booking: {
        id: 'bk-1',
        vehicleId: 'veh-1',
        customerId: 'cust-1',
        pickupStationId: 'st-1',
        returnStationId: 'st-2',
        startDate: new Date('2026-07-24T08:00:00.000Z'),
        endDate: new Date('2026-07-26T18:00:00.000Z'),
        status: 'CONFIRMED',
        totalPriceCents: 25000,
        currency: 'EUR',
        kmIncluded: 500,
        kmDriven: 0,
        isOneWayRental: false,
        actualPickupStationId: null,
        actualReturnStationId: null,
        customer: { firstName: 'Max', lastName: 'Muster' },
        vehicle: {
          vehicleName: 'Golf',
          make: 'VW',
          model: 'Golf',
          licensePlate: 'B-AB 123',
        },
      },
      stationMap: new Map([
        ['st-1', 'Berlin'],
        ['st-2', 'Munich'],
      ]),
      pickup: null,
      returnProtocol: null,
    });

    const calendar = mapBookingCalendarItem(listItem);
    expect(calendar).not.toHaveProperty('totalPriceCents');
    expect(calendar).not.toHaveProperty('currency');
    expect(calendar).not.toHaveProperty('kmIncluded');
    expect(calendar).not.toHaveProperty('status');
    expect(calendar.id).toBe('bk-1');
  });

  it('payment projection strips provider refs without payments-settings.manage', () => {
    const ctx = resolveBookingReadProjectionContext({
      actor: { id: 'u-1', membershipRole: 'EMPLOYEE' },
      permissions: normalizeMembershipPermissions({
        payments: { read: true, write: false },
        'payments-settings': { manage: false },
      }),
    });

    const card: BookingPaymentCardSectionDto = {
      enabled: true,
      summary: { bookingPaymentStatus: 'OPEN', paymentIntent: 'CARD' },
      primaryRequest: {
        id: 'pr-1',
        status: 'OPEN',
        purpose: 'RENTAL',
        amountCents: 10000,
        paidAmountCents: 0,
        openAmountCents: 10000,
        refundedAmountCents: 0,
        currency: 'EUR',
        depositAmountCents: 0,
        recipientEmail: 'a@b.c',
        checkoutUrl: 'https://checkout.example',
        checkoutExpiresAt: null,
        lastSentAt: null,
        paidAt: null,
        failedAt: null,
        cancelledAt: null,
        sendAttemptCount: 0,
        lastEmailErrorMessage: null,
        stripeCheckoutSessionId: 'cs_test',
        stripePaymentIntentId: 'pi_test',
        stripeChargeId: 'ch_test',
        paymentMethodLabel: null,
        refundStatus: 'NONE',
        disputeStatus: 'NONE',
      },
      requests: [],
      invoice: null,
    };

    const redacted = projection.applyDetailProjection(
      {
        core: {
          bookingId: 'bk-1',
          bookingNumber: 'BK-000001',
          status: 'Active',
          statusEnum: 'ACTIVE',
          startDate: '2026-07-24T08:00:00.000Z',
          endDate: '2026-07-26T18:00:00.000Z',
          pickupStationId: null,
          returnStationId: null,
          pickupStationName: null,
          returnStationName: null,
          notes: null,
          createdAt: '2026-07-23T08:00:00.000Z',
          updatedAt: '2026-07-23T08:00:00.000Z',
          cancelledAt: null,
          completedAt: null,
          kmIncluded: 500,
          kmDriven: 0,
          insuranceOptions: [],
          extras: [],
          currency: 'EUR',
          isOneWayRental: false,
          pickupAddressOverride: null,
          returnAddressOverride: null,
        },
        stations: {
          pickup: null,
          return: null,
          actualPickup: null,
          actualReturn: null,
          isOneWayRental: false,
          hasPickupDeviation: false,
          hasReturnDeviation: false,
        },
        customer: null,
        vehicle: {
          vehicleId: 'veh-1',
          displayName: 'Golf',
          licensePlate: 'B-AB 123',
          vin: null,
          make: 'VW',
          model: 'Golf',
          year: 2024,
          vehicleStatus: 'AVAILABLE',
          rentalBlocked: false,
          blockingReasons: [],
          odometerKm: 1000,
          fuelPercent: null,
          evSoc: null,
        },
        finance: null,
        documents: {
          bundleStatus: null,
          completenessStatus: null,
          legalTermsAttached: false,
          legalWithdrawalAttached: false,
          legalPrivacyAttached: false,
          legalMissing: [],
          warnings: [],
          slots: [],
        },
        handover: { pickup: null, return: null },
        tasks: {
          openCount: 0,
          overdueCount: 0,
          completedCount: 0,
          nextDueAt: null,
          items: [],
        },
        health: {
          rentalBlocked: false,
          blockingReasons: [],
          overallState: null,
          criticalWarnings: [],
          warningWarnings: [],
        },
        usage: {
          drivingStressScore: null,
          stressLevel: null,
          drivingEventsCount: null,
          abuseDetectionCount: null,
          misuseCaseCount: 0,
          hasAnalysis: false,
        },
        eligibility: null,
        rentalEligibility: null,
        audit: { items: [] },
        activity: [],
        payments: card,
      },
      ctx,
    );

    const forbidden = collectForbiddenFields(redacted.payments, BOOKING_PAYMENT_FORBIDDEN_FIELDS);
    expect(forbidden).toEqual([]);
    expect((redacted.payments as BookingPaymentCardSectionDto).primaryRequest?.stripePaymentIntentId).toBeNull();
  });
});
