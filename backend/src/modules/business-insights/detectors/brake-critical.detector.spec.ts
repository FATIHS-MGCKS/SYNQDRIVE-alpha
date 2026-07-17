import { BrakeCriticalDetector } from './brake-critical.detector';
import { DetectorContext, InsightSeverity } from '../insight.types';

describe('BrakeCriticalDetector', () => {
  const now = new Date('2026-06-13T10:00:00.000Z');
  const fresh = new Date('2026-06-13T09:00:00.000Z');

  const buildCtx = (): DetectorContext =>
    ({ organizationId: 'org-1', now, policy: {} as any } as DetectorContext);

  const buildPrisma = (opts: {
    current?: Record<string, unknown> | null;
    evidence?: Array<Record<string, unknown>>;
  }) =>
    ({
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'veh-1', make: 'VW', model: 'Golf', licensePlate: 'B AB 123', homeStationId: null },
        ]),
      },
      brakeHealthCurrent: {
        findMany: jest
          .fn()
          .mockResolvedValue(opts.current ? [{ vehicleId: 'veh-1', ...opts.current }] : []),
      },
      brakeEvidence: {
        findMany: jest
          .fn()
          .mockResolvedValue((opts.evidence ?? []).map((e) => ({ vehicleId: 'veh-1', createdAt: fresh, ...e }))),
      },
    }) as any;

  it('emits at most WARNING for a fully-worn ESTIMATE (no real signal → never CRITICAL)', async () => {
    const prisma = buildPrisma({
      current: {
        isInitialized: true,
        anchorServiceDate: null,
        confidenceScore: 50,
        frontPadHealthPct: 0,
        frontDiscHealthPct: 30,
        rearPadHealthPct: 60,
        rearDiscHealthPct: 70,
        frontPadRemainingKm: 0,
        frontDiscRemainingKm: 3000,
        rearPadRemainingKm: 9000,
        rearDiscRemainingKm: 12000,
      },
      evidence: [],
    });
    const result = await new BrakeCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.WARNING);
  });

  it('escalates to CRITICAL on a fresh measured-critical pad thickness', async () => {
    const prisma = buildPrisma({
      current: {
        isInitialized: true,
        anchorServiceDate: null,
        frontPadHealthPct: 80,
        frontDiscHealthPct: 85,
        rearPadHealthPct: 80,
        rearDiscHealthPct: 85,
        frontPadRemainingKm: 12000,
        frontDiscRemainingKm: 20000,
        rearPadRemainingKm: 12000,
        rearDiscRemainingKm: 20000,
      },
      // 1.5 mm ≤ critical (2.0 mm) → genuine CRITICAL.
      evidence: [{
        source: 'AI_UPLOAD_CONFIRMED',
        axle: 'FRONT',
        measuredPadMm: 1.5,
        measuredAt: fresh,
        active: true,
        confirmationStatus: 'CONFIRMED',
      }],
    });
    const result = await new BrakeCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.CRITICAL);
  });

  it('escalates to CRITICAL on a critical brake-fluid safety signal', async () => {
    const prisma = buildPrisma({
      current: {
        isInitialized: true,
        anchorServiceDate: null,
        frontPadHealthPct: 80,
        frontDiscHealthPct: 85,
        rearPadHealthPct: 80,
        rearDiscHealthPct: 85,
        frontPadRemainingKm: 12000,
        frontDiscRemainingKm: 20000,
        rearPadRemainingKm: 12000,
        rearDiscRemainingKm: 20000,
      },
      evidence: [{
        source: 'WORKSHOP_MEASUREMENT',
        axle: 'UNKNOWN',
        brakeFluidStatus: 'CRITICAL',
        measuredAt: fresh,
        active: true,
      }],
    });
    const result = await new BrakeCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.CRITICAL);
  });

  it('emits INFO insight on a WATCH-only estimated condition', async () => {
    const prisma = buildPrisma({
      current: {
        isInitialized: true,
        anchorServiceDate: null,
        frontPadHealthPct: 40, // WATCH band
        frontDiscHealthPct: 60,
        rearPadHealthPct: 60,
        rearDiscHealthPct: 70,
        frontPadRemainingKm: 5000, // above watch threshold (4000)
        frontDiscRemainingKm: 9000,
        rearPadRemainingKm: 9000,
        rearDiscRemainingKm: 12000,
      },
      evidence: [],
    });
    const result = await new BrakeCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.INFO);
    expect(result[0].title).toBe('Bremsen beobachten');
  });

  it('does NOT alert when there is no baseline and no evidence (UNKNOWN)', async () => {
    const prisma = buildPrisma({ current: null, evidence: [] });
    const result = await new BrakeCriticalDetector(prisma).detect(buildCtx());
    expect(result).toHaveLength(0);
  });
});
