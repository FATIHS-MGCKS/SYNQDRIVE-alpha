import { InsightSeverity } from '@prisma/client';
import {
  BATTERY_ALERT_POLICY_VERSION,
  BATTERY_ALERT_RULE_IDS,
  evaluateBatteryAlerts,
  resolveBatteryAlertCandidate,
  shouldAutoResolveBatteryAlert,
} from './battery-alert.policy';
import { BatteryEvidenceStrengthTier } from './battery-v2-domain';

const NOW = new Date('2026-07-16T12:00:00.000Z');

const vehicle = {
  id: 'veh-1',
  make: 'VW',
  model: 'Golf',
  licensePlate: 'B-AB 123',
  homeStationId: null,
};

function baseSummary(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: 'veh-1',
    generatedAt: NOW.toISOString(),
    support: { lv: true, hv: false },
    currentState: { lastChecked: NOW.toISOString() },
    lv: {
      healthStatus: 'GOOD',
      publicationState: 'STABLE',
      restingVoltage: {
        valueV: 12.7,
        status: 'GOOD',
        measurementContext: 'RESTING',
        dataQuality: { observedAt: NOW.toISOString() },
      },
      estimatedHealth: { status: 'GOOD', decisionCapable: true, scorePct: 82 },
      legacyPublicationSafety: { decisionCapable: true },
      freshness: { observedAt: NOW.toISOString() },
      telemetry: { crank: { operationalStatus: 'GOOD', diagnosticStatus: 'GOOD' } },
    },
    canonical: {
      resolvedAt: NOW.toISOString(),
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
          assessmentEvidenceObservedAt: NOW.toISOString(),
        },
        latestQualifiedRest: { quality: 'VALID' },
        assessment: { assessmentTrack: 'TELEMETRY', assessmentMode: 'CANONICAL' },
      },
      hv: {
        providerSoh: { percent: null, decisionFresh: false },
        capacityAssessment: { shadowGatePassed: false },
      },
    },
    ...overrides,
  } as any;
}

