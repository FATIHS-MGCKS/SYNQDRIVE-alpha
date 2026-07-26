import {
  NotificationSeverity,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
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

export interface NotificationTestStore {
  notifications: Map<string, any>;
  occurrences: any[];
  receipts: Map<string, any>;
  outbox: Map<string, any>;
  activeByFingerprint: Map<string, string>;
}

export interface NotificationTestHarness {
  store: NotificationTestStore;
  repository: NotificationRepository;
  service: NotificationCoreService;
  createSecondInstance: () => NotificationCoreService;
  setV2Enabled: (enabled: boolean) => void;
  simulateDeadlockOnAttempt: (attempt: number) => void;
  resetDeadlockSimulation: () => void;
}

const DEFAULT_ORG = 'org-load-test';

export function buildLoadTestCandidate(
  overrides: Partial<NotificationCandidate> = {},
): NotificationCandidate {
  const entityId = overrides.entityId ?? `veh-${Math.random().toString(36).slice(2, 8)}`;
  const occurredAt = overrides.occurredAt ?? new Date('2026-07-11T10:00:00.000Z');
  return {
    organizationId: overrides.organizationId ?? DEFAULT_ORG,
    eventType: overrides.eventType ?? 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
    eventKind: DomainEventKind.STATE,
    domain: DomainDomain.VEHICLE_HEALTH,
    severity: overrides.severity ?? DomainSeverity.WARNING,
    entityType: DomainEntityType.VEHICLE,
    entityId,
    conditionCode: overrides.conditionCode ?? 'driving_assessment_device_quality',
    scopeVersion: overrides.scopeVersion ?? 1,
    sourceType: DomainSourceType.DASHBOARD_INSIGHT,
    sourceRef: overrides.sourceRef ?? `ref-${Math.random().toString(36).slice(2, 10)}`,
    occurredAt,
    titleKey: 'notification.title.drivingAssessmentDegraded',
    bodyKey: 'notification.body.insightDefault',
    templateParams: { plate: 'TEST-PLATE' },
    actionType: DomainActionType.OPEN_VEHICLE_MODULE,
    actionTarget: { type: DomainActionType.OPEN_VEHICLE_MODULE, vehicleId: entityId, module: 'health' },
    resolutionPolicy: {
      eventKind: DomainEventKind.STATE,
      autoResolveWhenConditionClears: true,
      reopenPolicy: { ...DEFAULT_STATE_REOPEN_POLICY, cooldownMs: 0 },
    },
    ...overrides,
  };
}

export function countActiveDuplicateFingerprints(store: NotificationTestStore): number {
  const groups = new Map<string, number>();
  for (const row of store.notifications.values()) {
    if (!ACTIVE_NOTIFICATION_STATUSES.includes(row.status)) continue;
    const key = `${row.organizationId}|${row.fingerprint}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups.values()].filter((c) => c > 1).length;
}

export function createNotificationTestHarness(): NotificationTestHarness {
  const store: NotificationTestStore = {
    notifications: new Map(),
    occurrences: [],
    receipts: new Map(),
    outbox: new Map(),
    activeByFingerprint: new Map(),
  };

  let idSeq = 0;
  let v2Enabled = true;
  let deadlockOnAttempt = 0;
  let createAttempt = 0;
  const fingerprintLocks = new Map<string, Promise<void>>();

  const activeKey = (orgId: string, fp: string, gen: number) => `${orgId}::${fp}::${gen}`;

  const withFingerprintLock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const prev = fingerprintLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fingerprintLocks.set(key, prev.then(() => gate));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  };

  const prisma: any = {
    notification: {
      findFirst: jest.fn(async ({ where, orderBy }: any) => {
        const rows = [...store.notifications.values()].filter((r) => {
          if (where.id && r.id !== where.id) return false;
          if (where.organizationId && r.organizationId !== where.organizationId) return false;
          if (where.fingerprint && r.fingerprint !== where.fingerprint) return false;
          if (where.lifecycleGeneration != null && r.lifecycleGeneration !== where.lifecycleGeneration) return false;
          if (where.status?.in && !where.status.in.includes(r.status)) return false;
          return true;
        });
        if (orderBy?.lifecycleGeneration === 'desc') {
          rows.sort((a, b) => b.lifecycleGeneration - a.lifecycleGeneration);
        }
        return rows[0] ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const gen = data.lifecycleGeneration ?? 1;
        const key = activeKey(data.organizationId, data.fingerprint, gen);
        return withFingerprintLock(`${data.organizationId}::${data.fingerprint}`, async () => {
          createAttempt += 1;
          if (deadlockOnAttempt > 0 && createAttempt === deadlockOnAttempt) {
            throw new Prisma.PrismaClientKnownRequestError('Deadlock', {
              code: 'P2034',
              clientVersion: 'test',
            });
          }
          if (
            ACTIVE_NOTIFICATION_STATUSES.includes(data.status ?? NotificationStatus.OPEN)
            && store.activeByFingerprint.has(key)
          ) {
            throw new Prisma.PrismaClientKnownRequestError('Unique', {
              code: 'P2002',
              clientVersion: 'test',
            });
          }
          const id = `n-${++idSeq}`;
          const row = {
            id,
            occurrenceCount: 1,
            reopenCount: 0,
            version: 1,
            status: NotificationStatus.OPEN,
            templateParams: {},
            actionTarget: {},
            ...data,
          };
          store.notifications.set(id, row);
          if (ACTIVE_NOTIFICATION_STATUSES.includes(row.status)) {
            store.activeByFingerprint.set(key, id);
          }
          return row;
        });
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = store.notifications.get(where.id);
        if (!existing) throw new Error('not found');
        if (where.version != null && existing.version !== where.version) {
          throw new Prisma.PrismaClientKnownRequestError('Version', { code: 'P2025', clientVersion: 'test' });
        }
        const prevKey = activeKey(existing.organizationId, existing.fingerprint, existing.lifecycleGeneration);
        const updated = { ...existing };
        for (const [k, v] of Object.entries(data)) {
          if (k === 'version' && v && typeof v === 'object' && 'increment' in (v as any)) {
            updated.version = existing.version + (v as any).increment;
          } else if (k === 'occurrenceCount' && v && typeof v === 'object' && 'increment' in (v as any)) {
            updated.occurrenceCount = existing.occurrenceCount + (v as any).increment;
          } else {
            (updated as any)[k] = v;
          }
        }
        store.notifications.set(where.id, updated);
        if (!ACTIVE_NOTIFICATION_STATUSES.includes(updated.status)) {
          store.activeByFingerprint.delete(prevKey);
        } else {
          store.activeByFingerprint.set(prevKey, where.id);
        }
        return updated;
      }),
      findMany: jest.fn(async ({ where }: any = {}) =>
        [...store.notifications.values()].filter((r) => {
          if (where?.organizationId && r.organizationId !== where.organizationId) return false;
          if (where?.status?.in && !where.status.in.includes(r.status)) return false;
          return true;
        }),
      ),
      count: jest.fn(async ({ where }: any) =>
        [...store.notifications.values()].filter((r) => {
          if (where.organizationId && r.organizationId !== where.organizationId) return false;
          if (where.status?.in && !where.status.in.includes(r.status)) return false;
          return true;
        }).length,
      ),
      groupBy: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    notificationOccurrence: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `o-${++idSeq}`, ...data };
        store.occurrences.push(row);
        return row;
      }),
    },
    notificationReceipt: {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const key = `${where.notificationId_userId.notificationId}:${where.notificationId_userId.userId}`;
        if (store.receipts.has(key)) {
          const merged = { ...store.receipts.get(key), ...update };
          store.receipts.set(key, merged);
          return merged;
        }
        const row = { id: `r-${++idSeq}`, ...create };
        store.receipts.set(key, row);
        return row;
      }),
    },
    notificationDeliveryOutbox: {
      create: jest.fn(async ({ data }: any) => {
        const id = `out-${++idSeq}`;
        const row = { id, attempts: 0, status: 'PENDING', ...data };
        store.outbox.set(id, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return store.outbox.get(where.id) ?? null;
        if (where.idempotencyKey) {
          return [...store.outbox.values()].find((r) => r.idempotencyKey === where.idempotencyKey) ?? null;
        }
        return null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = store.outbox.get(where.id);
        if (!row) throw new Error('outbox not found');
        const updated = { ...row, ...data };
        store.outbox.set(where.id, updated);
        return updated;
      }),
      count: jest.fn(async ({ where }: any = {}) =>
        [...store.outbox.values()].filter((r) => {
          if (where?.status && r.status !== where.status) return false;
          if (where?.status?.in && !where.status.in.includes(r.status)) return false;
          return true;
        }).length,
      ),
    },
    $transaction: jest.fn(async (fn: any) => {
      if (Array.isArray(fn)) {
        const results = [];
        for (const op of fn) results.push(await op);
        return results;
      }
      return fn(prisma);
    }),
  };

  const engineConfig = {
    isV2Enabled: () => v2Enabled,
  } as NotificationEngineConfig;

  const createDeliveryMocks = () => {
    const deliveryEnqueue = {
      isDeliveryEnabled: () => true,
      enqueueInTransaction: jest.fn(async ({ notification, transition }: any) => {
        const id = `out-${store.outbox.size + 1}`;
        store.outbox.set(id, {
          id,
          notificationId: notification.id,
          organizationId: notification.organizationId,
          status: 'PENDING',
          attempts: 0,
          deliveryTransition: transition,
          idempotencyKey: `${notification.id}:${transition}:EMAIL:user-1`,
        });
        return [id];
      }),
    } as unknown as NotificationDeliveryEnqueueService;
    const deliveryPolicy = new NotificationDeliveryPolicyService();
    const deliveryScheduler = {
      scheduleOutboxIds: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationDeliverySchedulerService;
    return { deliveryEnqueue, deliveryPolicy, deliveryScheduler };
  };

  const buildService = () => {
    const { deliveryEnqueue, deliveryPolicy, deliveryScheduler } = createDeliveryMocks();
    return new NotificationCoreService(
      new NotificationRepository(prisma as any),
      engineConfig,
      deliveryEnqueue,
      deliveryPolicy,
      deliveryScheduler,
    );
  };

  return {
    store,
    repository: new NotificationRepository(prisma as any),
    service: buildService(),
    createSecondInstance: buildService,
    setV2Enabled: (enabled: boolean) => {
      v2Enabled = enabled;
    },
    simulateDeadlockOnAttempt: (attempt: number) => {
      deadlockOnAttempt = attempt;
    },
    resetDeadlockSimulation: () => {
      deadlockOnAttempt = 0;
      createAttempt = 0;
    },
  };
}

export function countOrphanOccurrences(store: NotificationTestStore): number {
  const notificationIds = new Set(store.notifications.keys());
  return store.occurrences.filter((o) => !notificationIds.has(o.notificationId)).length;
}

export function outboxBacklog(store: NotificationTestStore): number {
  return [...store.outbox.values()].filter((r) => r.status === 'PENDING' || r.status === 'FAILED').length;
}

export function deadLetterCount(store: NotificationTestStore): number {
  return [...store.outbox.values()].filter((r) => r.status === 'DEAD_LETTER').length;
}

export { DomainSeverity, NotificationSeverity, NotificationStatus, DEFAULT_ORG };
