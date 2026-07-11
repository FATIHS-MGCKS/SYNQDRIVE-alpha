import {
  MembershipRole,
  MembershipStatus,
  NotificationCategory,
  NotificationDeliveryChannel,
  NotificationDeliveryOutboxStatus,
  NotificationDeliveryTransition,
  NotificationSeverity,
  NotificationStatus,
  OrgEmailMode,
} from '@prisma/client';
import { NotificationDeliveryPolicyService } from './notification-delivery-policy.service';
import { buildDeliveryIdempotencyKey } from './notification-delivery-idempotency.util';
import {
  criticalOverridesQuietHours,
  isWithinQuietHours,
} from './notification-delivery-quiet-hours.util';
import { NotificationDeliveryEnqueueService } from './notification-delivery-enqueue.service';
import { NotificationDeliveryOutboxRepository } from './notification-delivery-outbox.repository';
import { NotificationDeliveryProcessorService } from './notification-delivery-processor.service';
import { NotificationChannelDispatcher } from './notification-delivery-channels.service';
import { NotificationPreferenceService } from '../access/notification-preference.service';
import { NotificationStationScopeService } from '../access/notification-station-scope.service';
import { NotificationEngineConfig } from '../notification-engine.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

describe('NotificationDeliveryPolicyService', () => {
  const policy = new NotificationDeliveryPolicyService();

  it('enqueues OPEN_CREATED on create', () => {
    const transition = policy.shouldEnqueueForIngestOperation('created', baseNotification());
    expect(transition).toBe('OPEN_CREATED');
  });

  it('does not enqueue on update without severity escalation', () => {
    const n = baseNotification({ severity: NotificationSeverity.WARNING });
    const transition = policy.shouldEnqueueForIngestOperation(
      'updated',
      n,
      NotificationSeverity.WARNING,
    );
    expect(transition).toBeNull();
  });

  it('enqueues SEVERITY_ESCALATED when severity rises', () => {
    const n = baseNotification({ severity: NotificationSeverity.CRITICAL });
    const transition = policy.shouldEnqueueForIngestOperation(
      'updated',
      n,
      NotificationSeverity.WARNING,
    );
    expect(transition).toBe('SEVERITY_ESCALATED');
  });

  it('does not enqueue resolved for in-app-only events by default', () => {
    const n = baseNotification({
      eventType: 'STATION_SHORTAGE',
      status: NotificationStatus.RESOLVED,
    });
    expect(policy.shouldEnqueueForIngestOperation('resolved', n)).toBeNull();
  });

  it('enqueues resolved for critical STATE events with email channel', () => {
    const n = baseNotification({
      eventType: 'INTEGRATION_DISCONNECTED',
      status: NotificationStatus.RESOLVED,
    });
    expect(policy.shouldEnqueueForIngestOperation('resolved', n)).toBe('RESOLVED');
  });
});

describe('buildDeliveryIdempotencyKey', () => {
  it('combines notification lifecycle transition channel recipient', () => {
    const key = buildDeliveryIdempotencyKey({
      notificationId: 'ntf-1',
      lifecycleGeneration: 2,
      deliveryTransition: NotificationDeliveryTransition.OPEN_CREATED,
      channel: NotificationDeliveryChannel.EMAIL,
      recipientId: 'user-1',
    });
    expect(key).toBe('ntf-1:2:OPEN_CREATED:EMAIL:user-1');
  });
});

describe('quiet hours', () => {
  it('detects quiet window', () => {
    const ref = new Date('2026-07-11T21:00:00.000Z');
    expect(
      isWithinQuietHours(ref, 'Europe/Berlin', { startLocal: '22:00', endLocal: '07:00' }),
    ).toBe(true);
  });

  it('critical overrides quiet hours policy helper', () => {
    expect(criticalOverridesQuietHours(NotificationSeverity.CRITICAL)).toBe(true);
    expect(criticalOverridesQuietHours(NotificationSeverity.WARNING)).toBe(false);
  });
});

describe('NotificationDeliveryEnqueueService — preferences', () => {
  const preferenceService = new NotificationPreferenceService();

  it('respects email preference off', () => {
    const decision = preferenceService.evaluateInAppDelivery('STATION_SHORTAGE', NotificationSeverity.WARNING, [
      {
        category: NotificationCategory.BOOKINGS,
        inApp: true,
        email: false,
        push: false,
        sms: false,
        criticalOnly: false,
      } as any,
    ]);
    expect(decision.email).toBe(false);
    expect(decision.suppressedByPreference).toBe(false);
  });
});

