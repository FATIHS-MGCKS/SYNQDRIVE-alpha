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
import { CommunicationNormalizationErrorCode } from './normalization/communication-normalization.errors';
import type { NormalizedCommunicationInput } from './normalization/communication-normalization.types';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

function buildEventInput(
  orgId: string,
  nativeConversationId: string,
  providerEventId: string,
  occurredAt: Date,
  unreadDelta?: number,
): NormalizedCommunicationInput {
  const eventType = CommunicationEventType.MESSAGE_RECEIVED;
  return {
    envelope: {
      organizationId: orgId,
      channel: CommunicationChannel.WHATSAPP,
      nativeConversationId,
    },
    event: {
      eventType,
      occurredAt,
      providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
      providerEventId,
      idempotencyKey: buildCanonicalIdempotencyKey({
        organizationId: orgId,
        channel: CommunicationChannel.WHATSAPP,
        providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
        eventType,
        nativeConversationId,
        providerEventId,
      }),
    },
    projection: unreadDelta !== undefined ? { unreadDelta } : undefined,
  };
}

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

  it('A: concurrent identical events create one row and increment unread once', async () => {
    const input = buildEventInput(
      orgId,
      nativeConversationId,
      'evt-same',
      new Date('2026-08-21T10:00:00Z'),
      1,
    );

    const [first, second] = await Promise.all([
      service.projectNormalizedInput(input),
      service.projectNormalizedInput(input),
    ]);

    const createdCount = [first.eventCreated, second.eventCreated].filter(Boolean).length;
    expect(createdCount).toBe(1);
    expect(first.eventId).toBe(second.eventId);
    expect(first.conversationId).toBe(second.conversationId);

    const events = await prisma.communicationEvent.findMany({
      where: { organizationId: orgId, conversationId: first.conversationId },
    });
    expect(events).toHaveLength(1);

    const conversation = await prisma.communicationConversation.findUnique({
      where: { id: first.conversationId },
    });
    expect(conversation?.unreadCount).toBe(1);
  });

  it('B: concurrent first events on same native conversation create one envelope and two events', async () => {
    const [first, second] = await Promise.all([
      service.projectNormalizedInput(
        buildEventInput(orgId, nativeConversationId, 'evt-first-a', new Date('2026-08-21T10:00:00Z')),
      ),
      service.projectNormalizedInput(
        buildEventInput(orgId, nativeConversationId, 'evt-first-b', new Date('2026-08-21T10:00:01Z')),
      ),
    ]);

    expect(first.conversationId).toBe(second.conversationId);
    expect(first.eventId).not.toBe(second.eventId);

    const conversations = await prisma.communicationConversation.findMany({
      where: {
        organizationId: orgId,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId,
      },
    });
    expect(conversations).toHaveLength(1);

    const events = await prisma.communicationEvent.findMany({
      where: { organizationId: orgId, conversationId: first.conversationId },
    });
    expect(events).toHaveLength(2);
  });

  it('C: concurrent first inbound messages create one envelope with unreadCount = 2', async () => {
    const [first, second] = await Promise.all([
      service.projectNormalizedInput(
        buildEventInput(orgId, nativeConversationId, 'evt-msg-a', new Date('2026-08-21T10:00:00Z'), 1),
      ),
      service.projectNormalizedInput(
        buildEventInput(orgId, nativeConversationId, 'evt-msg-b', new Date('2026-08-21T10:00:01Z'), 1),
      ),
    ]);

    expect(first.conversationId).toBe(second.conversationId);

    const conversations = await prisma.communicationConversation.findMany({
      where: { organizationId: orgId, nativeConversationId },
    });
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.unreadCount).toBe(2);
  });

  it('D: replay collision increments unread exactly once', async () => {
    const input = buildEventInput(
      orgId,
      nativeConversationId,
      'evt-replay',
      new Date('2026-08-21T10:00:00Z'),
      1,
    );

    const first = await service.projectNormalizedInput(input);
    const [replayA, replayB] = await Promise.all([
      service.projectNormalizedInput(input),
      service.projectNormalizedInput(input),
    ]);

    expect(first.eventCreated).toBe(true);
    expect(replayA.eventCreated).toBe(false);
    expect(replayB.eventCreated).toBe(false);

    const events = await prisma.communicationEvent.findMany({
      where: { organizationId: orgId, conversationId: first.conversationId },
    });
    expect(events).toHaveLength(1);

    const conversation = await prisma.communicationConversation.findUnique({
      where: { id: first.conversationId },
    });
    expect(conversation?.unreadCount).toBe(1);
  });

  it('E: concurrent lastActivityAt keeps GREATEST (12:00 over 11:00)', async () => {
    const base = new Date('2026-08-21T10:00:00Z');
    const later = new Date('2026-08-21T12:00:00Z');
    const earlier = new Date('2026-08-21T11:00:00Z');

    await service.projectNormalizedInput(
      buildEventInput(orgId, nativeConversationId, 'evt-bootstrap', base),
    );

    await Promise.all([
      service.projectNormalizedInput(
        buildEventInput(orgId, nativeConversationId, 'evt-later', later),
      ),
      service.projectNormalizedInput(
        buildEventInput(orgId, nativeConversationId, 'evt-earlier', earlier),
      ),
    ]);

    const conversation = await prisma.communicationConversation.findUnique({
      where: {
        communication_conversations_org_channel_native: {
          organizationId: orgId,
          channel: CommunicationChannel.WHATSAPP,
          nativeConversationId,
        },
      },
    });
    expect(conversation?.lastActivityAt.toISOString()).toBe(later.toISOString());

    await service.projectNormalizedInput(
      buildEventInput(orgId, nativeConversationId, 'evt-older-seq', earlier),
    );
    const afterOlder = await prisma.communicationConversation.findUnique({
      where: { id: conversation!.id },
    });
    expect(afterOlder?.lastActivityAt.toISOString()).toBe(later.toISOString());
  });

  it('F: projection failure rolls back envelope, event, and unread mutations', async () => {
    const foreignOrg = await prisma.organization.create({
      data: {
        companyName: `Comm PG Foreign ${Date.now()}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
    });
    const foreignCustomer = await prisma.customer.create({
      data: {
        organizationId: foreignOrg.id,
        firstName: 'Foreign',
        lastName: 'Customer',
        email: `foreign-${Date.now()}@example.com`,
      },
    });

    await expect(
      service.projectNormalizedInput({
        envelope: {
          organizationId: orgId,
          channel: CommunicationChannel.WHATSAPP,
          nativeConversationId,
          initialContext: { customerId: foreignCustomer.id },
        },
        event: buildEventInput(orgId, nativeConversationId, 'evt-fail', new Date()).event,
        projection: { unreadDelta: 1 },
      }),
    ).rejects.toMatchObject({
      code: CommunicationNormalizationErrorCode.TENANT_CONTEXT_REJECTED,
    });

    const conversations = await prisma.communicationConversation.findMany({
      where: { organizationId: orgId },
    });
    const events = await prisma.communicationEvent.findMany({ where: { organizationId: orgId } });

    expect(conversations).toHaveLength(0);
    expect(events).toHaveLength(0);

    await prisma.customer.delete({ where: { id: foreignCustomer.id } });
    await prisma.organization.delete({ where: { id: foreignOrg.id } });
  });
});
