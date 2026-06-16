import { TireCriticalDetector } from './tire-critical.detector';
import { DetectorContext, InsightSeverity } from '../insight.types';

describe('TireCriticalDetector', () => {
  const fresh = new Date('2026-06-13T09:00:00.000Z');

  const buildCtx = (now = new Date('2026-06-13T10:00:00.000Z')): DetectorContext =>
    ({ organizationId: 'org-1', now, policy: {} as any } as DetectorContext);

  const buildPrisma = (opts: { setup?: Record<string, unknown> | null }) =>
    ({
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'veh-1', make: 'VW', model: 'Golf', licensePlate: 'B AB 123', homeStationId: null },
        ]),
      },
      vehicleTireSetup: {
        findMany: jest
          .fn()
          .mockResolvedValue(opts.setup ? [{ vehicleId: 'veh-1', ...opts.setup }] : []),
      },
    }) as any;

  it('caps a fully-critical ESTIMATE at WARNING (no measurement → never CRITICAL)', async () => {
    const prisma = buildPrisma({
      setup: {
        tireSeason: 'SUMMER',
        overallRemainingKm: 8000,
        confidenceLabel: 'LOW',
        dotCodeFront: '2420',
        dotCodeRear: '2420',
        measurements: [],
        snapshots: [{ estimatedTreadMm: 1.5, snapshotDate: fresh }],
      },
    });
    const result = await new TireCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.WARNING);
  });

  it('escalates to CRITICAL on a fresh measured-critical tread', async () => {
    const prisma = buildPrisma({
      setup: {
        tireSeason: 'SUMMER',
        overallRemainingKm: 8000,
        confidenceLabel: 'HIGH',
        dotCodeFront: '2420',
        dotCodeRear: '2420',
        measurements: [
          {
            frontLeftMm: 1.5,
            frontRightMm: 2.5,
            rearLeftMm: 3.0,
            rearRightMm: 3.0,
            measuredAt: fresh,
          },
        ],
        snapshots: [],
      },
    });
    const result = await new TireCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.CRITICAL);
  });

  it('emits WARNING on a summer-tire season mismatch in winter', async () => {
    const prisma = buildPrisma({
      setup: {
        tireSeason: 'SUMMER',
        overallRemainingKm: 8000,
        confidenceLabel: 'HIGH',
        dotCodeFront: '2420',
        dotCodeRear: '2420',
        measurements: [
          {
            frontLeftMm: 5.0,
            frontRightMm: 5.0,
            rearLeftMm: 5.0,
            rearRightMm: 5.0,
            measuredAt: fresh,
          },
        ],
        snapshots: [],
      },
    });
    const winterCtx = buildCtx(new Date('2026-01-15T10:00:00.000Z'));
    const result = await new TireCriticalDetector(prisma).detect(winterCtx);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.WARNING);
    expect(result[0].reasons[0]).toMatch(/Sommerreifen/i);
  });
});
