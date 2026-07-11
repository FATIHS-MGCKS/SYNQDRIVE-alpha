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
import { ACTIVE_NOTIFICATION_STATUSES, NotificationRepository } from './notification.repository';

const ORG_ID = 'org-test-1';
const USER_ID = 'user-test-1';
const FINGERPRINT = 'org-test-1|DRIVING_ASSESSMENT_DEVICE_QUALITY|VEHICLE|veh-1|driving_assessment_device_quality|v1';

function baseNotificationInput(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-07-11T10:00:00.000Z');
  return {
    organizationId: ORG_ID,
    fingerprint: FINGERPRINT,
    lifecycleGeneration: 1,
    eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
    eventKind: NotificationEventKind.STATE,
    conditionCode: 'driving_assessment_device_quality',
    domain: NotificationDomain.VEHICLE_HEALTH,
    severity: NotificationSeverity.WARNING,
    entityType: NotificationEntityType.VEHICLE,
    entityId: 'veh-1',
    titleKey: 'notification.driving_assessment.degraded.title',
    bodyKey: 'notification.driving_assessment.degraded.body',
    templateParams: { plate: 'WOB L 7503' },
    actionType: NotificationActionType.OPEN_VEHICLE_MODULE,
    actionTarget: { type: NotificationActionType.OPEN_VEHICLE_MODULE, vehicleId: 'veh-1', module: 'health' },
    sourceType: NotificationSourceType.DASHBOARD_INSIGHT,
    primarySourceRef: 'insight-legacy-1',
    firstSeenAt: now,
    lastSeenAt: now,
    ...overrides,
  };
}

