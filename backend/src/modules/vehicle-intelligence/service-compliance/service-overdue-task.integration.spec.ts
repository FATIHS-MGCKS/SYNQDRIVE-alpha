import { TaskCompletionMode } from '@prisma/client';
import { InsightEntityScope, InsightSeverity, InsightType } from '@prisma/client';
import type { InsightCandidate } from '@modules/business-insights/insight.types';
import { InsightTaskBridgeService } from '@modules/business-insights/insight-task-bridge.service';
import { createNoopTaskAutomationOutboxDeps } from '@modules/tasks/outbox/task-automation-outbox-test.util';
import { TasksService } from '@modules/tasks/tasks.service';
import { ServiceOverdueTaskService } from './service-overdue-task.service';
import { buildServiceOverdueTaskContext } from './service-overdue-task.util';
import type { ServiceComplianceEvaluation } from './service-compliance.types';

describe('Service overdue task automation', () => {
  const orgId = 'org-svc';
  const vehicleId = 'veh-svc';

  function overdueEvaluation(): ServiceComplianceEvaluation {
    return {
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        distanceToNextServiceKm: -200,
        timeToNextServiceDays: -4,
        lastUpdatedAt: '2026-07-10T10:00:00.000Z',
        serviceSourceLabel: 'HM/OEM',
        severity: 'CRITICAL',
        blocksRental: false,
        title: 'Service überfällig',
        description: '',
        message: 'Service überfällig',
        hmDistanceFromOem: true,
        hmTimeFromOem: true,
        hmDerivedDueDate: '2026-07-11T00:00:00.000Z',
      },
      tuvBokraft: {
        tuvValidTill: null,
        tuvRemainingMonths: null,
        tuvRemainingDays: null,
        tuvOverdue: false,
        tuvLastDate: null,
        bokraftValidTill: null,
        bokraftRemainingMonths: null,
        bokraftRemainingDays: null,
        bokraftOverdue: false,
        bokraftLastDate: null,
      },
    };
  }

  function overdueCandidate(suggestionOnly = false): InsightCandidate {
    const ctx = buildServiceOverdueTaskContext({
      vehicleLabel: 'B-XY 1',
      nextService: overdueEvaluation().nextService,
      vehicle: { mileageKm: 60000, lastServiceOdometerKm: 40000 },
    })!;

    return {
      type: InsightType.SERVICE_OVERDUE,
      severity: suggestionOnly ? InsightSeverity.WARNING : InsightSeverity.CRITICAL,
      priority: suggestionOnly ? 65 : 85,
      title: suggestionOnly ? 'Service bald fällig' : 'Service überfällig',
      message: 'Test',
      entityScope: InsightEntityScope.VEHICLE,
      entityIds: [vehicleId],
      reasons: [],
      confidence: 0.9,
      dedupeKey: `service_overdue:${vehicleId}`,
      metrics: { suggestionOnly, serviceOverdue: ctx },
    };
  }

  it('materialises overdue SERVICE_OVERDUE with structured metadata and no rental block', async () => {
    const prisma = {
      dashboardInsight: { findFirst: jest.fn().mockResolvedValue({ id: 'insight-1' }) },
      orgTask: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const tasks = {
      upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-1' }),
      closeStaleInsightTasks: jest.fn().mockResolvedValue(0),
    };
    const serviceOverdueTasks = new ServiceOverdueTaskService(prisma as any, tasks as any, {} as any);
    const { outboxEnqueue, outboxContext } = createNoopTaskAutomationOutboxDeps();
    const bridge = new InsightTaskBridgeService(
      tasks as any,
      prisma as any,
      serviceOverdueTasks,
      outboxEnqueue,
      outboxContext,
    );

    await bridge.materialize(orgId, [overdueCandidate()]);

    expect(tasks.upsertByDedup).toHaveBeenCalledWith(
      orgId,
      `service_overdue:${vehicleId}`,
      expect.objectContaining({
        type: 'VEHICLE_SERVICE',
        source: 'INSIGHT_SERVICE',
        alertId: 'insight-1',
        blocksVehicleAvailability: false,
        metadata: expect.objectContaining({
          serviceOverdue: expect.objectContaining({
            overdueByTime: true,
            overdueByKm: true,
          }),
          allowAutoResolve: true,
        }),
      }),
    );
  });

  it('does not auto-materialize due-soon suggestion-only insights', async () => {
    const prisma = {
      dashboardInsight: { findFirst: jest.fn() },
      orgTask: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const tasks = {
      upsertByDedup: jest.fn(),
      closeStaleInsightTasks: jest.fn().mockResolvedValue(0),
    };
    const serviceOverdueTasks = new ServiceOverdueTaskService(prisma as any, tasks as any, {} as any);
    const { outboxEnqueue, outboxContext } = createNoopTaskAutomationOutboxDeps();
    const bridge = new InsightTaskBridgeService(
      tasks as any,
      prisma as any,
      serviceOverdueTasks,
      outboxEnqueue,
      outboxContext,
    );

    await bridge.materialize(orgId, [overdueCandidate(true)]);

    expect(tasks.upsertByDedup).not.toHaveBeenCalled();
    expect(tasks.closeStaleInsightTasks).toHaveBeenCalledWith(orgId, [], ['INSIGHT_SERVICE', 'INSIGHT_COMPLIANCE', 'INSIGHT_HEALTH']);
  });

  it('auto-resolves open task when insight disappears with INSIGHT_CLEARED', async () => {
    const tasks = {
      upsertByDedup: jest.fn(),
      closeStaleInsightTasks: jest.fn().mockResolvedValue(1),
      autoResolveTask: jest.fn().mockResolvedValue({
        id: 'task-1',
        status: 'DONE',
        completionMode: TaskCompletionMode.AUTO_RESOLVED,
      }),
    } as unknown as TasksService;

    const closed = await tasks.closeStaleInsightTasks(orgId, [`service_overdue:${vehicleId}`], ['INSIGHT_SERVICE']);
    expect(closed).toBe(1);
  });
});
