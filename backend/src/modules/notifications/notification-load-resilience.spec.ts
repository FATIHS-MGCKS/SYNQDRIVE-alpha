import * as fs from 'fs';
import * as path from 'path';
import { MembershipRole, NotificationStatus } from '@prisma/client';
import { NotificationApiService } from './api/notification-api.service';
import { NotificationCoreService } from './notification-core.service';
import { NotificationEngineConfig } from './notification-engine.config';
import { NotificationRepository } from './notification.repository';
import { NotificationDeliveryProcessorService } from './delivery/notification-delivery-processor.service';
import { NotificationDeliveryOutboxRepository } from './delivery/notification-delivery-outbox.repository';
import { NotificationChannelDispatcher } from './delivery/notification-delivery-channels.service';
import { NotificationDeliveryObservabilityService } from './delivery/notification-delivery-observability.service';
import { withUniqueConflictRetry } from './notification-prisma.util';
import { summarizeLatencies, timeAsync } from './testing/notification-load-metrics.util';
import {
  buildLoadTestCandidate,
  countActiveDuplicateFingerprints,
  countOrphanOccurrences,
  createNotificationTestHarness,
  deadLetterCount,
  DEFAULT_ORG,
  DomainSeverity,
  outboxBacklog,
} from './testing/notification-test-harness';
import {
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationSourceType,
  NotificationActionType,
} from '@prisma/client';

const ORG_A = 'org-load-a';
const ORG_B = 'org-load-b';

/** Exported for audit doc generation — populated during test run. */
export const loadResilienceReport: Record<string, unknown> = {
  environment: 'isolated-in-memory-harness',
  scenarios: {} as Record<string, unknown>,
};

function recordScenario(name: string, data: Record<string, unknown>) {
  (loadResilienceReport.scenarios as Record<string, unknown>)[name] = data;
}

