import { BatteryCriticalDetector } from './battery-critical.detector';
import { DetectorContext, InsightSeverity } from '../insight.types';
import type { CanonicalBatteryHealthService } from '../../vehicle-intelligence/battery-health/canonical-battery-health.service';

describe('BatteryCriticalDetector', () => {
  const now = new Date('2026-06-13T10:00:00.000Z');

  const buildCtx = (): DetectorContext =>
    ({ organizationId: 'org-1', now, policy: {} as any } as DetectorContext);

  const buildSummary = (partial: Record<string, unknown> = {}) => ({
    vehicleId: 'veh-1',
    generatedAt: now.toISOString(),
    support: { lv: true, hv: false },
    currentState: { lastChecked: now.toISOString() },
    lv: {
      healthStatus: 'GOOD',
      restingVoltage: {
        valueV: 12.7,
        status: 'GOOD',
        measurementContext: 'RESTING',
      },
      estimatedHealth: { status: 'GOOD', decisionCapable: true },
      telemetry: { crank: { operationalStatus: 'GOOD', diagnosticStatus: 'GOOD' } },
      freshness: { observedAt: now.toISOString() },
    },
    hv: null,
    canonical: { resolvedAt: now.toISOString() },
    ...partial,
  });

  const buildDetector = (summary: ReturnType<typeof buildSummary> | null) => {
    const prisma = {
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'veh-1',
            make: 'BMW',
            model: 'i4',
            licensePlate: 'B AB 123',
            homeStationId: null,
          },
        ]),
      },
    } as any;
    const canonicalBatteryHealth = {
      getSummary: jest.fn().mockResolvedValue(summary),
    } as unknown as CanonicalBatteryHealthService;
    return new BatteryCriticalDetector(prisma, canonicalBatteryHealth);
  };

  it('does not alert on GOOD canonical battery summary', async () => {
    const detector = buildDetector(buildSummary());
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(0);
  });

  it('alerts CRITICAL on canonical resting CRITICAL', async () => {
    const detector = buildDetector(
      buildSummary({
        lv: {
          healthStatus: 'CRITICAL',
          restingVoltage: {
            valueV: 11.8,
            status: 'CRITICAL',
            measurementContext: 'RESTING',
          },
          estimatedHealth: { status: 'GOOD', decisionCapable: true },
          telemetry: { crank: { operationalStatus: 'GOOD' } },
          freshness: { observedAt: now.toISOString() },
        },
      }),
    );
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.CRITICAL);
  });

  it('alerts WARNING on canonical resting WARNING', async () => {
    const detector = buildDetector(
      buildSummary({
        lv: {
          healthStatus: 'WARNING',
          restingVoltage: {
            valueV: 12.1,
            status: 'WARNING',
            measurementContext: 'RESTING',
          },
          estimatedHealth: { status: 'GOOD', decisionCapable: true },
          telemetry: { crank: { operationalStatus: 'GOOD' } },
          freshness: { observedAt: now.toISOString() },
        },
      }),
    );
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.WARNING);
  });

  it('alerts WARNING on canonical estimated health WARNING', async () => {
    const detector = buildDetector(
      buildSummary({
        lv: {
          healthStatus: 'WARNING',
          restingVoltage: {
            valueV: 12.6,
            status: 'GOOD',
            measurementContext: 'RESTING',
          },
          estimatedHealth: { status: 'WARNING', decisionCapable: true },
          telemetry: { crank: { operationalStatus: 'GOOD' } },
          freshness: { observedAt: now.toISOString() },
        },
      }),
    );
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.WARNING);
  });

  it('alerts WARNING on canonical HV SOH WARNING for EVs', async () => {
    const detector = buildDetector(
      buildSummary({
        support: { lv: true, hv: true },
        hv: {
          healthStatus: 'WARNING',
          sohPct: 65,
          freshness: { observedAt: now.toISOString() },
        },
      }),
    );
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(InsightSeverity.WARNING);
  });

  it('returns no candidates when canonical summary is unavailable', async () => {
    const detector = buildDetector(null);
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(0);
  });
});
