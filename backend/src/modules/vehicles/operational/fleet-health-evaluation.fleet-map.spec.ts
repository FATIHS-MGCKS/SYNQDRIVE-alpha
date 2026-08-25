import { VehicleStatus } from '@prisma/client';
import {
  toFleetHealthEvaluationDto,
  FLEET_HEALTH_EVALUATION_UNKNOWN,
} from './fleet-health-evaluation.dto';
import {
  makeOperationalPrismaMocks,
  makeOperationalVehiclesService,
  makeVehicleRow,
} from './vehicle-operational-state-v2.test-helpers';
import type { VehicleOperationalProjection } from './projection/vehicle-operational-projection.types';
import {
  HealthEvaluabilityState,
  OperationalAvailabilityState,
} from './projection/vehicle-operational-projection.types';
import { healthEvidenceFromVehicleHealth } from './projection/health-evidence.adapter';
import { buildVehicleOperationalProjection } from './projection/vehicle-operational-projection.builder';
import {
  fixtureHmueC215,
  fixtureWobL7503,
  fixtureWobL9755,
  syntheticCurrentHealthEvidence,
} from './projection/vehicle-operational-projection.fixtures';
import type { VehicleHealth } from '../../rental-health/rental-health.types';
import {
  RENTAL_HEALTH_MODULE_KEYS,
  computeOverallState,
  finalizeVehicleHealthAvailability,
  type ModuleHealth,
  type RentalHealthModuleKey,
} from '../../rental-health/rental-health.types';

const ORG_ID = 'org-fleet-p04';
const NOW = '2026-08-25T12:00:00.000Z';

function moduleHealth(
  state: ModuleHealth['state'],
  overrides: Partial<ModuleHealth> = {},
): ModuleHealth {
  return {
    state,
    reason: overrides.reason ?? 'test',
    last_updated_at: overrides.last_updated_at ?? NOW,
    data_stale: overrides.data_stale ?? false,
    ...overrides,
  };
}

/** Canonical ICE-like Rental Health: telemetry modules n_a; service paths current. */
function iceTelemetryModulesNotApplicableHealth(): VehicleHealth {
  const modules = Object.fromEntries(
    RENTAL_HEALTH_MODULE_KEYS.map((key: RentalHealthModuleKey) => {
      const telemetryKeys = new Set<RentalHealthModuleKey>([
        'battery',
        'tires',
        'brakes',
        'error_codes',
        'vehicle_alerts',
      ]);
      return [
        key,
        telemetryKeys.has(key)
          ? moduleHealth('n_a', { reason: 'Nicht unterstützt' })
          : moduleHealth('good'),
      ];
    }),
  ) as VehicleHealth['modules'];
  const { modules: withAvailability, availability } = finalizeVehicleHealthAvailability(
    modules,
    {},
  );
  return {
    vehicle_id: 'veh-ice-na',
    organization_id: ORG_ID,
    overall_state: computeOverallState(Object.values(withAvailability)),
    availability,
    rental_blocked: false,
    blocking_reasons: [],
    modules: withAvailability,
    generated_at: NOW,
    evaluated_at: NOW,
  };
}

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

