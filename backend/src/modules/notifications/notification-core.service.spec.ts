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
import { NotificationEngineConfig } from './notification-engine.config';
import { NotificationCoreService } from './notification-core.service';
import {
  ACTIVE_NOTIFICATION_STATUSES,
  NotificationRepository,
} from './notification.repository';
import type { NotificationCandidate } from './notification.types';
import {
  NotificationActionType as DomainActionType,
  NotificationDomain as DomainDomain,
  NotificationEntityType as DomainEntityType,
  NotificationEventKind as DomainEventKind,
  NotificationSeverity as DomainSeverity,
  NotificationSourceType as DomainSourceType,
} from './notification.enums';
import { DEFAULT_STATE_REOPEN_POLICY } from './notification-reopen.policy';
import { buildCandidateFromRegistry } from './registry/notification-event-registry';
import { NotificationDeliveryEnqueueService } from './delivery/notification-delivery-enqueue.service';
import { NotificationDeliveryPolicyService } from './delivery/notification-delivery-policy.service';
import { NotificationDeliverySchedulerService } from './delivery/notification-delivery-scheduler.service';

function createDeliveryMocks() {
  const deliveryEnqueue = {
    isDeliveryEnabled: () => false,
    enqueueInTransaction: jest.fn().mockResolvedValue([]),
  } as unknown as NotificationDeliveryEnqueueService;
  const deliveryPolicy = new NotificationDeliveryPolicyService();
  const deliveryScheduler = {
    scheduleOutboxIds: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationDeliverySchedulerService;
  return { deliveryEnqueue, deliveryPolicy, deliveryScheduler };
}

const ORG = 'org-1';
const USER = 'user-1';
const VEH = 'veh-wob-l-7503';

function buildCandidate(overrides: Partial<NotificationCandidate> = {}): NotificationCandidate {
  const occurredAt = overrides.occurredAt ?? new Date('2026-07-11T10:00:00.000Z');
  const base = buildCandidateFromRegistry({
    organizationId: ORG,
    eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
    entityId: VEH,
    sourceRef: 'insight-run-1',
    occurredAt,
    templateParams: { label: 'WOB L 7503' },
    actionTargetContext: { vehicleId: VEH, module: 'health' },
    severity: overrides.severity,
  });
  return {
    ...base,
    resolutionPolicy: {
      eventKind: DomainEventKind.STATE,
      autoResolveWhenConditionClears: true,
      reopenPolicy: { ...DEFAULT_STATE_REOPEN_POLICY, cooldownMs: 0 },
    },
    ...overrides,
  };
}

function buildTelemetryCandidate(overrides: Partial<NotificationCandidate> = {}): NotificationCandidate {
  const occurredAt = overrides.occurredAt ?? new Date('2026-07-11T10:00:00.000Z');
  const base = buildCandidateFromRegistry({
    organizationId: ORG,
    eventType: 'TELEMETRY_OFFLINE',
    entityId: VEH,
    sourceRef: 'telemetry-run-1',
    occurredAt,
    templateParams: { label: 'WOB L 7503' },
    actionTargetContext: { vehicleId: VEH, module: 'connectivity' },
    severity: overrides.severity,
  });
  return {
    ...base,
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

describe('NotificationCoreService', () => {
  let notifications: Map<string, any>;
  let occurrences: any[];
  let receipts: Map<string, any>;
  let idSeq: number;
  let activeByFingerprint: Map<string, string>;
  let v2Enabled: boolean;

  const engineConfig = {
    isV2Enabled: () => v2Enabled,
  } as NotificationEngineConfig;

  const activeKey = (orgId: string, fp: string) => `${orgId}::${fp}`;

  let lockChain: Promise<void> = Promise.resolve();

  const withIngestLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const run = lockChain.then(fn);
    lockChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const resolveLockedRow = (orgId: string, fingerprint: string, activeOnly: boolean) => {
    const rows = [...notifications.values()].filter((r) => {
      if (r.organizationId !== orgId || r.fingerprint !== fingerprint) return false;
      if (activeOnly && !ACTIVE_NOTIFICATION_STATUSES.includes(r.status)) return false;
      return true;
    });
    rows.sort((a, b) => b.lifecycleGeneration - a.lifecycleGeneration);
    return rows[0] ?? null;
  };

  const prisma: any = {
    $queryRaw: jest.fn(async (query: TemplateStringsArray, orgId: string, fingerprint: string) => {
      const sql = query.join(' ');
      const activeOnly = sql.includes("status::text IN");
      const row = resolveLockedRow(orgId, fingerprint, activeOnly);
      return row ? [{ id: row.id }] : [];
    }),
    notification: {
      findFirst: jest.fn(async ({ where, orderBy }: any) => {
        const rows = [...notifications.values()].filter((r) => {
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
        const key = activeKey(data.organizationId, data.fingerprint);
        if (
          ACTIVE_NOTIFICATION_STATUSES.includes(data.status ?? NotificationStatus.OPEN)
          && activeByFingerprint.has(key)
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
        notifications.set(id, row);
        if (ACTIVE_NOTIFICATION_STATUSES.includes(row.status)) {
          activeByFingerprint.set(key, id);
        }
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = notifications.get(where.id);
        if (!existing) throw new Error('not found');
        if (where.version != null && existing.version !== where.version) {
          throw new Prisma.PrismaClientKnownRequestError('Version', { code: 'P2025', clientVersion: 'test' });
        }
        const prevKey = activeKey(existing.organizationId, existing.fingerprint);
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
        notifications.set(where.id, updated);
        if (!ACTIVE_NOTIFICATION_STATUSES.includes(updated.status)) {
          activeByFingerprint.delete(prevKey);
        } else {
          activeByFingerprint.set(prevKey, where.id);
        }
        return updated;
      }),
      findMany: jest.fn(async () => [...notifications.values()]),
      count: jest.fn(async ({ where }: any) =>
        [...notifications.values()].filter((r) => {
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
        const existing = occurrences.find(
          (o) => o.notificationId === data.notificationId && o.sourceEventId === data.sourceEventId,
        );
        if (existing) {
          throw new Prisma.PrismaClientKnownRequestError('Unique', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row = { id: `o-${++idSeq}`, ...data };
        occurrences.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const key = where.notificationId_sourceEventId;
        return (
          occurrences.find(
            (o) => o.notificationId === key.notificationId && o.sourceEventId === key.sourceEventId,
          ) ?? null
        );
      }),
      count: jest.fn(async ({ where }: any) =>
        occurrences.filter((o) => o.notificationId === where.notificationId).length,
      ),
    },
    notificationReceipt: {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const key = `${where.notificationId_userId.notificationId}:${where.notificationId_userId.userId}`;
        if (receipts.has(key)) {
          const merged = { ...receipts.get(key), ...update };
          receipts.set(key, merged);
          return merged;
        }
        const row = { id: `r-${++idSeq}`, ...create };
        receipts.set(key, row);
        return row;
      }),
    },
    $transaction: jest.fn(async (fn: any, _options?: unknown) => {
      return withIngestLock(async () => {
        if (Array.isArray(fn)) {
          const results = [];
          for (const op of fn) results.push(await op);
          return results;
        }
        return fn(prisma);
      });
    }),
  };

  const repository = new NotificationRepository(prisma as any);
  const { deliveryEnqueue, deliveryPolicy, deliveryScheduler } = createDeliveryMocks();
  const service = new NotificationCoreService(
    repository,
    engineConfig,
    deliveryEnqueue,
    deliveryPolicy,
    deliveryScheduler,
  );

  beforeEach(() => {
    notifications = new Map();
    occurrences = [];
    receipts = new Map();
    activeByFingerprint = new Map();
    idSeq = 0;
    lockChain = Promise.resolve();
    v2Enabled = true;
    jest.clearAllMocks();
  });

  it('skips ingest when NOTIFICATIONS_V2 is off', async () => {
    v2Enabled = false;
    const result = await service.ingestCandidate(buildCandidate());
    expect(result.enabled).toBe(false);
    expect(result.operation).toBe('skipped_flag_off');
    expect(notifications.size).toBe(0);
  });

  it('creates one active notification from 20 identical candidates', async () => {
    const candidate = buildCandidate();
    for (let i = 0; i < 20; i++) {
      await service.ingestCandidate({ ...candidate, sourceRef: `ref-${i}` });
    }
    expect(notifications.size).toBe(1);
    const row = [...notifications.values()][0];
    expect(row.occurrenceCount).toBe(20);
    expect(occurrences).toHaveLength(20);
  });

  it('keeps firstSeenAt stable and updates lastSeenAt', async () => {
    const first = buildCandidate({ occurredAt: new Date('2026-07-11T10:00:00.000Z') });
    await service.ingestCandidate(first);
    const later = buildCandidate({
      occurredAt: new Date('2026-07-11T12:00:00.000Z'),
      sourceRef: 'ref-2',
      templateParams: { label: 'WOB L 7503', plate: 'WOB L 7503', km: 120 },
    });
    await service.ingestCandidate(later);
    const row = [...notifications.values()][0];
    expect(row.firstSeenAt).toEqual(new Date('2026-07-11T10:00:00.000Z'));
    expect(row.lastSeenAt).toEqual(new Date('2026-07-11T12:00:00.000Z'));
    expect(row.templateParams).toMatchObject({ km: 120 });
  });

  it('escalates severity INFO → WARNING → CRITICAL without deescalation', async () => {
    await service.ingestCandidate(buildTelemetryCandidate({ severity: DomainSeverity.INFO }));
    await service.ingestCandidate(buildTelemetryCandidate({
      severity: DomainSeverity.WARNING,
      sourceRef: 's2',
      occurredAt: new Date('2026-07-11T11:00:00.000Z'),
    }));
    let row = [...notifications.values()][0];
    expect(row.severity).toBe(NotificationSeverity.WARNING);

    await service.ingestCandidate(buildTelemetryCandidate({
      severity: DomainSeverity.INFO,
      sourceRef: 's3',
      occurredAt: new Date('2026-07-11T12:00:00.000Z'),
    }));
    row = [...notifications.values()][0];
    expect(row.severity).toBe(NotificationSeverity.WARNING);

    await service.ingestCandidate(buildTelemetryCandidate({
      severity: DomainSeverity.CRITICAL,
      sourceRef: 's4',
      occurredAt: new Date('2026-07-11T13:00:00.000Z'),
    }));
    row = [...notifications.values()][0];
    expect(row.severity).toBe(NotificationSeverity.CRITICAL);
  });

  it('resolves on recovery severity without creating new active warning', async () => {
    await service.ingestCandidate(buildCandidate());
    const result = await service.ingestCandidate(buildCandidate({
      severity: DomainSeverity.SUCCESS,
      sourceRef: 'recovery-1',
      occurredAt: new Date('2026-07-11T14:00:00.000Z'),
      titleKey: 'notification.title.drivingAssessmentRecovering',
    }));
    expect(result.operation).toBe('resolved');
    expect(notifications.size).toBe(1);
    const row = [...notifications.values()][0];
    expect(row.status).toBe(NotificationStatus.RESOLVED);
    expect(row.resolvedAt).toBeDefined();
    expect([...notifications.values()].filter((n) => ACTIVE_NOTIFICATION_STATUSES.includes(n.status))).toHaveLength(0);
  });

  it('reopens resolved notification after cooldown', async () => {
    await service.ingestCandidate(buildCandidate());
    await service.ingestCandidate(buildCandidate({
      severity: DomainSeverity.SUCCESS,
      sourceRef: 'recovery-1',
      occurredAt: new Date('2026-07-11T11:00:00.000Z'),
      titleKey: 'notification.title.drivingAssessmentRecovering',
    }));
    const reopened = await service.ingestCandidate(buildCandidate({
      sourceRef: 'reopen-1',
      occurredAt: new Date('2026-07-11T12:00:00.000Z'),
    }));
    expect(reopened.operation).toBe('reopened');
    const row = [...notifications.values()][0];
    expect(row.status).toBe(NotificationStatus.OPEN);
    expect(row.reopenCount).toBe(1);
  });

  it('creates new lifecycle generation after max reopens', async () => {
    const strictPolicy = {
      eventKind: DomainEventKind.STATE,
      autoResolveWhenConditionClears: true,
      reopenPolicy: { cooldownMs: 0, maxReopensBeforeNewGeneration: 1 },
    };
    await service.ingestCandidate(buildCandidate({ resolutionPolicy: strictPolicy }));
    await service.ingestCandidate(buildCandidate({
      severity: DomainSeverity.SUCCESS,
      sourceRef: 'recovery-strict-1',
      occurredAt: new Date('2026-07-11T11:00:00.000Z'),
      titleKey: 'notification.title.drivingAssessmentRecovering',
      resolutionPolicy: strictPolicy,
    }));
    await service.ingestCandidate(buildCandidate({
      sourceRef: 'r1',
      occurredAt: new Date('2026-07-11T12:00:00.000Z'),
      resolutionPolicy: strictPolicy,
    }));
    await service.ingestCandidate(buildCandidate({
      severity: DomainSeverity.SUCCESS,
      sourceRef: 'recovery-strict-2',
      occurredAt: new Date('2026-07-11T13:00:00.000Z'),
      titleKey: 'notification.title.drivingAssessmentRecovering',
      resolutionPolicy: strictPolicy,
    }));
    const gen2 = await service.ingestCandidate(buildCandidate({
      sourceRef: 'gen2',
      occurredAt: new Date('2026-07-11T14:00:00.000Z'),
      resolutionPolicy: strictPolicy,
    }));
    expect(gen2.operation).toBe('created');
    expect(notifications.size).toBe(2);
    const gens = [...notifications.values()].map((n) => n.lifecycleGeneration).sort();
    expect(gens).toEqual([1, 2]);
  });

  it('parallel identical candidates yield one active notification', async () => {
    const candidate = buildCandidate();
    await Promise.all([
      service.ingestCandidate({ ...candidate, sourceRef: 'p1' }),
      service.ingestCandidate({ ...candidate, sourceRef: 'p2' }),
    ]);
    expect(notifications.size).toBe(1);
    const row = [...notifications.values()][0];
    expect(row.occurrenceCount).toBe(2);
  });

  describe('concurrency safety', () => {
    it('10 parallel identical candidates → one active row and 10 occurrences', async () => {
      const candidate = buildCandidate();
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          service.ingestCandidate({ ...candidate, sourceRef: `parallel-${i}` }),
        ),
      );
      const active = [...notifications.values()].filter((n) =>
        ACTIVE_NOTIFICATION_STATUSES.includes(n.status),
      );
      expect(active).toHaveLength(1);
      expect(active[0].occurrenceCount).toBe(10);
      expect(occurrences).toHaveLength(10);
    });

    it('parallel severity escalation keeps highest severity', async () => {
      const base = buildTelemetryCandidate();
      await Promise.all([
        service.ingestCandidate({ ...base, severity: DomainSeverity.INFO, sourceRef: 'sev-info' }),
        service.ingestCandidate({ ...base, severity: DomainSeverity.CRITICAL, sourceRef: 'sev-critical' }),
        service.ingestCandidate({ ...base, severity: DomainSeverity.WARNING, sourceRef: 'sev-warning' }),
      ]);
      const row = [...notifications.values()][0];
      expect(row.severity).toBe(NotificationSeverity.CRITICAL);
      expect(row.occurrenceCount).toBe(3);
    });

    it('recovery racing escalation ends with a single consistent lifecycle row', async () => {
      await service.ingestCandidate(buildCandidate());
      const recovery = buildCandidate({
        severity: DomainSeverity.SUCCESS,
        occurredAt: new Date('2026-07-11T14:00:00.000Z'),
        titleKey: 'notification.title.drivingAssessmentRecovering',
      });
      const escalation = buildCandidate({
        severity: DomainSeverity.CRITICAL,
        occurredAt: new Date('2026-07-11T14:00:00.000Z'),
        sourceRef: 'escalate-parallel',
      });
      const results = await Promise.allSettled([
        service.ingestCandidate(recovery),
        service.ingestCandidate(escalation),
      ]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      const active = [...notifications.values()].filter((n) =>
        ACTIVE_NOTIFICATION_STATUSES.includes(n.status),
      );
      expect(active.length).toBeLessThanOrEqual(1);
      expect(notifications.size).toBe(1);
    });

    it('dedupes identical sourceEventId without double-counting', async () => {
      const candidate = buildCandidate({ sourceRef: 'evt-dup' });
      await service.ingestCandidate(candidate);
      await service.ingestCandidate({
        ...candidate,
        occurredAt: new Date('2026-07-11T11:00:00.000Z'),
        observedAt: new Date('2026-07-11T11:00:00.000Z'),
      });
      const row = [...notifications.values()][0];
      expect(row.occurrenceCount).toBe(1);
      expect(occurrences).toHaveLength(1);
    });

    it('records distinct sourceEventId as separate occurrences', async () => {
      const candidate = buildCandidate({ sourceRef: 'evt-dup' });
      await service.ingestCandidate(candidate);
      await service.ingestCandidate({
        ...candidate,
        sourceRef: 'evt-dup-2',
        occurredAt: new Date('2026-07-11T11:00:00.000Z'),
        observedAt: new Date('2026-07-11T11:00:00.000Z'),
      });
      const row = [...notifications.values()][0];
      expect(row.occurrenceCount).toBe(2);
      expect(occurrences).toHaveLength(2);
    });

    it('does not downgrade severity on stale WARNING after CRITICAL', async () => {
      const base = buildTelemetryCandidate();
      await service.ingestCandidate({
        ...base,
        severity: DomainSeverity.CRITICAL,
        sourceRef: 'evt-critical',
        occurredAt: new Date('2026-07-11T15:00:00.000Z'),
        observedAt: new Date('2026-07-11T15:00:00.000Z'),
      });
      await service.ingestCandidate({
        ...base,
        severity: DomainSeverity.WARNING,
        sourceRef: 'evt-stale-warning',
        occurredAt: new Date('2026-07-11T10:00:00.000Z'),
        observedAt: new Date('2026-07-11T16:00:00.000Z'),
      });
      const row = [...notifications.values()][0];
      expect(row.severity).toBe(NotificationSeverity.CRITICAL);
      expect(row.occurrenceCount).toBe(2);
      expect(row.lastSeenAt).toEqual(new Date('2026-07-11T15:00:00.000Z'));
    });

    it('ignores stale recovery when a newer active signal exists', async () => {
      await service.ingestCandidate(buildTelemetryCandidate({
        sourceRef: 'evt-active',
        occurredAt: new Date('2026-07-11T15:00:00.000Z'),
      }));
      const result = await service.ingestCandidate(buildTelemetryCandidate({
        severity: DomainSeverity.SUCCESS,
        sourceRef: 'evt-stale-recovery',
        occurredAt: new Date('2026-07-11T10:00:00.000Z'),
      }));
      expect(result.operation).toBe('ignored');
      expect(result.reason).toBe('STALE_RECOVERY');
      const row = [...notifications.values()][0];
      expect(row.status).toBe(NotificationStatus.OPEN);
      expect(row.occurrenceCount).toBe(2);
      expect(occurrences).toHaveLength(2);
    });

    it('same entity key in two organizations stays tenant-isolated', async () => {
      const orgA = buildCandidate({ organizationId: 'org-a' });
      const orgB = buildCandidate({ organizationId: 'org-b' });
      await Promise.all([service.ingestCandidate(orgA), service.ingestCandidate(orgB)]);
      const orgARows = [...notifications.values()].filter((n) => n.organizationId === 'org-a');
      const orgBRows = [...notifications.values()].filter((n) => n.organizationId === 'org-b');
      expect(orgARows).toHaveLength(1);
      expect(orgBRows).toHaveLength(1);
      expect(orgARows[0].id).not.toBe(orgBRows[0].id);
      expect(occurrences.filter((o) => o.organizationId === 'org-a')).toHaveLength(1);
      expect(occurrences.filter((o) => o.organizationId === 'org-b')).toHaveLength(1);
    });
  });

  it('tracks receipt per user without changing org-wide status', async () => {
    const { notification } = await service.createOrUpdateNotification(buildCandidate());
    await service.markRead(notification!.id, ORG, USER);
    const row = [...notifications.values()][0];
    expect(row.status).toBe(NotificationStatus.OPEN);
    expect(receipts.size).toBe(1);
    const receipt = [...receipts.values()][0];
    expect(receipt.readAt).toBeDefined();
  });

  it('acknowledge updates org-wide lifecycle status', async () => {
    const { notification } = await service.createOrUpdateNotification(buildCandidate());
    const acked = await service.acknowledgeNotification(notification!.id, ORG);
    expect(acked.status).toBe(NotificationStatus.ACKNOWLEDGED);
  });

  it('rejects invalid status transitions', async () => {
    const { notification } = await service.createOrUpdateNotification(buildCandidate());
    await service.resolveNotification(notification!.id, ORG);
    await expect(service.acknowledgeNotification(notification!.id, ORG)).rejects.toThrow();
  });

  it('resolves by fingerprint', async () => {
    await service.createOrUpdateNotification(buildCandidate());
    const fp = fingerprintFrom(buildCandidate());
    const resolved = await service.resolveNotificationByFingerprint({
      organizationId: ORG,
      fingerprint: fp,
    });
    expect(resolved.status).toBe(NotificationStatus.RESOLVED);
  });

  it('snooze and unsnooze', async () => {
    const { notification } = await service.createOrUpdateNotification(buildCandidate());
    const until = new Date('2026-07-12T00:00:00.000Z');
    const snoozed = await service.snoozeNotification(notification!.id, ORG, until);
    expect(snoozed.status).toBe(NotificationStatus.SNOOZED);
    const open = await service.unsnoozeNotification(notification!.id, ORG);
    expect(open.status).toBe(NotificationStatus.OPEN);
  });

  it('wakes org SNOOZED to OPEN on CRITICAL escalation ingest', async () => {
    const { notification } = await service.createOrUpdateNotification(buildTelemetryCandidate());
    const until = new Date('2026-07-12T00:00:00.000Z');
    await service.snoozeNotification(notification!.id, ORG, until);
    await service.ingestCandidate(buildTelemetryCandidate({
      severity: DomainSeverity.CRITICAL,
      sourceRef: 'critical-while-snoozed',
      occurredAt: new Date('2026-07-11T11:00:00.000Z'),
    }));
    const row = [...notifications.values()][0];
    expect(row.status).toBe(NotificationStatus.OPEN);
    expect(row.severity).toBe(NotificationSeverity.CRITICAL);
  });
});
