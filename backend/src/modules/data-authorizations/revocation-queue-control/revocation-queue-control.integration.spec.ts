import type { Job, Queue } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { REVOCATION_CHECKPOINT, WORKER_POLICY_ENGINE_VERSION } from './revocation-queue-control.constants';
import { WorkerRevocationCheckpointService } from './worker-revocation-checkpoint.service';
import { WorkerRuntimeHealthService } from './worker-runtime-health.service';
import { QueueEnqueueGuardService } from './queue-enqueue-guard.service';
import { ScheduledJobRevocationService } from './scheduled-job-revocation.service';
import { DownstreamRevocationNotifyService } from './downstream-revocation-notify.service';
import { DenySwitchLocalStore } from '../deny-switch/deny-switch.local-store';
import { DENY_SWITCH_SCOPE } from '../deny-switch/deny-switch.constants';

const ORG = 'org-queue-ctrl';
const OTHER_ORG = 'org-other';
const VEHICLE = 'veh-1';
const WORKFLOW = 'wf-queue-1';

function mockJob(
  id: string,
  data: Record<string, unknown>,
  state: string = 'waiting',
): Job {
  return {
    id,
    data,
    remove: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn().mockResolvedValue(state),
  } as unknown as Job;
}

function mockQueue(jobs: Job[]): Queue {
  return {
    name: 'dimo.snapshot.poll',
    getJobs: jest.fn().mockResolvedValue(jobs),
  } as unknown as Queue;
}