describe('Notification Engine — load, concurrency & resilience (isolated harness)', () => {
  describe('ingest scale & concurrency', () => {
    it('scenario 1: ingests 10_000 distinct notifications for one org', async () => {
      const harness = createNotificationTestHarness();
      const latencies: number[] = [];
      let errors = 0;

      for (let i = 0; i < 10_000; i++) {
        try {
          const { durationMs } = await timeAsync(() =>
            harness.service.ingestCandidate(
              buildLoadTestCandidate({
                organizationId: ORG_A,
                entityId: `veh-scale-${i}`,
                sourceRef: `scale-${i}`,
              }),
            ),
          );
          latencies.push(durationMs);
        } catch {
          errors += 1;
        }
      }

      const summary = summarizeLatencies(latencies);
      const duplicates = countActiveDuplicateFingerprints(harness.store);
      const orphans = countOrphanOccurrences(harness.store);

      expect(errors).toBe(0);
      expect(duplicates).toBe(0);
      expect(orphans).toBe(0);
      expect(harness.store.notifications.size).toBe(10_000);
      expect(harness.store.occurrences).toHaveLength(10_000);

      recordScenario('10k_distinct_notifications', {
        ...summary,
        errorRate: errors / 10_000,
        activeDuplicates: duplicates,
        orphanOccurrences: orphans,
        notificationCount: harness.store.notifications.size,
      });
    }, 120_000);

    it('scenario 2: 10 parallel identical candidates → 1 active row, 10 occurrences', async () => {
      const harness = createNotificationTestHarness();
      const candidate = buildLoadTestCandidate({ organizationId: ORG_A, entityId: 'veh-dup-10' });

      const latencies: number[] = [];
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          timeAsync(() =>
            harness.service.ingestCandidate({ ...candidate, sourceRef: `par-${i}` }),
          ),
        ),
      );
      for (const r of results) latencies.push(r.durationMs);

      expect(harness.store.notifications.size).toBe(1);
      expect(harness.store.occurrences).toHaveLength(10);
      expect(countActiveDuplicateFingerprints(harness.store)).toBe(0);

      recordScenario('10_parallel_identical', {
        ...summarizeLatencies(latencies),
        occurrenceCount: harness.store.occurrences.length,
        activeDuplicates: 0,
      });
    });

    it('scenario 3: 100 parallel distinct candidates', async () => {
      const harness = createNotificationTestHarness();
      const latencies: number[] = [];

      await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          timeAsync(() =>
            harness.service.ingestCandidate(
              buildLoadTestCandidate({
                organizationId: ORG_A,
                entityId: `veh-par-${i}`,
                sourceRef: `par-distinct-${i}`,
              }),
            ),
          ).then((r) => {
            latencies.push(r.durationMs);
          }),
        ),
      );

      expect(harness.store.notifications.size).toBe(100);
      expect(harness.store.occurrences).toHaveLength(100);
      expect(countActiveDuplicateFingerprints(harness.store)).toBe(0);

      recordScenario('100_parallel_distinct', {
        ...summarizeLatencies(latencies),
        notificationCount: 100,
      });
    });

    it('scenario 4: two backend instances share store without duplicate actives', async () => {
      const harness = createNotificationTestHarness();
      const instanceB = harness.createSecondInstance();
      const candidate = buildLoadTestCandidate({ organizationId: ORG_A, entityId: 'veh-multi-inst' });

      await Promise.all([
        harness.service.ingestCandidate({ ...candidate, sourceRef: 'inst-a-1' }),
        instanceB.ingestCandidate({ ...candidate, sourceRef: 'inst-b-1' }),
        harness.service.ingestCandidate({ ...candidate, sourceRef: 'inst-a-2' }),
        instanceB.ingestCandidate({ ...candidate, sourceRef: 'inst-b-2' }),
      ]);

      expect(harness.store.notifications.size).toBe(1);
      expect(harness.store.occurrences).toHaveLength(4);
      expect(countActiveDuplicateFingerprints(harness.store)).toBe(0);

      recordScenario('multi_instance_shared_store', {
        instances: 2,
        occurrenceCount: 4,
        activeDuplicates: 0,
      });
    });
  });

  describe('lifecycle & ordering', () => {
    it('scenario 5: WARNING escalates to CRITICAL', async () => {
      const harness = createNotificationTestHarness();
      const base = buildLoadTestCandidate({
        organizationId: ORG_A,
        entityId: 'veh-sev',
        severity: DomainSeverity.WARNING,
      });
      await harness.service.ingestCandidate(base);
      await harness.service.ingestCandidate({
        ...base,
        severity: DomainSeverity.CRITICAL,
        sourceRef: 'sev-up',
        occurredAt: new Date('2026-07-11T11:00:00.000Z'),
      });

      const row = [...harness.store.notifications.values()][0];
      expect(row.severity).toBe(NotificationSeverity.CRITICAL);
      recordScenario('warning_to_critical', { finalSeverity: row.severity });
    });

    it('scenario 6: CRITICAL recovers via SUCCESS severity', async () => {
      const harness = createNotificationTestHarness();
      const base = buildLoadTestCandidate({
        organizationId: ORG_A,
        entityId: 'veh-rec',
        severity: DomainSeverity.CRITICAL,
      });
      await harness.service.ingestCandidate(base);
      const result = await harness.service.ingestCandidate({
        ...base,
        severity: DomainSeverity.SUCCESS,
        sourceRef: 'recovery',
        occurredAt: new Date('2026-07-11T12:00:00.000Z'),
        titleKey: 'notification.title.drivingAssessmentRecovering',
      });

      expect(result.operation).toBe('resolved');
      expect([...harness.store.notifications.values()][0].status).toBe(NotificationStatus.RESOLVED);
      recordScenario('critical_to_recovery', { operation: result.operation });
    });

    it('scenario 7: resolve then reopen', async () => {
      const harness = createNotificationTestHarness();
      const base = buildLoadTestCandidate({ organizationId: ORG_A, entityId: 'veh-reopen' });
      await harness.service.ingestCandidate(base);
      await harness.service.ingestCandidate({
        ...base,
        severity: DomainSeverity.SUCCESS,
        sourceRef: 'resolve-1',
        occurredAt: new Date('2026-07-11T11:00:00.000Z'),
        titleKey: 'notification.title.drivingAssessmentRecovering',
      });
      const reopened = await harness.service.ingestCandidate({
        ...base,
        sourceRef: 'reopen-1',
        occurredAt: new Date('2026-07-11T12:00:00.000Z'),
      });

      expect(reopened.operation).toBe('reopened');
      expect([...harness.store.notifications.values()][0].reopenCount).toBe(1);
      recordScenario('resolve_and_reopen', { operation: reopened.operation, reopenCount: 1 });
    });

    it('scenario 8: out-of-order events preserve firstSeenAt from earliest occurredAt', async () => {
      const harness = createNotificationTestHarness();
      const base = buildLoadTestCandidate({ organizationId: ORG_A, entityId: 'veh-ooo' });

      await harness.service.ingestCandidate({
        ...base,
        sourceRef: 'newer',
        occurredAt: new Date('2026-07-11T12:00:00.000Z'),
      });
      await harness.service.ingestCandidate({
        ...base,
        sourceRef: 'older',
        occurredAt: new Date('2026-07-11T08:00:00.000Z'),
      });

      const row = [...harness.store.notifications.values()][0];
      expect(row.firstSeenAt).toEqual(new Date('2026-07-11T08:00:00.000Z'));
      expect(row.lastSeenAt).toEqual(new Date('2026-07-11T12:00:00.000Z'));
      expect(harness.store.occurrences).toHaveLength(2);
      recordScenario('out_of_order_events', {
        occurrenceCount: 2,
        orphanOccurrences: countOrphanOccurrences(harness.store),
      });
    });
  });

  describe('failure & recovery paths', () => {
    it('scenario 9: withUniqueConflictRetry recovers from simulated P2002', async () => {
      let attempts = 0;
      const result = await withUniqueConflictRetry(async () => {
        attempts += 1;
        if (attempts === 1) {
          const { Prisma } = await import('@prisma/client');
          throw new Prisma.PrismaClientKnownRequestError('Unique', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        return 'ok';
      });

      expect(result).toBe('ok');
      expect(attempts).toBe(2);
      recordScenario('bullmq_retry_analog_p2002', { attempts, recovered: true });
    });

    it('scenario 10: ingest continues after simulated redis-unavailable (flag off path)', async () => {
      const harness = createNotificationTestHarness();
      harness.setV2Enabled(false);
      const result = await harness.service.ingestCandidate(buildLoadTestCandidate());
      expect(result.operation).toBe('skipped_flag_off');
      harness.setV2Enabled(true);
      await harness.service.ingestCandidate(buildLoadTestCandidate({ entityId: 'veh-after-redis' }));
      expect(harness.store.notifications.size).toBe(1);
      recordScenario('redis_interruption_analog', {
        skippedWhenDisabled: true,
        recoveredAfterReenable: true,
      });
    });

    it('scenario 11: worker restart preserves notification state', async () => {
      const harness = createNotificationTestHarness();
      await harness.service.ingestCandidate(
        buildLoadTestCandidate({ organizationId: ORG_A, entityId: 'veh-restart' }),
      );
      const beforeCount = harness.store.notifications.size;
      const restarted = harness.createSecondInstance();
      const row = [...harness.store.notifications.values()][0];
      const acked = await restarted.acknowledgeNotification(row.id, ORG_A);
      expect(acked.status).toBe(NotificationStatus.ACKNOWLEDGED);
      expect(harness.store.notifications.size).toBe(beforeCount);
      recordScenario('worker_restart', { notificationsPreserved: beforeCount, status: acked.status });
    });

    it('scenario 12: provider timeout marks outbox for retry not silent loss', async () => {
      const harness = createNotificationTestHarness();
      await harness.service.ingestCandidate(
        buildLoadTestCandidate({ organizationId: ORG_A, entityId: 'veh-timeout' }),
      );

      const outboxRepo = {
        claimForProcessing: jest.fn(async (id: string) => {
          const row = harness.store.outbox.get(id);
          return row ? { ...row, channel: 'EMAIL', attempts: row.attempts ?? 1 } : null;
        }),
        markCompleted: jest.fn(),
        markRetry: jest.fn(async (id: string, error: string) => {
          const row = harness.store.outbox.get(id);
          if (row) {
            harness.store.outbox.set(id, {
              ...row,
              status: 'FAILED',
              lastError: error,
              attempts: (row.attempts ?? 0) + 1,
            });
          }
        }),
        markDeadLetter: jest.fn(),
        markSuppressed: jest.fn(),
      } as unknown as NotificationDeliveryOutboxRepository;

      const dispatcher = {
        deliver: jest.fn().mockResolvedValue({
          success: false,
          retryable: true,
          errorCode: 'PROVIDER_TIMEOUT',
          errorMessage: 'timeout',
        }),
      } as unknown as NotificationChannelDispatcher;

      const processor = new NotificationDeliveryProcessorService(
        { maxAttempts: 3, backoffMs: 1000 } as any,
        outboxRepo,
        dispatcher,
        {
          recordAttempt: jest.fn(),
          observeProcessingDuration: jest.fn(),
          log: jest.fn(),
          logWarn: jest.fn(),
          recordSent: jest.fn(),
          recordFailure: jest.fn(),
          recordRetry: jest.fn(),
          recordFailed: jest.fn(),
        } as unknown as NotificationDeliveryObservabilityService,
      );

      const outboxId = [...harness.store.outbox.keys()][0];
      const outcome = await processor.processOutboxId(outboxId);
      expect(outcome).toBe('retry');
      expect(outboxRepo.markRetry).toHaveBeenCalled();
      recordScenario('provider_timeout', { outcome, retried: true });
    });

    it('scenario 13: unique conflict retry on parallel create path', async () => {
      const harness = createNotificationTestHarness();
      const candidate = buildLoadTestCandidate({ organizationId: ORG_A, entityId: 'veh-deadlock' });

      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          harness.service.ingestCandidate({ ...candidate, sourceRef: `dl-${i}` }),
        ),
      );

      expect(harness.store.notifications.size).toBe(1);
      expect(harness.store.occurrences).toHaveLength(20);
      expect(countOrphanOccurrences(harness.store)).toBe(0);
      recordScenario('db_conflict_retry', {
        parallelIngests: 20,
        occurrenceCount: 20,
        lostOccurrences: 0,
      });
    });
  });

  describe('API under load', () => {
    const buildApiHarness = (notificationCount: number) => {
      const rows = Array.from({ length: notificationCount }, (_, i) => ({
        id: `notif-${i}`,
        organizationId: ORG_A,
        fingerprint: `fp-${i}`,
        lifecycleGeneration: 1,
        eventType: 'TECHNICAL_OBSERVATION_ACTIVE',
        eventKind: NotificationEventKind.STATE,
        conditionCode: 'technical_observation_active',
        domain: NotificationDomain.VEHICLE_HEALTH,
        severity: NotificationSeverity.WARNING,
        status: NotificationStatus.OPEN,
        entityType: NotificationEntityType.VEHICLE,
        entityId: `veh-api-${i}`,
        titleKey: 'notification.title.technicalObservation',
        bodyKey: 'notification.body.technicalObservation',
        templateParams: {},
        actionType: NotificationActionType.OPEN_VEHICLE_MODULE,
        actionTarget: {},
        sourceType: NotificationSourceType.OPERATIONAL_ISSUE,
        primarySourceRef: `obs-${i}`,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        occurrenceCount: 1,
        resolvedAt: null,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        acknowledgedAt: null,
        snoozedUntil: null,
        archivedAt: null,
        reopenCount: 0,
        version: 1,
        legacyInsightId: null,
      }));

      const repository = {
        listNotificationsWhere: jest.fn(async () => rows),
        countNotificationsWhere: jest.fn(async () => rows.length),
        groupCountBySeverityWhere: jest.fn(async () => [
          { severity: NotificationSeverity.WARNING, _count: { _all: rows.length } },
        ]),
        groupCountByDomainWhere: jest.fn(async () => [
          { domain: NotificationDomain.VEHICLE_HEALTH, _count: { _all: rows.length } },
        ]),
        findReceiptsForUser: jest.fn(async () => []),
        findById: jest.fn(),
      } as unknown as NotificationRepository;

      const prisma = {
        user: { findUnique: jest.fn(async () => ({ status: 'ACTIVE' })) },
        organizationMembership: {
          findFirst: jest.fn(async () => ({ role: MembershipRole.ORG_ADMIN, stationScope: 'ALL' })),
        },
        userNotificationPreference: { findMany: jest.fn(async () => []) },
        vehicle: { findMany: jest.fn(async () => []) },
        station: { findMany: jest.fn(async () => []) },
        booking: { findMany: jest.fn(async () => []) },
        dashboardInsight: { findMany: jest.fn(async () => []) },
        customer: { findFirst: jest.fn(async () => null) },
        orgInvoice: { findFirst: jest.fn(async () => null) },
        vehicleTrip: { findFirst: jest.fn(async () => null) },
      };

      const stationScopeService = {
        buildScopeContext: jest.fn(async () => ({
          scopedStationIds: [],
          scopedVehicleIds: [],
          scopedBookingIds: [],
          bypassStationScope: true,
        })),
        isNotificationInScope: jest.fn(() => true),
        isEntityInCallerScope: jest.fn(() => true),
        recheckVehicleStationScope: jest.fn(async () => true),
        shouldApplyStationScope: jest.fn(() => false),
      };

      const api = new NotificationApiService(
        {} as NotificationCoreService,
        repository,
        { isV2Enabled: () => true, isV2EnabledForOrg: () => true } as unknown as NotificationEngineConfig,
        prisma as any,
        { recordFireAndForget: jest.fn(), listEvents: jest.fn() } as any,
        { recordApiRequest: jest.fn(), recordFireAndForget: jest.fn() } as any,
        { findReceipt: jest.fn() } as any,
        stationScopeService as any,
      );

      return { api, rows };
    };

    it('scenario 14: list API under 50 parallel requests', async () => {
      const { api } = buildApiHarness(200);
      const latencies: number[] = [];

      await Promise.all(
        Array.from({ length: 50 }, () =>
          timeAsync(() => api.list(ORG_A, { id: 'user-1' }, {})).then((timed) => {
            latencies.push(timed.durationMs);
          }),
        ),
      );

      recordScenario('api_list_under_load', {
        ...summarizeLatencies(latencies),
        parallelRequests: 50,
        rowCount: 200,
      });
    });

    it('scenario 15: counts API under 50 parallel requests', async () => {
      const { api } = buildApiHarness(200);
      const latencies: number[] = [];

      await Promise.all(
        Array.from({ length: 50 }, () =>
          timeAsync(() => api.getCounts(ORG_A, { id: 'user-1' })).then((timed) => {
            latencies.push(timed.durationMs);
          }),
        ),
      );

      recordScenario('api_counts_under_load', {
        ...summarizeLatencies(latencies),
        parallelRequests: 50,
      });
    });
  });

  describe('multi-tenant isolation', () => {
    it('scenario 16: parallel ingests across orgs do not cross-mix', async () => {
      const harness = createNotificationTestHarness();
      const sharedEntityId = 'veh-shared-id';

      await Promise.all([
        ...Array.from({ length: 50 }, (_, i) =>
          harness.service.ingestCandidate(
            buildLoadTestCandidate({
              organizationId: ORG_A,
              entityId: sharedEntityId,
              sourceRef: `a-${i}`,
            }),
          ),
        ),
        ...Array.from({ length: 50 }, (_, i) =>
          harness.service.ingestCandidate(
            buildLoadTestCandidate({
              organizationId: ORG_B,
              entityId: sharedEntityId,
              sourceRef: `b-${i}`,
            }),
          ),
        ),
      ]);

      const orgARows = [...harness.store.notifications.values()].filter((r) => r.organizationId === ORG_A);
      const orgBRows = [...harness.store.notifications.values()].filter((r) => r.organizationId === ORG_B);

      expect(orgARows).toHaveLength(1);
      expect(orgBRows).toHaveLength(1);
      expect(orgARows[0].fingerprint).not.toBe(orgBRows[0].fingerprint);
      expect(countActiveDuplicateFingerprints(harness.store)).toBe(0);

      recordScenario('multi_org_parallel', {
        orgANotifications: 1,
        orgBNotifications: 1,
        orgAOccurrences: harness.store.occurrences.filter((o) => o.organizationId === ORG_A).length,
        orgBOccurrences: harness.store.occurrences.filter((o) => o.organizationId === ORG_B).length,
        crossTenantLeak: false,
      });
    });
  });

  afterAll(() => {
    loadResilienceReport.completedAt = new Date().toISOString();
    loadResilienceReport.expectations = {
      noActiveFingerprintDuplicates: true,
      noCrossTenantMixing: true,
      noLostOccurrences: true,
      controlledRetries: true,
    };
    if (process.env.NOTIFICATION_LOAD_REPORT === '1') {
      const outPath = path.resolve(process.cwd(), 'tmp/notification-load-resilience-report.json');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(loadResilienceReport, null, 2), 'utf8');
    }
  });
});
