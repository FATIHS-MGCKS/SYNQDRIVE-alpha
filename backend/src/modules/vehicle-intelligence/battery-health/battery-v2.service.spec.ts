import { BatteryV2Service } from './battery-v2.service';
import {
  BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV,
  BATTERY_V2_START_PROXY_ENV,
} from '../../../config/battery-health-v2.config';

describe('BatteryV2Service crank deprecation', () => {
  const tripStartAt = new Date('2026-07-15T08:00:00.000Z');

  const buildService = () => {
    const prisma = {
      batteryFeatures: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      vehicleTripDetectionState: { findUnique: jest.fn() },
    } as any;

    const segments = {
      fetchCrankWindow: jest.fn().mockResolvedValue([
        { timestamp: '2026-07-15T07:59:50.000Z', voltage: 12.5, rpm: 0 },
        { timestamp: '2026-07-15T08:00:00.000Z', voltage: 10.2, rpm: 800 },
        { timestamp: '2026-07-15T08:00:05.000Z', voltage: 12.1, rpm: 1200 },
      ]),
    } as any;

    const batteryHealth = { recordSnapshot: jest.fn() } as any;

    const svc = new BatteryV2Service(prisma, segments, batteryHealth);
    return { svc, prisma, segments };
  };

  const originalLegacy = process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV];
  const originalProxy = process.env[BATTERY_V2_START_PROXY_ENV];

  afterEach(() => {
    if (originalLegacy === undefined) delete process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV];
    else process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV] = originalLegacy;
    if (originalProxy === undefined) delete process.env[BATTERY_V2_START_PROXY_ENV];
    else process.env[BATTERY_V2_START_PROXY_ENV] = originalProxy;
  });

  it('does not recompute health or write crankDrop on trip start by default', async () => {
    process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV] = 'false';
    process.env[BATTERY_V2_START_PROXY_ENV] = 'false';
    const { svc, prisma, segments } = buildService();

    await svc.onTripStart('veh-1', 123, 'trip-1', tripStartAt);

    expect(segments.fetchCrankWindow).not.toHaveBeenCalled();
    expect(prisma.batteryFeatures.upsert).not.toHaveBeenCalled();
  });

  it('collects start window diagnostically without crank health effect when proxy flag is on', async () => {
    process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV] = 'false';
    process.env[BATTERY_V2_START_PROXY_ENV] = 'true';
    const { svc, prisma } = buildService();
    prisma.batteryFeatures.upsert.mockResolvedValue({
      vehicleId: 'veh-1',
      crankTripId: 'trip-1',
      vPreCrank: 12.5,
      vMinCrank: 10.2,
      crankDrop: null,
      crankObservationCount: 0,
      qualifiedEventCount: 0,
      restObservationCount: 0,
      publicationState: 'INITIAL_CALIBRATION',
      ewmaAlpha: 0.25,
      outlierSuppressedCount: 0,
    });

    const recomputeSpy = jest.spyOn(svc as any, 'recomputeHealth');

    await svc.onTripStart('veh-1', 123, 'trip-1', tripStartAt);

    expect(prisma.batteryFeatures.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({ crankDrop: expect.anything() }),
      }),
    );
    expect(recomputeSpy).not.toHaveBeenCalled();
  });

  it('still runs legacy crank assessment only when explicitly enabled', async () => {
    process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV] = 'true';
    process.env[BATTERY_V2_START_PROXY_ENV] = 'false';
    const { svc, prisma } = buildService();
    prisma.batteryFeatures.upsert.mockResolvedValue({
      vehicleId: 'veh-1',
      crankDrop: 2.3,
      vOff60m: null,
      vOff6h: null,
      crankObservationCount: 0,
      qualifiedEventCount: 0,
      restObservationCount: 0,
      publicationState: 'INITIAL_CALIBRATION',
      ewmaAlpha: 0.25,
      outlierSuppressedCount: 0,
    });
    prisma.batteryFeatures.findUnique.mockResolvedValue({
      vehicleId: 'veh-1',
      crankObservationCount: 0,
      qualifiedEventCount: 0,
      restObservationCount: 0,
      publicationState: 'INITIAL_CALIBRATION',
      ewmaAlpha: 0.25,
      outlierSuppressedCount: 0,
      stabilizedSohPct: null,
      publishedSohPct: null,
      lastPublishedAt: null,
      firstUsableMeasurementAt: null,
    });
    prisma.vehicleBatterySpec = {
      findMany: jest.fn().mockResolvedValue([
        { batteryType: 'LEAD_ACID', batteryVolt: 12, sourceConfidence: 0.9 },
      ]),
    };
    prisma.batteryFeatures.update.mockResolvedValue({});

    const recomputeSpy = jest.spyOn(svc as any, 'recomputeHealth').mockResolvedValue(undefined);

    await svc.onTripStart('veh-1', 123, 'trip-1', tripStartAt);

    expect(recomputeSpy).toHaveBeenCalledWith(
      'veh-1',
      expect.any(Object),
      expect.objectContaining({ newCrankObservation: true }),
    );
  });

  it('computeHealth ignores crank weight when legacy assessment is disabled', () => {
    process.env[BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENV] = 'false';
    const { svc } = buildService();
    const leadAcid = { leadAcidCurveAllowed: true };
    const withCrank = (svc as any).computeHealth(
      {
        vOff60m: 12.6,
        vOff6h: null,
        deltaVRest: null,
        vPreCrank: 12.5,
        vMinCrank: 9.8,
        crankDrop: 2.7,
        vRecovery5s: 12.4,
        vRecovery30s: null,
      },
      leadAcid,
    );
    const restOnly = (svc as any).computeHealth(
      {
        vOff60m: 12.6,
        vOff6h: null,
        deltaVRest: null,
        vPreCrank: null,
        vMinCrank: null,
        crankDrop: null,
        vRecovery5s: null,
        vRecovery30s: null,
      },
      leadAcid,
    );
    expect(withCrank.soh).toBe(restOnly.soh);
  });

  it('computeHealth returns insufficient_data when lead-acid curve is not applicable', () => {
    const { svc } = buildService();
    const result = (svc as any).computeHealth(
      {
        vOff60m: 12.6,
        vOff6h: null,
        deltaVRest: null,
        vPreCrank: null,
        vMinCrank: null,
        crankDrop: null,
        vRecovery5s: null,
        vRecovery30s: null,
      },
      { leadAcidCurveAllowed: false },
    );
    expect(result.soh).toBeNull();
    expect(result.confidence).toBe('insufficient_data');
  });

  it('onSnapshot captures rest without legacy scoring', async () => {
    const { svc, prisma } = buildService();
    const now = Date.now();
    const restStart = new Date(now - 70 * 60_000);
    const sampleAt = new Date(now - 5_000);

    prisma.vehicleTripDetectionState.findUnique.mockResolvedValue({
      state: 'RESTING',
      lastActivityAt: restStart,
    });
    prisma.batteryFeatures.findUnique.mockResolvedValue({
      restWindowStartedAt: restStart,
      rest60mCapturedAt: null,
      rest6hCapturedAt: null,
      vOff60m: null,
    });
    prisma.batteryFeatures.update.mockResolvedValue({
      vOff60m: 12.55,
      vOff6h: null,
    });

    const recomputeSpy = jest.spyOn(svc as any, 'recomputeHealth');

    const result = await svc.onSnapshot('veh-1', 12.55, sampleAt);

    expect(result.restCaptured).toBe(true);
    expect(result.capturedAt).toEqual(sampleAt);
    expect(recomputeSpy).not.toHaveBeenCalled();
  });
});
