import {
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationSourceType,
  NotificationStatus,
} from './notification.enums';
import {
  DEFAULT_STATE_REOPEN_POLICY,
  evaluateReopenDecision,
} from './notification-reopen.policy';

describe('notification-reopen.policy', () => {
  const baseRecord = {
    id: 'notif-1',
    status: NotificationStatus.RESOLVED,
    resolvedAt: new Date('2026-07-10T12:00:00.000Z'),
    reopenCount: 0,
    generation: 1,
  };

  const occurrence = {
    organizationId: 'org-1',
    fingerprint: {
      parts: {
        organizationId: 'org-1',
        eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
        entityType: NotificationEntityType.VEHICLE,
        entityId: 'veh-1',
        conditionCode: 'driving_assessment_device_quality',
        scopeVersion: 1,
      },
      canonical: 'org-1|DRIVING_ASSESSMENT_DEVICE_QUALITY|VEHICLE|veh-1|driving_assessment_device_quality|v1',
    },
    occurredAt: new Date('2026-07-10T12:20:00.000Z'),
    severity: NotificationSeverity.WARNING,
    sourceType: NotificationSourceType.DASHBOARD_INSIGHT,
    sourceRef: 'insight-run-1',
  };

  it('ignores reopen during cooldown window', () => {
    const decision = evaluateReopenDecision({
      existing: baseRecord,
      occurrence,
      policy: {
        eventKind: NotificationEventKind.STATE,
        autoResolveWhenConditionClears: true,
        reopenPolicy: { ...DEFAULT_STATE_REOPEN_POLICY, cooldownMs: 30 * 60_000 },
      },
      referenceNow: new Date('2026-07-10T12:10:00.000Z'),
    });
    expect(decision).toEqual({ action: 'IGNORE', reason: 'COOLDOWN' });
  });

  it('reopens after cooldown elapsed', () => {
    const decision = evaluateReopenDecision({
      existing: baseRecord,
      occurrence,
      policy: {
        eventKind: NotificationEventKind.STATE,
        autoResolveWhenConditionClears: true,
        reopenPolicy: DEFAULT_STATE_REOPEN_POLICY,
      },
      referenceNow: new Date('2026-07-10T12:20:00.000Z'),
    });
    expect(decision).toEqual({
      action: 'REOPEN',
      notificationId: 'notif-1',
      generation: 1,
      reopenCount: 1,
    });
  });

  it('creates new generation when max reopens exceeded', () => {
    const decision = evaluateReopenDecision({
      existing: { ...baseRecord, reopenCount: 5 },
      occurrence,
      policy: {
        eventKind: NotificationEventKind.STATE,
        autoResolveWhenConditionClears: true,
        reopenPolicy: { ...DEFAULT_STATE_REOPEN_POLICY, maxReopensBeforeNewGeneration: 5 },
      },
      referenceNow: new Date('2026-07-10T13:00:00.000Z'),
    });
    expect(decision).toEqual({ action: 'CREATE', generation: 2 });
  });

  it('ignores occurrences against archived notifications', () => {
    const decision = evaluateReopenDecision({
      existing: { ...baseRecord, status: NotificationStatus.ARCHIVED },
      occurrence,
      policy: {
        eventKind: NotificationEventKind.STATE,
        autoResolveWhenConditionClears: true,
        reopenPolicy: DEFAULT_STATE_REOPEN_POLICY,
      },
      referenceNow: new Date('2026-07-10T13:00:00.000Z'),
    });
    expect(decision).toEqual({ action: 'IGNORE', reason: 'ARCHIVED' });
  });
});
