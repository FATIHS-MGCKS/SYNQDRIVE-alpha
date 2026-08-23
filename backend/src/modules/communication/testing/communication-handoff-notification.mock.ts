import type { CommunicationHandoffNotificationService } from '../handoff/communication-handoff-notification.service';

export type CommunicationHandoffNotificationMock = jest.Mocked<
  Pick<CommunicationHandoffNotificationService, 'notifyHandoffRequired'>
>;

export function createCommunicationHandoffNotificationMock(): CommunicationHandoffNotificationMock {
  return {
    notifyHandoffRequired: jest.fn().mockResolvedValue(undefined),
  };
}
