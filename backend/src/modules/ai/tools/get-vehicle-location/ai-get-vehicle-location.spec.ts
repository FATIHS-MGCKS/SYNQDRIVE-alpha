import { MembershipRole, TripDetectionState } from '@prisma/client';
import { AiGetVehicleLocationTool } from './ai-get-vehicle-location.tool';
import { buildAiExecutionContext } from '../../execution/ai-execution-context.builder';
import type { AiExecutionContext } from '../../execution/ai-execution-context.types';
import type { AiDataAuthorizationProbe } from '../../execution/ai-execution-context.types';
import type { AiVehicleScopeResolver } from '../../execution/ai-execution-context.types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '99999999-9999-4999-8999-999999999999';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const STATION_ID = '33333333-3333-4333-8333-333333333333';

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}

function buildContext(
  overrides: Partial<Parameters<typeof buildAiExecutionContext>[0]> = {},
): AiExecutionContext {
  return buildAiExecutionContext({
    organizationId: ORG_ID,
    userId: '44444444-4444-4444-8444-444444444444',
    membershipRole: MembershipRole.WORKER,
    membershipStatus: 'ACTIVE',
    permissions: {
      fleet: { read: true, write: false },
      'ai-assistant': { read: true, write: false },
    },
    channel: 'fleet_chat',
    dataAccessPurpose: 'fleet_assistant_query',
    correlationId: 'corr-location-1',
    requestId: 'req-location-1',
    ...overrides,
  });
}

function makeVehicleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VEHICLE_ID,
    organizationId: ORG_ID,
    licensePlate: 'WOB-L 7503',
    vehicleName: 'Fleet Tiguan',
    make: 'VW',
    model: 'Tiguan',
    year: 2021,
    dimoVehicle: { tokenId: 872, lastSignal: minutesAgo(2) },
    latestState: {
      latitude: 52.4234,
      longitude: 10.7879,
      speedKmh: 0,
      isIgnitionOn: false,
      engineLoad: 0,
      tractionBatteryPowerKw: null,
      coolantTempC: 88,
      odometerKm: 50120,
      lastSeenAt: minutesAgo(2),
      sourceTimestamp: minutesAgo(2),
      providerFetchedAt: minutesAgo(2),
      updatedAt: minutesAgo(2),
    },
    ...overrides,
  };
}

