import { ConflictException } from '@nestjs/common';
import { StationBookingRuleOutcome } from '@shared/stations/station-booking-rules.contract';
import type { HandoverStationRulesResult } from '@shared/stations/handover-station-rules.contract';
import { BookingsHandoverService } from './bookings-handover.service';
import { StationValidationService } from '@modules/stations/station-validation.service';
import { StationBookingRulesService } from '@modules/stations/station-booking-rules.service';
import { OneWayReturnFollowUpService } from './one-way-return-follow-up.service';

const ORG = 'org-handover-rules';
const BOOKING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VEHICLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STATION_PICKUP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_RETURN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USER_ID = 'user-handover-rules';

function allowedHandoverRules(
  overrides: Partial<HandoverStationRulesResult> = {},
): HandoverStationRulesResult {
  return {
    version: 1,
    evaluatedAt: '2026-07-18T10:00:00.000Z',
    kind: 'PICKUP',
    actualStationId: STATION_PICKUP,
    plannedStationId: STATION_PICKUP,
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
    ...overrides,
  };
}

describe('BookingsHandoverService station rules re-validation', () => {
  const booking = {
    id: BOOKING_ID,
    vehicleId: VEHICLE_ID,
    customerId: 'cust-1',
    status: 'CONFIRMED' as const,
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
    evaluateHandoverRequest: jest.fn(),
  } as unknown as StationBookingRulesService;

  const oneWayReturnFollowUp = {
    evaluateAfterReturn: jest.fn().mockResolvedValue(null),
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
    odometerKm: 1000,
    fuelPercent: 80,
    performedByUserId: USER_ID,
    actualStationId: STATION_PICKUP,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({ ...booking });
    (prisma.bookingHandoverProtocol.findUnique as jest.Mock).mockResolvedValue(null);
    (stationBookingRules.evaluateHandoverRequest as jest.Mock).mockResolvedValue(
      allowedHandoverRules(),
    );
    (tx.bookingHandoverProtocol.create as jest.Mock).mockResolvedValue({
      id: 'proto-rules-1',
      bookingId: BOOKING_ID,
      vehicleId: VEHICLE_ID,
      kind: 'PICKUP',
      performedAt: new Date('2026-07-18T09:00:00.000Z'),
      performedByUserId: USER_ID,
      performedByName: null,
      odometerKm: 1000,
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
      actualStationId: STATION_PICKUP,
      stationRulesSnapshot: allowedHandoverRules(),
      createdAt: new Date('2026-07-18T09:00:00.000Z'),
      updatedAt: new Date('2026-07-18T09:00:00.000Z'),
    });
    (tx.booking.update as jest.Mock).mockResolvedValue({
      id: BOOKING_ID,
      status: 'ACTIVE',
      vehicleId: VEHICLE_ID,
    });
    (tx.vehicle.findFirst as jest.Mock).mockResolvedValue({
      status: 'AVAILABLE',
      homeStationId: STATION_PICKUP,
      currentStationId: STATION_PICKUP,
      expectedStationId: STATION_RETURN,
      currentStationSource: 'MANUAL',
      stationPositionVersion: 1,
    });
    (tx.vehicle.update as jest.Mock).mockResolvedValue({});
    (tx.booking.count as jest.Mock).mockResolvedValue(0);
  });

  it('blocks pickup when station rules are BLOCKED at handover time', async () => {
    (stationBookingRules.evaluateHandoverRequest as jest.Mock).mockResolvedValue(
      allowedHandoverRules({
        outcome: StationBookingRuleOutcome.BLOCKED,
        evaluations: [
          {
            ruleId: 'station.inactive',
            outcome: StationBookingRuleOutcome.BLOCKED,
            field: 'pickup',
            reason: { code: 'STATION_INACTIVE', message: 'Station inactive' },
          },
        ],
      }),
    );

    await expect(
      service.createHandover(ORG, BOOKING_ID, 'PICKUP', basePayload, { userId: USER_ID }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HANDOVER_STATION_RULES_BLOCKED' }),
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('re-evaluates at performedAt and persists station rules snapshot on protocol', async () => {
    const performedAt = '2026-07-18T07:00:00.000Z';
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      ...booking,
      startDate: new Date('2026-07-18T08:00:00.000Z'),
    });
    const rules = allowedHandoverRules({
      outcome: StationBookingRuleOutcome.WARNING,
      reasons: [{ code: 'OUTSIDE_OPENING_HOURS', message: 'Outside hours' }],
    });
    (stationBookingRules.evaluateHandoverRequest as jest.Mock).mockResolvedValue(rules);

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-18T09:00:00.000Z'));

    const result = await service.createHandover(
      ORG,
      BOOKING_ID,
      'PICKUP',
      {
        ...basePayload,
        performedAt,
      },
      { userId: USER_ID },
    );

    jest.useRealTimers();

    expect(stationBookingRules.evaluateHandoverRequest).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({
        kind: 'PICKUP',
        actualStationId: STATION_PICKUP,
        evaluatedAt: new Date(performedAt),
      }),
      { id: USER_ID },
    );
    expect(tx.bookingHandoverProtocol.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stationRulesSnapshot: rules,
          actualStationId: STATION_PICKUP,
        }),
      }),
    );
    expect(result.stationRules).toEqual(rules);
  });

  it('blocks return when manual confirmation is required without override', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      ...booking,
      status: 'ACTIVE',
    });
    (stationBookingRules.evaluateHandoverRequest as jest.Mock).mockResolvedValue(
      allowedHandoverRules({
        kind: 'RETURN',
        actualStationId: STATION_RETURN,
        plannedStationId: STATION_RETURN,
        outcome: StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
        manualOverrideRequired: true,
      }),
    );

    await expect(
      service.createHandover(
        ORG,
        BOOKING_ID,
        'RETURN',
        {
          ...basePayload,
          odometerKm: 1100,
          actualStationId: STATION_RETURN,
        },
        { userId: USER_ID },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'HANDOVER_STATION_RULES_MANUAL_OVERRIDE_REQUIRED',
      }),
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows return with override and updates current station only after successful completion', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      ...booking,
      status: 'ACTIVE',
    });
    (stationBookingRules.evaluateHandoverRequest as jest.Mock).mockResolvedValue(
      allowedHandoverRules({
        kind: 'RETURN',
        actualStationId: STATION_RETURN,
        plannedStationId: STATION_RETURN,
        manualOverrideApplied: true,
      }),
    );
    (tx.bookingHandoverProtocol.findUnique as jest.Mock).mockResolvedValue({
      odometerKm: 900,
    });
    (tx.booking.update as jest.Mock).mockResolvedValue({
      id: BOOKING_ID,
      status: 'COMPLETED',
      vehicleId: VEHICLE_ID,
    });

    await service.createHandover(
      ORG,
      BOOKING_ID,
      'RETURN',
      {
        ...basePayload,
        odometerKm: 1100,
        actualStationId: STATION_RETURN,
        stationBookingRules: {
          manualOverride: { reason: 'After-hours return approved by manager' },
        },
      },
      { userId: USER_ID },
    );

    expect(stationBookingRules.evaluateHandoverRequest).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({
        kind: 'RETURN',
        manualOverride: {
          reason: 'After-hours return approved by manager',
          expiresAt: null,
        },
      }),
      { id: USER_ID },
    );
    expect(tx.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStationId: STATION_RETURN,
          currentStationSource: 'RETURN',
        }),
      }),
    );
  });

  it('rejects handover when station validation fails before transaction', async () => {
    (stationValidation.assertHandoverStation as jest.Mock).mockRejectedValue(
      new ConflictException('archived'),
    );

    await expect(
      service.createHandover(ORG, BOOKING_ID, 'PICKUP', basePayload, { userId: USER_ID }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(stationBookingRules.evaluateHandoverRequest).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
