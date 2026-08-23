import { CommunicationChannel } from '@prisma/client';
import { CommunicationHandoffNotificationService } from './communication-handoff-notification.service';
import { CommunicationHandoffNotificationAdapter } from '@modules/notifications/adapters/communication-handoff-notification.adapter';

describe('CommunicationHandoffNotificationService', () => {
  const router = {
    ingestFromAdapter: jest.fn(),
  };
  const adapter = new CommunicationHandoffNotificationAdapter();
  const readRepository = {
    findConversationById: jest.fn(),
  };

  let service: CommunicationHandoffNotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CommunicationHandoffNotificationService(
      router as any,
      adapter,
      readRepository as any,
    );
    readRepository.findConversationById.mockResolvedValue({
      id: 'conv-1',
      stationId: 'station-a',
      customer: null,
      metadata: { contactDisplay: 'Customer A' },
    });
    router.ingestFromAdapter.mockResolvedValue({ created: true });
  });

  it('ingests one logical notification per communicationEventId', async () => {
    const input = {
      organizationId: 'org-1',
      conversationId: 'conv-1',
      communicationEventId: 'evt-1',
      channel: CommunicationChannel.WHATSAPP,
      occurredAt: new Date('2026-08-23T10:00:00.000Z'),
      handoffReasonCode: 'LOW_CONFIDENCE',
    };

    await service.notifyHandoffRequired(input);
    await service.notifyHandoffRequired(input);

    expect(router.ingestFromAdapter).toHaveBeenCalledTimes(2);
    const firstCandidate = router.ingestFromAdapter.mock.calls[0]?.[2];
    const secondCandidate = router.ingestFromAdapter.mock.calls[1]?.[2];
    expect(firstCandidate?.sourceRef).toBe('evt-1');
    expect(secondCandidate?.sourceRef).toBe('evt-1');
  });

  it('ingests a second notification for a new communicationEventId', async () => {
    const base = {
      organizationId: 'org-1',
      conversationId: 'conv-1',
      channel: CommunicationChannel.WHATSAPP,
      occurredAt: new Date('2026-08-23T10:00:00.000Z'),
      handoffReasonCode: 'LOW_CONFIDENCE',
    };

    await service.notifyHandoffRequired({ ...base, communicationEventId: 'evt-1' });
    await service.notifyHandoffRequired({ ...base, communicationEventId: 'evt-2' });

    expect(router.ingestFromAdapter).toHaveBeenCalledTimes(2);
    expect(router.ingestFromAdapter.mock.calls[0]?.[2]?.sourceRef).toBe('evt-1');
    expect(router.ingestFromAdapter.mock.calls[1]?.[2]?.sourceRef).toBe('evt-2');
  });

  it('does not throw when notification ingest fails', async () => {
    router.ingestFromAdapter.mockRejectedValue(new Error('notification ingest failed'));

    await expect(
      service.notifyHandoffRequired({
        organizationId: 'org-1',
        conversationId: 'conv-1',
        communicationEventId: 'evt-1',
        channel: CommunicationChannel.VOICE,
        occurredAt: new Date(),
      }),
    ).resolves.toBeUndefined();
  });
});