describe('AiGetVehicleLocationTool', () => {
  let prisma: {
    vehicle: { findFirst: jest.Mock };
    vehicleTripDetectionState: { findUnique: jest.Mock };
  };
  let vehicles: { getLiveGps: jest.Mock };
  let vehicleScopeResolver: AiVehicleScopeResolver;
  let dataAuthorizationProbe: AiDataAuthorizationProbe;
  let tool: AiGetVehicleLocationTool;

  beforeEach(() => {
    prisma = {
      vehicle: { findFirst: jest.fn() },
      vehicleTripDetectionState: {
        findUnique: jest.fn().mockResolvedValue({ state: TripDetectionState.RESTING }),
      },
    };
    vehicles = { getLiveGps: jest.fn() };
    vehicleScopeResolver = {
      findVehicleInOrganization: jest.fn(async (vehicleId, organizationId) => {
        if (vehicleId !== VEHICLE_ID || organizationId !== ORG_ID) {
          return null;
        }
        return {
          id: VEHICLE_ID,
          organizationId: ORG_ID,
          currentStationId: STATION_ID,
        };
      }),
    };
    dataAuthorizationProbe = {
      isGpsLocationAuthorized: jest.fn().mockResolvedValue(true),
    };
    tool = new AiGetVehicleLocationTool(
      prisma as never,
      vehicles as never,
      vehicleScopeResolver as never,
      dataAuthorizationProbe as never,
    );
  });

  it('returns a fresh snapshot position from VehicleLatestState without live fetch', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(makeVehicleRow());

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(vehicles.getLiveGps).not.toHaveBeenCalled();
    expect(outcome.data?.telemetryState).toMatch(/live|fresh/);
    expect(outcome.data?.isLastKnownLocation).toBe(false);
    expect(outcome.data?.source).toBe('vehicle_latest_state');
    expect(outcome.data?.latitude).toBe(52.4234);
    expect(outcome.errors).toHaveLength(0);
    expect(outcome.allowLlmInference).toBe(true);
  });

  it('marks standby snapshot coordinates as last known', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(
      makeVehicleRow({
        latestState: {
          ...makeVehicleRow().latestState,
          lastSeenAt: minutesAgo(120),
          sourceTimestamp: minutesAgo(120),
        },
      }),
    );

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.data?.isLastKnownLocation).toBe(true);
    expect(outcome.data?.telemetryState).toBe('stale');
    expect(outcome.data?.freshness).toBe('standby');
  });

  it('returns stale semantics for delayed signal age', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(
      makeVehicleRow({
        latestState: {
          ...makeVehicleRow().latestState,
          lastSeenAt: hoursAgo(30),
          sourceTimestamp: hoursAgo(30),
        },
      }),
    );

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.data?.telemetryState).toBe('stale');
    expect(outcome.data?.isLastKnownLocation).toBe(true);
  });

  it('returns no coordinates when position data is missing', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(
      makeVehicleRow({
        latestState: {
          ...makeVehicleRow().latestState,
          latitude: null,
          longitude: null,
          lastSeenAt: null,
          sourceTimestamp: null,
        },
        dimoVehicle: { tokenId: 872, lastSignal: null },
      }),
    );
    vehicles.getLiveGps.mockResolvedValue({
      latitude: null,
      longitude: null,
      speedKmh: null,
      lastSeenAt: null,
      source: 'cache',
    });

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.data).toBeNull();
    expect(outcome.evidence).toHaveLength(0);
  });

  it('reports DIMO not connected without claiming live telemetry', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(
      makeVehicleRow({
        dimoVehicle: null,
      }),
    );

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.errors[0]?.code).toBe('integration_not_connected');
    expect(outcome.allowLlmInference).toBe(false);
    expect(vehicles.getLiveGps).not.toHaveBeenCalled();
  });

  it('returns partial snapshot data when live provider times out', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(
      makeVehicleRow({
        latestState: {
          ...makeVehicleRow().latestState,
          speedKmh: 55,
          lastSeenAt: minutesAgo(0.5),
          sourceTimestamp: minutesAgo(0.5),
        },
      }),
    );
    prisma.vehicleTripDetectionState.findUnique.mockResolvedValue({
      state: TripDetectionState.ACTIVE_TRIP,
    });
    vehicles.getLiveGps.mockRejectedValue({ code: 'ETIMEDOUT' });

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(vehicles.getLiveGps).toHaveBeenCalled();
    expect(outcome.partial).toBe(true);
    expect(outcome.data?.latitude).toBe(52.4234);
    expect(outcome.data?.source).toBe('cache_fallback');
    expect(outcome.errors[0]?.code).toBe('timeout');
    expect(outcome.allowLlmInference).toBe(false);
  });

  it('denies access without GPS authorization', async () => {
    (dataAuthorizationProbe.isGpsLocationAuthorized as jest.Mock).mockResolvedValue(false);

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.errors[0]?.code).toBe('permission_denied');
    expect(outcome.data).toBeNull();
    expect(prisma.vehicle.findFirst).not.toHaveBeenCalled();
  });

  it('denies access for foreign organization vehicles', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(
      makeVehicleRow({ organizationId: OTHER_ORG_ID }),
    );

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.errors[0]?.code).toBe('vehicle_not_found');
    expect(outcome.data).toBeNull();
  });

  it('returns vehicle_not_found for unknown vehicle id', async () => {
    vehicleScopeResolver = {
      findVehicleInOrganization: jest.fn().mockResolvedValue(null),
    };
    tool = new AiGetVehicleLocationTool(
      prisma as never,
      vehicles as never,
      vehicleScopeResolver as never,
      dataAuthorizationProbe as never,
    );

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.errors[0]?.code).toBe('vehicle_not_found');
  });

  it('never fabricates an address', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(makeVehicleRow());

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.data?.address).toBeNull();
  });

  it('uses live DIMO coordinates only for live-tracking vehicles', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(
      makeVehicleRow({
        latestState: {
          ...makeVehicleRow().latestState,
          speedKmh: 55,
          lastSeenAt: minutesAgo(0.5),
          sourceTimestamp: minutesAgo(0.5),
        },
      }),
    );
    prisma.vehicleTripDetectionState.findUnique.mockResolvedValue({
      state: TripDetectionState.ACTIVE_TRIP,
    });
    vehicles.getLiveGps.mockResolvedValue({
      latitude: 52.5,
      longitude: 10.8,
      speedKmh: 55,
      lastSeenAt: '2026-07-24T11:59:55.000Z',
      source: 'dimo',
    });

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(vehicles.getLiveGps).toHaveBeenCalled();
    expect(outcome.data?.source).toBe('dimo_live');
    expect(outcome.data?.latitude).toBe(52.5);
    expect(outcome.data?.telemetryState).toMatch(/live|fresh/);
  });
});
