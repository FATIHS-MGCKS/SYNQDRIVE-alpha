import { Test } from '@nestjs/testing';
import {
  CommunicationChannel,
  CommunicationEventType,
  CommunicationProviderIdentity,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationConversationRepository } from './communication-conversation.repository';
import { CommunicationEventRepository } from './communication-event.repository';
import { CommunicationProjectionService } from './communication-projection.service';
import { CommunicationTenantContextValidation } from './communication-tenant-context.validation';
import { buildCanonicalIdempotencyKey } from './normalization/communication-idempotency';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('CommunicationProjectionService postgres concurrency', () => {
  let prisma: PrismaClient;
  let service: CommunicationProjectionService;
  let orgId: string;
  let nativeConversationId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        CommunicationTenantContextValidation,
        CommunicationConversationRepository,
        CommunicationEventRepository,
        CommunicationProjectionService,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    service = moduleRef.get(CommunicationProjectionService);
  });

  beforeEach(async () => {
    const org = await prisma.organization.create({
      data: {
        companyName: `Comm PG Concurrency ${Date.now()}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
    });
    orgId = org.id;
    nativeConversationId = `wa-native-${Date.now()}`;
  });

  afterEach(async () => {
    await prisma.communicationEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.communicationConversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('increments unreadCount twice for concurrent distinct new events', async () => {
    await service.projectNormalizedInput({
      envelope: {
        organizationId: orgId,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId,
      },
      event: {
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt: new Date('2026-08-21T09:59:00Z'),
        providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
        providerEventId: 'evt-bootstrap',
        idempotencyKey: buildCanonicalIdempotencyKey({
          organizationId: orgId,
          channel: CommunicationChannel.WHATSAPP,
          providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
          eventType: CommunicationEventType.MESSAGE_RECEIVED,
          nativeConversationId,
          providerEventId: 'evt-bootstrap',
        }),
      },
    });

    const baseInput = {
      envelope: {
        organizationId: orgId,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId,
      },
      projection: { unreadDelta: 1 },
    };

    const [first, second] = await Promise.all([
      service.projectNormalizedInput({
        ...baseInput,
        event: {
          eventType: CommunicationEventType.MESSAGE_RECEIVED,
          occurredAt: new Date('2026-08-21T10:00:00Z'),
          providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
          providerEventId: 'evt-a',
          idempotencyKey: buildCanonicalIdempotencyKey({
            organizationId: orgId,
            channel: CommunicationChannel.WHATSAPP,
            providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
            eventType: CommunicationEventType.MESSAGE_RECEIVED,
            nativeConversationId,
            providerEventId: 'evt-a',
          }),
        },
      }),
      service.projectNormalizedInput({
        ...baseInput,
        event: {
          eventType: CommunicationEventType.MESSAGE_RECEIVED,
          occurredAt: new Date('2026-08-21T10:00:01Z'),
          providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
          providerEventId: 'evt-b',
          idempotencyKey: buildCanonicalIdempotencyKey({
            organizationId: orgId,
            channel: CommunicationChannel.WHATSAPP,
            providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
            eventType: CommunicationEventType.MESSAGE_RECEIVED,
            nativeConversationId,
            providerEventId: 'evt-b',
          }),
        },
      }),
    ]);

    expect(first.eventCreated).toBe(true);
    expect(second.eventCreated).toBe(true);
    expect(first.conversationId).toBe(second.conversationId);

    const conversation = await prisma.communicationConversation.findUnique({
      where: { id: first.conversationId },
    });
    expect(conversation?.unreadCount).toBe(2);
  });

  it('does not double-increment unread on replay', async () => {
    const input = {
      envelope: {
        organizationId: orgId,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId,
      },
      event: {
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt: new Date('2026-08-21T10:00:00Z'),
        providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
        providerEventId: 'evt-replay',
        idempotencyKey: buildCanonicalIdempotencyKey({
          organizationId: orgId,
          channel: CommunicationChannel.WHATSAPP,
          providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
          eventType: CommunicationEventType.MESSAGE_RECEIVED,
          nativeConversationId,
          providerEventId: 'evt-replay',
        }),
      },
      projection: { unreadDelta: 1 },
    };

    const first = await service.projectNormalizedInput(input);
    const replay = await service.projectNormalizedInput(input);

    expect(first.eventCreated).toBe(true);
    expect(replay.eventCreated).toBe(false);

    const conversation = await prisma.communicationConversation.findUnique({
      where: { id: first.conversationId },
    });
    expect(conversation?.unreadCount).toBe(1);
  });
});
