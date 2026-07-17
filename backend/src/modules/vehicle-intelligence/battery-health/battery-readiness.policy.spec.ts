import { BATTERY_V2_READINESS_ENABLED_ENV } from '@config/battery-health-v2.config';
import {
  BatteryEvidenceStrengthTier,
  BatteryMeasurementQuality,
} from './battery-v2-domain';
import {
  BATTERY_READINESS_POLICY_VERSION,
  BATTERY_READINESS_PROVIDER_SOH_BLOCK_THRESHOLD_PCT,
  buildBatteryReadinessInputFromSummary,
  evaluateBatteryReadiness,
  hasActiveBatterySafetyDtc,
  isBatteryBlockWorthy,
  isBatterySafetyDtcFault,
} from './battery-readiness.policy';

describe('battery-readiness.policy', () => {
  const originalReadiness = process.env[BATTERY_V2_READINESS_ENABLED_ENV];

  afterEach(() => {
    if (originalReadiness === undefined) {
      delete process.env[BATTERY_V2_READINESS_ENABLED_ENV];
    } else {
      process.env[BATTERY_V2_READINESS_ENABLED_ENV] = originalReadiness;
    }
  });

  it('exposes policy version 1.0.0', () => {
    expect(BATTERY_READINESS_POLICY_VERSION).toBe('1.0.0');
  });

  it('does not block when readiness flag is disabled', () => {
    process.env[BATTERY_V2_READINESS_ENABLED_ENV] = 'false';
    const evaluation = evaluateBatteryReadiness({
      hasSummary: true,
      confirmedWorkshopDefect: true,
      batteryWarningLightActive: true,
    });
    expect(evaluation.blocksRental).toBe(false);
    expect(isBatteryBlockWorthy(evaluation)).toBe(false);
  });

  it('treats missing battery data as UNKNOWN without block', () => {
    const evaluation = evaluateBatteryReadiness(
      { hasSummary: false },
      { readinessEnabled: true },
    );
    expect(evaluation.effect).toBe('UNKNOWN');
    expect(evaluation.blocksRental).toBe(false);
  });

  it('hard-blocks confirmed workshop defect', () => {
    const evaluation = evaluateBatteryReadiness(
      {
        hasSummary: true,
        confirmedWorkshopDefect: true,
        evidenceTier: BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED,
      },
      { readinessEnabled: true },
    );
    expect(evaluation.effect).toBe('HARD_BLOCK');
    expect(evaluation.hardBlock).toBe(true);
    expect(evaluation.blocksRental).toBe(true);
    expect(evaluation.reason).toMatch(/Werkstatt/i);
  });

  it('blocks on battery warning light (Not Ready)', () => {
    const evaluation = evaluateBatteryReadiness(
      {
        hasSummary: true,
        batteryWarningLightActive: true,
      },
      { readinessEnabled: true },
    );
    expect(evaluation.effect).toBe('NOT_READY');
    expect(evaluation.manualReviewRequired).toBe(true);
    expect(evaluation.blocksRental).toBe(true);
    expect(evaluation.hardBlock).toBe(false);
  });

  it('blocks on battery safety DTC (Not Ready)', () => {
    const evaluation = evaluateBatteryReadiness(
      {
        hasSummary: true,
        batterySafetyDtcActive: true,
      },
      { readinessEnabled: true },
    );
    expect(evaluation.effect).toBe('NOT_READY');
    expect(evaluation.blocksRental).toBe(true);
  });

  it('blocks on stable qualified critical LV evidence', () => {
    const evaluation = evaluateBatteryReadiness(
      {
        hasSummary: true,
        publicationMaturity: 'STABLE',
        restingMeasurementQuality: BatteryMeasurementQuality.VALID,
        restingVoltageStatus: 'CRITICAL',
        lvAggregateStatus: 'CRITICAL',
        decisionCapable: true,
        evidenceTier: BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE,
      },
      { readinessEnabled: true },
    );
    expect(evaluation.effect).toBe('NOT_READY');
    expect(evaluation.blocksRental).toBe(true);
    expect(evaluation.evidenceTier).toBe(
      BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE,
    );
  });

  it('does not block proxy/start-proxy/rest-shadow signals', () => {
    const startProxy = evaluateBatteryReadiness(
      {
        hasSummary: true,
        startProxyConspicuous: true,
        evidenceTier: BatteryEvidenceStrengthTier.PROXY,
      },
      { readinessEnabled: true },
    );
    expect(startProxy.effect).toBe('DIAGNOSTIC');
    expect(startProxy.blocksRental).toBe(false);

    const restShadow = evaluateBatteryReadiness(
      {
        hasSummary: true,
        restShadowSignal: true,
        lvAggregateStatus: 'CRITICAL',
        evidenceTier: BatteryEvidenceStrengthTier.ESTIMATED,
      },
      { readinessEnabled: true },
    );
    expect(restShadow.blocksRental).toBe(false);

    const hvShadow = evaluateBatteryReadiness(
      {
        hasSummary: true,
        hvCapacityShadowSignal: true,
        evidenceTier: BatteryEvidenceStrengthTier.ESTIMATED,
      },
      { readinessEnabled: true },
    );
    expect(hvShadow.blocksRental).toBe(false);
  });

  it('hints on unusual live voltage without blocking', () => {
    const evaluation = evaluateBatteryReadiness(
      {
        hasSummary: true,
        liveVoltageUnusual: true,
        liveTelemetryOnly: true,
        evidenceTier: BatteryEvidenceStrengthTier.LIVE_TELEMETRY,
      },
      { readinessEnabled: true },
    );
    expect(evaluation.effect).toBe('HINT');
    expect(evaluation.blocksRental).toBe(false);
  });

  it('blocks provider SOH only below threshold with medium+ confidence', () => {
    const blocked = evaluateBatteryReadiness(
      {
        hasSummary: true,
        providerSohOnlySignal: true,
        providerSohFresh: true,
        providerSohPercent: 65,
        providerSohConfidence: 'medium',
        evidenceTier: BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH,
      },
      { readinessEnabled: true },
    );
    expect(blocked.blocksRental).toBe(true);
    expect(blocked.reason).toContain(String(BATTERY_READINESS_PROVIDER_SOH_BLOCK_THRESHOLD_PCT));

    const notBlocked = evaluateBatteryReadiness(
      {
        hasSummary: true,
        providerSohOnlySignal: true,
        providerSohFresh: true,
        providerSohPercent: 72,
        providerSohConfidence: 'high',
      },
      { readinessEnabled: true },
    );
    expect(notBlocked.blocksRental).toBe(false);
  });

  it('workshop hard block wins over provider SOH conflict', () => {
    const evaluation = evaluateBatteryReadiness(
      {
        hasSummary: true,
        confirmedWorkshopDefect: true,
        providerSohOnlySignal: true,
        providerSohFresh: true,
        providerSohPercent: 60,
        providerSohConfidence: 'high',
      },
      { readinessEnabled: true },
    );
    expect(evaluation.effect).toBe('HARD_BLOCK');
    expect(evaluation.blocksRental).toBe(true);
  });

  it('detects battery safety DTC faults', () => {
    expect(
      isBatterySafetyDtcFault({
        code: 'P0A80',
        severity: 'critical',
        description: 'Hybrid battery pack deterioration',
      }),
    ).toBe(true);
    expect(
      isBatterySafetyDtcFault({
        code: 'P0301',
        severity: 'critical',
        description: 'Misfire',
      }),
    ).toBe(false);
    expect(
      hasActiveBatterySafetyDtc([
        { code: 'B13A0', severity: 'critical', description: 'Battery sensor' },
      ]),
    ).toBe(true);
  });

  it('builds readiness input from canonical summary', () => {
    const input = buildBatteryReadinessInputFromSummary({
      summary: {
        generatedAt: '2026-07-16T12:00:00.000Z',
        lv: {
          healthStatus: 'CRITICAL',
          publicationState: 'STABLE',
          restingVoltage: {
            valueV: 11.2,
            status: 'CRITICAL',
            measurementContext: 'RESTING',
            dataQuality: { status: 'VERIFIED', observedAt: '2026-07-16T11:00:00.000Z' },
          },
          legacyPublicationSafety: { decisionCapable: true },
          estimatedHealth: { decisionCapable: true },
          telemetry: {
            startProxy: {
              measurements: [{ quality: 'VALID_PROXY', numericValue: 8.5 }],
            },
          },
        },
        canonical: {
          lv: {
            canonical: {
              primaryTruth: { source: 'V2_PUBLICATION_STABLE', decisionCapable: true },
            },
            publication: { maturity: 'STABLE' },
            latestQualifiedRest: { quality: 'VALID' },
            assessment: { assessmentTrack: 'TELEMETRY', assessmentMode: 'CANONICAL' },
          },
          liveState: {
            lv: { values: { voltageV: 12.1 } },
          },
          hv: {
            providerSoh: { percent: null, decisionFresh: false },
            capacityAssessment: { shadowGatePassed: true },
          },
        },
        hv: { sohPct: null, confidence: 'medium' },
      } as any,
      warningLightActive: false,
    });

    expect(input.restShadowSignal).toBe(false);
    expect(input.startProxyConspicuous).toBe(true);
    expect(input.publicationMaturity).toBe('STABLE');
  });
});
