import { CommunicationChannel } from '@prisma/client';
import { NotificationStatus } from '@prisma/client';
import { NotificationEngineConfig } from '../notification-engine.config';
import { NotificationCoreService } from '../notification-core.service';
import { NotificationRepository } from '../notification.repository';
import { NotificationDeliveryEnqueueService } from '../delivery/notification-delivery-enqueue.service';
import { NotificationDeliveryPolicyService } from '../delivery/notification-delivery-policy.service';
import { NotificationDeliverySchedulerService } from '../delivery/notification-delivery-scheduler.service';
import { CommunicationHandoffNotificationAdapter } from './communication-handoff-notification.adapter';
import { createNotificationProducerRouter } from '../testing/notification-producer-router.factory';

function createDeliveryMocks() {
  return {
    deliveryEnqueue: {
      isDeliveryEnabled: () => false,
      enqueueInTransaction: jest.fn().mockResolvedValue([]),
    } as unknown as NotificationDeliveryEnqueueService,
    deliveryPolicy: new NotificationDeliveryPolicyService(),
    deliveryScheduler: {
      scheduleOutboxIds: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationDeliverySchedulerService,
  };
}

describe('CommunicationHandoffNotificationAdapter ingest dedupe', () => {
  let v2Enabled = true;
  const notifications = new Map<string, any>();
  const activeByFingerprint = new Map<string, string>();
  let idSeq = 0;

  const engineConfig = {
    isV2Enabled: () => v2Enabled,
    isV2EnabledForOrg: () => v2Enabled,
  } as unknown as NotificationEngineConfig;

  const repository = {
    findAnyActiveByFingerprint: jest.fn(async (orgId: string, fp: string) => {
      const id = activeByFingerprint.get(`${orgId}:${fp}`);
      return id ? notifications.get(id) : null;
    }),
    findLatestByFingerprint: jest.fn(async (orgId: string, fp: string) => {
      const matches = [...notifications.values()].filter(
        (n) => n.organizationId === orgId && n.fingerprint === fp,
      );
      return matches.sort((a, b) => b.lifecycleGeneration - a.lifecycleGeneration)[0] ?? null;
    }),
    findById: jest.fn(async (id: string, orgId: string) => {
      const row = notifications.get(id);
      return row?.organizationId === orgId ? row : null;
    }),
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    createNotification: jest.fn(async (data: any) => {
      const id = `notif-${++idSeq}`;
      const row = {
        id,
        ...data,
        status: NotificationStatus.OPEN,
        occurrenceCount: 1,
        lifecycleGeneration: data.lifecycleGeneration ?? 1,
        version: 1,
        templateParams: data.templateParams ?? {},
        actionTarget: data.actionTarget ?? {},
        lastSeenAt: data.lastSeenAt ?? data.firstSeenAt,
      };
      notifications.set(id, row);
      activeByFingerprint.set(`${data.organizationId}:${data.fingerprint}`, id);
      return row;
    }),
    updateNotification: jest.fn(async (id: string, data: any, version?: number) => {
      const existing = notifications.get(id);
      if (!existing) throw new Error('not found');
      if (version != null && existing.version !== version) throw new Error('version conflict');
      const updated = { ...existing, ...data, version: (existing.version ?? 1) + 1 };
      notifications.set(id, updated);
      return updated;
    }),
    createOccurrence: jest.fn(async () => ({ id: `occ-${++idSeq}` })),
  } as unknown as NotificationRepository;

  const adapter = new CommunicationHandoffNotificationAdapter();

  beforeEach(() => {
    notifications.clear();
    activeByFingerprint.clear();
    idSeq = 0;
    jest.clearAllMocks();
  });

  it('dedupes same communicationEventId and allows a new event id', async () => {
    const { deliveryEnqueue, deliveryPolicy, deliveryScheduler } = createDeliveryMocks();
    const core = new NotificationCoreService(
      repository,
      engineConfig,
      deliveryEnqueue,
      deliveryPolicy,
      deliveryScheduler,
    );
    const ingestObservability = {
      recordCandidate: jest.fn(),
      recordCandidateRejected: jest.fn(),
    };
    const router = createNotificationProducerRouter(core, engineConfig, ingestObservability as any);

    const baseSource = {
      conversationId: 'conv-1',
      channel: CommunicationChannel.WHATSAPP,
      stationId: 'station-a',
      contactDisplay: 'Customer A',
      handoffReasonCode: 'LOW_CONFIDENCE',
    };

    await router.ingestFromAdapter(adapter, { ...baseSource, communicationEventId: 'evt-1' }, {
      organizationId: 'org-1',
      sourceRef: 'evt-1',
      occurredAt: new Date('2026-08-23T10:00:00.000Z'),
      runId: 'evt-1',
    });
    await router.ingestFromAdapter(adapter, { ...baseSource, communicationEventId: 'evt-1' }, {
      organizationId: 'org-1',
      sourceRef: 'evt-1',
      occurredAt: new Date('2026-08-23T10:00:00.000Z'),
      runId: 'evt-1-replay',
    });
    await router.ingestFromAdapter(adapter, { ...baseSource, communicationEventId: 'evt-2' }, {
      organizationId: 'org-1',
      sourceRef: 'evt-2',
      occurredAt: new Date('2026-08-23T10:05:00.000Z'),
      runId: 'evt-2',
    });

    expect(notifications.size).toBe(2);
    const conditionCodes = [...notifications.values()]
      .map((row) => row.conditionCode)
      .sort();
    expect(conditionCodes).toEqual(['handoff_required:evt-1', 'handoff_required:evt-2']);
    expect(repository.createNotification).toHaveBeenCalledTimes(2);
    expect(repository.updateNotification).toHaveBeenCalledTimes(1);
  });
});
