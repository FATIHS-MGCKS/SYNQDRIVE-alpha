import { ConflictException } from '@nestjs/common';
import { StationBookingRuleOutcome, StationBookingRulesBookingType } from '@shared/stations/station-booking-rules.contract';
import type { StationBookingRulesResult } from '@shared/stations/station-booking-rules.contract';
import { BookingsService } from './bookings.service';

const ORG = 'org-booking-rules';
const VEHICLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CUSTOMER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PICKUP_STATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RETURN_STATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOOKING_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const USER_ID = 'user-booking-rules';

function rulesResult(
  overrides: Partial<StationBookingRulesResult> = {},
): StationBookingRulesResult {
  return {
    version: 5,
    evaluatedAt: '2026-07-18T10:00:00.000Z',
    bookingType: StationBookingRulesBookingType.STANDARD,
    derivedIsOneWay: false,
    pickup: {
      side: 'pickup',
      stationId: PICKUP_STATION_ID,
      outcome: StationBookingRuleOutcome.ALLOWED,
      reasons: [],
      evaluations: [],
      effectiveRule: null,
      timezone: 'Europe/Berlin',
      evaluatedInstant: {
        instantUtc: '2026-07-18T08:00:00.000Z',
        localDate: '2026-07-18',
        localTime: '10:00',
        timezone: 'Europe/Berlin',
      },
      adminOverrideApplied: false,
      manualOverrideApplied: false,
    },
    return: {
      side: 'return',
      stationId: RETURN_STATION_ID,
      outcome: StationBookingRuleOutcome.ALLOWED,
      reasons: [],
      evaluations: [],
      effectiveRule: null,
      timezone: 'Europe/Berlin',
      evaluatedInstant: {
        instantUtc: '2026-07-20T16:00:00.000Z',
        localDate: '2026-07-20',
        localTime: '18:00',
        timezone: 'Europe/Berlin',
      },
      adminOverrideApplied: false,
      manualOverrideApplied: false,
    },
    manualOverrideRequired: false,
    manualOverrideApplied: false,
    manualOverrideAudit: null,
    ...overrides,
  };
}

