import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import {
  CommunicationChannel,
  CommunicationEventType,
  PrismaClient,
  WhatsAppConversationStatus,
  WhatsAppMessageDeliveryStatus,
} from '@prisma/client';
import communicationProjectionConfig from '@config/communication-projection.config';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationConversationRepository } from '../../communication-conversation.repository';
import { CommunicationEventRepository } from '../../communication-event.repository';
import { CommunicationProjectionFeatureService } from '../../communication-projection-feature.service';
import { CommunicationProjectionService } from '../../communication-projection.service';
import { CommunicationTenantContextValidation } from '../../communication-tenant-context.validation';
import { MetaWhatsAppCommunicationAdapter } from './meta-whatsapp-communication.adapter';
import { WhatsAppCommunicationProjectionIntegration } from './whatsapp-communication-projection.integration';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('WhatsApp canonical projection postgres integration', () => {
  let prisma: PrismaClient;
  let integration: WhatsAppCommunicationProjectionIntegration;
  let orgId: string;
  let waConversationId: string;

  beforeAll(async () => {
    process.env.COMMUNICATION_CENTER_WHATSAPP_PROJECTION_ENABLED = 'true';
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [communicationProjectionConfig] })],
      providers: [
        PrismaService,
        CommunicationTenantContextValidation,
        CommunicationConversationRepository,
        CommunicationEventRepository,
        CommunicationProjectionService,
        CommunicationProjectionFeatureService,
        MetaWhatsAppCommunicationAdapter,
        WhatsAppCommunicationProjectionIntegration,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    integration = moduleRef.get(WhatsAppCommunicationProjectionIntegration);
  });

  beforeEach(async () => {
    const org = await prisma.organization.create({
      data: {
        companyName: `WA C3 PG ${Date.now()}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
    });
    orgId = org.id;

    const waConvo = await prisma.whatsAppConversation.create({
      data: {
        organizationId: orgId,
        contactPhone: '+491701111111',
        contactPhoneNormalized: `491701111${Date.now()}`,
        status: WhatsAppConversationStatus.OPEN,
      },
    });
    waConversationId = waConvo.id;
  });

  afterEach(async () => {
    await prisma.communicationEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.communicationConversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.whatsAppMessage.deleteMany({ where: { organizationId: orgId } });
    await prisma.whatsAppConversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  });

  afterAll(async () => {
    delete process.env.COMMUNICATION_CENTER_WHATSAPP_PROJECTION_ENABLED;
    await prisma.$disconnect();
  });

  it('projects inbound WhatsApp message once with unreadCount = 1 and replays idempotently', async () => {
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgId,
        conversationId: waConversationId,
        direction: 'incoming',
        senderType: 'customer',
        content: 'Hello canonical',
        messageType: 'text',
        providerMessageId: `wamid.pg.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    const waConvo = await prisma.whatsAppConversation.findUniqueOrThrow({
      where: { id: waConversationId },
    });

    const source = {
      conversation: waConvo,
      message: waMessage,
      webhookExternalEventId: `msg:${waMessage.providerMessageId}`,
      occurredAt: waMessage.createdAt,
    };

    await integration.projectInbound(source);
    await integration.projectInbound(source);

    const canonicalConversations = await prisma.communicationConversation.findMany({
      where: { organizationId: orgId, channel: CommunicationChannel.WHATSAPP },
    });
    expect(canonicalConversations).toHaveLength(1);
    expect(canonicalConversations[0]?.nativeConversationId).toBe(waConversationId);
    expect(canonicalConversations[0]?.unreadCount).toBe(1);

    const events = await prisma.communicationEvent.findMany({
      where: { organizationId: orgId, conversationId: canonicalConversations[0]!.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe(CommunicationEventType.MESSAGE_RECEIVED);
  });

  it('projects HUMAN_REQUIRED per native transition occurrence with replay convergence', async () => {
    const firstTransition = await prisma.whatsAppConversation.update({
      where: { id: waConversationId },
      data: { status: WhatsAppConversationStatus.PENDING_HUMAN },
    });

    const firstSource = {
      conversation: firstTransition,
      occurredAt: firstTransition.updatedAt,
      handoffReasonCode: 'ACCIDENT',
    };

    await integration.projectHumanRequired(firstSource);
    await integration.projectHumanRequired(firstSource);

    const canonical = await prisma.communicationConversation.findFirst({
      where: { organizationId: orgId, nativeConversationId: waConversationId },
    });
    expect(canonical?.status).toBe('HUMAN_REQUIRED');

    let hrEvents = await prisma.communicationEvent.findMany({
      where: {
        organizationId: orgId,
        conversationId: canonical!.id,
        eventType: CommunicationEventType.HUMAN_REQUIRED,
      },
    });
    expect(hrEvents).toHaveLength(1);

    await prisma.whatsAppConversation.update({
      where: { id: waConversationId },
      data: { status: WhatsAppConversationStatus.OPEN },
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const secondTransition = await prisma.whatsAppConversation.update({
      where: { id: waConversationId },
      data: { status: WhatsAppConversationStatus.PENDING_HUMAN },
    });

    await integration.projectHumanRequired({
      conversation: secondTransition,
      occurredAt: secondTransition.updatedAt,
      handoffReasonCode: 'PAYMENT',
    });

    hrEvents = await prisma.communicationEvent.findMany({
      where: {
        organizationId: orgId,
        conversationId: canonical!.id,
        eventType: CommunicationEventType.HUMAN_REQUIRED,
      },
      orderBy: { occurredAt: 'asc' },
    });
    expect(hrEvents).toHaveLength(2);
    expect(hrEvents[0]?.providerEventId).not.toBe(hrEvents[1]?.providerEventId);
  });

  it('projects delivered and read for same wamid without unread changes', async () => {
    const providerMessageId = `wamid.lifecycle.${Date.now()}`;
    const waConvo = await prisma.whatsAppConversation.findUniqueOrThrow({
      where: { id: waConversationId },
    });

    const inbound = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgId,
        conversationId: waConversationId,
        direction: 'incoming',
        senderType: 'customer',
        content: 'seed',
        providerMessageId: `wamid.seed.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });

    await integration.projectInbound({
      conversation: waConvo,
      message: inbound,
      webhookExternalEventId: `msg:${inbound.providerMessageId}`,
    });

    const canonicalAfterInbound = await prisma.communicationConversation.findFirst({
      where: { organizationId: orgId, nativeConversationId: waConversationId },
    });
    expect(canonicalAfterInbound?.unreadCount).toBe(1);

    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgId,
        conversationId: waConversationId,
        direction: 'outgoing',
        senderType: 'human',
        content: 'Outbound',
        messageType: 'text',
        providerMessageId,
        status: WhatsAppMessageDeliveryStatus.SENT,
      },
    });

    const delivered = await prisma.whatsAppMessage.update({
      where: { id: waMessage.id },
      data: { status: WhatsAppMessageDeliveryStatus.DELIVERED },
    });

    await integration.projectStatusUpdate({
      conversation: waConvo,
      message: delivered,
      status: 'DELIVERED',
      webhookExternalEventId: `status:${providerMessageId}:delivered:1`,
      occurredAt: new Date('2026-08-21T10:01:00Z'),
    });

    const read = await prisma.whatsAppMessage.update({
      where: { id: waMessage.id },
      data: { status: WhatsAppMessageDeliveryStatus.READ },
    });

    await integration.projectStatusUpdate({
      conversation: waConvo,
      message: read,
      status: 'READ',
      webhookExternalEventId: `status:${providerMessageId}:read:2`,
      occurredAt: new Date('2026-08-21T10:02:00Z'),
    });

    const canonical = await prisma.communicationConversation.findFirst({
      where: { organizationId: orgId, nativeConversationId: waConversationId },
    });
    expect(canonical?.unreadCount).toBe(1);

    const events = await prisma.communicationEvent.findMany({
      where: { organizationId: orgId, conversationId: canonical!.id },
      orderBy: { occurredAt: 'asc' },
    });
    const eventTypes = events.map((event) => event.eventType);
    expect(eventTypes).toContain(CommunicationEventType.MESSAGE_RECEIVED);
    expect(eventTypes).toContain(CommunicationEventType.MESSAGE_DELIVERED);
    expect(eventTypes).toContain(CommunicationEventType.MESSAGE_READ);
    expect(events).toHaveLength(3);
  });
});
