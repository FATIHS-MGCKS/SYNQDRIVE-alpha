import { BatteryCriticalDetector } from './battery-critical.detector';
import { DetectorContext, InsightSeverity } from '../insight.types';
import type { CanonicalBatteryHealthService } from '../../vehicle-intelligence/battery-health/canonical-battery-health.service';
import { BATTERY_ALERT_RULE_IDS } from '../../vehicle-intelligence/battery-health/battery-alert.policy';

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
      publicationState: 'STABLE',
      restingVoltage: {
        valueV: 12.7,
        status: 'GOOD',
        measurementContext: 'RESTING',
        dataQuality: { observedAt: now.toISOString() },
      },
      estimatedHealth: { status: 'GOOD', decisionCapable: true },
      legacyPublicationSafety: { decisionCapable: true },
      telemetry: { crank: { operationalStatus: 'GOOD', diagnosticStatus: 'GOOD' } },
      freshness: { observedAt: now.toISOString() },
    },
    canonical: {
      resolvedAt: now.toISOString(),
      liveState: { lv: { values: { voltageV: 12.7 } } },
      lv: {
        canonical: {
          primaryTruth: {
            source: 'V2_PUBLICATION_STABLE',
            decisionCapable: true,
            estimatedHealthScore: 82,
          },
        },
        publication: {
          maturity: 'STABLE',
          publishedEstimatedHealth: 82,
          assessmentEvidenceObservedAt: now.toISOString(),
        },
        latestQualifiedRest: { quality: 'VALID' },
        assessment: { assessmentTrack: 'TELEMETRY', assessmentMode: 'CANONICAL' },
      },
      hv: {
        providerSoh: { percent: null, decisionFresh: false },
        capacityAssessment: { shadowGatePassed: false },
      },
    },
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

  it('alerts CRITICAL on stable qualified publication resting CRITICAL', async () => {
    const detector = buildDetector(
      buildSummary({
        lv: {
          ...buildSummary().lv,
          healthStatus: 'CRITICAL',
          restingVoltage: {
            valueV: 11.2,
            status: 'CRITICAL',
            measurementContext: 'RESTING',
            dataQuality: { observedAt: now.toISOString() },
          },
        },
      }),
    );
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(1);
    const candidate = result[0]!;
    expect(candidate.severity).toBe(InsightSeverity.CRITICAL);
    expect(candidate.dedupeKey).toBe(
      `battery_alert:veh-1:${BATTERY_ALERT_RULE_IDS.LV_PUBLICATION_STABLE}`,
    );
    expect(candidate.metrics?.ruleId).toBe(BATTERY_ALERT_RULE_IDS.LV_PUBLICATION_STABLE);
  });

  it('does not alert on legacy estimated health WARNING without stable publication', async () => {
    const detector = buildDetector(
      buildSummary({
        lv: {
          ...buildSummary().lv,
          healthStatus: 'WARNING',
          restingVoltage: {
            valueV: 12.6,
            status: 'GOOD',
            measurementContext: 'RESTING',
            dataQuality: { observedAt: now.toISOString() },
          },
          estimatedHealth: { status: 'WARNING', decisionCapable: false },
          legacyPublicationSafety: { decisionCapable: false },
        },
        canonical: {
          ...buildSummary().canonical,
          lv: {
            ...buildSummary().canonical.lv,
            canonical: {
              primaryTruth: { source: 'LEGACY_UNVERIFIED', decisionCapable: false },
            },
          },
        },
      }),
    );
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(0);
  });

  it('does not alert on HV SOH alone', async () => {
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
    expect(result).toHaveLength(0);
  });

  it('returns no candidates when canonical summary is unavailable', async () => {
    const detector = buildDetector(null);
    const result = await detector.detect(buildCtx());
    expect(result).toHaveLength(0);
  });
});
