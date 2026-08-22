import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import {
  CommunicationChannel,
  CommunicationEventType,
  CommunicationMessageContentType,
  PrismaClient,
  SmsMessageDeliveryStatus,
  WhatsAppConversationStatus,
  WhatsAppMessageDeliveryStatus,
} from '@prisma/client';
import communicationProjectionConfig from '@config/communication-projection.config';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationConversationRepository } from '../communication-conversation.repository';
import { CommunicationEventRepository } from '../communication-event.repository';
import { CommunicationProjectionFeatureService } from '../communication-projection-feature.service';
import { CommunicationProjectionService } from '../communication-projection.service';
import { CommunicationTenantContextValidation } from '../communication-tenant-context.validation';
import { MetaWhatsAppCommunicationAdapter } from '../adapters/whatsapp/meta-whatsapp-communication.adapter';
import { WhatsAppCommunicationProjectionIntegration } from '../adapters/whatsapp/whatsapp-communication-projection.integration';
import { SentDmSmsCommunicationAdapter } from '../adapters/sms/sentdm-sms-communication.adapter';
import { SmsCommunicationProjectionIntegration } from '../adapters/sms/sms-communication-projection.integration';
import { CommunicationContentBackfillService } from './communication-content-backfill.service';
import { CommunicationContentRepository } from './communication-content.repository';
import { CommunicationContentService } from './communication-content.service';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationReadService } from '../read/communication-read.service';
import { CANONICAL_MESSAGE_TEXT_MAX_LENGTH } from './communication-content.constants';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('Communication canonical content postgres (C7.2)', () => {
  let prisma: PrismaClient;
  let waIntegration: WhatsAppCommunicationProjectionIntegration;
  let smsIntegration: SmsCommunicationProjectionIntegration;
  let contentService: CommunicationContentService;
  let readService: CommunicationReadService;
  let backfill: CommunicationContentBackfillService;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    process.env.COMMUNICATION_CENTER_WHATSAPP_PROJECTION_ENABLED = 'true';
    process.env.COMMUNICATION_CENTER_SMS_PROJECTION_ENABLED = 'true';
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
        CommunicationContentRepository,
        CommunicationContentService,
        CommunicationContentBackfillService,
        MetaWhatsAppCommunicationAdapter,
        WhatsAppCommunicationProjectionIntegration,
        SentDmSmsCommunicationAdapter,
        SmsCommunicationProjectionIntegration,
        CommunicationReadRepository,
        CommunicationReadService,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    waIntegration = moduleRef.get(WhatsAppCommunicationProjectionIntegration);
    smsIntegration = moduleRef.get(SmsCommunicationProjectionIntegration);
    contentService = moduleRef.get(CommunicationContentService);
    readService = moduleRef.get(CommunicationReadService);
    backfill = moduleRef.get(CommunicationContentBackfillService);
  });

  beforeEach(async () => {
    const ts = Date.now();
    orgA = (
      await prisma.organization.create({
        data: { companyName: `C72 A ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
      })
    ).id;
    orgB = (
      await prisma.organization.create({
        data: { companyName: `C72 B ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
      })
    ).id;
  });

  afterEach(async () => {
    for (const orgId of [orgA, orgB]) {
      await prisma.communicationMessageContent.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationEvent.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.whatsAppMessage.deleteMany({ where: { organizationId: orgId } });
      await prisma.whatsAppConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.smsMessage.deleteMany({ where: { organizationId: orgId } });
      await prisma.smsConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
  });

  afterAll(async () => {
    delete process.env.COMMUNICATION_CENTER_WHATSAPP_PROJECTION_ENABLED;
    delete process.env.COMMUNICATION_CENTER_SMS_PROJECTION_ENABLED;
    await prisma.$disconnect();
  });

  async function seedWaConversation(orgId: string) {
    return prisma.whatsAppConversation.create({
      data: {
        organizationId: orgId,
        contactPhone: '+491701234567',
        contactPhoneNormalized: `49170123${Date.now()}`,
        status: WhatsAppConversationStatus.OPEN,
      },
    });
  }

  async function seedSmsConversation(orgId: string) {
    return prisma.smsConversation.create({
      data: {
        organizationId: orgId,
        contactPhone: '+491709876543',
        contactPhoneNormalized: `49170987${Date.now()}`,
      },
    });
  }

  it('A — WhatsApp inbound text creates one canonical content linked to MESSAGE_RECEIVED', async () => {
    const waConvo = await seedWaConversation(orgA);
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'Inbound hello',
        messageType: 'text',
        providerMessageId: `wamid.in.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    await waIntegration.projectInbound({
      conversation: waConvo,
      message: waMessage,
      webhookExternalEventId: `msg:${waMessage.providerMessageId}`,
    });

    const contents = await prisma.communicationMessageContent.findMany({ where: { organizationId: orgA } });
    expect(contents).toHaveLength(1);
    expect(contents[0]?.text).toBe('Inbound hello');
    expect(contents[0]?.contentType).toBe(CommunicationMessageContentType.TEXT);

    const event = await prisma.communicationEvent.findFirst({
      where: { id: contents[0]!.communicationEventId },
    });
    expect(event?.eventType).toBe(CommunicationEventType.MESSAGE_RECEIVED);
  });

  it('B — WhatsApp outbound text creates content for MESSAGE_SENT', async () => {
    const waConvo = await seedWaConversation(orgA);
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'outgoing',
        senderType: 'user',
        content: 'Outbound reply',
        messageType: 'text',
        providerMessageId: `wamid.out.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.SENT,
      },
    });
    await waIntegration.projectOutboundAccepted({ conversation: waConvo, message: waMessage });

    const contents = await prisma.communicationMessageContent.findMany({ where: { organizationId: orgA } });
    expect(contents).toHaveLength(1);
    expect(contents[0]?.text).toBe('Outbound reply');
  });

  it('C/D — SMS inbound and outbound text create canonical content', async () => {
    const smsConvo = await seedSmsConversation(orgA);
    const inbound = await prisma.smsMessage.create({
      data: {
        organizationId: orgA,
        conversationId: smsConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'SMS inbound',
        providerMessageId: `sms.in.${Date.now()}`,
        businessOperationId: `biz-in-${Date.now()}`,
        status: SmsMessageDeliveryStatus.DELIVERED,
      },
    });
    await smsIntegration.projectInbound({
      conversation: smsConvo,
      message: inbound,
      webhookExternalEventId: `evt:${inbound.providerMessageId}`,
    });

    const outbound = await prisma.smsMessage.create({
      data: {
        organizationId: orgA,
        conversationId: smsConvo.id,
        direction: 'outgoing',
        senderType: 'user',
        content: 'SMS outbound',
        providerMessageId: `sms.out.${Date.now()}`,
        businessOperationId: `biz-out-${Date.now()}`,
        status: SmsMessageDeliveryStatus.QUEUED,
      },
    });
    await smsIntegration.projectOutboundAccepted({ conversation: smsConvo, message: outbound });

    const contents = await prisma.communicationMessageContent.findMany({
      where: { organizationId: orgA, channel: CommunicationChannel.SMS },
      orderBy: { occurredAt: 'asc' },
    });
    expect(contents).toHaveLength(2);
    expect(contents.map((c) => c.text)).toEqual(['SMS inbound', 'SMS outbound']);
  });

  it('E/F — delivery and failed webhooks do not create duplicate content', async () => {
    const waConvo = await seedWaConversation(orgA);
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'Lifecycle',
        messageType: 'text',
        providerMessageId: `wamid.lc.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    await waIntegration.projectInbound({
      conversation: waConvo,
      message: waMessage,
      webhookExternalEventId: `msg:${waMessage.providerMessageId}`,
    });
    await waIntegration.projectStatusUpdate({
      conversation: waConvo,
      message: waMessage,
      status: 'DELIVERED',
      webhookExternalEventId: `del:${waMessage.providerMessageId}`,
      occurredAt: new Date(),
    });
    await waIntegration.projectStatusUpdate({
      conversation: waConvo,
      message: { ...waMessage, status: WhatsAppMessageDeliveryStatus.FAILED },
      status: 'FAILED',
      webhookExternalEventId: `fail:${waMessage.providerMessageId}`,
      occurredAt: new Date(),
    });

    const contents = await prisma.communicationMessageContent.findMany({ where: { organizationId: orgA } });
    expect(contents).toHaveLength(1);
  });

  it('G/H — projection replay and concurrent identity converge to one content row', async () => {
    const waConvo = await seedWaConversation(orgA);
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'Idempotent',
        messageType: 'text',
        providerMessageId: `wamid.idem.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    const source = {
      conversation: waConvo,
      message: waMessage,
      webhookExternalEventId: `msg:${waMessage.providerMessageId}`,
    };
    await Promise.all([
      waIntegration.projectInbound(source),
      waIntegration.projectInbound(source),
      waIntegration.projectInbound(source),
    ]);

    const contents = await prisma.communicationMessageContent.findMany({ where: { organizationId: orgA } });
    expect(contents).toHaveLength(1);
  });

  it('J — cross-org content is not returned via read API', async () => {
    const waConvoA = await seedWaConversation(orgA);
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvoA.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'Org A secret',
        messageType: 'text',
        providerMessageId: `wamid.xorg.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    await waIntegration.projectInbound({
      conversation: waConvoA,
      message: waMessage,
      webhookExternalEventId: `msg:${waMessage.providerMessageId}`,
    });

    const canonicalA = await prisma.communicationConversation.findFirst({
      where: { organizationId: orgA },
    });
    await expect(
      readService.listConversationEvents(orgB, canonicalA!.id, {}),
    ).rejects.toThrow();
  });

  it('K/L — timeline returns canonical content without provider payload keys', async () => {
    const waConvo = await seedWaConversation(orgA);
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'Timeline body',
        messageType: 'text',
        providerMessageId: `wamid.tl.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    await waIntegration.projectInbound({
      conversation: waConvo,
      message: waMessage,
      webhookExternalEventId: `msg:${waMessage.providerMessageId}`,
    });

    const canonical = await prisma.communicationConversation.findFirst({ where: { organizationId: orgA } });
    const timeline = await readService.listConversationEvents(orgA, canonical!.id, {});
    const messageEvent = timeline.items.find((e) => e.eventType === 'MESSAGE_RECEIVED');
    expect(messageEvent?.content?.text).toBe('Timeline body');
    expect(JSON.stringify(messageEvent)).not.toMatch(/providerMessageId|nativeMessageId|rawPayload/i);
  });

  it('P/Q — unsupported WhatsApp type and image message avoid URL leakage', async () => {
    const waConvo = await seedWaConversation(orgA);
    const imageMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: '',
        messageType: 'image',
        providerMessageId: `wamid.img.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    await waIntegration.projectInbound({
      conversation: waConvo,
      message: imageMessage,
      webhookExternalEventId: `msg:${imageMessage.providerMessageId}`,
    });

    const content = await prisma.communicationMessageContent.findFirst({ where: { organizationId: orgA } });
    expect(content?.contentType).toBe(CommunicationMessageContentType.IMAGE);
    expect(content?.hasAttachments).toBe(true);
    expect(content?.text ?? '').not.toMatch(/https?:\/\//i);
  });

  it('R/S — backfill dry-run does not mutate; apply is idempotent', async () => {
    const waConvo = await seedWaConversation(orgA);
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'Backfill me',
        messageType: 'text',
        providerMessageId: `wamid.bf.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    await waIntegration.projectInbound({
      conversation: waConvo,
      message: waMessage,
      webhookExternalEventId: `msg:${waMessage.providerMessageId}`,
    });

    const dryRun = await backfill.backfillOrganization({ organizationId: orgA, dryRun: true });
    expect(dryRun.alreadyProjected).toBeGreaterThanOrEqual(1);
    expect(dryRun.wouldCreate).toBe(0);

    await prisma.communicationMessageContent.deleteMany({ where: { organizationId: orgA } });
    const apply1 = await backfill.backfillOrganization({ organizationId: orgA, dryRun: false });
    expect(apply1.applied).toBeGreaterThanOrEqual(1);
    const apply2 = await backfill.backfillOrganization({ organizationId: orgA, dryRun: false });
    expect(apply2.alreadyProjected).toBeGreaterThanOrEqual(1);
    expect(apply2.applied).toBe(0);
  });

  it('V/W — preview updates for newer message and ignores out-of-order older content', async () => {
    const waConvo = await seedWaConversation(orgA);
    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: waConvo.id,
        lastActivityAt: new Date(),
      },
    });
    const newerEvent = await prisma.communicationEvent.create({
      data: {
        organizationId: orgA,
        conversationId: canonical.id,
        channel: CommunicationChannel.WHATSAPP,
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt: new Date('2026-08-22T12:00:00Z'),
        providerMessageId: 'wamid.new',
      },
    });
    const olderEvent = await prisma.communicationEvent.create({
      data: {
        organizationId: orgA,
        conversationId: canonical.id,
        channel: CommunicationChannel.WHATSAPP,
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt: new Date('2026-08-22T10:00:00Z'),
        providerMessageId: 'wamid.old',
      },
    });

    await contentService.projectWhatsAppMessage({
      organizationId: orgA,
      conversationId: canonical.id,
      communicationEventId: newerEvent.id,
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      message: {
        id: 'native-new',
        content: 'Newer preview',
        messageType: 'text',
        direction: 'incoming',
      } as never,
      occurredAt: newerEvent.occurredAt,
    });

    await contentService.projectWhatsAppMessage({
      organizationId: orgA,
      conversationId: canonical.id,
      communicationEventId: olderEvent.id,
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      message: {
        id: 'native-old',
        content: 'Older should not win',
        messageType: 'text',
        direction: 'incoming',
      } as never,
      occurredAt: olderEvent.occurredAt,
    });

    const updated = await prisma.communicationConversation.findUnique({ where: { id: canonical.id } });
    expect(updated?.lastMessagePreview).toBe('Newer preview');
  });

  it('truncates canonical text beyond limit with truncated flag', async () => {
    const waConvo = await seedWaConversation(orgA);
    const longText = 'x'.repeat(CANONICAL_MESSAGE_TEXT_MAX_LENGTH + 50);
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: longText,
        messageType: 'text',
        providerMessageId: `wamid.long.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    await waIntegration.projectInbound({
      conversation: waConvo,
      message: waMessage,
      webhookExternalEventId: `msg:${waMessage.providerMessageId}`,
    });

    const content = await prisma.communicationMessageContent.findFirst({ where: { organizationId: orgA } });
    expect(content?.truncated).toBe(true);
    expect(content?.text).toHaveLength(CANONICAL_MESSAGE_TEXT_MAX_LENGTH);
  });
});
