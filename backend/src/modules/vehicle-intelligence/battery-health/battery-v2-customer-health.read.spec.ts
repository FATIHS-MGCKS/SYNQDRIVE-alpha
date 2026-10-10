import { SohPublicationState } from '@prisma/client';
import {
  buildBatteryV2CustomerHealthReadModel,
  presentBatteryV2CustomerHealthPayload,
} from './battery-v2-customer-health.read';

describe('buildBatteryV2CustomerHealthReadModel', () => {
  const envBackup = { ...process.env };
  const now = new Date('2026-04-13T10:00:00.000Z');

  const baseFeatures = {
    vehicleId: 'veh-1',
    publicationState: SohPublicationState.STABLE,
    publishedSohPct: 80,
    maturityConfidence: 'high',
    vOff60m: 12.62,
    vOff6h: 12.6,
    rest60mCapturedAt: new Date('2026-04-13T06:00:00.000Z'),
    rest6hCapturedAt: new Date('2026-04-13T09:00:00.000Z'),
    crankDrop: null,
    crankObservationCount: 0,
    crankAt: new Date('2026-04-13T05:55:00.000Z'),
    scoredAt: now,
    lastPublishedAt: now,
    estimatedSocPct: 95,
    estimatedSohPct: 78,
    confidence: 'high',
    badge: 'healthy',
    deltaVRest: null,
    restWindowStartedAt: null,
    vPreCrank: null,
    vMinCrank: null,
    vRecovery5s: null,
    vRecovery30s: null,
    crankTripId: null,
  } as any;

  afterEach(() => {
    process.env = { ...envBackup };
  });

  const prisma = {
    vehicleBatterySpec: { findMany: jest.fn() },
    batteryEvidence: { findMany: jest.fn() },
  } as any;

  beforeEach(() => {
    prisma.vehicleBatterySpec.findMany.mockResolvedValue([
      {
        batteryType: 'AGM',
        batteryVolt: 12,
        sourceConfidence: 0.9,
        createdAt: now,
      },
    ]);
    prisma.batteryEvidence.findMany.mockResolvedValue([]);
  });

  it('exposes user-facing SOH when publication on and supported chemistry present', async () => {
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'true';
    const model = await buildBatteryV2CustomerHealthReadModel(prisma, baseFeatures);
    expect(model.userFacingSohPct).toBe(80);
    expect(model.estimatedLvHealthScore).toBe(80);
    expect(model).not.toHaveProperty('publishedSohPct');
    expect(model).not.toHaveProperty('rawSohPct');
  });

  it('masks SOH when chemistry spec is missing (fail-closed)', async () => {
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'true';
    prisma.vehicleBatterySpec.findMany.mockResolvedValue([]);
    const model = await buildBatteryV2CustomerHealthReadModel(prisma, baseFeatures);
    expect(model.userFacingSohPct).toBeNull();
    expect(model.badge).toBe('unknown');
    expect(model.legacyPublicationSafety.decisionCapable).toBe(false);
  });

  it('masks SOH when publication is off', async () => {
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'false';
    const model = await buildBatteryV2CustomerHealthReadModel(prisma, baseFeatures);
    expect(model.userFacingSohPct).toBeNull();
  });

  it('API payload omits raw publishedSohPct', async () => {
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'true';
    const model = await buildBatteryV2CustomerHealthReadModel(prisma, baseFeatures);
    const payload = presentBatteryV2CustomerHealthPayload(model);
    expect(payload).not.toHaveProperty('publishedSohPct');
    expect(payload).not.toHaveProperty('rawSohPct');
    expect(payload.estimatedSohPct).toBe(80);
  });

  it('masks SOH when rest evidence is contaminated', async () => {
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'true';
    const model = await buildBatteryV2CustomerHealthReadModel(prisma, {
      ...baseFeatures,
      publishedSohPct: 35,
      vOff60m: 14.5,
    });
    expect(model.userFacingSohPct).toBeNull();
  });
});
