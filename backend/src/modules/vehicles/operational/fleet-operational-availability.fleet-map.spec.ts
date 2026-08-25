import { VehicleStatus } from '@prisma/client';
import {
  FLEET_OPERATIONAL_AVAILABILITY_UNKNOWN,
  toFleetOperationalAvailabilityDto,
} from './fleet-operational-availability.dto';
import {
  makeOperationalPrismaMocks,
  makeOperationalVehiclesService,
  makeVehicleRow,
} from './vehicle-operational-state-v2.test-helpers';
import type { VehicleOperationalProjection } from './projection/vehicle-operational-projection.types';
import { OperationalAvailabilityState } from './projection/vehicle-operational-projection.types';
import {
  fixtureHmueC215,
  fixtureWobL7503,
  fixtureWobL9755,
} from './projection/vehicle-operational-projection.fixtures';
import { buildVehicleOperationalProjection } from './projection/vehicle-operational-projection.builder';

const ORG_ID = 'org-fleet-p03';

type ProjectionFixture = {
  vehicleId: string;
  businessState: import('./projection/vehicle-operational-projection.types').BusinessOperationalState;
  connectivity: import('../connectivity/domain/connectivity-domain.types').VehicleConnectivityRuntimeState;
  health?: import('./projection/vehicle-operational-projection.types').HealthEvidenceSnapshot;
  episodeEvidenceReliable: boolean;
};

function projectionFromFixture(fixture: ProjectionFixture): VehicleOperationalProjection {
  return buildVehicleOperationalProjection({
    vehicleId: fixture.vehicleId,
    organizationId: ORG_ID,
    businessState: fixture.businessState,
    connectivity: fixture.connectivity,
    health: fixture.health ?? null,
    episodeEvidenceReliable: fixture.episodeEvidenceReliable,
    generatedAt: fixture.connectivity.calculatedAt,
  });
}

function projectionWithAvailability(
  fixture: ProjectionFixture,
  state: (typeof OperationalAvailabilityState)[keyof typeof OperationalAvailabilityState],
): VehicleOperationalProjection {
  const projection = projectionFromFixture(fixture);
  return { ...projection, operationalAvailability: state };
}

function makeFleetMapService(options: {
  vehicles?: ReturnType<typeof makeVehicleRow>[];
  projections?: Map<string, VehicleOperationalProjection>;
  projectionError?: Error;
}) {
  const vehicles = options.vehicles ?? [makeVehicleRow()];
  const getVehicleProjections = jest.fn().mockImplementation(async () => {
    if (options.projectionError) throw options.projectionError;
    return options.projections ?? new Map();
  });
  const getVehicleProjection = jest.fn();

  const service = makeOperationalVehiclesService({
    prisma: makeOperationalPrismaMocks({
      vehicle: {
        findMany: jest.fn().mockResolvedValue(vehicles),
      },
      booking: { findMany: jest.fn().mockResolvedValue([]) },
    }),
    redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn() },
    operationalProjection: { getVehicleProjections, getVehicleProjection },
  });

  return { service, getVehicleProjections, getVehicleProjection };
}