describe('BookingsService station booking rules wiring', () => {
  const tx = {
    booking: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const prisma = {
    booking: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
    },
    station: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  const rentalHealthService = {
    isRentalBlocked: jest.fn().mockResolvedValue({
      blocked: false,
      healthGateStatus: 'OK',
      healthGateWarning: null,
      manualReviewRequired: false,
      reasons: [],
    }),
  };

  const customerEligibilityService = {
    evaluateForBooking: jest.fn().mockResolvedValue({
      canCreatePendingBooking: true,
      canConfirmBooking: true,
      canStartRental: true,
      stages: {
        createBooking: { blockingReasons: [] },
        confirmBooking: { blockingReasons: [] },
        startPickup: { blockingReasons: [] },
      },
    }),
  };

  const pricingQuoteService = {
    findConsumedBookingId: jest.fn().mockResolvedValue(null),
    consumeForBooking: jest.fn().mockResolvedValue({
      simulation: { totalPriceCents: 10000 },
      pricingInput: {},
    }),
    markConsumed: jest.fn().mockResolvedValue(undefined),
  };

  const pricingService = {
    extractPricingInputFromBookingData: jest.fn().mockReturnValue(undefined),
    legacyBookingFieldsFromSimulation: jest.fn().mockReturnValue({ totalPriceCents: 10000 }),
    createBookingPriceSnapshotFromSimulation: jest.fn().mockResolvedValue(undefined),
    simulateBookingPrice: jest.fn(),
    createBookingPriceSnapshot: jest.fn(),
  };

  const stationValidation = {
    validateBookingStations: jest.fn().mockResolvedValue({
      pickupStationId: PICKUP_STATION_ID,
      returnStationId: RETURN_STATION_ID,
      isOneWayRental: false,
    }),
    computeIsOneWayRental: jest.fn().mockReturnValue(false),
  };

  const stationBookingRules = {
    evaluateRequest: jest.fn(),
    linkOverrideAuditToBooking: jest.fn().mockResolvedValue(undefined),
  };

  const service = new BookingsService(
    prisma as never,
    { findByBookingId: jest.fn() } as never,
    { enqueueForBooking: jest.fn() } as never,
    { bootstrapBookingInvoice: jest.fn().mockResolvedValue(undefined) } as never,
    rentalHealthService as never,
    { generateInitialBundle: jest.fn().mockResolvedValue(undefined) } as never,
    { voidAllForBooking: jest.fn() } as never,
    { maybeAutoSendBookingDocuments: jest.fn() } as never,
    { ensureBookingLifecycleTasks: jest.fn() } as never,
    { onBookingVehicleChanged: jest.fn() } as never,
    customerEligibilityService as never,
    pricingService as never,
    pricingQuoteService as never,
    stationValidation as never,
    stationBookingRules as never,
    {} as never,
    { invalidate: jest.fn() } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue({ homeStationId: PICKUP_STATION_ID });
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({ id: PICKUP_STATION_ID });
    (tx.booking.create as jest.Mock).mockResolvedValue({
      id: BOOKING_ID,
      organizationId: ORG,
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      pickupStationId: PICKUP_STATION_ID,
      returnStationId: RETURN_STATION_ID,
      startDate: new Date('2026-07-18T08:00:00.000Z'),
      endDate: new Date('2026-07-20T16:00:00.000Z'),
      status: 'PENDING',
      totalPriceCents: 10000,
      dailyRateCents: 5000,
      currency: 'eur',
      kmIncluded: 500,
    });
    jest
      .spyOn(service as never as { assertNoVehicleOverlap: () => Promise<void> }, 'assertNoVehicleOverlap')
      .mockResolvedValue(undefined);
  });

  const baseCreateInput = {
    vehicleId: VEHICLE_ID,
    customerId: CUSTOMER_ID,
    startDate: new Date('2026-07-18T08:00:00.000Z'),
    endDate: new Date('2026-07-20T16:00:00.000Z'),
    pickupStationId: PICKUP_STATION_ID,
    returnStationId: RETURN_STATION_ID,
    quoteId: 'quote-1',
    status: 'PENDING',
  };

  it('blocks create when station rules return BLOCKED', async () => {
    stationBookingRules.evaluateRequest.mockResolvedValue(
      rulesResult({
        pickup: {
          ...rulesResult().pickup,
          outcome: StationBookingRuleOutcome.BLOCKED,
        },
      }),
    );

    await expect(service.create(ORG, baseCreateInput as never, { userId: USER_ID })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STATION_BOOKING_RULES_BLOCKED' }),
    });
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('blocks create when manual confirmation is required without override', async () => {
    stationBookingRules.evaluateRequest.mockResolvedValue(
      rulesResult({
        manualOverrideRequired: true,
        return: {
          ...rulesResult().return,
          outcome: StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
        },
      }),
    );

    await expect(service.create(ORG, baseCreateInput as never, { userId: USER_ID })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STATION_BOOKING_RULES_MANUAL_OVERRIDE_REQUIRED' }),
    });
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('persists WARNING snapshot and returns stationBookingRules on create', async () => {
    const warningResult = rulesResult({
      pickup: {
        ...rulesResult().pickup,
        outcome: StationBookingRuleOutcome.WARNING,
      },
    });
    stationBookingRules.evaluateRequest.mockResolvedValue(warningResult);

    const created = await service.create(ORG, baseCreateInput as never, { userId: USER_ID });

    expect(tx.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stationBookingRulesSnapshot: warningResult,
        }),
      }),
    );
    expect((created as { stationBookingRules?: StationBookingRulesResult }).stationBookingRules).toEqual(
      warningResult,
    );
  });

  it('links manual override audit after successful create', async () => {
    const overrideResult = rulesResult({
      manualOverrideApplied: true,
      manualOverrideAudit: {
        id: 'override-1',
        organizationId: ORG,
        referenceType: 'BOOKING_RULES',
        reference: { type: 'BOOKING_RULES', bookingId: null, transferId: null },
        scopeFingerprint: 'fp',
        scopeSnapshot: { organizationId: ORG },
        permission: 'stations.override_rules',
        reason: 'Approved by manager for after-hours return',
        actorUserId: USER_ID,
        grantedAt: '2026-07-18T10:00:00.000Z',
        expiresAt: '2026-07-18T10:15:00.000Z',
        originalRuleResults: [],
      },
    });
    stationBookingRules.evaluateRequest.mockResolvedValue(overrideResult);

    await service.create(
      ORG,
      {
        ...baseCreateInput,
        stationBookingRules: {
          manualOverride: { reason: 'Approved by manager for after-hours return' },
        },
      } as never,
      { userId: USER_ID },
    );

    expect(stationBookingRules.linkOverrideAuditToBooking).toHaveBeenCalledWith(
      ORG,
      'override-1',
      BOOKING_ID,
    );
  });

  it('re-evaluates on update when dates change and blocks persistence', async () => {
    const existing = {
      id: BOOKING_ID,
      organizationId: ORG,
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      pickupStationId: PICKUP_STATION_ID,
      returnStationId: RETURN_STATION_ID,
      startDate: new Date('2026-07-18T08:00:00.000Z'),
      endDate: new Date('2026-07-20T16:00:00.000Z'),
      status: 'CONFIRMED',
      pickupAddressOverride: null,
      returnAddressOverride: null,
      isOneWayRental: false,
      stationTransferFeeCents: null,
    };
    (prisma.booking.findFirstOrThrow as jest.Mock).mockResolvedValue(existing);
    stationBookingRules.evaluateRequest.mockResolvedValue(
      rulesResult({
        pickup: {
          ...rulesResult().pickup,
          outcome: StationBookingRuleOutcome.BLOCKED,
        },
      }),
    );

    await expect(
      service.update(
        ORG,
        BOOKING_ID,
        { endDate: new Date('2026-07-21T16:00:00.000Z') },
        { userId: USER_ID },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it('derives one-way server-side and passes STANDARD booking type to rules', async () => {
    stationValidation.validateBookingStations.mockResolvedValue({
      pickupStationId: PICKUP_STATION_ID,
      returnStationId: RETURN_STATION_ID,
      isOneWayRental: false,
    });
    stationValidation.computeIsOneWayRental.mockReturnValue(false);
    stationBookingRules.evaluateRequest.mockResolvedValue(rulesResult());

    await service.create(
      ORG,
      {
        ...baseCreateInput,
        isOneWayRental: true,
      } as never,
      { userId: USER_ID },
    );

    expect(stationBookingRules.evaluateRequest).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({
        bookingType: StationBookingRulesBookingType.STANDARD,
        pickupStationId: PICKUP_STATION_ID,
        returnStationId: RETURN_STATION_ID,
      }),
      undefined,
      { id: USER_ID },
    );
  });

  it('skips station rules when address override replaces station selection', async () => {
    await service.create(
      ORG,
      {
        ...baseCreateInput,
        pickupStationId: PICKUP_STATION_ID,
        returnStationId: RETURN_STATION_ID,
        pickupAddressOverride: 'Custom pickup address',
      } as never,
      { userId: USER_ID },
    );

    expect(stationBookingRules.evaluateRequest).not.toHaveBeenCalled();
    expect(tx.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stationBookingRulesSnapshot: undefined,
        }),
      }),
    );
  });
});
