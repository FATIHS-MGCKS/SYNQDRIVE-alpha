import { BrakeCriticalDetector } from './brake-critical.detector';
import { DetectorContext, InsightSeverity } from '../insight.types';
import type { BrakeHealthService } from '../../vehicle-intelligence/brakes/brake-health.service';

describe('BrakeCriticalDetector', () => {
  const buildCtx = (): DetectorContext =>
    ({ organizationId: 'org-1', now: new Date('2026-06-13T10:00:00.000Z'), policy: {} as any } as DetectorContext);

  const buildPrisma = () =>
    ({
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'veh-1', make: 'VW', model: 'Golf', licensePlate: 'B AB 123', homeStationId: null },
        ]),
      },
    }) as any;

  const buildBrakeHealth = (summary: Record<string, unknown> | null) =>
    ({
      getSummary: jest.fn().mockResolvedValue(summary),
    }) as unknown as BrakeHealthService;

  it('emits at most WARNING for a fully-worn ESTIMATE (no real signal → never CRITICAL)', async () => {
    const detector = new BrakeCriticalDetector(
      buildPrisma(),
      buildBrakeHealth({
        overallCondition: 'WARNING',
        dataBasis: 'ESTIMATED',
        openAlerts: [],
        estimatedFrontRemainingKmMin: 0,
        estimatedRearRemainingKmMin: 9000,
      }),
    );
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.WARNING);
  });

  it('escalates to CRITICAL on measured critical summary', async () => {
    const detector = new BrakeCriticalDetector(
      buildPrisma(),
      buildBrakeHealth({
        overallCondition: 'CRITICAL',
        dataBasis: 'MEASURED',
        openAlerts: [{ code: 'BRAKE_PAD_CRITICAL', category: 'WEAR', severity: 'critical', message: 'x' }],
        estimatedFrontRemainingKmMin: 12000,
        estimatedRearRemainingKmMin: 12000,
      }),
    );
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.CRITICAL);
  });

  it('escalates to CRITICAL on safety DTC alert', async () => {
    const detector = new BrakeCriticalDetector(
      buildPrisma(),
      buildBrakeHealth({
        overallCondition: 'CRITICAL',
        dataBasis: 'ESTIMATED',
        openAlerts: [{ code: 'BRAKE_SYSTEM_DTC', category: 'SAFETY', severity: 'critical', message: 'x' }],
        estimatedFrontRemainingKmMin: 12000,
        estimatedRearRemainingKmMin: 12000,
      }),
    );
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.CRITICAL);
  });

  it('emits INFO insight on a WATCH-only estimated condition', async () => {
    const detector = new BrakeCriticalDetector(
      buildPrisma(),
      buildBrakeHealth({
        overallCondition: 'WATCH',
        dataBasis: 'ESTIMATED',
        openAlerts: [],
        estimatedFrontRemainingKmMin: 5000,
        estimatedRearRemainingKmMin: 9000,
      }),
    );
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.INFO);
    expect(result[0].title).toBe('Bremsen beobachten');
  });

  it('does NOT alert when summary is missing (UNKNOWN)', async () => {
    const detector = new BrakeCriticalDetector(buildPrisma(), buildBrakeHealth(null));
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(0);
  });
});
