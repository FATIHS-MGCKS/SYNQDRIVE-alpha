import { DashboardWarningLightsService } from './dashboard-warning-lights.service';
import type { HmAiHealthCareRawState } from '../../high-mobility/high-mobility-signal-usage.service';

describe('DashboardWarningLightsService', () => {
  const vehicleId = 'veh-1';
  const now = new Date('2026-06-16T12:00:00.000Z');

  const prisma = {
    vehicle: { findUnique: jest.fn().mockResolvedValue({ fuelType: 'PETROL' }) },
  };
  const hm = {
    isHmHealthActive: jest.fn(),
    getLinkedHmVehicleId: jest.fn(),
    getAiHealthCareRawState: jest.fn(),
  };

  const svc = new DashboardWarningLightsService(prisma as any, hm as any);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(now);
    hm.getLinkedHmVehicleId.mockResolvedValue('hm-veh-1');
    prisma.vehicle.findUnique.mockResolvedValue({ fuelType: 'PETROL' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function activeHmRaw(overrides: Partial<HmAiHealthCareRawState> = {}): HmAiHealthCareRawState {
    return {
      signals: {},
      tirePressureStatuses: null,
      lastSuccessAt: now.toISOString(),
      lastErrorAt: null,
      lastErrorMessage: null,
      freshnessStatus: 'fresh',
      hmVehicleId: 'hm-veh-1',
      ...overrides,
    };
  }

  function light(res: Awaited<ReturnType<DashboardWarningLightsService['getDashboardWarningLights']>>, key: string) {
    const l = res.lights.find((x) => x.key === key);
    if (!l) throw new Error(`missing light ${key}`);
    return l;
  }

  it('HM connected + active limp mode → critical block_rental', async () => {
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        signals: {
          'engine.get.limp_mode': { value: true, timestamp: now.toISOString() },
        },
      }),
    );

    const res = await svc.getDashboardWarningLights(vehicleId);
    const limp = light(res, 'engine_limp_mode');
    expect(limp.state).toBe('active');
    expect(limp.severity).toBe('critical');
    expect(limp.rentalImpact).toBe('block_rental');
    expect(res.overallStatus).toBe('critical');
  });

  it('HM connected + oil level low → critical block_rental', async () => {
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        signals: {
          'diagnostics.get.engine_oil_level': { value: 'low', timestamp: now.toISOString() },
        },
      }),
    );

    const oil = light(await svc.getDashboardWarningLights(vehicleId), 'engine_oil_level');
    expect(oil.state).toBe('active');
    expect(oil.severity).toBe('critical');
    expect(oil.rentalImpact).toBe('block_rental');
  });

  it('HM connected + oil level high → warning inspect_before_next_rental', async () => {
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        signals: {
          'diagnostics.get.engine_oil_level': { value: 'high', timestamp: now.toISOString() },
        },
      }),
    );

    const oil = light(await svc.getDashboardWarningLights(vehicleId), 'engine_oil_level');
    expect(oil.state).toBe('active');
    expect(oil.severity).toBe('warning');
    expect(oil.rentalImpact).toBe('inspect_before_next_rental');
  });

  it('HM connected + fresh stream but warn flag null → no_event_yet not off_confirmed', async () => {
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        signals: {
          'engine.get.limp_mode': { value: null, timestamp: now.toISOString() },
        },
      }),
    );

    const limp = light(await svc.getDashboardWarningLights(vehicleId), 'engine_limp_mode');
    expect(limp.state).toBe('no_event_yet');
    expect(limp.state).not.toBe('off_confirmed');
  });

  it('HM not connected → response still present', async () => {
    hm.isHmHealthActive.mockResolvedValue(false);
    hm.getLinkedHmVehicleId.mockResolvedValue(null);

    const res = await svc.getDashboardWarningLights(vehicleId);
    expect(res.connectionStatus).toBe('not_connected');
    expect(res.supportStatus).toBe('not_connected');
    expect(res.freshness).toBe('no_data');
    expect(res.lights.length).toBeGreaterThan(0);
  });

  it('HM health active but no data → no_data', async () => {
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        signals: {},
        lastSuccessAt: null,
        freshnessStatus: 'no_data',
      }),
    );

    const res = await svc.getDashboardWarningLights(vehicleId);
    expect(res.supportStatus).toBe('no_data');
    expect(res.freshness).toBe('no_data');
  });

  it('stale HM data → stale light state', async () => {
    const staleAt = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        lastSuccessAt: staleAt,
        freshnessStatus: 'stale',
        signals: {
          'engine.get.limp_mode': { value: false, timestamp: staleAt },
        },
      }),
    );

    const limp = light(await svc.getDashboardWarningLights(vehicleId), 'engine_limp_mode');
    expect(limp.state).toBe('stale');
    expect((await svc.getDashboardWarningLights(vehicleId)).freshness).toBe('stale');
  });

  it('unsupported signal → unsupported', async () => {
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(activeHmRaw({ signals: {} }));

    const brake = light(await svc.getDashboardWarningLights(vehicleId), 'brake_lining_wear_pre_warning');
    expect(brake.state).toBe('unsupported');
    expect(brake.supported).toBe(false);
  });

  it('explicit false/off → off_confirmed', async () => {
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        signals: {
          'diagnostics.get.brake_lining_wear_pre_warning': { value: false, timestamp: now.toISOString() },
        },
      }),
    );

    const brake = light(await svc.getDashboardWarningLights(vehicleId), 'brake_lining_wear_pre_warning');
    expect(brake.state).toBe('off_confirmed');
  });

  it('stale dashboard_lights battery on → stale not active', async () => {
    const staleAt = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
    const dashboardValue = [{ name: 'battery_low_warning', state: 'on' }];
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        lastSuccessAt: staleAt,
        freshnessStatus: 'stale',
        signals: {
          'dashboard_lights.get.dashboard_lights': { value: dashboardValue, timestamp: staleAt },
        },
      }),
    );

    const res = await svc.getDashboardWarningLights(vehicleId);
    const battery = light(res, 'battery_warning_light');
    expect(battery.state).toBe('stale');
    expect(battery.state).not.toBe('active');
    expect(res.overallStatus).not.toBe('warning');
  });

  it('stale dashboard_lights timestamp with fresh group → battery stale not active', async () => {
    const staleAt = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
    const dashboardValue = [{ name: 'battery_low_warning', state: 'on' }];
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        signals: {
          'dashboard_lights.get.dashboard_lights': { value: dashboardValue, timestamp: staleAt },
        },
      }),
    );

    const battery = light(await svc.getDashboardWarningLights(vehicleId), 'battery_warning_light');
    expect(battery.state).toBe('stale');
    expect(battery.state).not.toBe('active');
  });

  it('stale battery on snapshot → stale with isHistorical not current active', async () => {
    const staleAt = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
    const dashboardValue = [{ name: 'battery_low_warning', state: 'on' }];
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        lastSuccessAt: staleAt,
        freshnessStatus: 'stale',
        signals: {
          'dashboard_lights.get.dashboard_lights': { value: dashboardValue, timestamp: staleAt },
        },
      }),
    );

    const battery = light(await svc.getDashboardWarningLights(vehicleId), 'battery_warning_light');
    expect(battery.state).toBe('stale');
    expect(battery.isHistorical).toBe(true);
    expect(battery.isCurrentActive).toBe(false);
    expect(battery.lastSeenAt).toBe(staleAt);
  });

  it('fresh dashboard_lights battery on → active', async () => {
    const dashboardValue = [{ name: 'battery_low_warning', state: 'on' }];
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        signals: {
          'dashboard_lights.get.dashboard_lights': { value: dashboardValue, timestamp: now.toISOString() },
        },
      }),
    );

    const battery = light(await svc.getDashboardWarningLights(vehicleId), 'battery_warning_light');
    expect(battery.state).toBe('active');
  });

  it('EV battery warning text vs ICE battery warning text', async () => {
    const dashboardValue = [{ name: 'battery_low_warning', state: 'on' }];
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        signals: {
          'dashboard_lights.get.dashboard_lights': { value: dashboardValue, timestamp: now.toISOString() },
        },
      }),
    );

    prisma.vehicle.findUnique.mockResolvedValue({ fuelType: 'ELECTRIC' });
    const ev = light(await svc.getDashboardWarningLights(vehicleId), 'battery_warning_light');
    expect(ev.action).toContain('12V-System');
    expect(ev.action).toContain('DC-DC');

    prisma.vehicle.findUnique.mockResolvedValue({ fuelType: 'PETROL' });
    const ice = light(await svc.getDashboardWarningLights(vehicleId), 'battery_warning_light');
    expect(ice.action).toContain('Ladesystem');
    expect(ice.action).toContain('Lichtmaschine');
  });

  it('HM inactive link → envelope with message, not good', async () => {
    hm.isHmHealthActive.mockResolvedValue(false);
    hm.getLinkedHmVehicleId.mockResolvedValue('hm-veh-1');

    const res = await svc.getDashboardWarningLights(vehicleId);
    expect(res.overallStatus).toBe('unknown');
    expect(res.message).toContain('nicht aktiv');
    expect(res.lights.every((l) => l.state !== 'off_confirmed')).toBe(true);
  });

  it('provider_error when HM fetch failed without success', async () => {
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        lastSuccessAt: null,
        lastErrorMessage: 'MQTT timeout',
        freshnessStatus: 'no_data',
        signals: {},
      }),
    );

    const res = await svc.getDashboardWarningLights(vehicleId);
    expect(res.connectionStatus).toBe('provider_error');
    expect(res.freshness).toBe('error');
    expect(res.overallStatus).not.toBe('good');
  });

  it('brake pre-warning active → warning overall', async () => {
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        signals: {
          'diagnostics.get.brake_lining_wear_pre_warning': { value: true, timestamp: now.toISOString() },
        },
      }),
    );

    const res = await svc.getDashboardWarningLights(vehicleId);
    const brake = light(res, 'brake_lining_wear_pre_warning');
    expect(brake.state).toBe('active');
    expect(brake.severity).toBe('warning');
    expect(res.overallStatus).toBe('warning');
  });

  it('tire pressure ALERT → critical overall', async () => {
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        tirePressureStatuses: { FL: 'ALERT', FR: 'OK' },
      }),
    );

    const res = await svc.getDashboardWarningLights(vehicleId);
    expect(light(res, 'tire_pressure_warning').severity).toBe('critical');
    expect(res.overallStatus).toBe('critical');
  });

  it('mixed unsupported + off_confirmed is not good', async () => {
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(
      activeHmRaw({
        signals: {
          'diagnostics.get.brake_lining_wear_pre_warning': { value: false, timestamp: now.toISOString() },
        },
      }),
    );

    const res = await svc.getDashboardWarningLights(vehicleId);
    expect(res.overallStatus).toBe('unknown');
  });

  it('limp mode label is Motorwarnung / Notlauf', async () => {
    hm.isHmHealthActive.mockResolvedValue(true);
    hm.getAiHealthCareRawState.mockResolvedValue(activeHmRaw({ signals: {} }));
    const limp = light(await svc.getDashboardWarningLights(vehicleId), 'engine_limp_mode');
    expect(limp.label).toBe('Motorwarnung / Notlauf');
  });
});

