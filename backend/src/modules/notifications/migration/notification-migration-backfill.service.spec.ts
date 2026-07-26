import {
  InsightEntityScope,
  InsightSeverity,
  InsightType,
  NotificationSeverity,
  NotificationStatus,
} from '@prisma/client';
import { NotificationMigrationBackfillService } from './notification-migration-backfill.service';
import { NotificationRepository } from '../notification.repository';

const ORG = 'org-migrate-1';
const OTHER_ORG = 'org-other';

function buildInsight(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ins-1',
    organizationId: ORG,
    runId: 'run-1',
    type: InsightType.STATION_SHORTAGE,
    severity: InsightSeverity.WARNING,
    priority: 50,
    title: 'Station shortage',
    message: 'Only 1 vehicle',
    actionLabel: 'View',
    actionType: 'navigate_station',
    entityScope: InsightEntityScope.STATION,
    entityIds: ['st-1'],
    timeContext: null,
    metrics: { stationName: 'WOB' },
    reasons: [],
    confidence: 1,
    dedupeKey: 'station_shortage:st-1',
    groupKey: null,
    isGrouped: false,
    groupCount: 1,
    isActive: true,
    expiresAt: null,
    createdAt: new Date('2026-07-01T10:00:00Z'),
    updatedAt: new Date('2026-07-11T10:00:00Z'),
    ...overrides,
  };
}

describe('NotificationMigrationBackfillService', () => {
  let insights: ReturnType<typeof buildInsight>[];
  let notifications: Map<string, any>;
  let occurrences: any[];
  let txHandlers: {
    createNotification: jest.Mock;
    createOccurrence: jest.Mock;
    updateNotification: jest.Mock;
  };

  const prisma = {
    organization: {
      findUnique: jest.fn().mockResolvedValue({ id: ORG }),
    },
    dashboardInsight: {
      findMany: jest.fn(),
    },
    notification: {
      findFirst: jest.fn(),
    },
  };

  const repository = {
    findAnyActiveByFingerprint: jest.fn(),
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
    createNotification: jest.fn(),
    createOccurrence: jest.fn(),
    updateNotification: jest.fn(),
  } as unknown as NotificationRepository;

  let service: NotificationMigrationBackfillService;

  beforeEach(() => {
    insights = [buildInsight()];
    notifications = new Map();
    occurrences = [];
    txHandlers = {
      createNotification: jest.fn(async (data: any) => {
        const row = { id: 'ntf-1', version: 1, occurrenceCount: 1, ...data };
        notifications.set(row.id, row);
        return row;
      }),
      createOccurrence: jest.fn(async (data: any) => {
        occurrences.push(data);
      }),
      updateNotification: jest.fn(async (id: string, patch: any) => {
        notifications.set(id, { ...notifications.get(id), ...patch });
      }),
    };

    (repository.createNotification as jest.Mock) = txHandlers.createNotification;
    (repository.createOccurrence as jest.Mock) = txHandlers.createOccurrence;
    (repository.updateNotification as jest.Mock) = txHandlers.updateNotification;
    (repository.findAnyActiveByFingerprint as jest.Mock).mockResolvedValue(null);

    prisma.organization.findUnique.mockResolvedValue({ id: ORG });
    prisma.dashboardInsight.findMany.mockImplementation(async () => {
      const batch = [...insights];
      insights = [];
      return batch;
    });
    prisma.notification.findFirst.mockResolvedValue(null);

    service = new NotificationMigrationBackfillService(prisma as any, repository);
  });

  it('rejects unknown organization', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(
      service.run({ organizationId: ORG, mode: 'dry_run' }),
    ).rejects.toThrow('Organization not found');
  });

  it('rejects checkpoint org mismatch', async () => {
    await expect(
      service.run({
        organizationId: ORG,
        mode: 'dry_run',
        checkpoint: {
          organizationId: OTHER_ORG,
          lastInsightId: null,
          lastInsightUpdatedAt: null,
          processedCount: 0,
          updatedAt: new Date().toISOString(),
        },
      }),
    ).rejects.toThrow('Checkpoint organization mismatch');
  });

  it('dry-run projects migration without writes', async () => {
    const result = await service.run({ organizationId: ORG, mode: 'dry_run' });

    expect(result.stats.migrated).toBe(1);
    expect(result.stats.failed).toBe(0);
    expect(txHandlers.createNotification).not.toHaveBeenCalled();
    expect(result.schemaVersion).toBe('1.0');
  });

  it('apply creates notification with preserved timestamps', async () => {
    const result = await service.run({ organizationId: ORG, mode: 'apply' });

    expect(result.stats.migrated).toBe(1);
    expect(txHandlers.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        legacyInsightId: 'ins-1',
        firstSeenAt: new Date('2026-07-01T10:00:00Z'),
        lastSeenAt: new Date('2026-07-11T10:00:00Z'),
      }),
      expect.anything(),
    );
  });

  it('skips already migrated insights (idempotent)', async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: 'ntf-existing' });

    const result = await service.run({ organizationId: ORG, mode: 'apply' });

    expect(result.stats.skipped).toBe(1);
    expect(txHandlers.createNotification).not.toHaveBeenCalled();
  });

  it('merges duplicate fingerprint into active notification', async () => {
    (repository.findAnyActiveByFingerprint as jest.Mock).mockResolvedValue({
      id: 'ntf-active',
      version: 2,
      occurrenceCount: 1,
      firstSeenAt: new Date('2026-06-01T10:00:00Z'),
      lastSeenAt: new Date('2026-07-01T10:00:00Z'),
      legacyInsightId: null,
    });

    const result = await service.run({ organizationId: ORG, mode: 'apply' });

    expect(result.stats.merged).toBe(1);
    expect(txHandlers.createOccurrence).toHaveBeenCalled();
    expect(txHandlers.updateNotification).toHaveBeenCalledWith(
      'ntf-active',
      expect.objectContaining({
        legacyInsightId: 'ins-1',
        firstSeenAt: new Date('2026-06-01T10:00:00Z'),
        lastSeenAt: new Date('2026-07-11T10:00:00Z'),
      }),
      2,
      expect.anything(),
    );
  });

  it('records per-insight failures without aborting batch', async () => {
    prisma.dashboardInsight.findMany.mockImplementation(async () => [
      buildInsight({ id: 'ins-bad', organizationId: OTHER_ORG }),
    ]);

    const result = await service.run({ organizationId: ORG, mode: 'dry_run' });

    expect(result.stats.failed).toBe(1);
    expect(result.failures[0]).toMatchObject({
      insightId: 'ins-bad',
      organizationId: OTHER_ORG,
    });
  });

  it('resumes from checkpoint cursor', async () => {
    await service.run({
      organizationId: ORG,
      mode: 'dry_run',
      checkpoint: {
        organizationId: ORG,
        lastInsightId: 'ins-0',
        lastInsightUpdatedAt: '2026-07-10T10:00:00Z',
        processedCount: 10,
        updatedAt: new Date().toISOString(),
      },
    });

    expect(prisma.dashboardInsight.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          OR: expect.any(Array),
        }),
      }),
    );
  });
});
