import { InsightEntityScope, InsightSeverity, InsightType } from '@prisma/client';
import {
  fingerprintFromDedupeKeyOnly,
  isMigratableInsightType,
  resolveInsightFingerprint,
} from './notification-migration-insight.util';
import { NotificationDeliveryPolicyService } from '../delivery/notification-delivery-policy.service';
import { buildDeliveryIdempotencyKey } from '../delivery/notification-delivery-idempotency.util';
import { NotificationDeliveryChannel, NotificationDeliveryTransition } from '@prisma/client';

describe('notification-migration-insight.util', () => {
  const baseRow = {
    id: 'ins-1',
    organizationId: 'org-1',
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
  };

  it('maps migratable insight types', () => {
    expect(isMigratableInsightType('STATION_SHORTAGE')).toBe(true);
    expect(isMigratableInsightType('TIGHT_HANDOVER')).toBe(false);
  });

  it('resolves stable fingerprint from dedupe key — not title', () => {
    const resolved = resolveInsightFingerprint('org-1', baseRow as any);
    expect(resolved?.fingerprint).toContain('org-1');
    expect(resolved?.fingerprint).toContain('STATION_SHORTAGE');
    expect(resolved?.fingerprint).toContain('st-1');
    expect(resolved?.fingerprint).not.toContain('Station shortage');
  });

  it('dedupe key alone is not used for migration identity', () => {
    const fromDedupe = fingerprintFromDedupeKeyOnly(
      'org-1',
      'station_shortage:st-1',
      InsightEntityScope.STATION,
    );
    const fromCandidate = resolveInsightFingerprint('org-1', baseRow as any)?.fingerprint;
    expect(fromCandidate).toContain('shortage');
    expect(fromDedupe).toContain('station_shortage');
    expect(fromDedupe).not.toBe(fromCandidate);
  });

  it('returns null for unmigratable type', () => {
    expect(
      resolveInsightFingerprint('org-1', {
        ...baseRow,
        type: InsightType.LOW_UTILIZATION,
      } as any),
    ).toBeNull();
  });
});

describe('delivery policy — no resend on occurrence-only', () => {
  const policy = new NotificationDeliveryPolicyService();

  it('does not enqueue update without severity escalation', () => {
    const n = {
      eventType: 'STATION_SHORTAGE',
      severity: 'WARNING',
      status: 'OPEN',
    } as any;
    expect(policy.shouldEnqueueForIngestOperation('updated', n, 'WARNING')).toBeNull();
  });
});

describe('idempotency key stability', () => {
  it('builds deterministic delivery key', () => {
    const key = buildDeliveryIdempotencyKey({
      notificationId: 'ntf-1',
      lifecycleGeneration: 1,
      deliveryTransition: NotificationDeliveryTransition.OPEN_CREATED,
      channel: NotificationDeliveryChannel.EMAIL,
      recipientId: 'user-1',
    });
    expect(key).toBe('ntf-1:1:OPEN_CREATED:EMAIL:user-1');
  });
});
