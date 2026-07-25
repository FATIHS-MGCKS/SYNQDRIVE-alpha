import { MembershipRole } from '@prisma/client';
import { AiExplainOverdueReturnTool } from './ai-explain-overdue-return.tool';
import { buildAiExecutionContext } from '../../execution/ai-execution-context.builder';
import type { AiExecutionContext } from '../../execution/ai-execution-context.types';
import type { AiVehicleScopeResolver } from '../../execution/ai-execution-context.types';
import type { AiDataAuthorizationProbe } from '../../execution/ai-execution-context.types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const BOOKING_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_BOOKING_ID = '44444444-4444-4444-8444-444444444444';
const STATION_RETURN_ID = '55555555-5555-4555-8555-555555555555';

const NOW = new Date('2026-07-24T12:00:00.000Z').getTime();

function buildContext(
  overrides: Partial<Parameters<typeof buildAiExecutionContext>[0]> = {},
): AiExecutionContext {
  return buildAiExecutionContext({
    organizationId: ORG_ID,
    userId: '66666666-6666-4666-8666-666666666666',
    membershipRole: MembershipRole.WORKER,
    membershipStatus: 'ACTIVE',
    permissions: {
      fleet: { read: true, write: false },
      bookings: { read: true, write: false },
      'ai-assistant': { read: true, write: false },
    },
    channel: 'fleet_chat',
    dataAccessPurpose: 'fleet_assistant_query',
    correlationId: 'corr-overdue-1',
    requestId: 'req-overdue-1',
    ...overrides,
  });
}

function makeBooking(overrides: Record<string, unknown> = {}) {
  const start = new Date('2026-07-20T08:00:00.000Z');
  const end = new Date('2026-07-24T10:00:00.000Z');
  return {
    id: BOOKING_ID,
    vehicleId: VEHICLE_ID,
    status: 'ACTIVE',
    startDate: start,
    endDate: end,
    completedAt: null,
    cancelledAt: null,
    pickupStationId: 'station-pickup',
    returnStationId: STATION_RETURN_ID,
    actualReturnStationId: null,
    customer: { firstName: 'Max', lastName: 'Mustermann', company: null },
    vehicle: {
      id: VEHICLE_ID,
      licensePlate: 'WOB-L 7503',
      vehicleName: 'Fleet Tiguan',
      make: 'VW',
      model: 'Tiguan',
      year: 2021,
    },
    handoverProtocols: [
      {
        kind: 'PICKUP',
        performedAt: new Date('2026-07-20T08:30:00.000Z'),
      },
    ],
    pricingQuote: { returnAt: end },
    ...overrides,
  };
}

describe('AiExplainOverdueReturnTool', () => {
  let prisma: {
    booking: { findFirst: jest.Mock };
    organization: { findUnique: jest.Mock };
    station: { findMany: jest.Mock };
    vehicleLatestState: { findUnique: jest.Mock };
  };
  let vehicleScopeResolver: AiVehicleScopeResolver;
  let dataAuthorizationProbe: AiDataAuthorizationProbe;
  let tool: AiExplainOverdueReturnTool;

  beforeEach(() => {
    prisma = {
      booking: { findFirst: jest.fn() },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Berlin' }),
      },
      station: {
        findMany: jest.fn().mockResolvedValue([{ id: STATION_RETURN_ID, name: 'Hannover' }]),
      },
      vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    vehicleScopeResolver = {
      findVehicleInOrganization: jest.fn(async (vehicleId, organizationId) => {
        if (vehicleId !== VEHICLE_ID || organizationId !== ORG_ID) return null;
        return { id: VEHICLE_ID, organizationId: ORG_ID, currentStationId: null };
      }),
    };
    dataAuthorizationProbe = {
      isGpsLocationAuthorized: jest.fn().mockResolvedValue(true),
    };
    tool = new AiExplainOverdueReturnTool(
      prisma as never,
      vehicleScopeResolver,
      dataAuthorizationProbe,
    );
  });

  it('denies without ai-assistant permission', async () => {
    const outcome = await tool.execute(
      buildContext({
        permissions: { 'ai-assistant': { read: false, write: false } },
      }),
      { vehicleId: VEHICLE_ID },
      NOW,
    );
    expect(outcome.allowLlmInference).toBe(false);
    expect(outcome.data).toBeNull();
  });

  it('denies without bookings read permission', async () => {
    const outcome = await tool.execute(
      buildContext({
        permissions: {
          bookings: { read: false, write: false },
          'ai-assistant': { read: true, write: false },
        },
      }),
      { vehicleId: VEHICLE_ID },
      NOW,
    );
    expect(outcome.allowLlmInference).toBe(false);
  });

  it('explains overdue return for current ACTIVE booking', async () => {
    prisma.booking.findFirst
      .mockResolvedValueOnce(makeBooking())
      .mockResolvedValueOnce(makeBooking());

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID }, NOW);

    expect(outcome.allowLlmInference).toBe(true);
    expect(outcome.data?.isMarkedOverdue).toBe(true);
    expect(outcome.data?.bookingStatus).toBe('ACTIVE');
    expect(outcome.data?.returnStatus).toBe('PENDING');
    expect(outcome.data?.overdueDurationMinutes).toBe(120);
    expect(outcome.data?.returnStation.stationName).toBe('Hannover');
    expect(outcome.data?.reasonCodes).toEqual(
      expect.arrayContaining(['RETURN_DEADLINE_PASSED', 'RETURN_NOT_COMPLETED']),
    );
    expect(outcome.data?.isCurrentCauseBooking).toBe(true);
  });

  it('does not expose location without authorization', async () => {
    dataAuthorizationProbe.isGpsLocationAuthorized = jest.fn().mockResolvedValue(false);
    prisma.booking.findFirst
      .mockResolvedValueOnce(makeBooking())
      .mockResolvedValueOnce(makeBooking());

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID }, NOW);

    expect(outcome.data?.latestKnownLocation).toBeNull();
  });

  it('flags historical booking when explicit bookingId is not current ACTIVE', async () => {
    prisma.booking.findFirst
      .mockResolvedValueOnce(makeBooking())
      .mockResolvedValueOnce(makeBooking({ id: OTHER_BOOKING_ID, status: 'COMPLETED' }));

    const outcome = await tool.execute(
      buildContext(),
      { vehicleId: VEHICLE_ID, bookingId: OTHER_BOOKING_ID },
      NOW,
    );

    expect(outcome.data?.isCurrentCauseBooking).toBe(false);
    expect(outcome.data?.inconsistencyFlags).toContain('HISTORICAL_BOOKING_NOT_CURRENT');
  });

  it('respects approved extension via pricing quote returnAt', async () => {
    const extendedEnd = new Date('2026-07-25T10:00:00.000Z');
    prisma.booking.findFirst.mockResolvedValueOnce(
      makeBooking({
        endDate: extendedEnd,
        pricingQuote: { returnAt: new Date('2026-07-24T10:00:00.000Z') },
      }),
    );

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID }, NOW);

    expect(outcome.data?.extensionStatus).toBe('APPLIED_VIA_END_DATE_PATCH');
    expect(outcome.data?.isMarkedOverdue).toBe(false);
  });
});
