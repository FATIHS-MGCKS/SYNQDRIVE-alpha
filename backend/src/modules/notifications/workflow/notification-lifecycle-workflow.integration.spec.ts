import {
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationSourceType,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { OrgWorkflow } from '@prisma/client';
import { TasksService } from '@modules/tasks/tasks.service';
import { WorkflowEngineService } from '@modules/workflows/workflow-engine.service';
import { WorkflowActionExecutorService } from '@modules/workflows/workflow-action-executor.service';
import { WorkflowEventService } from '@modules/workflows/workflow-event.service';
import { WorkflowExecutionMode } from '@modules/workflows/workflow-execution-mode';
import { makeRolloutServiceMock } from '@modules/workflows/rollout/workflow-runtime-rollout.test-util';
import { ConfigService } from '@nestjs/config';
import { NotificationEngineConfig } from '../notification-engine.config';
import { NotificationCoreService } from '../notification-core.service';
import {
  ACTIVE_NOTIFICATION_STATUSES,
  NotificationRepository,
} from '../notification.repository';
import type { NotificationCandidate } from '../notification.types';
import {
  NotificationActionType as DomainActionType,
  NotificationDomain as DomainDomain,
  NotificationEntityType as DomainEntityType,
  NotificationEventKind as DomainEventKind,
  NotificationSeverity as DomainSeverity,
  NotificationSourceType as DomainSourceType,
} from '../notification.enums';
import { DEFAULT_STATE_REOPEN_POLICY } from '../notification-reopen.policy';
import { NotificationDeliveryEnqueueService } from '../delivery/notification-delivery-enqueue.service';
import { NotificationDeliveryPolicyService } from '../delivery/notification-delivery-policy.service';
import { NotificationDeliverySchedulerService } from '../delivery/notification-delivery-scheduler.service';
import { NotificationLifecycleWorkflowEmitter } from './notification-lifecycle-workflow.emitter';
import {
  resolveWorkflowTriggerNotificationId,
  shouldSuppressWorkflowNotificationLoop,
} from './notification-workflow-loop.guard';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEH = 'veh-1';

function buildCandidate(overrides: Partial<NotificationCandidate> = {}): NotificationCandidate {
  const occurredAt = overrides.occurredAt ?? new Date('2026-07-11T10:00:00.000Z');
  return {
    organizationId: ORG_A,
    eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
    eventKind: DomainEventKind.STATE,
    domain: DomainDomain.VEHICLE_HEALTH,
    severity: DomainSeverity.WARNING,
    entityType: DomainEntityType.VEHICLE,
    entityId: VEH,
    conditionCode: 'driving_assessment_device_quality',
    scopeVersion: 1,
    sourceType: DomainSourceType.DASHBOARD_INSIGHT,
    sourceRef: 'insight-run-1',
    occurredAt,
    titleKey: 'notification.title.drivingAssessmentDegraded',
    bodyKey: 'notification.body.insightDefault',
    templateParams: { plate: 'WOB L 7503' },
    actionType: DomainActionType.OPEN_VEHICLE_MODULE,
    actionTarget: { type: DomainActionType.OPEN_VEHICLE_MODULE, vehicleId: VEH, module: 'health' },
    resolutionPolicy: {
      eventKind: DomainEventKind.STATE,
      autoResolveWhenConditionClears: true,
      reopenPolicy: { ...DEFAULT_STATE_REOPEN_POLICY, cooldownMs: 0 },
    },
    ...overrides,
  };
}

function fingerprintFrom(candidate: NotificationCandidate): string {
  return [
    candidate.organizationId,
    candidate.eventType,
    candidate.entityType,
    candidate.entityId,
    candidate.conditionCode,
    `v${candidate.scopeVersion ?? 1}`,
  ].join('|');
}

function createInMemoryRepository() {
  let idSeq = 0;
  const notifications = new Map<string, any>();
  const occurrences: any[] = [];
  const activeByFingerprint = new Map<string, string>();

  const activeKey = (orgId: string, fp: string, gen: number) => `${orgId}::${fp}::${gen}`;

  const repo = {
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(repo),
    findAnyActiveByFingerprint: async (orgId: string, fp: string) => {
      for (const row of notifications.values()) {
        if (
          row.organizationId === orgId
          && row.fingerprint === fp
          && ACTIVE_NOTIFICATION_STATUSES.includes(row.status)
        ) {
          return row;
        }
      }
      return null;
    },
    findLatestByFingerprint: async (orgId: string, fp: string) => {
      let latest: any = null;
      for (const row of notifications.values()) {
        if (row.organizationId === orgId && row.fingerprint === fp) {
          if (!latest || row.lifecycleGeneration > latest.lifecycleGeneration) latest = row;
        }
      }
      return latest;
    },
    findById: async (id: string, orgId: string) => {
      const row = notifications.get(id);
      return row?.organizationId === orgId ? row : null;
    },
    createNotification: async (data: any) => {
      const id = `notif-${++idSeq}`;
      const row = {
        id,
        version: 1,
        status: NotificationStatus.OPEN,
        occurrenceCount: 1,
        reopenCount: 0,
        acknowledgedAt: null,
        resolvedAt: null,
        archivedAt: null,
        snoozedUntil: null,
        ...data,
      };
      notifications.set(id, row);
      activeByFingerprint.set(
        activeKey(data.organizationId, data.fingerprint, data.lifecycleGeneration),
        id,
      );
      return row;
    },
    createOccurrence: async (data: any) => {
      occurrences.push(data);
    },
    updateNotification: async (id: string, data: any, version: number) => {
      const row = notifications.get(id);
      if (!row) throw new Error('not found');
      const updated = { ...row, ...data, version: version + 1 };
      notifications.set(id, updated);
      return updated;
    },
    _notifications: notifications,
  } as unknown as NotificationRepository;

  return repo;
}

function createCoreWithWorkflowCapture() {
  const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const workflowEvents = {
    scheduleEmit: jest.fn((event: { type: string; payload: Record<string, unknown> }) => {
      emitted.push({ type: event.type, payload: event.payload });
    }),
    emitEvent: jest.fn(),
  } as unknown as WorkflowEventService;

  const emitter = new NotificationLifecycleWorkflowEmitter(workflowEvents);
  const deliveryEnqueue = {
    enqueueInTransaction: jest.fn().mockResolvedValue([]),
  } as unknown as NotificationDeliveryEnqueueService;
  const deliveryScheduler = {
    scheduleOutboxIds: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationDeliverySchedulerService;

  const repository = createInMemoryRepository();
  const service = new NotificationCoreService(
    repository,
    { isV2Enabled: () => true } as NotificationEngineConfig,
    deliveryEnqueue,
    new NotificationDeliveryPolicyService(),
    deliveryScheduler,
    emitter,
  );

  return { service, repository, emitted, workflowEvents };
}

function makeWorkflow(overrides: Partial<OrgWorkflow> = {}): OrgWorkflow {
  return {
    id: 'wf-1',
    organizationId: ORG_A,
    name: 'Notification workflow',
    description: null,
    category: 'maintenance',
    trigger: { type: 'notification.opened' },
    conditions: [],
    actions: [{ type: 'task.create', config: { title: 'Follow-up' } }],
    scope: { type: 'organization' },
    status: 'ACTIVE',
    enabled: true,
    version: 1,
    triggerCount: 0,
    lastTriggeredAt: null,
    createdById: null,
    createdByName: null,
    updatedById: null,
    updatedByName: null,
    isTemplate: false,
    systemMetadata: null,
    shadowEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as OrgWorkflow;
}

function makeWorkflowPrisma(workflows: OrgWorkflow[]) {
  const runs = new Map<string, unknown>();
  return {
    orgWorkflow: {
      findMany: jest.fn(async ({ where }: { where: { organizationId: string } }) =>
        workflows.filter(
          (wf) =>
            wf.organizationId === where.organizationId
            && wf.status === 'ACTIVE'
            && wf.enabled,
        ),
      ),
      update: jest.fn(),
    },
    orgWorkflowRun: {
      findUnique: jest.fn(async ({
        where,
      }: {
        where: { organizationId_idempotencyKey: { organizationId: string; idempotencyKey: string } };
      }) => {
        const key = `${where.organizationId_idempotencyKey.organizationId}:${where.organizationId_idempotencyKey.idempotencyKey}`;
        return runs.get(key) ?? null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `run-${runs.size + 1}`, ...data };
        runs.set(`${data.organizationId}:${data.idempotencyKey}`, row);
        return row;
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    orgWorkflowActionRun: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: `ar-${data.actionIndex}`,
        ...data,
      })),
      update: jest.fn().mockResolvedValue({}),
    },
    orgWorkflowApproval: { create: jest.fn() },
    vehicle: { findFirst: jest.fn(), update: jest.fn() },
    booking: { findFirst: jest.fn() },
    _runs: runs,
  } as any;
}

function makeWorkflowEngine(prisma: ReturnType<typeof makeWorkflowPrisma>) {
  const upsertByDedup = jest.fn().mockResolvedValue({ id: 'task-1' });
  const rollout = makeRolloutServiceMock();
  const config = { get: jest.fn().mockReturnValue(20) } as unknown as ConfigService;
  const shadowGate = {
    resolve: jest.fn().mockResolvedValue({
      runShadow: false,
      runLive: true,
      legacyCompare: false,
      orgShadowEnabled: false,
    }),
    isOrgShadowEnabled: jest.fn().mockResolvedValue(false),
  };
  const shadowService = { scheduleShadowEvaluation: jest.fn() };

  const engine = new WorkflowEngineService(
    prisma,
    new WorkflowActionExecutorService(
      prisma,
      { upsertByDedup } as unknown as TasksService,
      rollout as never,
    ),
    shadowGate as never,
    shadowService as never,
    rollout as never,
    config,
  );

  return { engine, upsertByDedup };
}

describe('Notification lifecycle workflow integration', () => {
  describe('emitter payload contract', () => {
    it('emits notification.opened on create with full canonical payload', async () => {
      const { service, emitted } = createCoreWithWorkflowCapture();
      const result = await service.ingestCandidate(buildCandidate());

      expect(result.operation).toBe('created');
      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('notification.opened');
      expect(emitted[0].payload).toEqual(
        expect.objectContaining({
          organizationId: ORG_A,
          notificationId: result.notification!.id,
          fingerprint: fingerprintFrom(buildCandidate()),
          lifecycleGeneration: 1,
          reopenCount: 0,
          eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
          entityType: NotificationEntityType.VEHICLE,
          entityId: VEH,
          severity: NotificationSeverity.WARNING,
          correlationId: expect.any(String),
          occurredAt: expect.any(String),
        }),
      );
    });

    it('emits notification.escalated when severity increases', async () => {
      const { service, emitted } = createCoreWithWorkflowCapture();
      await service.ingestCandidate(buildCandidate());
      emitted.length = 0;

      await service.ingestCandidate(
        buildCandidate({
          severity: DomainSeverity.CRITICAL,
          occurredAt: new Date('2026-07-11T11:00:00.000Z'),
        }),
      );

      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('notification.escalated');
      expect(emitted[0].payload.severity).toBe(NotificationSeverity.CRITICAL);
    });

    it('emits notification.resolved on recovery ingest', async () => {
      const { service, emitted } = createCoreWithWorkflowCapture();
      const created = await service.ingestCandidate(buildCandidate());
      emitted.length = 0;

      await service.ingestCandidate(
        buildCandidate({
          severity: DomainSeverity.SUCCESS,
          occurredAt: new Date('2026-07-11T12:00:00.000Z'),
        }),
      );

      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('notification.resolved');
      expect(emitted[0].payload.notificationId).toBe(created.notification!.id);
    });

    it('emits notification.reopened after resolve + recurrence', async () => {
      const { service, emitted } = createCoreWithWorkflowCapture();
      await service.ingestCandidate(buildCandidate());
      await service.ingestCandidate(
        buildCandidate({
          severity: DomainSeverity.SUCCESS,
          occurredAt: new Date('2026-07-11T12:00:00.000Z'),
        }),
      );
      emitted.length = 0;

      await service.ingestCandidate(
        buildCandidate({
          occurredAt: new Date('2026-07-11T13:00:00.000Z'),
        }),
      );

      expect(emitted.some((e) => e.type === 'notification.reopened')).toBe(true);
    });

    it('emits notification.acknowledged on org-wide acknowledge', async () => {
      const { service, emitted } = createCoreWithWorkflowCapture();
      const created = await service.ingestCandidate(buildCandidate());
      emitted.length = 0;

      await service.acknowledgeNotification(created.notification!.id, ORG_A);

      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('notification.acknowledged');
    });
  });

  describe('workflow loop guard', () => {
    it('blocks ingest when workflowTriggerNotificationId matches existing notification', async () => {
      const { service } = createCoreWithWorkflowCapture();
      const created = await service.ingestCandidate(buildCandidate());

      const loopResult = await service.ingestCandidate(
        buildCandidate({
          metadata: { workflowTriggerNotificationId: created.notification!.id },
        }),
        { workflowTriggerNotificationId: created.notification!.id },
      );

      expect(loopResult.operation).toBe('ignored');
      expect(loopResult.reason).toBe('WORKFLOW_LOOP_GUARD');
    });

    it('shouldSuppressWorkflowNotificationLoop returns true only for matching trigger id', () => {
      const candidate = buildCandidate({
        metadata: { workflowTriggerNotificationId: 'notif-1' },
      });
      expect(
        shouldSuppressWorkflowNotificationLoop(candidate, {}, { id: 'notif-1', fingerprint: 'fp' }),
      ).toBe(true);
      expect(
        shouldSuppressWorkflowNotificationLoop(candidate, {}, { id: 'notif-2', fingerprint: 'fp' }),
      ).toBe(false);
      expect(resolveWorkflowTriggerNotificationId(candidate, {})).toBe('notif-1');
    });
  });

  describe('workflow engine consumption', () => {
    it('runs multiple ACTIVE workflows for notification.opened', async () => {
      const workflows = [
        makeWorkflow({ id: 'wf-1', trigger: { type: 'notification.opened' } }),
        makeWorkflow({ id: 'wf-2', trigger: { type: 'notification.opened' } }),
      ];
      const prisma = makeWorkflowPrisma(workflows);
      const { engine, upsertByDedup } = makeWorkflowEngine(prisma);

      const notificationId = 'notif-abc';
      const runIds = await engine.processEvent({
        organizationId: ORG_A,
        type: 'notification.opened',
        entityType: 'vehicle',
        entityId: VEH,
        idempotencyKey: `notification.opened:${notificationId}:gen:1`,
        payload: {
          organizationId: ORG_A,
          notificationId,
          fingerprint: 'fp-1',
          lifecycleGeneration: 1,
          reopenCount: 0,
          eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
          entityType: 'VEHICLE',
          entityId: VEH,
          severity: 'WARNING',
          occurredAt: new Date().toISOString(),
          correlationId: 'corr-1',
        },
      });

      expect(runIds).toHaveLength(2);
      expect(prisma.orgWorkflowRun.create).toHaveBeenCalledTimes(2);
      expect(prisma.orgWorkflowActionRun.create).toHaveBeenCalledTimes(2);
    });

    it('does not run DISABLED workflows', async () => {
      const workflows = [
        makeWorkflow({ id: 'wf-disabled', enabled: false }),
      ];
      const prisma = makeWorkflowPrisma(workflows);
      prisma.orgWorkflow.findMany.mockResolvedValue([]);
      const { engine, upsertByDedup } = makeWorkflowEngine(prisma);

      const runIds = await engine.processEvent({
        organizationId: ORG_A,
        type: 'notification.opened',
        payload: { notificationId: 'n1' },
      });

      expect(runIds).toHaveLength(0);
      expect(upsertByDedup).not.toHaveBeenCalled();
    });

    it('isolates tenants — org B workflows never match org A events', async () => {
      const workflows = [
        makeWorkflow({ id: 'wf-b', organizationId: ORG_B, trigger: { type: 'notification.resolved' } }),
      ];
      const prisma = makeWorkflowPrisma(workflows);
      const { engine, upsertByDedup } = makeWorkflowEngine(prisma);

      const runIds = await engine.processEvent({
        organizationId: ORG_A,
        type: 'notification.resolved',
        payload: {
          organizationId: ORG_A,
          notificationId: 'notif-x',
          fingerprint: 'fp',
          lifecycleGeneration: 1,
          reopenCount: 0,
          eventType: 'TEST',
          entityType: 'VEHICLE',
          entityId: VEH,
          severity: 'WARNING',
          occurredAt: new Date().toISOString(),
          correlationId: 'corr-x',
        },
      });

      expect(runIds).toHaveLength(0);
      expect(upsertByDedup).not.toHaveBeenCalled();
      expect(prisma.orgWorkflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_A }),
        }),
      );
    });

    it('workflow action output references triggering notificationId', async () => {
      const prisma = makeWorkflowPrisma([makeWorkflow()]);
      const upsertByDedup = jest.fn().mockResolvedValue({ id: 'task-1' });
      const rollout = makeRolloutServiceMock();
      const executor = new WorkflowActionExecutorService(
        prisma,
        { upsertByDedup } as unknown as TasksService,
        rollout as never,
      );

      const result = await executor.execute(
        { type: 'notification.prepare', config: { message: 'Draft' } },
        {
          organizationId: ORG_A,
          workflowId: 'wf-1',
          workflowRunId: 'run-1',
          actionRunId: 'ar-0',
          actionIndex: 0,
          eventType: 'notification.opened',
          entityType: 'vehicle',
          entityId: VEH,
          payload: {
            notificationId: 'notif-trigger',
            organizationId: ORG_A,
            fingerprint: 'fp',
            lifecycleGeneration: 1,
            reopenCount: 0,
            eventType: 'TEST',
            severity: 'WARNING',
            occurredAt: new Date().toISOString(),
            correlationId: 'corr-1',
          },
          idempotencyKey: 'key-1',
          executionMode: WorkflowExecutionMode.LIVE,
        },
      );

      expect(result.output?.triggeringNotificationId).toBe('notif-trigger');
      const metadata = upsertByDedup.mock.calls[0][2].metadata as Record<string, unknown>;
      expect(metadata.triggeringNotificationId).toBe('notif-trigger');
    });
  });
});