describe('battery-alert.policy', () => {
  it('exposes policy version 1.0.0', () => {
    expect(BATTERY_ALERT_POLICY_VERSION).toBe('1.0.0');
  });

  it('does not alert on missing summary', () => {
    expect(
      evaluateBatteryAlerts({ summary: null, vehicle, now: NOW }),
    ).toHaveLength(0);
  });

  it('does not alert from start proxy, REST shadow, or legacy scores', () => {
    const startProxy = evaluateBatteryAlerts({
      summary: baseSummary({
        lv: {
          ...baseSummary().lv,
          healthStatus: 'CRITICAL',
          telemetry: {
            startProxy: {
              measurements: [{ quality: 'VALID_PROXY', numericValue: 8.2 }],
            },
          },
        },
      }),
      vehicle,
      now: NOW,
    });
    expect(startProxy).toHaveLength(0);

    const shadow = evaluateBatteryAlerts({
      summary: baseSummary({
        canonical: {
          ...baseSummary().canonical,
          lv: {
            ...baseSummary().canonical.lv,
            canonical: {
              primaryTruth: { source: 'V2_SHADOW_DIAGNOSTIC', decisionCapable: false },
            },
            assessment: { assessmentMode: 'SHADOW', assessmentTrack: 'TELEMETRY' },
            latestQualifiedRest: { quality: 'SHADOW' },
          },
        },
        lv: {
          ...baseSummary().lv,
          healthStatus: 'CRITICAL',
          estimatedHealth: { status: 'CRITICAL', decisionCapable: false },
          legacyPublicationSafety: { decisionCapable: false },
        },
      }),
      vehicle,
      now: NOW,
    });
    expect(shadow).toHaveLength(0);

    const legacyScore = evaluateBatteryAlerts({
      summary: baseSummary({
        canonical: {
          ...baseSummary().canonical,
          lv: {
            ...baseSummary().canonical.lv,
            canonical: {
              primaryTruth: { source: 'LEGACY_UNVERIFIED', decisionCapable: false },
            },
          },
        },
        lv: {
          ...baseSummary().lv,
          healthStatus: 'CRITICAL',
          estimatedHealth: { status: 'CRITICAL', decisionCapable: false },
          legacyPublicationSafety: { decisionCapable: false },
        },
      }),
      vehicle,
      now: NOW,
    });
    expect(legacyScore).toHaveLength(0);
  });

  it('alerts on warning light with semantic dedup key', () => {
    const alerts = evaluateBatteryAlerts({
      summary: baseSummary(),
      vehicle,
      now: NOW,
      warningLightActive: true,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].ruleId).toBe(BATTERY_ALERT_RULE_IDS.WARNING_LIGHT);
    expect(alerts[0].dedupeKey).toBe(
      `battery_alert:veh-1:${BATTERY_ALERT_RULE_IDS.WARNING_LIGHT}`,
    );
    expect(alerts[0].autoResolveWhen).toContain('WARNING_LIGHT_CLEARED');
  });

  it('alerts on safety-relevant battery DTC', () => {
    const alerts = evaluateBatteryAlerts({
      summary: baseSummary(),
      vehicle,
      now: NOW,
      activeDtcFaults: [
        { code: 'P0A80', severity: 'critical', description: 'Hybrid battery pack' },
      ],
    });
    expect(alerts[0].ruleId).toBe(BATTERY_ALERT_RULE_IDS.SAFETY_DTC);
    expect(alerts[0].severity).toBe(InsightSeverity.CRITICAL);
  });

  it('alerts on stable qualified LV publication CRITICAL resting', () => {
    const alerts = evaluateBatteryAlerts({
      summary: baseSummary({
        lv: {
          ...baseSummary().lv,
          healthStatus: 'CRITICAL',
          restingVoltage: {
            valueV: 11.1,
            status: 'CRITICAL',
            measurementContext: 'RESTING',
            dataQuality: { observedAt: NOW.toISOString() },
          },
        },
      }),
      vehicle,
      now: NOW,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].ruleId).toBe(BATTERY_ALERT_RULE_IDS.LV_PUBLICATION_STABLE);
    expect(alerts[0].evidenceTier).toBe(
      BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE,
    );
    expect(alerts[0].recommendedAction).toMatch(/Starthilfe|Austausch/i);
  });

  it('alerts on workshop finding with hard evidence tier', () => {
    const alerts = evaluateBatteryAlerts({
      summary: baseSummary({
        lv: {
          ...baseSummary().lv,
          healthStatus: 'CRITICAL',
          restingVoltage: {
            valueV: 10.8,
            status: 'CRITICAL',
            measurementContext: 'RESTING',
            dataQuality: { observedAt: NOW.toISOString() },
          },
        },
        canonical: {
          ...baseSummary().canonical,
          lv: {
            ...baseSummary().canonical.lv,
            assessment: { assessmentTrack: 'WORKSHOP_OVERRIDE', assessmentMode: 'CANONICAL' },
          },
        },
      }),
      vehicle,
      now: NOW,
    });
    expect(alerts[0].ruleId).toBe(BATTERY_ALERT_RULE_IDS.WORKSHOP_FINDING);
    expect(alerts[0].evidenceTier).toBe(
      BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED,
    );
  });

  it('deduplicates semantically per ruleId for multiple causes', () => {
    const alerts = evaluateBatteryAlerts({
      summary: baseSummary({
        lv: {
          ...baseSummary().lv,
          healthStatus: 'CRITICAL',
          restingVoltage: {
            valueV: 11.0,
            status: 'CRITICAL',
            measurementContext: 'RESTING',
            dataQuality: { observedAt: NOW.toISOString() },
          },
        },
      }),
      vehicle,
      now: NOW,
      warningLightActive: true,
      activeDtcFaults: [
        { code: 'P0A80', severity: 'critical', description: 'Battery deterioration' },
      ],
    });
    const dedupeKeys = new Set(alerts.map((alert) => alert.dedupeKey));
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    expect(dedupeKeys.size).toBe(alerts.length);
  });

  it('resolveBatteryAlertCandidate returns primary alert only', () => {
    const alert = resolveBatteryAlertCandidate(
      baseSummary({
        lv: {
          ...baseSummary().lv,
          healthStatus: 'WARNING',
          restingVoltage: {
            valueV: 12.05,
            status: 'WARNING',
            measurementContext: 'RESTING',
            dataQuality: { observedAt: NOW.toISOString() },
          },
        },
      }),
      vehicle,
      NOW,
    );
    expect(alert).not.toBeNull();
    expect(alert?.ruleId).toBe(BATTERY_ALERT_RULE_IDS.LV_PUBLICATION_STABLE);
    expect(alert?.dedupeKey).toContain('battery_alert:veh-1:');
  });

  it('auto-resolves when warning light clears', () => {
    const active = evaluateBatteryAlerts({
      summary: baseSummary(),
      vehicle,
      now: NOW,
      warningLightActive: true,
    });
    expect(active).toHaveLength(1);

    const resolved = shouldAutoResolveBatteryAlert({
      existingRuleId: BATTERY_ALERT_RULE_IDS.WARNING_LIGHT,
      summary: baseSummary(),
      warningLightActive: false,
      now: NOW,
    });
    expect(resolved).toBe(true);
  });

  it('does not auto-resolve while qualified publication alert still active', () => {
    const summary = baseSummary({
      lv: {
        ...baseSummary().lv,
        healthStatus: 'CRITICAL',
        restingVoltage: {
          valueV: 11.0,
          status: 'CRITICAL',
          measurementContext: 'RESTING',
          dataQuality: { observedAt: NOW.toISOString() },
        },
      },
    });
    const resolved = shouldAutoResolveBatteryAlert({
      existingRuleId: BATTERY_ALERT_RULE_IDS.LV_PUBLICATION_STABLE,
      summary,
      now: NOW,
    });
    expect(resolved).toBe(false);
  });
});