describe('revocation queue control integration', () => {
  beforeEach(() => {
    RuntimeStatusRegistry.setWorkersEnabled(true);
  });

  describe('WorkerRevocationCheckpointService', () => {
    let checkpoint: WorkerRevocationCheckpointService;
    let denySwitch: { evaluate: jest.Mock };
    let prisma: { vehicle: { findFirst: jest.Mock; findUnique: jest.Mock } };
    let runtimeHealth: WorkerRuntimeHealthService;

    beforeEach(() => {
      const localStore = new DenySwitchLocalStore();
      localStore.apply({
        organizationId: ORG,
        scopeType: DENY_SWITCH_SCOPE.ORGANIZATION,
        scopeEntityId: ORG,
        resourceType: null,
        resourceId: null,
        sequence: 1n,
        active: true,
        blocksIngest: true,
        blocksRead: true,
        blocksQueueEnqueue: true,
        trigger: 'REVOKED',
        activatedAt: new Date().toISOString(),
      });
      localStore.markReady();

      denySwitch = {
        evaluate: jest.fn().mockReturnValue({ denied: true, reason: 'DENY_SWITCH_ACTIVE' }),
      };
      prisma = {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({ id: VEHICLE }),
          findUnique: jest.fn().mockResolvedValue({ organizationId: ORG }),
        },
      };
      runtimeHealth = new WorkerRuntimeHealthService(new DenySwitchLocalStore());
      runtimeHealth.registerWorkerPolicyEngineVersion(WORKER_POLICY_ENGINE_VERSION);

      checkpoint = new WorkerRevocationCheckpointService(
        denySwitch as never,
        prisma as never,
        undefined,
        runtimeHealth,
      );
    });

    it('blocks waiting job path via pre_persist deny switch', async () => {
      const result = await checkpoint.assertMayProceed({
        organizationId: ORG,
        vehicleId: VEHICLE,
        checkpoint: REVOCATION_CHECKPOINT.PRE_PERSIST,
        correlationId: 'waiting-job-1',
      });
      expect(result.allowed).toBe(false);
    });

    it('blocks running job at pre_persist checkpoint when deny switch active', async () => {
      const result = await checkpoint.assertMayProceed({
        organizationId: ORG,
        vehicleId: VEHICLE,
        checkpoint: REVOCATION_CHECKPOINT.PRE_PERSIST,
      });
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe('DENY_SWITCH_ACTIVE');
    });

    it('blocks foreign tenant vehicle scope mismatch', async () => {
      denySwitch.evaluate.mockReturnValue(null);
      prisma.vehicle.findFirst.mockResolvedValue(null);
      const result = await checkpoint.assertMayProceed({
        organizationId: ORG,
        vehicleId: 'foreign-vehicle',
        checkpoint: REVOCATION_CHECKPOINT.PRE_PERSIST,
      });
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe('ORG_SCOPE_MISMATCH');
    });

    it('blocks outdated worker policy engine version', async () => {
      runtimeHealth.registerWorkerPolicyEngineVersion('old-version');
      const result = await checkpoint.assertMayProceed({
        organizationId: ORG,
        vehicleId: VEHICLE,
        checkpoint: REVOCATION_CHECKPOINT.PRE_PERSIST,
      });
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe('WORKER_POLICY_ENGINE_OUTDATED');
    });
  });

  describe('QueueEnqueueGuardService', () => {
    it('denies retry enqueue when deny switch blocks queue', async () => {
      const denySwitch = {
        isQueueEnqueueDenied: jest.fn().mockReturnValue(true),
      };
      const guard = new QueueEnqueueGuardService(denySwitch as never);
      const allowed = await guard.mayEnqueue({ organizationId: ORG, context: 'retry-job' });
      expect(allowed).toBe(false);
    });

    it('allows enqueue when deny switch is clear', async () => {
      const denySwitch = {
        isQueueEnqueueDenied: jest.fn().mockReturnValue(false),
      };
      const scheduledJobs = {
        isSchedulerPaused: jest.fn().mockResolvedValue(false),
      };
      const guard = new QueueEnqueueGuardService(denySwitch as never, scheduledJobs as never);
      const allowed = await guard.mayEnqueue({
        organizationId: ORG,
        vehicleId: VEHICLE,
        schedulerKey: 'dimo-snapshot.scheduler',
        context: 'delayed-job',
      });
      expect(allowed).toBe(true);
    });

    it('blocks delayed enqueue when scheduler paused after queue restart', async () => {
      const denySwitch = {
        isQueueEnqueueDenied: jest.fn().mockReturnValue(false),
      };
      const scheduledJobs = {
        isSchedulerPaused: jest.fn().mockResolvedValue(true),
      };
      const guard = new QueueEnqueueGuardService(denySwitch as never, scheduledJobs as never);
      const allowed = await guard.mayEnqueue({
        organizationId: ORG,
        schedulerKey: 'dimo-snapshot.scheduler',
        context: 'queue-restart',
      });
      expect(allowed).toBe(false);
    });
  });

  describe('ScheduledJobRevocationService', () => {
    it('blocks backfill/cron paths when scheduler paused', async () => {
      const prisma = {
        dataAuthorizationScheduledJobPause: {
          findFirst: jest.fn().mockResolvedValue({ id: 'pause-1' }),
        },
      };
      const service = new ScheduledJobRevocationService(prisma as never);
      const paused = await service.isSchedulerPaused(ORG, 'dimo-snapshot.scheduler');
      expect(paused).toBe(true);
    });

    it('pauses cron schedulers idempotently', async () => {
      const prisma = {
        dataAuthorizationScheduledJobPause: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue({ id: 'pause-1' }),
          create: jest.fn().mockResolvedValue({}),
          count: jest.fn().mockResolvedValue(1),
        },
      };
      const service = new ScheduledJobRevocationService(prisma as never);
      const paused = await service.pauseSchedulersForOrganization({
        organizationId: ORG,
        correlationId: 'corr-1',
        schedulerKeys: ['dimo-snapshot.scheduler'],
      });
      expect(paused).toBe(1);
      expect(prisma.dataAuthorizationScheduledJobPause.create).toHaveBeenCalled();
    });
  });

  describe('queue catalog coverage', () => {
    it('includes AI, partner webhook, document, and analytics queues', async () => {
      const { REVOCATION_QUEUE_CATALOG, REVOCATION_QUEUE_CATEGORY } = await import(
        './revocation-queue-catalog'
      );
      const names = REVOCATION_QUEUE_CATALOG.map((e) => e.queueName);
      expect(names).toContain('document.extraction');
      expect(names).toContain('dtc.knowledge.enrichment');
      expect(names).toContain('voice.webhook.process');
      expect(names).toContain('booking.document.generation');
      expect(names).toContain('trip.behavior.enrichment');
      const categories = new Set(REVOCATION_QUEUE_CATALOG.map((e) => e.category));
      expect(categories.has(REVOCATION_QUEUE_CATEGORY.AI_JOB)).toBe(true);
      expect(categories.has(REVOCATION_QUEUE_CATEGORY.PARTNER_WEBHOOK)).toBe(true);
    });
  });

  describe('DownstreamRevocationNotifyService', () => {
    it('dispatches partner webhook notification with idempotent replay', async () => {
      const prisma = {
        dataAuthorizationDownstreamRevocationNotify: {
          findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
            id: 'notify-1',
            status: 'DELIVERED',
          }),
          create: jest.fn().mockResolvedValue({ id: 'notify-1', attempts: 0, maxAttempts: 8 }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      const auditOutbox = { enqueue: jest.fn().mockResolvedValue({}) };
      const service = new DownstreamRevocationNotifyService(prisma as never, auditOutbox as never);

      const first = await service.dispatch({
        organizationId: ORG,
        workflowId: WORKFLOW,
        correlationId: 'corr-partner',
        recipient: 'partner-acme',
        channel: 'partner_webhook',
        dataCategories: ['GPS_LOCATION'],
      });
      expect(first.idempotentReplay).toBe(false);
      expect(first.status).toBe('DELIVERED');

      prisma.dataAuthorizationDownstreamRevocationNotify.findUnique.mockResolvedValue({
        id: 'notify-1',
        status: 'DELIVERED',
      });
      const second = await service.dispatch({
        organizationId: ORG,
        workflowId: WORKFLOW,
        correlationId: 'corr-partner',
        recipient: 'partner-acme',
        channel: 'partner_webhook',
        dataCategories: ['GPS_LOCATION'],
      });
      expect(second.idempotentReplay).toBe(true);
    });
  });

  describe('WorkerRuntimeHealthService', () => {
    it('reports compliant when worker registers current policy engine version', () => {
      const health = new WorkerRuntimeHealthService(new DenySwitchLocalStore());
      health.registerWorkerPolicyEngineVersion(WORKER_POLICY_ENGINE_VERSION);
      const snap = health.snapshot();
      expect(snap.compliant).toBe(true);
      expect(snap.policyEngineVersion).toBe(WORKER_POLICY_ENGINE_VERSION);
    });

    it('reports non-compliant for old worker version', () => {
      const health = new WorkerRuntimeHealthService(new DenySwitchLocalStore());
      health.registerWorkerPolicyEngineVersion('legacy-worker-v0');
      expect(health.isWorkerCompliant()).toBe(false);
    });
  });
});
