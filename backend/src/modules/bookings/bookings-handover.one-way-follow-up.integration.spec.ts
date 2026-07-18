import { OneWayReturnFollowUpRecommendation } from '@shared/stations/one-way-return-follow-up.contract';
import { BookingsHandoverService } from './bookings-handover.service';
import { StationValidationService } from '@modules/stations/station-validation.service';
import { StationBookingRulesService } from '@modules/stations/station-booking-rules.service';
import { OneWayReturnFollowUpService } from './one-way-return-follow-up.service';
import { StationBookingRuleOutcome } from '@shared/stations/station-booking-rules.contract';

const ORG = 'org-one-way-follow-up';
const BOOKING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VEHICLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STATION_HOME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_PICKUP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STATION_RETURN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const STATION_NEXT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const USER_ID = 'user-follow-up';

function followUpResult(
  recommendation: (typeof OneWayReturnFollowUpRecommendation)[keyof typeof OneWayReturnFollowUpRecommendation],
) {
  return {
    version: 1 as const,
    evaluatedAt: '2026-07-18T12:00:00.000Z',
    bookingId: BOOKING_ID,
    recommendation,
    checks: {
      isOneWayRental: true,
      vehicleHomeDiffersFromReturn: true,
      currentMatchesReturnStation: true,
      repositioningRequired: true,
      hasNextBookingAtOtherStation: false,
      transferSuggestionSensible: recommendation.startsWith('SUGGEST_'),
    },
    context: {
      homeStationId: STATION_HOME,
      currentStationId: STATION_RETURN,
      actualReturnStationId: STATION_RETURN,
      plannedReturnStationId: STATION_RETURN,
      pickupStationId: STATION_PICKUP,
      nextBooking: null,
      activeTransfer: null,
      expectedStationId: null,
      expectedStationSource: null,
    },
    transferSuggestion: null,
    reasons: [],
    noAutomaticTransfer: true as const,
    homeUnchanged: true as const,
    expectedUnchanged: true as const,
  };
}

