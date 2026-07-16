import { InsightSeverity } from '@prisma/client';
import {
  BATTERY_TASK_INTENTS,
  BATTERY_TASK_POLICY_VERSION,
  buildBatteryTaskDedupKey,
  evaluateBatteryTasks,
  evaluateReferenceCapacityTask,
  shouldAutoResolveBatteryTask,
} from './battery-task.policy';
import { BATTERY_ALERT_RULE_IDS } from './battery-alert.policy';
import { BatteryEvidenceStrengthTier } from './battery-v2-domain';
import { ReferenceCapacityVerificationStatus } from './battery-v2-domain';
import { HV_SOH_GATE_GATE_REASONS } from './hv-capacity-shadow/hv-soh-gate.types';

const NOW = new Date('2026-07-16T12:00:00.000Z');

const vehicle = {
  id: 'veh-1',
  make: 'VW',
  model: 'ID.4',
  licensePlate: 'B-EV 100',
  homeStationId: null,
};

function baseSummary(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: 'veh-1',
    generatedAt: NOW.toISOString(),
    support: { lv: true, hv: true },
    currentState: { lastChecked: NOW.toISOString() },
    lv: {
      healthStatus: 'CRITICAL',
      publicationState: 'STABLE',
      restingVoltage: {
        valueV: 11.2,
        status: 'CRITICAL',
        measurementContext: 'RESTING',
        dataQuality: { observedAt: NOW.toISOString() },
      },
      estimatedHealth: { status: 'CRITICAL', decisionCapable: true, scorePct: 28 },
      legacyPublicationSafety: { decisionCapable: true },
      freshness: { observedAt: NOW.toISOString() },
    },
    canonical: {
      resolvedAt: NOW.toISOString(),
      liveState: { lv: { values: { voltageV: 11.2 } } },
      lv: {
        canonical: {
          primaryTruth: {
            source: 'V2_PUBLICATION_STABLE',
            decisionCapable: true,
            estimatedHealthScore: 28,
          },
        },
        publication: {
          maturity: 'STABLE',
          publishedEstimatedHealth: 28,
          assessmentEvidenceObservedAt: NOW.toISOString(),
        },
        latestQualifiedRest: { quality: 'VALID' },
        assessment: { assessmentTrack: 'TELEMETRY', assessmentMode: 'CANONICAL' },
      },
      hv: {
        providerSoh: { percent: null, decisionFresh: false },
        capacityAssessment: { shadowGatePassed: false },
        referenceCapacity: {
          id: 'ref-1',
          capacityKwh: 77,
          capacityType: 'USABLE',
          source: 'MANUFACTURER_VERIFIED',
          verificationStatus: ReferenceCapacityVerificationStatus.UNVERIFIED,
          verifiedAt: null,
        },
        sohAssessment: {
          gateReasonCodes: [HV_SOH_GATE_GATE_REASONS.REFERENCE_NOT_VERIFIED],
          sohGatePassed: false,
        },
      },
    },
    ...overrides,
  } as any;
}

