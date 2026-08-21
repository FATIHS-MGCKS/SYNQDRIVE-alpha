import {
  CommunicationChannel,
  CommunicationEventType,
  CommunicationProviderIdentity,
} from '@prisma/client';
import { CommunicationEventRepository } from './communication-event.repository';

function makePrisma() {
  return {
    communicationEvent: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;
}

describe('CommunicationEventRepository', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repository: CommunicationEventRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repository = new CommunicationEventRepository(prisma);
  });

  it('appends event without provider payload fields', async () => {
    prisma.communicationEvent.create.mockResolvedValue({ id: 'ev-1' });
    await repository.appendEvent({
      organizationId: 'org-1',
      conversationId: 'cc-1',
      channel: CommunicationChannel.WHATSAPP,
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      occurredAt: new Date('2026-08-21T09:00:00Z'),
      providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
      providerMessageId: 'wamid-1',
    });
    expect(prisma.communicationEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: CommunicationEventType.MESSAGE_RECEIVED,
          providerMessageId: 'wamid-1',
        }),
      }),
    );
    const payload = prisma.communicationEvent.create.mock.calls[0][0].data;
    expect(payload).not.toHaveProperty('payload');
  });

  it('returns existing row on idempotent append', async () => {
    prisma.communicationEvent.findUnique.mockResolvedValue({ id: 'ev-existing' });
    const result = await repository.appendEventIdempotently({
      organizationId: 'org-1',
      conversationId: 'cc-1',
      channel: CommunicationChannel.VOICE,
      eventType: CommunicationEventType.CALL_STARTED,
      occurredAt: new Date(),
      idempotencyKey: 'org-1:voice:evt-1',
    });
    expect(result.created).toBe(false);
    expect(result.event).toEqual({ id: 'ev-existing' });
    expect(prisma.communicationEvent.create).not.toHaveBeenCalled();
  });

  it('allows multiple delivery events with same providerMessageId via distinct idempotency keys', async () => {
    prisma.communicationEvent.findUnique.mockResolvedValue(null);
    prisma.communicationEvent.create.mockResolvedValue({ id: 'ev-delivered' });

    await repository.appendEventIdempotently({
      organizationId: 'org-1',
      conversationId: 'cc-1',
      channel: CommunicationChannel.WHATSAPP,
      eventType: CommunicationEventType.MESSAGE_DELIVERED,
      occurredAt: new Date('2026-08-21T09:01:00Z'),
      providerMessageId: 'wamid-shared',
      idempotencyKey: 'org-1:wa:delivered:wamid-shared',
    });

    expect(prisma.communicationEvent.create).toHaveBeenCalled();
  });

  it('does not dedupe by provider-event unique when provider fields are null', async () => {
    prisma.communicationEvent.findUnique.mockResolvedValue(null);
    prisma.communicationEvent.create.mockResolvedValue({ id: 'ev-null-provider' });

    await repository.appendEventIdempotently({
      organizationId: 'org-1',
      conversationId: 'cc-1',
      channel: CommunicationChannel.WHATSAPP,
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      occurredAt: new Date(),
    });

    expect(prisma.communicationEvent.findUnique).not.toHaveBeenCalled();
    expect(prisma.communicationEvent.create).toHaveBeenCalled();
  });

  it('scopes listByConversation to organization', async () => {
    prisma.communicationEvent.findMany.mockResolvedValue([]);
    await repository.listByConversation('org-1', 'cc-1');
    expect(prisma.communicationEvent.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', conversationId: 'cc-1' },
      orderBy: { occurredAt: 'asc' },
    });
  });
});
