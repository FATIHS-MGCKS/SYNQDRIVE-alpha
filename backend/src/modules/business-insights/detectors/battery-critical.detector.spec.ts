import { BatteryCriticalDetector } from './battery-critical.detector';
import { DetectorContext, InsightSeverity } from '../insight.types';

describe('BatteryCriticalDetector', () => {
  const now = new Date('2026-06-13T10:00:00.000Z');
  const fresh = new Date('2026-06-13T09:00:00.000Z');
  const safePublicationFeatures = {
    publishedSohPct: 50,
    publicationState: 'STABLE',
    maturityConfidence: 'high',
    vOff60m: 12.6,
    vOff6h: 12.58,
    rest60mCapturedAt: new Date('2026-06-13T07:00:00.000Z'),
    rest6hCapturedAt: new Date('2026-06-13T08:30:00.000Z'),
    crankDrop: null,
    crankObservationCount: 0,
    crankAt: new Date('2026-06-13T06:55:00.000Z'),
    scoredAt: fresh,
    lastPublishedAt: fresh,
  };

  const buildCtx = (): DetectorContext =>
    ({ organizationId: 'org-1', now, policy: {} as any } as DetectorContext);

  const buildPrisma = (opts: {
    fuelType?: string;
    batteryType?: string | null;
    snapshots?: Array<{ restingVoltage: number | null; voltageV: number; engineRunning: boolean; recordedAt: Date }>;
    features?: {
      publishedSohPct: number | null;
      publicationState: string;
      crankDrop: number | null;
      maturityConfidence?: string | null;
      vOff60m?: number | null;
      vOff6h?: number | null;
      rest60mCapturedAt?: Date | null;
      rest6hCapturedAt?: Date | null;
      crankObservationCount?: number;
      crankAt?: Date | null;
      scoredAt?: Date | null;
      lastPublishedAt?: Date | null;
    } | null;
    hvCurrent?: {
      publishedSohPct: number | null;
      publicationState: string;
      publicationMethod?: string | null;
    } | null;
    providerHvSoh?: number | null;
  }) => {
    const snapshots = (opts.snapshots ?? []).map((s) => ({ vehicleId: 'veh-1', ...s }));
    return {
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'veh-1',
            make: 'BMW',
            model: 'i4',
            licensePlate: 'B AB 123',
            homeStationId: null,
            fuelType: opts.fuelType ?? 'GASOLINE',
            latestState: {
              tractionBatterySohPercent: opts.providerHvSoh ?? null,
              lastSeenAt: fresh,
            },
          },
        ]),
      },
      batteryHealthSnapshot: { findMany: jest.fn().mockResolvedValue(snapshots) },
      batteryFeatures: {
        findMany: jest.fn().mockResolvedValue(
          opts.features ? [{ vehicleId: 'veh-1', ...opts.features }] : [],
        ),
      },
      vehicleBatterySpec: {
        findMany: jest.fn().mockResolvedValue(
          opts.batteryType !== undefined
            ? [{ vehicleId: 'veh-1', batteryType: opts.batteryType, createdAt: fresh }]
            : [],
        ),
      },
      hvBatteryHealthCurrent: {
        findMany: jest.fn().mockResolvedValue(
          opts.hvCurrent ? [{ vehicleId: 'veh-1', ...opts.hvCurrent }] : [],
        ),
      },
      batteryEvidence: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;
  };

  it('does not alert on a WATCH resting voltage', async () => {
    const prisma = buildPrisma({
      batteryType: null, // default bands
      snapshots: [{ restingVoltage: 12.4, voltageV: 12.4, engineRunning: false, recordedAt: fresh }],
    });
    const detector = new BatteryCriticalDetector(prisma);
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(0);
  });

  it('alerts CRITICAL on a critical resting voltage immediately', async () => {
    const prisma = buildPrisma({
      batteryType: null,
      snapshots: [{ restingVoltage: 11.8, voltageV: 11.8, engineRunning: false, recordedAt: fresh }],
    });
    const detector = new BatteryCriticalDetector(prisma);
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.CRITICAL);
  });

  it('requires two consecutive WARNING resting measurements before alerting', async () => {
    // Single WARNING reading → no alert (spam guard).
    const prismaSingle = buildPrisma({
      batteryType: null,
      snapshots: [{ restingVoltage: 12.1, voltageV: 12.1, engineRunning: false, recordedAt: fresh }],
    });
    const single = await new BatteryCriticalDetector(prismaSingle).detect(buildCtx());
    expect(single).toHaveLength(0);

    // Two consecutive WARNING readings → WARNING alert.
    const prismaDouble = buildPrisma({
      batteryType: null,
      snapshots: [
        { restingVoltage: 12.1, voltageV: 12.1, engineRunning: false, recordedAt: fresh },
        { restingVoltage: 12.05, voltageV: 12.05, engineRunning: false, recordedAt: new Date('2026-06-13T08:00:00.000Z') },
      ],
    });
    const double = await new BatteryCriticalDetector(prismaDouble).detect(buildCtx());
    expect(double).toHaveLength(1);
    expect(double[0].severity).toBe(InsightSeverity.WARNING);
  });

  it('does not alert on a lithium battery from lead-acid bands', async () => {
    const prisma = buildPrisma({
      batteryType: 'Lithium',
      snapshots: [{ restingVoltage: 12.1, voltageV: 12.1, engineRunning: false, recordedAt: fresh }],
    });
    const result = await new BatteryCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(0);
  });

  it('alerts WARNING on a low HV SOH for an EV with a reliable basis', async () => {
    const prisma = buildPrisma({
      fuelType: 'ELECTRIC',
      providerHvSoh: 65, // WARNING band 60–69
    });
    const result = await new BatteryCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.WARNING);
  });

  it('does not alert on an EV with no reliable HV SOH basis', async () => {
    const prisma = buildPrisma({ fuelType: 'ELECTRIC', providerHvSoh: null });
    const result = await new BatteryCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(0);
  });

  it('does not alert on legacy degradation_model HV publication rows', async () => {
    const prisma = buildPrisma({
      fuelType: 'ELECTRIC',
      providerHvSoh: null,
      hvCurrent: {
        publishedSohPct: 55,
        publicationState: 'STABLE',
        publicationMethod: 'degradation_model',
      },
    });
    const result = await new BatteryCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(0);
  });

  it('does not alert on WATCH estimated battery health', async () => {
    const prisma = buildPrisma({
      batteryType: 'AGM',
      features: { ...safePublicationFeatures, publishedSohPct: 70 },
    });
    const result = await new BatteryCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(0);
  });

  it('alerts WARNING on low estimated battery health when publication is safety-qualified', async () => {
    const prisma = buildPrisma({
      batteryType: 'AGM',
      features: safePublicationFeatures,
    });
    const result = await new BatteryCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.WARNING);
  });

  it('alerts CRITICAL on critical estimated battery health when publication is safety-qualified', async () => {
    const prisma = buildPrisma({
      batteryType: 'AGM',
      features: { ...safePublicationFeatures, publishedSohPct: 35 },
    });
    const result = await new BatteryCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.CRITICAL);
  });

  it('does not alert on unsafe legacy publication score alone (contaminated REST)', async () => {
    const prisma = buildPrisma({
      batteryType: 'AGM',
      features: { ...safePublicationFeatures, publishedSohPct: 35, vOff60m: 14.43 },
    });
    const result = await new BatteryCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(0);
  });

  it('does not alert on unsafe legacy publication with mislabeled LV SOH evidence', async () => {
    const prisma = buildPrisma({
      batteryType: 'AGM',
      features: safePublicationFeatures,
    });
    prisma.batteryEvidence.findMany.mockResolvedValue([
      {
        vehicleId: 'veh-1',
        scope: 'LV',
        sourceType: 'TELEMETRY_DERIVED',
        valueType: 'SOH_PERCENT',
        numericValue: 50,
        observedAt: fresh,
      },
    ]);
    const result = await new BatteryCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(0);
  });

  it('still alerts CRITICAL on resting voltage when legacy publication is unsafe', async () => {
    const prisma = buildPrisma({
      batteryType: 'AGM',
      snapshots: [{ restingVoltage: 11.8, voltageV: 11.8, engineRunning: false, recordedAt: fresh }],
      features: { ...safePublicationFeatures, publishedSohPct: 35, vOff60m: 14.43 },
    });
    const result = await new BatteryCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.CRITICAL);
    expect(result[0].reasons?.[0]).toMatch(/Ruhespannung/i);
  });

  it('does not alert on legacy pairwise HV publication when assessment is disabled', async () => {
    const prisma = buildPrisma({
      fuelType: 'ELECTRIC',
      providerHvSoh: null,
      hvCurrent: {
        publishedSohPct: 55,
        publicationState: 'STABLE',
        publicationMethod: 'capacity_measurement',
      },
    });
    const result = await new BatteryCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(0);
  });
});
