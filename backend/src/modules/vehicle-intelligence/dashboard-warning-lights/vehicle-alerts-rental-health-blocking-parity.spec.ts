import { DashboardWarningLightsService } from './dashboard-warning-lights.service';
import {
  projectVehicleAlertsToRentalHealth,
  vehicleAlertBlockingCausesToReasons,
} from './vehicle-alerts-rental-health.projector';
import { RentalHealthService } from '../../rental-health/rental-health.service';
import { resolveRentalBlockedState } from '../../rental-health/rental-health.types';

describe('Vehicle alerts rental-health blocking parity (P2.2A)', () => {
  const vehicleId = 'veh-parity';
  const now = new Date('2026-06-16T12:00:00.000Z');

  const prisma = {
    vehicle: { findUnique: jest.fn().mockResolvedValue({ fuelType: 'PETROL' }) },
  };
  const hm = {
    isHmHealthActive: jest.fn(),
    getLinkedHmVehicleId: jest.fn(),
    getAiHealthCareRawState: jest.fn(),
  };

  const dwl = new DashboardWarningLightsService(prisma as any, hm as any);

  const collectBlockingReasons = (
    modules: any,
    blockingCauses: ReturnType<typeof projectVehicleAlertsToRentalHealth>['blockingCauses'],
  ) =>
    (new RentalHealthService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      undefined,
      dwl,
    ) as any).collectBlockingReasons(
      modules,
      [],
      blockingCauses,
      { tuvBokraft: { tuvOverdue: false, bokraftOverdue: false } },
      null,
      null,
      null,
      [],
      null,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(now);
    hm.getLinkedHmVehicleId.mockResolvedValue('hm-1');
    hm.isHmHealthActive.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function activeHmRaw(signals: Record<string, { value: unknown; timestamp?: string }>) {
    return {
      signals,
      tirePressureStatuses: null,
      lastSuccessAt: now.toISOString(),
      lastErrorAt: null,
      lastErrorMessage: null,
      freshnessStatus: 'fresh' as const,
      hmVehicleId: 'hm-1',
    };
  }

  async function projectFromHm(signals: Record<string, { value: unknown; timestamp?: string }>) {
    hm.getAiHealthCareRawState.mockResolvedValue(activeHmRaw(signals));
    const envelope = await dwl.getDashboardWarningLights(vehicleId);
    return projectVehicleAlertsToRentalHealth(envelope);
  }

  it('limp active → vehicle_alerts critical → blocking → rental_blocked true', async () => {
    const projection = await projectFromHm({
      'engine.get.limp_mode': { value: true, timestamp: now.toISOString() },
      'diagnostics.get.engine_oil_level': { value: 'ok', timestamp: now.toISOString() },
    });

    const modules = {
      vehicle_alerts: projection.moduleHealth,
      service_compliance: { state: 'good' },
      brakes: { state: 'good' },
      tires: { state: 'good' },
      error_codes: { state: 'good' },
      battery: { state: 'good' },
      complaints: { state: 'good' },
    };
    const blocking_reasons = collectBlockingReasons(modules, projection.blockingCauses);
    const rental_blocked = resolveRentalBlockedState('ready', blocking_reasons);

    expect(projection.moduleHealth.state).toBe('critical');
    expect(blocking_reasons).toContain('Limp Mode aktiv');
    expect(rental_blocked).toBe(true);
  });

  it('oil low → vehicle_alerts critical → blocking → rental_blocked true', async () => {
    const projection = await projectFromHm({
      'engine.get.limp_mode': { value: false, timestamp: now.toISOString() },
      'diagnostics.get.engine_oil_level': { value: 'low', timestamp: now.toISOString() },
    });

    const modules = {
      vehicle_alerts: projection.moduleHealth,
      service_compliance: { state: 'good' },
      brakes: { state: 'good' },
      tires: { state: 'good' },
      error_codes: { state: 'good' },
      battery: { state: 'good' },
      complaints: { state: 'good' },
    };
    const blocking_reasons = collectBlockingReasons(modules, projection.blockingCauses);
    const rental_blocked = resolveRentalBlockedState('ready', blocking_reasons);

    expect(projection.moduleHealth.state).toBe('critical');
    expect(blocking_reasons).toContain('Motoröl Minimum');
    expect(rental_blocked).toBe(true);
  });

  it('oil high → warning module, no hard blocking reason', async () => {
    const projection = await projectFromHm({
      'engine.get.limp_mode': { value: false, timestamp: now.toISOString() },
      'diagnostics.get.engine_oil_level': { value: 'high', timestamp: now.toISOString() },
    });

    const blocking_reasons = vehicleAlertBlockingCausesToReasons(projection.blockingCauses);
    const rental_blocked = resolveRentalBlockedState('ready', blocking_reasons);

    expect(projection.moduleHealth.state).toBe('warning');
    expect(blocking_reasons).toHaveLength(0);
    expect(rental_blocked).toBe(false);
  });

  it('multi-cause limp + oil low → both blocking reasons', async () => {
    const projection = await projectFromHm({
      'engine.get.limp_mode': { value: true, timestamp: now.toISOString() },
      'diagnostics.get.engine_oil_level': { value: 'minimum', timestamp: now.toISOString() },
    });

    const reasons = vehicleAlertBlockingCausesToReasons(projection.blockingCauses);
    expect(reasons).toEqual(expect.arrayContaining(['Limp Mode aktiv', 'Motoröl Minimum']));
    expect(reasons).toHaveLength(2);
  });
});
