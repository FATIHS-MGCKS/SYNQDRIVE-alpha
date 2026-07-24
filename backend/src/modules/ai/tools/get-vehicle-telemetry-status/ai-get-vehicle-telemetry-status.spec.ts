import { MembershipRole } from '@prisma/client';
import {
  TELEMETRY_FRESH_THRESHOLD_MS,
  TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS,
  TELEMETRY_STANDBY_THRESHOLD_MS,
} from '@modules/vehicles/telemetry-freshness.resolver';
import { AiGetVehicleTelemetryStatusTool } from './ai-get-vehicle-telemetry-status.tool';
import { buildAiExecutionContext } from '../../execution/ai-execution-context.builder';
import type { AiExecutionContext } from '../../execution/ai-execution-context.types';
import type { AiVehicleScopeResolver } from '../../execution/ai-execution-context.types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const STATION_ID = '33333333-3333-4333-8333-333333333333';

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}

function msAgo(ms: number): Date {
  return new Date(Date.now() - ms);
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
    correlationId: 'corr-telemetry-1',
    requestId: 'req-telemetry-1',
    ...overrides,
  });
}

function makeVehicleRow(overrides: Record<string, unknown> = {}) {
  const lastSeenAt = minutesAgo(2);
  return {
    id: VEHICLE_ID,
    organizationId: ORG_ID,
    licensePlate: 'WOB-L 7503',
    vehicleName: 'Fleet Tiguan',
    make: 'VW',
    model: 'Tiguan',
    year: 2021,
    hardwareType: 'OEM',
    fuelType: 'GASOLINE',
    dimoVehicleId: 'dimo-1',
    dimoVehicle: {
      tokenId: 872,
      lastSignal: lastSeenAt,
      connectionStatus: 'CONNECTED',
    },
    latestState: {
      lastSeenAt,
      sourceTimestamp: lastSeenAt,
      providerFetchedAt: lastSeenAt,
      updatedAt: lastSeenAt,
      providerSource: 'DIMO',
      providerBindingId: 'binding-1',
      rawPayloadJson: {
        currentLocationCoordinates: { value: { latitude: 52.4, longitude: 10.7 } },
        speed: { value: 0 },
        powertrainTransmissionTravelledDistance: { value: 50120 },
        powertrainFuelSystemRelativeLevel: { value: 0.62 },
        obdDTCList: { value: [] },
      },
      latitude: 52.4234,
      longitude: 10.7879,
      speedKmh: 0,
      isIgnitionOn: false,
      engineLoad: 0,
      tractionBatteryPowerKw: null,
      coolantTempC: 88,
      odometerKm: 50120,
      fuelLevelRelative: 0.62,
      fuelLevelAbsolute: null,
      evSoc: null,
      obdDtcList: [],
      lastDtcPollAt: lastSeenAt,
    },
    dataSourceLinks: [
      {
        id: 'binding-1',
        sourceType: 'DIMO',
        sourceSubtype: null,
        isActive: true,
        provider: 'DIMO',
      },
    ],
    providerConsents: [
      {
        organizationId: ORG_ID,
        provider: 'DIMO',
        status: 'ACTIVE',
        grantedAt: hoursAgo(48),
        expiresAt: null,
        revokedAt: null,
      },
    ],
    deviceConnectionEpisodes: [],
    ...overrides,
  };
}