describe('Fleet health evaluation — fleet-map (P0.4)', () => {
  const NOW = new Date('2026-08-25T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('B1 — Health EVALUABLE + GOOD → condition good, evaluability EVALUABLE', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-good' });
    const projection = buildVehicleOperationalProjection({
      vehicleId: vehicle.id,
      organizationId: ORG_ID,
      businessState: 'AVAILABLE',
      connectivity: fixtureHmueC215().connectivity,
      health: syntheticCurrentHealthEvidence({ conditionState: 'good' }),
      episodeEvidenceReliable: true,
      generatedAt: NOW.toISOString(),
    });

    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projections: new Map([[vehicle.id, projection]]),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].healthEvaluation).toEqual(toFleetHealthEvaluationDto(projection));
    expect(rows[0].healthEvaluation?.condition).toBe('good');
    expect(rows[0].healthEvaluation?.evaluability).toBe(HealthEvaluabilityState.EVALUABLE);
  });

  it('B2 — Health EVALUABLE + CRITICAL → condition critical', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-critical' });
    const projection = buildVehicleOperationalProjection({
      vehicleId: vehicle.id,
      organizationId: ORG_ID,
      businessState: 'AVAILABLE',
      connectivity: fixtureHmueC215().connectivity,
      health: syntheticCurrentHealthEvidence({ conditionState: 'critical' }),
      episodeEvidenceReliable: true,
      generatedAt: NOW.toISOString(),
    });

    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projections: new Map([[vehicle.id, projection]]),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].healthEvaluation?.condition).toBe('critical');
    expect(rows[0].healthEvaluation?.evaluability).toBe(HealthEvaluabilityState.EVALUABLE);
  });

  it('B3 — stale previous GOOD + NOT_EVALUABLE → not presented as evaluable good', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-stale-good', healthStatus: 'GOOD' });
    const projection = projectionFromFixture(fixtureWobL7503());

    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projections: new Map([[vehicle.id, projection]]),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].healthEvaluation?.evaluability).toBe(HealthEvaluabilityState.NOT_EVALUABLE);
    expect(rows[0].healthEvaluation?.evaluability).not.toBe(HealthEvaluabilityState.EVALUABLE);
    expect(rows[0].healthStatus).toBe('Good Health');
  });

  it('B4 — Health UNKNOWN + business AVAILABLE → health UNKNOWN, business unaffected', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-h-unknown', status: VehicleStatus.AVAILABLE });
    const projection = projectionFromFixture(fixtureHmueC215());

    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projections: new Map([[vehicle.id, projection]]),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].status).toBe('Available');
    expect(rows[0].operationalState?.status).toBe('AVAILABLE');
    expect(rows[0].healthEvaluation?.evaluability).toBe(HealthEvaluabilityState.UNKNOWN);
  });

  it('B5 — connectivity OFFLINE + stale health evidence → conservative evaluability', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-offline-stale' });
    const projection = projectionFromFixture(fixtureWobL9755());

    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projections: new Map([[vehicle.id, projection]]),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].healthEvaluation?.evaluability).toBe(HealthEvaluabilityState.NOT_EVALUABLE);
    expect(rows[0].healthEvaluation?.evaluability).not.toBe(HealthEvaluabilityState.EVALUABLE);
    expect(rows[0].operationalAvailability?.state).toBe(
      OperationalAvailabilityState.NEEDS_VERIFICATION,
    );
  });

  it('B6 — connectivity healthy + no health evidence → UNKNOWN, not good', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-no-health' });
    const projection = projectionFromFixture(fixtureHmueC215());

    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projections: new Map([[vehicle.id, projection]]),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].healthEvaluation?.evaluability).toBe(HealthEvaluabilityState.UNKNOWN);
    expect(rows[0].healthEvaluation?.condition).toBe('unknown');
  });

  it('B7 — projection loader failure → UNKNOWN fallback, not good', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-loader-fail', healthStatus: 'GOOD' });
    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projectionError: new Error('projection unavailable'),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].healthEvaluation?.evaluability).toBe('UNKNOWN');
    expect(rows[0].healthEvaluation?.condition).toBe('unknown');
    expect(rows[0].healthEvaluation?.evaluability).not.toBe('EVALUABLE');
  });

  it('B8 — batch path reuses single P0.2 projection call', async () => {
    const vehicles = [
      makeVehicleRow({ id: 'veh-1' }),
      makeVehicleRow({ id: 'veh-2', licensePlate: 'WOB L 9755' }),
    ];
    const projections = new Map([
      [vehicles[0].id, projectionFromFixture(fixtureWobL7503())],
      [vehicles[1].id, projectionFromFixture(fixtureWobL9755())],
    ]);
    const { service, getVehicleProjections, getVehicleProjection } = makeFleetMapService({
      vehicles,
      projections,
    });

    await service.getFleetMapData(ORG_ID);

    expect(getVehicleProjections).toHaveBeenCalledTimes(1);
    expect(getVehicleProjection).not.toHaveBeenCalled();
  });

  it('B9 — non-applicable telemetry Health modules do not reduce evaluability', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-ice' });
    const rentalHealth = iceTelemetryModulesNotApplicableHealth();
    const healthEvidence = healthEvidenceFromVehicleHealth(rentalHealth);
    expect(healthEvidence.telemetryDependentModulesEvaluated).toBe(false);

    const projection = buildVehicleOperationalProjection({
      vehicleId: vehicle.id,
      organizationId: ORG_ID,
      businessState: 'AVAILABLE',
      connectivity: fixtureHmueC215().connectivity,
      health: healthEvidence,
      episodeEvidenceReliable: true,
      generatedAt: NOW,
    });

    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projections: new Map([[vehicle.id, projection]]),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].healthEvaluation?.evaluability).toBe(HealthEvaluabilityState.EVALUABLE);
    expect(rows[0].healthEvaluation?.condition).toBe('good');
    expect(rows[0].healthEvaluation?.pipelineAvailability).toBe('ready');
  });

  it('production semantic fixtures — long-offline vehicles not EVALUABLE+good', async () => {
    const wob7503 = makeVehicleRow({
      id: fixtureWobL7503().vehicleId,
      licensePlate: 'WOB L 7503',
      healthStatus: 'GOOD',
    });
    const wob9755 = makeVehicleRow({
      id: fixtureWobL9755().vehicleId,
      licensePlate: 'WOB L 9755',
      healthStatus: 'GOOD',
    });
    const hmue = makeVehicleRow({
      id: fixtureHmueC215().vehicleId,
      licensePlate: 'HMÜ C 215',
      healthStatus: 'GOOD',
    });
    const projections = new Map([
      [wob7503.id, projectionFromFixture(fixtureWobL7503())],
      [wob9755.id, projectionFromFixture(fixtureWobL9755())],
      [hmue.id, projectionFromFixture(fixtureHmueC215())],
    ]);
    const { service } = makeFleetMapService({
      vehicles: [wob7503, wob9755, hmue],
      projections,
    });

    const rows = await service.getFleetMapData(ORG_ID);
    const byId = new Map(rows.map((row) => [row.id, row]));

    for (const id of [wob7503.id, wob9755.id, hmue.id]) {
      const evaluation = byId.get(id)?.healthEvaluation;
      expect(evaluation?.evaluability === 'EVALUABLE' && evaluation?.condition === 'good').toBe(
        false,
      );
    }
  });

  it('missing per-vehicle projection entry → UNKNOWN fallback with shared generatedAt', async () => {
    const vehicle = makeVehicleRow({ id: 'veh-missing-health' });
    const { service } = makeFleetMapService({
      vehicles: [vehicle],
      projections: new Map(),
    });

    const rows = await service.getFleetMapData(ORG_ID);
    expect(rows[0].healthEvaluation?.evaluability).toBe(FLEET_HEALTH_EVALUATION_UNKNOWN.evaluability);
    expect(rows[0].healthEvaluation?.generatedAt).toBe(NOW.toISOString());
  });
});
