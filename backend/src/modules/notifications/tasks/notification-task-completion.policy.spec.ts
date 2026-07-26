import { NotificationEventKind, NotificationStatus } from '@prisma/client';
import { evaluateNotificationResolveOnTaskCompletion } from './notification-task-completion.policy';

describe('notification-task-completion.policy', () => {
  const baseNotification = {
    id: 'notif-1',
    organizationId: 'org-1',
    fingerprint: 'fp-1',
    status: NotificationStatus.OPEN,
  };

  it('skips STATE notifications while condition is still active', () => {
    const decision = evaluateNotificationResolveOnTaskCompletion({
      notification: {
        ...baseNotification,
        eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
        eventKind: NotificationEventKind.STATE,
      },
      task: { resolutionNote: 'Fixed' },
      conditionCleared: false,
    });
    expect(decision).toEqual({ action: 'skip', reason: 'CONDITION_STILL_ACTIVE' });
  });

  it('resolves STATE notification when condition is cleared', () => {
    const decision = evaluateNotificationResolveOnTaskCompletion({
      notification: {
        ...baseNotification,
        eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
        eventKind: NotificationEventKind.STATE,
      },
      task: { resolutionNote: 'Sensor recovered' },
      conditionCleared: true,
    });
    expect(decision).toEqual({ action: 'resolve', mode: 'condition_cleared' });
  });

  it('requires resolution note for EVENT notifications', () => {
    const decision = evaluateNotificationResolveOnTaskCompletion({
      notification: {
        ...baseNotification,
        eventType: 'TECHNICAL_OBSERVATION_ACTIVE',
        eventKind: NotificationEventKind.EVENT,
      },
      task: { resolutionNote: '' },
    });
    expect(decision).toEqual({ action: 'skip', reason: 'RESOLUTION_NOTE_REQUIRED' });
  });

  it('allows manual resolve for EVENT notifications with note', () => {
    const decision = evaluateNotificationResolveOnTaskCompletion({
      notification: {
        ...baseNotification,
        eventType: 'TECHNICAL_OBSERVATION_ACTIVE',
        eventKind: NotificationEventKind.EVENT,
      },
      task: { resolutionNote: 'Observation handled' },
    });
    expect(decision).toEqual({ action: 'resolve', mode: 'manual' });
  });

  it('skips already resolved notifications', () => {
    const decision = evaluateNotificationResolveOnTaskCompletion({
      notification: {
        ...baseNotification,
        eventType: 'TECHNICAL_OBSERVATION_ACTIVE',
        eventKind: NotificationEventKind.EVENT,
        status: NotificationStatus.RESOLVED,
      },
      task: { resolutionNote: 'Done' },
    });
    expect(decision).toEqual({ action: 'skip', reason: 'ALREADY_RESOLVED' });
  });
});