describe('AiGetVehicleTelemetryStatusTool', () => {
  let prisma: {
    vehicle: { findFirst: jest.Mock };
    orgDataAuthorization: { findFirst: jest.Mock };
  };
  let vehicleScopeResolver: AiVehicleScopeResolver;
  let tool: AiGetVehicleTelemetryStatusTool;

  beforeEach(() => {
    prisma = {
      vehicle: { findFirst: jest.fn() },
      orgDataAuthorization: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          expiresAt: null,
          revokedAt: null,
        }),
      },
    };
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
    tool = new AiGetVehicleTelemetryStatusTool(
      prisma as never,
      vehicleScopeResolver as never,
    );
  });

  it('reports live telemetry with fresh signal groups', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(makeVehicleRow());

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.errors).toHaveLength(0);
    expect(outcome.data?.telemetryState).toMatch(/live|fresh/);
    expect(outcome.data?.freshness).toBe('live');
    expect(outcome.data?.connectivityStatus).toBe('TELEMETRY_ACTIVE');
    expect(outcome.data?.availableSignalGroups).toContain('gps');
    expect(outcome.data?.isLastKnownTelemetry).toBe(false);
    expect(outcome.data?.explanation.locationStatementReliable).toBe(true);
    expect(outcome.allowLlmInference).toBe(true);
  });

  it('reports standby as connected-but-quiet without calling vehicle offline', async () => {
    const lastSeenAt = minutesAgo(120);
    prisma.vehicle.findFirst.mockResolvedValue(
      makeVehicleRow({
        latestState: {
          ...makeVehicleRow().latestState,
          lastSeenAt,
          sourceTimestamp: lastSeenAt,
          providerFetchedAt: lastSeenAt,
          updatedAt: lastSeenAt,
        },
        dimoVehicle: {
          ...makeVehicleRow().dimoVehicle,
          lastSignal: lastSeenAt,
        },
      }),
    );

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.data?.telemetryState).toBe('stale');
    expect(outcome.data?.freshness).toBe('standby');
    expect(outcome.data?.connectivityStatus).toBe('STANDBY');
    expect(outcome.data?.explanation.connectedButQuiet).toBe(true);
    expect(outcome.data?.explanation.stateSummary).toBe('connected_standby_heartbeat');
    expect(outcome.data?.isLastKnownTelemetry).toBe(true);
    expect(outcome.data?.connectivityStatus).not.toBe('OFFLINE');
  });

  it('reports soft-offline semantics for delayed signal age', async () => {
    const lastSeenAt = hoursAgo(30);
    prisma.vehicle.findFirst.mockResolvedValue(
      makeVehicleRow({
        latestState: {
          ...makeVehicleRow().latestState,
          lastSeenAt,
          sourceTimestamp: lastSeenAt,
          providerFetchedAt: lastSeenAt,
          updatedAt: lastSeenAt,
        },
      }),
    );

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.data?.telemetryState).toBe('stale');
    expect(outcome.data?.freshness).toBe('signal_delayed');
    expect(outcome.data?.connectivityStatus).toBe('SOFT_OFFLINE');
    expect(outcome.data?.staleSignalGroups.length).toBeGreaterThan(0);
    expect(outcome.data?.explanation.lastKnownDataPresent).toBe(true);
  });

  it('reports offline with last-known data when snapshot exists', async () => {
    const lastSeenAt = hoursAgo(72);
    prisma.vehicle.findFirst.mockResolvedValue(
      makeVehicleRow({
        latestState: {
          ...makeVehicleRow().latestState,
          lastSeenAt,
          sourceTimestamp: lastSeenAt,
          providerFetchedAt: lastSeenAt,
          updatedAt: lastSeenAt,
        },
      }),
    );

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.data?.telemetryState).toBe('stale');
    expect(outcome.data?.freshness).toBe('offline');
    expect(outcome.data?.connectivityStatus).toBe('OFFLINE');
    expect(outcome.data?.isLastKnownTelemetry).toBe(true);
    expect(outcome.data?.availableSignalGroups.length).toBeGreaterThan(0);
    expect(outcome.data?.explanation.stateSummary).toBe('presenting_last_known_telemetry');
  });

  it('reports unknown when no telemetry timestamp exists', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(
      makeVehicleRow({
        latestState: null,
        dimoVehicle: {
          tokenId: 872,
          lastSignal: null,
          connectionStatus: 'CONNECTED',
        },
      }),
    );

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.data?.telemetryState).toBe('unknown');
    expect(outcome.data?.freshness).toBe('no_signal');
    expect(outcome.data?.lastSignalAt).toBeNull();
    expect(outcome.data?.explanation.stateSummary).toBe('no_telemetry_timestamp');
  });

  it('does not claim vehicle offline when only individual signals are missing', async () => {
    const lastSeenAt = minutesAgo(5);
    prisma.vehicle.findFirst.mockResolvedValue(
      makeVehicleRow({
        latestState: {
          ...makeVehicleRow().latestState,
          lastSeenAt,
          sourceTimestamp: lastSeenAt,
          fuelLevelRelative: null,
          fuelLevelAbsolute: null,
          rawPayloadJson: {
            currentLocationCoordinates: { value: { latitude: 52.4, longitude: 10.7 } },
            speed: { value: 0 },
            powertrainTransmissionTravelledDistance: { value: 50120 },
          },
        },
      }),
    );

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.data?.telemetryState).toMatch(/live|fresh/);
    expect(outcome.data?.connectivityStatus).toBe('TELEMETRY_ACTIVE');
    expect(outcome.data?.missingSignalGroups).toContain('fuel');
    expect(outcome.data?.availableSignalGroups).toContain('gps');
    expect(outcome.data?.warnings).toContain('partial_signal_coverage');
    expect(outcome.data?.explanation.stateSummary).not.toBe('telemetry_offline');
  });

  it('returns integration_not_connected when provider link is missing', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(
      makeVehicleRow({
        dimoVehicleId: null,
        dimoVehicle: null,
        dataSourceLinks: [],
        providerConsents: [],
      }),
    );

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.errors[0]?.code).toBe('integration_not_connected');
    expect(outcome.data?.telemetryState).toBe('unavailable');
    expect(outcome.data?.lastSignalAt).not.toBeNull();
    expect(outcome.data?.explanation.stateSummary).toBe('no_provider_link');
  });

  it('flags provider outage separately from missing signals', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(
      makeVehicleRow({
        dimoVehicle: {
          tokenId: 872,
          lastSignal: minutesAgo(2),
          connectionStatus: 'ERROR',
        },
      }),
    );

    const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });

    expect(outcome.data?.telemetryState).toBe('unavailable');
    expect(outcome.data?.explanation.providerOutageLikely).toBe(true);
    expect(outcome.data?.connectivityStatus).toBe('INTEGRATION_ERROR');
    expect(outcome.data?.warnings).toContain('provider_outage_suspected');
  });

  it('blocks execution without fleet.read permission', async () => {
    const outcome = await tool.execute(
      buildContext({ permissions: { fleet: { read: false, write: false } } }),
      { vehicleId: VEHICLE_ID },
    );

    expect(outcome.data).toBeNull();
    expect(outcome.errors[0]?.code).toBe('permission_denied');
  });

  it('returns vehicle_not_found for unknown vehicle id', async () => {
    const outcome = await tool.execute(buildContext(), {
      vehicleId: '00000000-0000-4000-8000-000000000099',
    });

    expect(outcome.data).toBeNull();
    expect(outcome.errors[0]?.code).toBe('vehicle_not_found');
  });

  describe('freshness boundary thresholds', () => {
    it('classifies just under 15 minutes as live', async () => {
      const lastSeenAt = msAgo(TELEMETRY_FRESH_THRESHOLD_MS - 60_000);
      prisma.vehicle.findFirst.mockResolvedValue(
        makeVehicleRow({
          latestState: {
            ...makeVehicleRow().latestState,
            lastSeenAt,
            sourceTimestamp: lastSeenAt,
            providerFetchedAt: lastSeenAt,
            updatedAt: lastSeenAt,
          },
        }),
      );

      const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });
      expect(outcome.data?.freshness).toBe('live');
    });

    it('classifies exactly 15 minutes as standby', async () => {
      const lastSeenAt = msAgo(TELEMETRY_FRESH_THRESHOLD_MS);
      prisma.vehicle.findFirst.mockResolvedValue(
        makeVehicleRow({
          latestState: {
            ...makeVehicleRow().latestState,
            lastSeenAt,
            sourceTimestamp: lastSeenAt,
            providerFetchedAt: lastSeenAt,
            updatedAt: lastSeenAt,
          },
        }),
      );

      const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });
      expect(outcome.data?.freshness).toBe('standby');
    });

    it('classifies just under 24 hours as standby', async () => {
      const lastSeenAt = msAgo(TELEMETRY_STANDBY_THRESHOLD_MS - 60_000);
      prisma.vehicle.findFirst.mockResolvedValue(
        makeVehicleRow({
          latestState: {
            ...makeVehicleRow().latestState,
            lastSeenAt,
            sourceTimestamp: lastSeenAt,
            providerFetchedAt: lastSeenAt,
            updatedAt: lastSeenAt,
          },
        }),
      );

      const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });
      expect(outcome.data?.freshness).toBe('standby');
    });

    it('classifies exactly 24 hours as signal_delayed', async () => {
      const lastSeenAt = msAgo(TELEMETRY_STANDBY_THRESHOLD_MS);
      prisma.vehicle.findFirst.mockResolvedValue(
        makeVehicleRow({
          latestState: {
            ...makeVehicleRow().latestState,
            lastSeenAt,
            sourceTimestamp: lastSeenAt,
            providerFetchedAt: lastSeenAt,
            updatedAt: lastSeenAt,
          },
        }),
      );

      const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });
      expect(outcome.data?.freshness).toBe('signal_delayed');
    });

    it('classifies just under 48 hours as signal_delayed', async () => {
      const lastSeenAt = msAgo(TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS - 60_000);
      prisma.vehicle.findFirst.mockResolvedValue(
        makeVehicleRow({
          latestState: {
            ...makeVehicleRow().latestState,
            lastSeenAt,
            sourceTimestamp: lastSeenAt,
            providerFetchedAt: lastSeenAt,
            updatedAt: lastSeenAt,
          },
        }),
      );

      const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });
      expect(outcome.data?.freshness).toBe('signal_delayed');
    });

    it('classifies exactly 48 hours as offline', async () => {
      const lastSeenAt = msAgo(TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS);
      prisma.vehicle.findFirst.mockResolvedValue(
        makeVehicleRow({
          latestState: {
            ...makeVehicleRow().latestState,
            lastSeenAt,
            sourceTimestamp: lastSeenAt,
            providerFetchedAt: lastSeenAt,
            updatedAt: lastSeenAt,
          },
        }),
      );

      const outcome = await tool.execute(buildContext(), { vehicleId: VEHICLE_ID });
      expect(outcome.data?.freshness).toBe('offline');
    });
  });
});
