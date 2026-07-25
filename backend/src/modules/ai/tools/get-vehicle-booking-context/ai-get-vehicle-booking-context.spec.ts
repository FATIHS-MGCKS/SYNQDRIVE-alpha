import { MembershipRole } from '@prisma/client';
import { AiGetVehicleBookingContextTool } from './ai-get-vehicle-booking-context.tool';
import { buildAiExecutionContext } from '../../execution/ai-execution-context.builder';
import type { AiExecutionContext } from '../../execution/ai-execution-context.types';
import type { AiPrismaVehicleScopeResolver } from '../ai-prisma-vehicle-scope.resolver';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '99999999-9999-4999-8999-999999999999';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-07-24T12:00:00.000Z').getTime();

function buildContext(
  overrides: Partial<Parameters<typeof buildAiExecutionContext>[0]> = {},
): AiExecutionContext {
  return buildAiExecutionContext({
    organizationId: ORG_ID,
    userId: '33333333-3333-4333-8333-333333333333',
    membershipRole: MembershipRole.WORKER,
    membershipStatus: 'ACTIVE',
    permissions: {
      fleet: { read: true, write: false },
      bookings: { read: true, write: false },
      'ai-assistant': { read: true, write: false },
    },
    channel: 'fleet_chat',
    dataAccessPurpose: 'fleet_assistant_query',
    correlationId: 'corr-booking-ctx-1',
    requestId: 'req-booking-ctx-1',
    ...overrides,
  });
}

function makeOperationalContext(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: VEHICLE_ID,
    contextKind: 'ACTIVE_RENTED',
    currentBooking: {
      bucket: 'CURRENT',
      bookingId: 'booking-1',
      bookingNumber: 'BK-ING-1',
      bookingStatus: 'ACTIVE',
      scheduledPickupAt: '2026-07-20T08:00:00.000Z',
      scheduledReturnAt: '2026-07-24T10:00:00.000Z',
      actualPickupAt: '2026-07-20T08:30:00.000Z',
      actualReturnAt: null,
      pickupStation: { stationId: 'pickup', stationName: 'Pickup' },
      returnStation: { stationId: 'return', stationName: 'Return' },
      extensionStatus: 'NONE',
      approvedExtensionUntil: null,
      handoverStatus: 'PICKUP_COMPLETED',
      returnStatus: 'PENDING',
      pickupOverdue: false,
      returnOverdue: true,
    },
    reservedBooking: null,
    upcomingBooking: null,
    futureBookingCount: 0,
    runtimeState: 'Active Rented',
    operationalState: {
      status: 'ACTIVE_RENTED',
      reason: null,
      source: 'vehicles.service:deriveFleetStatusContext',
      derivedAt: new Date(NOW).toISOString(),
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      isReliable: true,
    },
    openProcessSteps: ['RETURN_HANDOVER_PENDING', 'RETURN_OVERDUE'],
    nextRelevantDeadline: '2026-07-24T10:00:00.000Z',
    nextRelevantDeadlineKind: 'RETURN',
    pickupOverdue: false,
    returnOverdue: true,
    reasonCodes: ['ACTIVE_RENTED', 'RETURN_OVERDUE'],
    inconsistencyFlags: [],
    source: 'bookings.vehicle-booking-context.util',
    calculatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe('AiGetVehicleBookingContextTool', () => {
  let prisma: { vehicle: { findFirst: jest.Mock } };
  let vehicleBookingContext: { getVehicleBookingOperationalContext: jest.Mock };
  let vehicleScopeResolver: AiPrismaVehicleScopeResolver;
  let tool: AiGetVehicleBookingContextTool;

  beforeEach(() => {
    prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: VEHICLE_ID,
          licensePlate: 'WOB-L 7503',
          vehicleName: 'Fleet Tiguan',
          make: 'VW',
          model: 'Tiguan',
          year: 2021,
        }),
      },
    };
    vehicleBookingContext = {
      getVehicleBookingOperationalContext: jest.fn().mockResolvedValue(makeOperationalContext()),
    };
    vehicleScopeResolver = {
      prisma: prisma as never,
      findVehicleInOrganization: jest.fn(async (vehicleId, organizationId) => {
        if (vehicleId !== VEHICLE_ID || organizationId !== ORG_ID) return null;
        return { id: VEHICLE_ID, organizationId: ORG_ID, currentStationId: null };
      }),
    } as unknown as AiPrismaVehicleScopeResolver;
    tool = new AiGetVehicleBookingContextTool(
      prisma as never,
      vehicleBookingContext as never,
      vehicleScopeResolver,
    );
  });

  it('denies without bookings permission', async () => {
    const outcome = await tool.execute(
      buildContext({ permissions: { bookings: { read: false, write: false } } }),
      { vehicleId: VEHICLE_ID },
      NOW,
    );
    expect(outcome.allowLlmInference).toBe(false);
  });

  it('denies foreign organization via vehicle scope', async () => {
    const outcome = await tool.execute(
      buildContext({ organizationId: OTHER_ORG_ID }),
      { vehicleId: VEHICLE_ID },
      NOW,
    );
    expect(outcome.data).toBeNull();
    expect(outcome.allowLlmInference).toBe(false);
  });

  it('returns structured active booking context', async () => {
    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID }, NOW);

    expect(outcome.allowLlmInference).toBe(true);
    expect(outcome.data?.contextKind).toBe('ACTIVE_RENTED');
    expect(outcome.data?.returnOverdue).toBe(true);
    expect(outcome.data?.currentBooking?.returnStatus).toBe('PENDING');
    expect(outcome.data?.currentBooking?.customerDisplayName).toBeUndefined();
    expect(vehicleBookingContext.getVehicleBookingOperationalContext).toHaveBeenCalledWith(
      ORG_ID,
      VEHICLE_ID,
      expect.objectContaining({ includeCustomerDisplayName: false }),
    );
  });

  it('includes customer display name with customers read permission', async () => {
    const base = makeOperationalContext();
    vehicleBookingContext.getVehicleBookingOperationalContext.mockResolvedValue({
      ...base,
      currentBooking: {
        ...base.currentBooking!,
        customerDisplayName: 'Max Mustermann',
      },
    });

    const outcome = await tool.execute(
      buildContext({
        permissions: {
          fleet: { read: true, write: false },
          bookings: { read: true, write: false },
          customers: { read: true, write: false },
          'ai-assistant': { read: true, write: false },
        },
      }),
      { vehicleId: VEHICLE_ID },
      NOW,
    );

    expect(vehicleBookingContext.getVehicleBookingOperationalContext).toHaveBeenCalledWith(
      ORG_ID,
      VEHICLE_ID,
      expect.objectContaining({ includeCustomerDisplayName: true }),
    );
    expect(outcome.data?.currentBooking?.customerDisplayName).toBe('Max Mustermann');
  });

  it('returns none context when no open booking', async () => {
    vehicleBookingContext.getVehicleBookingOperationalContext.mockResolvedValue({
      ...makeOperationalContext(),
      contextKind: 'NONE',
      currentBooking: null,
      returnOverdue: false,
      reasonCodes: ['NO_OPEN_BOOKING'],
    });

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID }, NOW);

    expect(outcome.data?.contextKind).toBe('NONE');
    expect(outcome.data?.currentBooking).toBeNull();
  });
});
