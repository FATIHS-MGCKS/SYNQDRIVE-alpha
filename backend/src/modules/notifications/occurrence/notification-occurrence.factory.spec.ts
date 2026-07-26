import { NotificationOccurrenceRecoveryState } from '@prisma/client';
import { buildOccurrenceCreateInput } from './notification-occurrence.factory';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { DEFAULT_STATE_REOPEN_POLICY } from '../notification-reopen.policy';
import { NotificationEventKind, NotificationSeverity as DomainSeverity } from '../notification.enums';

describe('notification-occurrence.factory', () => {
  it('maps candidate fields to occurrence row input', () => {
    const candidate = buildCandidateFromRegistry({
      organizationId: 'org-1',
      eventType: 'TELEMETRY_OFFLINE',
      entityId: 'veh-1',
      sourceRef: 'evt-42',
      occurredAt: new Date('2026-07-11T10:00:00.000Z'),
      observedAt: new Date('2026-07-11T10:00:05.000Z'),
      correlationId: 'corr-1',
      causationId: 'cause-1',
      templateParams: { label: 'V1' },
      actionTargetContext: { vehicleId: 'veh-1', module: 'connectivity' },
    });

    const input = buildOccurrenceCreateInput('notif-1', {
      ...candidate,
      resolutionPolicy: {
        eventKind: NotificationEventKind.STATE,
        autoResolveWhenConditionClears: true,
        reopenPolicy: DEFAULT_STATE_REOPEN_POLICY,
      },
    });

    expect(input).toMatchObject({
      notificationId: 'notif-1',
      organizationId: 'org-1',
      sourceEventId: 'evt-42',
      sourceRef: 'evt-42',
      occurredAt: candidate.occurredAt,
      observedAt: candidate.observedAt,
      severityAtOccurrence: candidate.severity,
      recoveryState: NotificationOccurrenceRecoveryState.ACTIVE,
      correlationId: 'corr-1',
      causationId: 'cause-1',
    });
  });

  it('marks recovery occurrences', () => {
    const candidate = buildCandidateFromRegistry({
      organizationId: 'org-1',
      eventType: 'TELEMETRY_OFFLINE',
      entityId: 'veh-1',
      sourceRef: 'evt-rec',
      occurredAt: new Date('2026-07-11T10:00:00.000Z'),
      severity: DomainSeverity.SUCCESS,
      templateParams: { label: 'V1' },
      actionTargetContext: { vehicleId: 'veh-1', module: 'connectivity' },
    });

    const input = buildOccurrenceCreateInput('notif-1', {
      ...candidate,
      resolutionPolicy: {
        eventKind: NotificationEventKind.STATE,
        autoResolveWhenConditionClears: true,
        reopenPolicy: DEFAULT_STATE_REOPEN_POLICY,
      },
    }, { recovery: true });

    expect(input.recoveryState).toBe(NotificationOccurrenceRecoveryState.RECOVERED);
    expect(input.payload).toBeUndefined();
  });
});
