import { ForbiddenException } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationEventType,
} from '@prisma/client';
import { CommunicationPersistenceService } from './communication-persistence.service';
import { CommunicationConversationRepository } from './communication-conversation.repository';
import { CommunicationEventRepository } from './communication-event.repository';

describe('CommunicationPersistenceService', () => {
  const conversations = {
    findById: jest.fn(),
    ensureConversationEnvelope: jest.fn(),
    findByNativeReference: jest.fn(),
    updateConversationProjection: jest.fn(),
  } as unknown as CommunicationConversationRepository;

  const events = {
    appendEventIdempotently: jest.fn(),
  } as unknown as CommunicationEventRepository;

  let service: CommunicationPersistenceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CommunicationPersistenceService(conversations, events);
  });

  it('rejects cross-org event append when conversation missing in org', async () => {
    (conversations.findById as jest.Mock).mockResolvedValue(null);
    await expect(
      service.appendEventIdempotently({
        organizationId: 'org-a',
        conversationId: 'cc-foreign',
        channel: CommunicationChannel.WHATSAPP,
        eventType: CommunicationEventType.MESSAGE_SENT,
        occurredAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(events.appendEventIdempotently).not.toHaveBeenCalled();
  });

  it('appends event when conversation belongs to organization', async () => {
    (conversations.findById as jest.Mock).mockResolvedValue({
      id: 'cc-1',
      organizationId: 'org-1',
    });
    (events.appendEventIdempotently as jest.Mock).mockResolvedValue({
      event: { id: 'ev-1' },
      created: true,
    });

    const result = await service.appendEventIdempotently({
      organizationId: 'org-1',
      conversationId: 'cc-1',
      channel: CommunicationChannel.VOICE,
      eventType: CommunicationEventType.CALL_ENDED,
      occurredAt: new Date(),
      idempotencyKey: 'org-1:voice:end:1',
    });

    expect(result.created).toBe(true);
    expect(events.appendEventIdempotently).toHaveBeenCalled();
  });

  it('delegates ensureConversationEnvelope to repository', async () => {
    (conversations.ensureConversationEnvelope as jest.Mock).mockResolvedValue({
      conversation: { id: 'cc-1' },
      created: true,
    });
    const result = await service.ensureConversationEnvelope({
      organizationId: 'org-1',
      channel: CommunicationChannel.WHATSAPP,
      nativeConversationId: 'wa-1',
    });
    expect(result.created).toBe(true);
  });
});
