import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

  const baseConversation = {
    id: 'cc-1',
    organizationId: 'org-1',
    channel: CommunicationChannel.WHATSAPP,
    customerId: 'cust-1',
    bookingId: 'book-1',
    vehicleId: 'veh-1',
  };

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

  it('allows WHATSAPP conversation + WHATSAPP event', async () => {
    (conversations.findById as jest.Mock).mockResolvedValue(baseConversation);
    (events.appendEventIdempotently as jest.Mock).mockResolvedValue({
      event: { id: 'ev-1' },
      created: true,
    });

    const result = await service.appendEventIdempotently({
      organizationId: 'org-1',
      conversationId: 'cc-1',
      channel: CommunicationChannel.WHATSAPP,
      eventType: CommunicationEventType.MESSAGE_SENT,
      occurredAt: new Date(),
      idempotencyKey: 'org-1:wa:sent:1',
    });

    expect(result.created).toBe(true);
    expect(events.appendEventIdempotently).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: CommunicationChannel.WHATSAPP,
        customerId: 'cust-1',
        bookingId: 'book-1',
        vehicleId: 'veh-1',
      }),
    );
  });

  it('rejects WHATSAPP conversation + SMS event', async () => {
    (conversations.findById as jest.Mock).mockResolvedValue(baseConversation);
    await expect(
      service.appendEventIdempotently({
        organizationId: 'org-1',
        conversationId: 'cc-1',
        channel: CommunicationChannel.SMS,
        eventType: CommunicationEventType.MESSAGE_SENT,
        occurredAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(events.appendEventIdempotently).not.toHaveBeenCalled();
  });

  it('rejects VOICE conversation + WHATSAPP event', async () => {
    (conversations.findById as jest.Mock).mockResolvedValue({
      ...baseConversation,
      channel: CommunicationChannel.VOICE,
    });
    await expect(
      service.appendEventIdempotently({
        organizationId: 'org-1',
        conversationId: 'cc-1',
        channel: CommunicationChannel.WHATSAPP,
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(events.appendEventIdempotently).not.toHaveBeenCalled();
  });

  it('derives event context from conversation and ignores cross-org event context input', async () => {
    (conversations.findById as jest.Mock).mockResolvedValue(baseConversation);
    (events.appendEventIdempotently as jest.Mock).mockResolvedValue({
      event: { id: 'ev-2' },
      created: true,
    });

    await service.appendEventIdempotently({
      organizationId: 'org-1',
      conversationId: 'cc-1',
      channel: CommunicationChannel.WHATSAPP,
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      occurredAt: new Date(),
      customerId: 'cust-foreign',
      bookingId: 'book-foreign',
      vehicleId: 'veh-foreign',
    });

    expect(events.appendEventIdempotently).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        bookingId: 'book-1',
        vehicleId: 'veh-1',
      }),
    );
    expect(events.appendEventIdempotently).not.toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-foreign' }),
    );
  });

  it('appends VOICE event when conversation channel matches', async () => {
    (conversations.findById as jest.Mock).mockResolvedValue({
      ...baseConversation,
      channel: CommunicationChannel.VOICE,
      customerId: null,
      bookingId: null,
      vehicleId: null,
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