describe('Fleet operational availability — fleet-map (P0.3)', () => {
  const NOW = new Date('2026-08-25T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('A1 — fleet-map consumes P0.2 batch projection', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-batch' });
    const projection = projectionFromFixture(fixtureWobL7503());
    const { service, getVehicleProjections } = makeFleetMapService({
      vehicles: [vehicle],
      projections: new Map([[vehicle.id, projection]]),
    });

    const rows = await service.getFleetMapData(ORG_ID);

    expect(getVehicleProjections).toHaveBeenCalledTimes(1);
    expect(getVehicleProjections).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      vehicleIds: [vehicle.id],
    });
    expect(rows[0].operationalAvailability).toEqual(
      toFleetOperationalAvailabilityDto(projection),
    );
  });

  it('A2 — business AVAILABLE + P0.2 AVAILABLE → operationalAvailability AVAILABLE', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-available', status: VehicleStatus.AVAILABLE });
    const projection = buildVehicleOperationalProjection({
      vehicleId: vehicle.id,
      organizationId: ORG_ID,
      businessState: 'AVAILABLE',
      connectivity: fixtureWobL7503().connectivity,
      health: fixtureWobL7503().health,
      episodeEvidenceReliable: true,
      generatedAt: NOW.toISOString(),
    });
    projection.operationalAvailability = 'AVAILABLE';

    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projections: new Map([[vehicle.id, projection]]),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].status).toBe('Available');
    expect(rows[0].operationalAvailability?.state).toBe('AVAILABLE');
  });

  it('A3 — business AVAILABLE + NEEDS_VERIFICATION preserves business status', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-verify', status: VehicleStatus.AVAILABLE });
    const projection = projectionFromFixture(fixtureWobL7503());
    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projections: new Map([[vehicle.id, projection]]),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].status).toBe('Available');
    expect(rows[0].operationalState?.status).toBe('AVAILABLE');
    expect(rows[0].operationalAvailability?.state).toBe('NEEDS_VERIFICATION');
  });

  it('A4 — P0.2 UNKNOWN → fleet operational field UNKNOWN', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-unknown', status: VehicleStatus.AVAILABLE });
    const projection = projectionWithAvailability(fixtureHmueC215(), OperationalAvailabilityState.UNKNOWN);
    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projections: new Map([[vehicle.id, projection]]),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].operationalAvailability?.state).toBe('UNKNOWN');
  });

  it('A5 — P0.2 UNAVAILABLE → fleet operational field UNAVAILABLE', async () => {
    const vehicle = makeVehicleRow({
      id: 'veh-blocked',
      status: VehicleStatus.OUT_OF_SERVICE,
    });
    const projection = buildVehicleOperationalProjection({
      vehicleId: vehicle.id,
      organizationId: ORG_ID,
      businessState: 'OUT_OF_SERVICE',
      connectivity: fixtureWobL7503().connectivity,
      health: fixtureWobL7503().health,
      episodeEvidenceReliable: true,
      generatedAt: NOW.toISOString(),
    });

    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projections: new Map([[vehicle.id, projection]]),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].operationalAvailability?.state).toBe('UNAVAILABLE');
  });

  it('A6 — projection service failure → UNKNOWN fallback (not AVAILABLE)', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-fail', status: VehicleStatus.AVAILABLE });
    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projectionError: new Error('projection unavailable'),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].status).toBe('Available');
    expect(rows[0].operationalAvailability?.state).toBe('UNKNOWN');
    expect(rows[0].operationalAvailability?.state).not.toBe('AVAILABLE');
  });

  it('A7 — batch path does not call single projection per row', async () => {
    const vehicles = [
      makeVehicleRow({ id: 'veh-1' }),
      makeVehicleRow({ id: 'veh-2', licensePlate: 'WOB L 9755' }),
      makeVehicleRow({ id: 'veh-3', licensePlate: 'HMÜ C 215' }),
    ];
    const projections = new Map([
      [vehicles[0].id, projectionFromFixture(fixtureWobL7503())],
      [vehicles[1].id, projectionFromFixture(fixtureWobL9755())],
      [vehicles[2].id, projectionWithAvailability(fixtureHmueC215(), OperationalAvailabilityState.UNKNOWN)],
    ]);
    const { service, getVehicleProjections, getVehicleProjection } = makeFleetMapService({
      vehicles,
      projections,
    });

    await service.getFleetMapData(ORG_ID);

    expect(getVehicleProjections).toHaveBeenCalledTimes(1);
    expect(getVehicleProjection).not.toHaveBeenCalled();
  });

  it('production semantic fixtures — WOB L 7503 / 9755 NEEDS_VERIFICATION, HMÜ UNKNOWN', async () => {
    const wob7503 = makeVehicleRow({ id: fixtureWobL7503().vehicleId, licensePlate: 'WOB L 7503' });
    const wob9755 = makeVehicleRow({ id: fixtureWobL9755().vehicleId, licensePlate: 'WOB L 9755' });
    const hmue = makeVehicleRow({ id: fixtureHmueC215().vehicleId, licensePlate: 'HMÜ C 215' });
    const projections = new Map([
      [wob7503.id, projectionFromFixture(fixtureWobL7503())],
      [wob9755.id, projectionFromFixture(fixtureWobL9755())],
      [hmue.id, projectionWithAvailability(fixtureHmueC215(), OperationalAvailabilityState.UNKNOWN)],
    ]);
    const { service } = makeFleetMapService({
      vehicles: [wob7503, wob9755, hmue],
      projections,
    });

    const rows = await service.getFleetMapData(ORG_ID);
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(wob7503.id)?.operationalAvailability?.state).toBe('NEEDS_VERIFICATION');
    expect(byId.get(wob9755.id)?.operationalAvailability?.state).toBe('NEEDS_VERIFICATION');
    expect(byId.get(hmue.id)?.operationalAvailability?.state).toBe('UNKNOWN');
    expect(byId.get(wob7503.id)?.status).toBe('Available');
    expect(byId.get(hmue.id)?.status).toBe('Available');
  });

  it('missing per-vehicle projection entry → UNKNOWN fallback', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-missing-projection' });
    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projections: new Map(),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].operationalAvailability?.state).toBe(
      FLEET_OPERATIONAL_AVAILABILITY_UNKNOWN.state,
    );
  });
});