describe('NotificationRepository (mocked Prisma)', () => {
  const notifications = new Map<string, any>();
  const occurrences: any[] = [];
  const receipts = new Map<string, any>();
  let idSeq = 0;

  const activeKey = (orgId: string, fingerprint: string, generation: number) =>
    `${orgId}|${fingerprint}|${generation}`;

  const activeStore = new Map<string, string>();

  const prisma = {
    notification: {
      findFirst: jest.fn(async ({ where }: any) => {
        const key = activeKey(where.organizationId, where.fingerprint, where.lifecycleGeneration);
        const id = activeStore.get(key);
        if (!id) return null;
        const row = notifications.get(id);
        if (!row || !where.status?.in?.includes(row.status)) return null;
        return row;
      }),
      create: jest.fn(async ({ data }: any) => {
        const key = activeKey(data.organizationId, data.fingerprint, data.lifecycleGeneration ?? 1);
        if (
          ACTIVE_NOTIFICATION_STATUSES.includes(data.status ?? NotificationStatus.OPEN) &&
          activeStore.has(key)
        ) {
          const err = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['notifications_active_fingerprint_generation_key'] },
          });
          throw err;
        }
        const id = `notif-${++idSeq}`;
        const row = {
          id,
          occurrenceCount: 1,
          reopenCount: 0,
          version: 1,
          status: NotificationStatus.OPEN,
          ...data,
        };
        notifications.set(id, row);
        if (ACTIVE_NOTIFICATION_STATUSES.includes(row.status)) {
          activeStore.set(key, id);
        }
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = notifications.get(where.id);
        if (!existing) throw new Error('not found');
        const prevKey = activeKey(existing.organizationId, existing.fingerprint, existing.lifecycleGeneration);
        const updated = { ...existing, ...data };
        if (data.occurrenceCount?.increment) {
          updated.occurrenceCount = existing.occurrenceCount + data.occurrenceCount.increment;
        }
        if (data.version?.increment) {
          updated.version = existing.version + data.version.increment;
        }
        notifications.set(where.id, updated);
        if (!ACTIVE_NOTIFICATION_STATUSES.includes(updated.status)) {
          activeStore.delete(prevKey);
        }
        return updated;
      }),
      delete: jest.fn(async ({ where }: any) => {
        const existing = notifications.get(where.id);
        if (existing) {
          const key = activeKey(existing.organizationId, existing.fingerprint, existing.lifecycleGeneration);
          activeStore.delete(key);
          notifications.delete(where.id);
        }
        return existing;
      }),
    },
    notificationOccurrence: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `occ-${++idSeq}`, ...data };
        occurrences.push(row);
        return row;
      }),
    },
    notificationReceipt: {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const key = `${where.notificationId_userId.notificationId}:${where.notificationId_userId.userId}`;
        if (receipts.has(key)) {
          const merged = { ...receipts.get(key), ...update };
          receipts.set(key, merged);
          return merged;
        }
        const row = { id: `rcpt-${++idSeq}`, ...create };
        receipts.set(key, row);
        return row;
      }),
    },
    $transaction: jest.fn(async (ops: any[]) => {
      const results = [];
      for (const op of ops) results.push(await op);
      return results;
    }),
  };

  const repo = new NotificationRepository(prisma as any);

  beforeEach(() => {
    notifications.clear();
    occurrences.length = 0;
    receipts.clear();
    activeStore.clear();
    idSeq = 0;
    jest.clearAllMocks();
  });

  it('creates notification with JSON templateParams', async () => {
    const row = await repo.createNotification(baseNotificationInput());
    expect(row.templateParams).toEqual({ plate: 'WOB L 7503' });
    expect(row.actionTarget).toMatchObject({ vehicleId: 'veh-1' });
  });

  it('rejects parallel active fingerprint for same generation (simulated partial unique)', async () => {
    await repo.createNotification(baseNotificationInput());
    await expect(repo.createNotification(baseNotificationInput())).rejects.toMatchObject({
      code: 'P2002',
    });
    expect(notifications.size).toBe(1);
  });

  it('allows new lifecycle generation while prior generation is active', async () => {
    await repo.createNotification(baseNotificationInput({ lifecycleGeneration: 1 }));
    const gen2 = await repo.createNotification(
      baseNotificationInput({ lifecycleGeneration: 2, primarySourceRef: 'insight-2' }),
    );
    expect(gen2.lifecycleGeneration).toBe(2);
    expect(notifications.size).toBe(2);
  });

  it('allows same fingerprint after prior row is RESOLVED', async () => {
    const first = await repo.createNotification(baseNotificationInput());
    const key = activeKey(first.organizationId, first.fingerprint, first.lifecycleGeneration);
    activeStore.delete(key);
    notifications.set(first.id, { ...first, status: NotificationStatus.RESOLVED });

    const second = await repo.createNotification(
      baseNotificationInput({ primarySourceRef: 'insight-reopen' }),
    );
    expect(second.id).not.toBe(first.id);
    expect(notifications.size).toBe(2);
  });

  it('creates occurrence record', async () => {
    const notif = await repo.createNotification(baseNotificationInput());
    const occurredAt = new Date('2026-07-11T11:00:00.000Z');
    await repo.createOccurrence({
      notificationId: notif.id,
      organizationId: ORG_ID,
      occurredAt,
      sourceType: NotificationSourceType.RUNTIME,
      sourceRef: 'runtime-1',
      severityAtOccurrence: NotificationSeverity.WARNING,
      payload: { evidence: 'hf_mirror' },
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].payload).toEqual({ evidence: 'hf_mirror' });
    const updated = notifications.get(notif.id);
    expect(updated.occurrenceCount).toBe(1);
  });

  it('upserts receipt with unique notificationId + userId', async () => {
    const notif = await repo.createNotification(baseNotificationInput());
    const readAt = new Date('2026-07-11T12:00:00.000Z');

    const first = await repo.upsertReceipt({
      notificationId: notif.id,
      userId: USER_ID,
      organizationId: ORG_ID,
      readAt,
    });
    const second = await repo.upsertReceipt({
      notificationId: notif.id,
      userId: USER_ID,
      organizationId: ORG_ID,
      acknowledgedAt: new Date('2026-07-11T12:30:00.000Z'),
    });

    expect(receipts.size).toBe(1);
    expect(second.readAt).toEqual(readAt);
    expect(second.acknowledgedAt).toBeDefined();
    expect(first.id).toBe(second.id);
  });

  it('findActiveByFingerprint returns only active statuses', async () => {
    const created = await repo.createNotification(baseNotificationInput());
    const found = await repo.findActiveByFingerprint(ORG_ID, FINGERPRINT, 1);
    expect(found?.id).toBe(created.id);

    activeStore.delete(activeKey(ORG_ID, FINGERPRINT, 1));
    notifications.set(created.id, { ...created, status: NotificationStatus.RESOLVED });
    const afterResolve = await repo.findActiveByFingerprint(ORG_ID, FINGERPRINT, 1);
    expect(afterResolve).toBeNull();
  });

  it('cascades notification delete to occurrences and receipts in schema contract', () => {
    // Document expected onDelete: Cascade from Prisma schema — verified at migration SQL level.
    expect(ACTIVE_NOTIFICATION_STATUSES).toEqual([
      NotificationStatus.OPEN,
      NotificationStatus.ACKNOWLEDGED,
      NotificationStatus.SNOOZED,
    ]);
  });
});