describe('BookingsHandoverService one-way return follow-up', () => {
  const booking = {
    id: BOOKING_ID,
    vehicleId: VEHICLE_ID,
    customerId: 'cust-1',
    status: 'ACTIVE' as const,
    startDate: new Date('2026-07-18T08:00:00.000Z'),
    endDate: new Date('2026-07-20T18:00:00.000Z'),
    pickupStationId: STATION_PICKUP,
    returnStationId: STATION_RETURN,
    isOneWayRental: true,
  };

  const tx = {
    bookingHandoverProtocol: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    booking: {
      update: jest.fn(),
      count: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    vehicleDamage: {
      updateMany: jest.fn(),
    },
    vehicleComplaint: {
      create: jest.fn(),
    },
  };

  const prisma = {
    booking: {
      findFirst: jest.fn(),
    },
    bookingHandoverProtocol: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };

  const stationValidation = {
    assertHandoverStation: jest.fn().mockResolvedValue(undefined),
  } as unknown as StationValidationService;

  const stationBookingRules = {
    evaluateHandoverRequest: jest.fn().mockResolvedValue({
      version: 1,
      evaluatedAt: '2026-07-18T10:00:00.000Z',
      kind: 'RETURN',
      actualStationId: STATION_RETURN,
      plannedStationId: STATION_RETURN,
      outcome: StationBookingRuleOutcome.ALLOWED,
      reasons: [],
      evaluations: [],
      evaluatedInstant: {
        instantUtc: '2026-07-18T08:00:00.000Z',
        localDate: '2026-07-18',
        localTime: '10:00',
        timezone: 'Europe/Berlin',
      },
      manualOverrideRequired: false,
      manualOverrideApplied: false,
      manualOverrideAudit: null,
      replacesBookingTimeEvaluation: true,
    }),
  } as unknown as StationBookingRulesService;

  const oneWayReturnFollowUp = {
    evaluateAfterReturn: jest.fn(),
  } as unknown as OneWayReturnFollowUpService;

  const service = new BookingsHandoverService(
    prisma as never,
    {
      generatePickupProtocolDocument: jest.fn().mockResolvedValue(undefined),
      generateReturnProtocolDocument: jest.fn().mockResolvedValue(undefined),
      generateFinalInvoiceAndDocument: jest.fn().mockResolvedValue(undefined),
    } as never,
    { scheduleEmit: jest.fn() } as never,
    {
      onPickupHandoverCompleted: jest.fn().mockResolvedValue(undefined),
      onReturnHandoverCompleted: jest.fn().mockResolvedValue(undefined),
    } as never,
    { invalidate: jest.fn() } as never,
    stationValidation,
    stationBookingRules,
    oneWayReturnFollowUp,
  );

  const basePayload = {
    odometerKm: 1100,
    fuelPercent: 80,
    performedByUserId: USER_ID,
    actualStationId: STATION_RETURN,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({ ...booking });
    (prisma.bookingHandoverProtocol.findUnique as jest.Mock).mockResolvedValue(null);
    (tx.bookingHandoverProtocol.create as jest.Mock).mockResolvedValue({
      id: 'proto-follow-up-1',
      bookingId: BOOKING_ID,
      vehicleId: VEHICLE_ID,
      kind: 'RETURN',
      performedAt: new Date('2026-07-18T12:00:00.000Z'),
      performedByUserId: USER_ID,
      performedByName: null,
      odometerKm: 1100,
      fuelPercent: 80,
      fuelFull: false,
      exteriorClean: true,
      interiorClean: true,
      tiresSeasonOk: true,
      warningLightsOn: false,
      warningLightsNotes: null,
      notes: null,
      customerSignatureName: null,
      customerSignatureDataUrl: null,
      staffSignatureName: null,
      staffSignatureDataUrl: null,
      documentsAcknowledged: false,
      damageIds: [],
      actualStationId: STATION_RETURN,
      createdAt: new Date('2026-07-18T12:00:00.000Z'),
      updatedAt: new Date('2026-07-18T12:00:00.000Z'),
    });
    (tx.booking.update as jest.Mock).mockResolvedValue({
      id: BOOKING_ID,
      status: 'COMPLETED',
      vehicleId: VEHICLE_ID,
    });
    (tx.bookingHandoverProtocol.findUnique as jest.Mock).mockResolvedValue({
      odometerKm: 900,
    });
    (tx.booking.count as jest.Mock).mockResolvedValue(0);
    (tx.vehicle.findFirst as jest.Mock).mockResolvedValue({
      status: 'AVAILABLE',
      homeStationId: STATION_HOME,
      currentStationId: STATION_PICKUP,
      expectedStationId: null,
      currentStationSource: null,
    });
    (tx.vehicle.update as jest.Mock).mockResolvedValue({});
  });

  it('evaluates follow-up after successful one-way return and persists snapshot', async () => {
    const evaluation = followUpResult(
      OneWayReturnFollowUpRecommendation.SUGGEST_TRANSFER_HOME,
    );
    (oneWayReturnFollowUp.evaluateAfterReturn as jest.Mock).mockResolvedValue(evaluation);

    const result = await service.createHandover(ORG, BOOKING_ID, 'RETURN', basePayload);

    expect(oneWayReturnFollowUp.evaluateAfterReturn).toHaveBeenCalledWith({
      organizationId: ORG,
      bookingId: BOOKING_ID,
      vehicleId: VEHICLE_ID,
      isOneWayRental: true,
      pickupStationId: STATION_PICKUP,
      plannedReturnStationId: STATION_RETURN,
      actualReturnStationId: STATION_RETURN,
      evaluatedAt: new Date('2026-07-18T12:00:00.000Z'),
    });
    expect(prisma.bookingHandoverProtocol.update).toHaveBeenCalledWith({
      where: { id: 'proto-follow-up-1' },
      data: {
        oneWayReturnFollowUpSnapshot: evaluation,
      },
    });
    expect(result.oneWayReturnFollowUp?.recommendation).toBe(
      OneWayReturnFollowUpRecommendation.SUGGEST_TRANSFER_HOME,
    );
    expect(result.protocol.oneWayReturnFollowUp?.noAutomaticTransfer).toBe(true);
    expect(tx.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          expectedStationId: expect.anything(),
          homeStationId: expect.anything(),
        }),
      }),
    );
  });

  it('returns KEEP_AT_RETURN_STATION when next booking is at return station', async () => {
    const evaluation = followUpResult(
      OneWayReturnFollowUpRecommendation.KEEP_AT_RETURN_STATION,
    );
    (oneWayReturnFollowUp.evaluateAfterReturn as jest.Mock).mockResolvedValue(evaluation);

    const result = await service.createHandover(ORG, BOOKING_ID, 'RETURN', basePayload);

    expect(result.oneWayReturnFollowUp?.recommendation).toBe(
      OneWayReturnFollowUpRecommendation.KEEP_AT_RETURN_STATION,
    );
  });

  it('returns SUGGEST_TRANSFER_TO_NEXT_BOOKING when next booking is elsewhere', async () => {
    const evaluation = {
      ...followUpResult(OneWayReturnFollowUpRecommendation.SUGGEST_TRANSFER_TO_NEXT_BOOKING),
      transferSuggestion: {
        kind: 'NEXT_BOOKING' as const,
        fromStationId: STATION_RETURN,
        toStationId: STATION_NEXT,
        sourceBookingId: 'next-booking',
      },
    };
    (oneWayReturnFollowUp.evaluateAfterReturn as jest.Mock).mockResolvedValue(evaluation);

    const result = await service.createHandover(ORG, BOOKING_ID, 'RETURN', basePayload);

    expect(result.oneWayReturnFollowUp?.transferSuggestion).toEqual({
      kind: 'NEXT_BOOKING',
      fromStationId: STATION_RETURN,
      toStationId: STATION_NEXT,
      sourceBookingId: 'next-booking',
    });
  });

  it('skips follow-up evaluation for pickup handover', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      ...booking,
      status: 'CONFIRMED',
    });

    await service.createHandover(ORG, BOOKING_ID, 'PICKUP', {
      ...basePayload,
      actualStationId: STATION_PICKUP,
    });

    expect(oneWayReturnFollowUp.evaluateAfterReturn).not.toHaveBeenCalled();
    expect(prisma.bookingHandoverProtocol.update).not.toHaveBeenCalled();
  });

  it('returns MANUAL_REVIEW when active transfer already exists', async () => {
    const evaluation = followUpResult(OneWayReturnFollowUpRecommendation.MANUAL_REVIEW);
    (oneWayReturnFollowUp.evaluateAfterReturn as jest.Mock).mockResolvedValue(evaluation);

    const result = await service.createHandover(ORG, BOOKING_ID, 'RETURN', basePayload);

    expect(result.oneWayReturnFollowUp?.recommendation).toBe(
      OneWayReturnFollowUpRecommendation.MANUAL_REVIEW,
    );
  });
});
