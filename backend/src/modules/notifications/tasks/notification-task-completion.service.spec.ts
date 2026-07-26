import { NotificationEventKind, NotificationStatus } from '@prisma/client';
import { NotificationTaskCompletionService } from './notification-task-completion.service';
import { NotificationCoreService } from '../notification-core.service';
import { NotificationRepository } from '../notification.repository';
import { mergeNotificationTaskMetadata } from './notification-task-materializer';
import type { NotificationTaskLink } from './notification-task-link.types';

const ORG = 'org-a';
const NOTIF = 'notif-1';

function makeLink(overrides: Partial<NotificationTaskLink> = {}): NotificationTaskLink {
  return {
    organizationId: ORG,
    notificationId: NOTIF,
    workflowRunId: 'run-1',
    sourceEventType: 'notification.opened',
    idempotencyKey: 'notification-action:org-a:wf-1:notif-1:gen:1:action:task.create:0',
    ...overrides,
  };
}

describe('NotificationTaskCompletionService', () => {
  let repository: jest.Mocked<Pick<NotificationRepository, 'findById' | 'findAnyActiveByFingerprint'>>;
  let core: jest.Mocked<Pick<NotificationCoreService, 'isEnabled' | 'resolveNotification'>>;
  let service: NotificationTaskCompletionService;

  beforeEach(() => {
    repository = {
      findById: jest.fn(),
      findAnyActiveByFingerprint: jest.fn(),
    };
    core = {
      isEnabled: jest.fn().mockReturnValue(true),
      resolveNotification: jest.fn().mockResolvedValue({ id: NOTIF }),
    };
    service = new NotificationTaskCompletionService(
      repository as unknown as NotificationRepository,
      core as unknown as NotificationCoreService,
    );
  });

  it('does not resolve when task completed but STATE condition still active', async () => {
    repository.findById.mockResolvedValue({
      id: NOTIF,
      organizationId: ORG,
      eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
      eventKind: NotificationEventKind.STATE,
      status: NotificationStatus.OPEN,
      fingerprint: 'fp-1',
    } as never);
    repository.findAnyActiveByFingerprint.mockResolvedValue({ id: NOTIF } as never);

    const result = await service.handleTaskCompleted({
      id: 'task-1',
      organizationId: ORG,
      metadata: mergeNotificationTaskMetadata(makeLink()),
      resolutionNote: 'Done',
    });

    expect(result).toEqual({ resolved: false, reason: 'CONDITION_STILL_ACTIVE' });
    expect(core.resolveNotification).not.toHaveBeenCalled();
  });

  it('resolves EVENT notification on manual task completion with note', async () => {
    repository.findById.mockResolvedValue({
      id: NOTIF,
      organizationId: ORG,
      eventType: 'TECHNICAL_OBSERVATION_ACTIVE',
      eventKind: NotificationEventKind.EVENT,
      status: NotificationStatus.OPEN,
      fingerprint: 'fp-obs',
    } as never);
    repository.findAnyActiveByFingerprint.mockResolvedValue({ id: NOTIF } as never);

    const result = await service.handleTaskCompleted({
      id: 'task-1',
      organizationId: ORG,
      metadata: mergeNotificationTaskMetadata(makeLink()),
      resolutionNote: 'Handled observation',
    });

    expect(result).toEqual({ resolved: true });
    expect(core.resolveNotification).toHaveBeenCalledWith(
      NOTIF,
      ORG,
      expect.any(Date),
      expect.objectContaining({ manual: true }),
    );
  });

  it('does not resolve on task cancellation', async () => {
    await service.handleTaskCancelled({
      id: 'task-1',
      metadata: mergeNotificationTaskMetadata(makeLink()),
    });
    expect(core.resolveNotification).not.toHaveBeenCalled();
  });

  it('resolves STATE notification when condition cleared', async () => {
    repository.findById.mockResolvedValue({
      id: NOTIF,
      organizationId: ORG,
      eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
      eventKind: NotificationEventKind.STATE,
      status: NotificationStatus.OPEN,
      fingerprint: 'fp-1',
    } as never);
    repository.findAnyActiveByFingerprint.mockResolvedValue(null);

    const result = await service.handleTaskCompleted({
      id: 'task-1',
      organizationId: ORG,
      metadata: mergeNotificationTaskMetadata(makeLink()),
      resolutionNote: 'Recovered',
    });

    expect(result).toEqual({ resolved: true });
    expect(core.resolveNotification).toHaveBeenCalledWith(
      NOTIF,
      ORG,
      expect.any(Date),
      expect.objectContaining({ manual: false }),
    );
  });
});