describe('NotificationDeliveryOutboxRepository — idempotency', () => {
  it('createEntryIdempotent swallows unique violations', async () => {
    const prisma = {
      notificationDeliveryOutbox: {
        create: jest
          .fn()
          .mockRejectedValueOnce({ code: 'P2002' })
          .mockResolvedValueOnce({ id: 'out-1' }),
      },
    };
    const repo = new NotificationDeliveryOutboxRepository(prisma as any);
    const input = {
      organizationId: 'org-1',
      notificationId: 'ntf-1',
      lifecycleGeneration: 1,
      eventType: 'STATION_SHORTAGE',
      deliveryTransition: NotificationDeliveryTransition.OPEN_CREATED,
      channel: NotificationDeliveryChannel.EMAIL,
      recipientId: 'user-1',
      audienceKey: 'user:user-1',
      payloadRef: {},
      idempotencyKey: 'key-1',
    };
    const first = await repo.createEntryIdempotent(input);
    expect(first).toBeNull();
    const second = await repo.createEntryIdempotent(input);
    expect(second).toEqual({ id: 'out-1' });
  });
});

describe('NotificationDeliveryProcessorService', () => {
  it('marks push channel as suppressed without retry loop', async () => {
    const outboxRepo = {
      claimForProcessing: jest.fn().mockResolvedValue({
        id: 'out-1',
        notificationId: 'ntf-1',
        organizationId: 'org-1',
        eventType: 'INTEGRATION_DISCONNECTED',
        channel: NotificationDeliveryChannel.PUSH,
        attempts: 1,
      }),
      markSuppressed: jest.fn(),
      markCompleted: jest.fn(),
    };
    const metrics = new TripMetricsService();
    const observability = {
      log: jest.fn(),
      logWarn: jest.fn(),
      recordSent: jest.fn(),
      recordFailed: jest.fn(),
      recordRetry: jest.fn(),
      observeProcessingDuration: jest.fn(),
    };
    const processor = new NotificationDeliveryProcessorService(
      { enabled: true, maxAttempts: 3, backoffMs: 1000 } as any,
      outboxRepo as any,
      { deliver: jest.fn() } as any,
      observability as any,
    );
    const result = await processor.processOutboxId('out-1');
    expect(result).toBe('skipped');
    expect(outboxRepo.markSuppressed).toHaveBeenCalled();
  });

  it('completes successful email delivery once', async () => {
    const row = {
      id: 'out-1',
      notificationId: 'ntf-1',
      organizationId: 'org-1',
      eventType: 'INTEGRATION_DISCONNECTED',
      channel: NotificationDeliveryChannel.EMAIL,
      attempts: 1,
    };
    const outboxRepo = {
      claimForProcessing: jest
        .fn()
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(null),
      markCompleted: jest.fn(),
      markRetry: jest.fn(),
      markDeadLetter: jest.fn(),
    };
    const dispatcher = {
      deliver: jest.fn().mockResolvedValue({ success: true, outboundEmailId: 'email-1' }),
    };
    const observability = {
      log: jest.fn(),
      logWarn: jest.fn(),
      recordSent: jest.fn(),
      recordFailed: jest.fn(),
      recordRetry: jest.fn(),
      observeProcessingDuration: jest.fn(),
    };
    const processor = new NotificationDeliveryProcessorService(
      { enabled: true, maxAttempts: 3, backoffMs: 1000 } as any,
      outboxRepo as any,
      dispatcher as any,
      observability as any,
    );
    await processor.processOutboxId('out-1');
    await processor.processOutboxId('out-1');
    expect(dispatcher.deliver).toHaveBeenCalledTimes(1);
    expect(outboxRepo.markCompleted).toHaveBeenCalledWith('out-1', 'email-1');
  });
});

function baseNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ntf-1',
    organizationId: 'org-1',
    fingerprint: 'fp',
    lifecycleGeneration: 1,
    eventType: 'STATION_SHORTAGE',
    eventKind: 'STATE',
    conditionCode: 'shortage',
    domain: 'OPERATIONS',
    severity: NotificationSeverity.WARNING,
    status: NotificationStatus.OPEN,
    entityType: 'STATION',
    entityId: 'st-1',
    titleKey: 'notification.title.stationShortage',
    bodyKey: 'notification.body.stationShortage',
    templateParams: {},
    actionType: 'OPEN_STATION',
    actionTarget: { stationId: 'st-1' },
    sourceType: 'DASHBOARD_INSIGHT',
    primarySourceRef: 'run-1',
    legacyInsightId: null,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    occurrenceCount: 1,
    reopenCount: 0,
    acknowledgedAt: null,
    snoozedUntil: null,
    resolvedAt: null,
    archivedAt: null,
    expiresAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as any;
}
