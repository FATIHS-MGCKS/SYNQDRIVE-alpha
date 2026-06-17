import { TireCriticalDetector } from './tire-critical.detector';
import { DetectorContext, InsightSeverity } from '../insight.types';

describe('TireCriticalDetector', () => {
  const buildCtx = (): DetectorContext =>
    ({
      organizationId: 'org-1',
      now: new Date('2026-06-13T10:00:00.000Z'),
      policy: {} as any,
    }) as DetectorContext;

  const buildDeps = (summary: Record<string, unknown> | null) => {
    const prisma = {
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'veh-1',
            make: 'VW',
            model: 'Golf',
            licensePlate: 'B AB 123',
            homeStationId: null,
          },
        ]),
      },
    } as any;
    const tireHealth = {
      getSummary: jest.fn().mockResolvedValue(summary),
    } as any;
    return { prisma, tireHealth };
  };

  it('does not alert on WATCH overall status', async () => {
    const { prisma, tireHealth } = buildDeps({
      overallStatus: 'WATCH',
      displayMode: 'ESTIMATED',
      confidence: 'MEDIUM',
      alerts: [],
      measurementAgeDays: 10,
      lastMeasurementAt: null,
    });
    const result = await new TireCriticalDetector(prisma, tireHealth).detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.INFO);
  });

  it('alerts WARNING from canonical summary without re-computing thresholds', async () => {
    const { prisma, tireHealth } = buildDeps({
      overallStatus: 'WARNING',
      displayMode: 'MEASURED',
      confidence: 'HIGH',
      lowestTreadMm: 2.5,
      lowestTreadPosition: 'front left',
      measurementAgeDays: 3,
      lastMeasurementAt: '2026-06-10T10:00:00.000Z',
      alerts: [{ severity: 'warning', message: 'Plan replacement soon', type: 'LOW_TREAD' }],
    });
    const result = await new TireCriticalDetector(prisma, tireHealth).detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.WARNING);
    expect(tireHealth.getSummary).toHaveBeenCalledWith('veh-1');
  });

  it('caps CRITICAL estimate at WARNING when not measured', async () => {
    const { prisma, tireHealth } = buildDeps({
      overallStatus: 'CRITICAL',
      displayMode: 'ESTIMATED',
      confidence: 'LOW',
      lowestTreadMm: 1.4,
      lowestTreadPosition: 'rear right',
      measurementAgeDays: null,
      lastMeasurementAt: null,
      alerts: [{ severity: 'critical', message: 'Tread critical', type: 'CRITICAL_TREAD' }],
    });
    const result = await new TireCriticalDetector(prisma, tireHealth).detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.WARNING);
  });

  it('does not alert when no tire summary exists', async () => {
    const { prisma, tireHealth } = buildDeps(null);
    const result = await new TireCriticalDetector(prisma, tireHealth).detect(buildCtx());
    expect(result).toHaveLength(0);
  });
});
