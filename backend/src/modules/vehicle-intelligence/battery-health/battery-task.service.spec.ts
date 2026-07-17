import { InsightSeverity, InsightType } from '@prisma/client';
import { BatteryTaskService } from './battery-task.service';
import { BATTERY_TASK_INTENTS } from './battery-task.policy';

describe('BatteryTaskService', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-1';

  const buildService = () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: vehicleId,
          make: 'VW',
          model: 'Golf',
          licensePlate: 'B-AB 1',
          homeStationId: null,
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      orgTask: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const tasks = {
      upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-1' }),
      autoResolveTask: jest.fn().mockResolvedValue({ id: 'task-1', status: 'DONE' }),
    };
    const canonicalBatteryHealth = {
      getSummary: jest.fn().mockResolvedValue({
        vehicleId,
        generatedAt: new Date().toISOString(),
        support: { lv: true, hv: false },
        currentState: { lastChecked: new Date().toISOString() },
        lv: {
          healthStatus: 'CRITICAL',
          publicationState: 'STABLE',
          restingVoltage: {
            valueV: 11.2,
            status: 'CRITICAL',
            measurementContext: 'RESTING',
            dataQuality: { observedAt: new Date().toISOString() },
          },
          estimatedHealth: { status: 'CRITICAL', decisionCapable: true, scorePct: 28 },
          legacyPublicationSafety: { decisionCapable: true },
          freshness: { observedAt: new Date().toISOString() },
        },
        canonical: {
          resolvedAt: new Date().toISOString(),
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
              assessmentEvidenceObservedAt: new Date().toISOString(),
            },
            latestQualifiedRest: { quality: 'VALID' },
            assessment: { assessmentTrack: 'TELEMETRY', assessmentMode: 'CANONICAL' },
          },
        },
      }),
    };
    const ruleResolver = {
      resolveTaskAutomationRule: jest.fn().mockResolvedValue({
        effectivelyEnabled: true,
        materializesTask: true,
      }),
    };
    const outboxEnqueue = { enqueueFailure: jest.fn() };
    const outboxContext = { fromOutbox: false };

    const service = new BatteryTaskService(
      prisma as any,
      tasks as any,
      canonicalBatteryHealth as any,
      ruleResolver as any,
      outboxEnqueue as any,
      outboxContext as any,
    );

    return { service, prisma, tasks, canonicalBatteryHealth, ruleResolver };
  };

  it('materializes semantic battery tasks from insight candidate', async () => {
    const { service, tasks } = buildService();
    const result = await service.materializeFromInsightCandidate(
      organizationId,
      {
        type: InsightType.BATTERY_CRITICAL,
        dedupeKey: `battery_alert:${vehicleId}:battery.alert.lv_publication_stable`,
        severity: InsightSeverity.CRITICAL,
        entityIds: [vehicleId],
      },
      'alert-1',
    );

    expect(result.dedupeKeys).toHaveLength(1);
    expect(result.dedupeKeys[0]).toBe(
      `battery_task:${vehicleId}:${BATTERY_TASK_INTENTS.LV_PROFESSIONAL_CHECK}`,
    );
    expect(tasks.upsertByDedup).toHaveBeenCalledWith(
      organizationId,
      `battery_task:${vehicleId}:${BATTERY_TASK_INTENTS.LV_PROFESSIONAL_CHECK}`,
      expect.objectContaining({
        title: '12V-Batterie professionell prüfen',
        vehicleId,
        alertId: 'alert-1',
        metadata: expect.objectContaining({
          batteryTask: expect.objectContaining({
            taskIntent: BATTERY_TASK_INTENTS.LV_PROFESSIONAL_CHECK,
            nextAction: expect.any(String),
          }),
        }),
      }),
    );
  });

  it('skips materialization when automation rule is disabled', async () => {
    const { service, tasks, ruleResolver } = buildService();
    ruleResolver.resolveTaskAutomationRule.mockResolvedValue({ effectivelyEnabled: false });

    const result = await service.materializeFromInsightCandidate(organizationId, {
      type: InsightType.BATTERY_CRITICAL,
      dedupeKey: 'battery_alert:x',
      severity: InsightSeverity.CRITICAL,
      entityIds: [vehicleId],
    });

    expect(result.dedupeKeys).toHaveLength(0);
    expect(tasks.upsertByDedup).not.toHaveBeenCalled();
  });
});
