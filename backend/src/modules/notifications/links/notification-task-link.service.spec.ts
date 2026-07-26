import { NotificationStatus } from '@prisma/client';
import { NotificationTaskLinkService } from './notification-task-link.service';
import { canResolveNotificationOnTaskComplete } from './notification-task-link.registry';
import {
  notificationTaskDedupKey,
  readNotificationIdFromTaskMetadata,
} from './notification-task-link.util';

describe('notification-task-link.util', () => {
  it('builds stable dedup key from notification id', () => {
    expect(notificationTaskDedupKey('abc-123')).toBe('notification:task:abc-123');
  });

  it('reads notificationId from task metadata', () => {
    expect(readNotificationIdFromTaskMetadata({ notificationId: 'n-1' })).toBe('n-1');
    expect(readNotificationIdFromTaskMetadata({})).toBeNull();
  });
});

describe('notification-task-link.registry', () => {
  it('allows task creation for vehicle health events', () => {
    expect(canResolveNotificationOnTaskComplete('BATTERY_CRITICAL')).toBe(false);
  });

  it('may resolve document review notifications on task complete', () => {
    expect(canResolveNotificationOnTaskComplete('DOCUMENT_INTAKE_REVIEW')).toBe(true);
  });
});

describe('NotificationTaskLinkService', () => {
  const repository = {
    findById: jest.fn(),
  };
  const core = {
    resolveNotification: jest.fn(),
  };
  const config = {
    isActionQueueDecoupled: jest.fn(() => true),
  };

  const service = new NotificationTaskLinkService(
    config as never,
    repository as never,
    core as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not resolve health notifications when task completes', async () => {
    repository.findById.mockResolvedValue({
      id: 'n-1',
      eventType: 'BATTERY_CRITICAL',
      status: NotificationStatus.OPEN,
    });

    await service.onTaskCompleted({
      id: 't-1',
      organizationId: 'org-1',
      metadata: { notificationId: 'n-1' },
    });

    expect(core.resolveNotification).not.toHaveBeenCalled();
  });

  it('resolves registry-allowed notifications on task complete', async () => {
    repository.findById.mockResolvedValue({
      id: 'n-2',
      eventType: 'DOCUMENT_INTAKE_REVIEW',
      status: NotificationStatus.OPEN,
    });

    await service.onTaskCompleted({
      id: 't-2',
      organizationId: 'org-1',
      metadata: { notificationId: 'n-2' },
    });

    expect(core.resolveNotification).toHaveBeenCalledWith('n-2', 'org-1', expect.any(Date), {
      manual: false,
    });
  });

  it('skips when decoupling flag is off', async () => {
    config.isActionQueueDecoupled.mockReturnValueOnce(false);
    await service.onTaskCompleted({
      id: 't-3',
      organizationId: 'org-1',
      metadata: { notificationId: 'n-3' },
    });
    expect(repository.findById).not.toHaveBeenCalled();
  });
});