describe('battery-task.policy', () => {
  it('exposes policy version 1.0.0', () => {
    expect(BATTERY_TASK_POLICY_VERSION).toBe('1.0.0');
  });

  it('creates LV professional check task from stable publication alert', () => {
    const tasks = evaluateBatteryTasks({ summary: baseSummary(), vehicle, now: NOW });
    const lvTask = tasks.find(
      (task) => task.intent === BATTERY_TASK_INTENTS.LV_PROFESSIONAL_CHECK,
    );
    expect(lvTask).toBeDefined();
    expect(lvTask?.title).toBe('12V-Batterie professionell prüfen');
    expect(lvTask?.dedupeKey).toBe(
      buildBatteryTaskDedupKey(vehicle.id, BATTERY_TASK_INTENTS.LV_PROFESSIONAL_CHECK),
    );
    expect(lvTask?.nextAction).toContain('Spannung');
  });

  it('creates warning-light diagnostic task', () => {
    const tasks = evaluateBatteryTasks({
      summary: baseSummary({
        support: { lv: true, hv: false },
        lv: {
          ...baseSummary().lv,
          healthStatus: 'GOOD',
          restingVoltage: {
            valueV: 12.7,
            status: 'GOOD',
            measurementContext: 'RESTING',
            dataQuality: { observedAt: NOW.toISOString() },
          },
        },
        canonical: {
          ...baseSummary().canonical,
          hv: undefined,
          lv: {
            ...baseSummary().canonical.lv,
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
            },
          },
        },
      }),
      vehicle,
      warningLightActive: true,
      now: NOW,
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.intent).toBe(BATTERY_TASK_INTENTS.WARNING_LIGHT_DIAGNOSTIC);
    expect(tasks[0]?.title).toBe('Battery-Warnleuchte diagnostizieren');
  });

  it('creates BMS workshop report task from workshop finding alert', () => {
    const tasks = evaluateBatteryTasks({
      summary: baseSummary({
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
    const workshopTask = tasks.find(
      (task) => task.intent === BATTERY_TASK_INTENTS.BMS_WORKSHOP_REPORT,
    );
    expect(workshopTask).toBeDefined();
    expect(workshopTask?.taskType).toBe('DOCUMENT_REVIEW');
  });

  it('does not create task from manual measurement alert alone', () => {
    const tasks = evaluateBatteryTasks({
      summary: baseSummary({
        lv: {
          ...baseSummary().lv,
          healthStatus: 'WARNING',
          restingVoltage: {
            valueV: 12.3,
            status: 'WARNING',
            measurementContext: 'RESTING',
            dataQuality: { observedAt: NOW.toISOString() },
          },
        },
        canonical: {
          ...baseSummary().canonical,
          lv: {
            ...baseSummary().canonical.lv,
            assessment: { assessmentTrack: 'DOCUMENT', assessmentMode: 'CANONICAL' },
            canonical: {
              primaryTruth: {
                source: 'V2_PUBLICATION_STABLE',
                decisionCapable: true,
                estimatedHealthScore: 55,
              },
            },
          },
        },
      }),
      vehicle,
      now: NOW,
    });
    expect(
      tasks.some((task) => task.alertRuleId === BATTERY_ALERT_RULE_IDS.MANUAL_MEASUREMENT),
    ).toBe(false);
  });

  it('deduplicates multiple alert rules into one LV professional check task', () => {
    const tasks = evaluateBatteryTasks({
      summary: baseSummary(),
      vehicle,
      activeDtcFaults: [{ code: 'P0A80', description: 'Battery fault', severity: 'CRITICAL' }],
      now: NOW,
    });
    const lvTasks = tasks.filter(
      (task) => task.intent === BATTERY_TASK_INTENTS.LV_PROFESSIONAL_CHECK,
    );
    expect(lvTasks).toHaveLength(1);
  });

  it('creates reference capacity confirm task when HV reference is unverified', () => {
    const task = evaluateReferenceCapacityTask({
      summary: baseSummary(),
      vehicle,
    });
    expect(task?.intent).toBe(BATTERY_TASK_INTENTS.REFERENCE_CAPACITY_CONFIRM);
    expect(task?.title).toBe('Referenzkapazität bestätigen');
  });

  it('does not create reference capacity task from HV shadow gate alone', () => {
    const task = evaluateReferenceCapacityTask({
      summary: baseSummary({
        canonical: {
          ...baseSummary().canonical,
          hv: {
            ...baseSummary().canonical.hv,
            referenceCapacity: null,
            sohAssessment: {
              gateReasonCodes: [HV_SOH_GATE_GATE_REASONS.CAPACITY_ASSESSMENT_NOT_STABLE],
              sohGatePassed: false,
            },
          },
        },
      }),
      vehicle,
    });
    expect(task).toBeNull();
  });

  it('auto-resolves reference capacity task when verification no longer needed', () => {
    const resolved = shouldAutoResolveBatteryTask({
      taskIntent: BATTERY_TASK_INTENTS.REFERENCE_CAPACITY_CONFIRM,
      summary: baseSummary({
        canonical: {
          ...baseSummary().canonical,
          hv: {
            ...baseSummary().canonical.hv,
            referenceCapacity: {
              ...baseSummary().canonical.hv.referenceCapacity,
              verificationStatus: ReferenceCapacityVerificationStatus.VERIFIED,
            },
            sohAssessment: { gateReasonCodes: [], sohGatePassed: true },
          },
        },
      }),
      vehicleId: vehicle.id,
    });
    expect(resolved?.autoResolve).toBe(true);
    expect(resolved?.resolutionCode).toBe('REFERENCE_CAPACITY_VERIFIED');
  });

  it('auto-resolves LV task when alert condition clears', () => {
    const resolved = shouldAutoResolveBatteryTask({
      taskIntent: BATTERY_TASK_INTENTS.LV_PROFESSIONAL_CHECK,
      summary: baseSummary({
        support: { lv: true, hv: false },
        lv: {
          healthStatus: 'GOOD',
          publicationState: 'STABLE',
          restingVoltage: {
            valueV: 12.8,
            status: 'GOOD',
            measurementContext: 'RESTING',
            dataQuality: { observedAt: NOW.toISOString() },
          },
          estimatedHealth: { status: 'GOOD', decisionCapable: true, scorePct: 88 },
          legacyPublicationSafety: { decisionCapable: true },
          freshness: { observedAt: NOW.toISOString() },
        },
        canonical: {
          resolvedAt: NOW.toISOString(),
          liveState: { lv: { values: { voltageV: 12.8 } } },
          lv: {
            canonical: {
              primaryTruth: {
                source: 'V2_PUBLICATION_STABLE',
                decisionCapable: true,
                estimatedHealthScore: 88,
              },
            },
            publication: {
              maturity: 'STABLE',
              publishedEstimatedHealth: 88,
              assessmentEvidenceObservedAt: NOW.toISOString(),
            },
            latestQualifiedRest: { quality: 'VALID' },
            assessment: { assessmentTrack: 'TELEMETRY', assessmentMode: 'CANONICAL' },
          },
        },
      }),
      vehicleId: vehicle.id,
      now: NOW,
    });
    expect(resolved?.autoResolve).toBe(true);
  });
});
