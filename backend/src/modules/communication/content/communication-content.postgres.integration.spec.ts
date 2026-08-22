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
import { buildCanonicalContentIdempotencyKey } from './communication-content-idempotency';
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
  let contentRepository: CommunicationContentRepository;
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
    contentRepository = moduleRef.get(CommunicationContentRepository);
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
    for (const orgId of [orgA, orgB].filter(Boolean)) {
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
        content: 'https://provider.example/signed?token=secret',
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
    expect(content?.text).toBeNull();
    expect(content?.text ?? '').not.toMatch(/https?:\/\//i);

    const canonical = await prisma.communicationConversation.findFirst({ where: { organizationId: orgA } });
    expect(canonical?.lastMessagePreview).toBe('cc:IMAGE');
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
    expect([...content!.text!].length).toBe(CANONICAL_MESSAGE_TEXT_MAX_LENGTH);
  });

  it('crash convergence — replay repairs stale conversation preview', async () => {
    const waConvo = await seedWaConversation(orgA);
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'Crash repair body',
        messageType: 'text',
        providerMessageId: `wamid.crash.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    await waIntegration.projectInbound({
      conversation: waConvo,
      message: waMessage,
      webhookExternalEventId: `msg:${waMessage.providerMessageId}`,
    });

    const event = await prisma.communicationEvent.findFirst({
      where: { organizationId: orgA, providerMessageId: waMessage.providerMessageId },
    });
    const existing = await prisma.communicationMessageContent.findFirst({ where: { organizationId: orgA } });
    expect(existing).toBeTruthy();

    const canonical = await prisma.communicationConversation.findFirst({ where: { organizationId: orgA } });
    expect(canonical).toBeTruthy();

    await prisma.communicationConversation.update({
      where: { id: canonical!.id },
      data: { lastMessagePreview: null, lastContentAt: null, lastContentId: null },
    });

    await contentService.projectWhatsAppMessage({
      organizationId: orgA,
      conversationId: canonical!.id,
      communicationEventId: event!.id,
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      message: waMessage,
      occurredAt: event!.occurredAt,
    });

    const contents = await prisma.communicationMessageContent.findMany({ where: { organizationId: orgA } });
    expect(contents).toHaveLength(1);
    const updated = await prisma.communicationConversation.findUnique({ where: { id: canonical!.id } });
    expect(updated?.lastMessagePreview).toBe('Crash repair body');
    expect(updated?.lastContentAt).toEqual(event!.occurredAt);
    expect(updated?.lastContentId).toBe(existing!.id);
  });

  it('rejects cross-org event attachment', async () => {
    const waConvoB = await seedWaConversation(orgB);
    const canonicalB = await prisma.communicationConversation.create({
      data: {
        organizationId: orgB,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: waConvoB.id,
        lastActivityAt: new Date(),
      },
    });
    const eventB = await prisma.communicationEvent.create({
      data: {
        organizationId: orgB,
        conversationId: canonicalB.id,
        channel: CommunicationChannel.WHATSAPP,
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt: new Date(),
        providerMessageId: `wamid.xorg.${Date.now()}`,
      },
    });

    const result = await contentService.projectWhatsAppMessage({
      organizationId: orgA,
      conversationId: eventB.conversationId,
      communicationEventId: eventB.id,
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      message: {
        id: 'native-xorg',
        content: 'Should not attach',
        messageType: 'text',
        direction: 'incoming',
      } as never,
      occurredAt: eventB.occurredAt,
    });

    expect(result.skipped).toBe(true);
    expect(await prisma.communicationMessageContent.count({ where: { organizationId: orgA } })).toBe(0);
  });

  it('rejects wrong-conversation event attachment', async () => {
    const waConvo = await seedWaConversation(orgA);
    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: waConvo.id,
        lastActivityAt: new Date(),
      },
    });
    const otherCanonical = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: `other-${Date.now()}`,
        lastActivityAt: new Date(),
      },
    });
    const event = await prisma.communicationEvent.create({
      data: {
        organizationId: orgA,
        conversationId: canonical.id,
        channel: CommunicationChannel.WHATSAPP,
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt: new Date(),
        providerMessageId: `wamid.wrongconvo.${Date.now()}`,
      },
    });

    const result = await contentService.projectWhatsAppMessage({
      organizationId: orgA,
      conversationId: otherCanonical.id,
      communicationEventId: event.id,
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      message: {
        id: 'native-wrong-convo',
        content: 'Wrong convo',
        messageType: 'text',
        direction: 'incoming',
      } as never,
      occurredAt: event.occurredAt,
    });

    expect(result.skipped).toBe(true);
  });

  it('rejects delivery-event content projection', async () => {
    const waConvo = await seedWaConversation(orgA);
    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: waConvo.id,
        lastActivityAt: new Date(),
      },
    });
    const deliveryEvent = await prisma.communicationEvent.create({
      data: {
        organizationId: orgA,
        conversationId: canonical.id,
        channel: CommunicationChannel.WHATSAPP,
        eventType: CommunicationEventType.MESSAGE_DELIVERED,
        occurredAt: new Date(),
        providerMessageId: `wamid.del.${Date.now()}`,
      },
    });

    const result = await contentService.projectWhatsAppMessage({
      organizationId: orgA,
      conversationId: canonical!.id,
      communicationEventId: deliveryEvent.id,
      eventType: CommunicationEventType.MESSAGE_SENT,
      message: {
        id: 'native-del',
        content: 'Fake sent',
        messageType: 'text',
        direction: 'outgoing',
      } as never,
      occurredAt: deliveryEvent.occurredAt,
    });

    expect(result.skipped).toBe(true);
    expect(
      await prisma.communicationMessageContent.count({
        where: { communicationEventId: deliveryEvent.id },
      }),
    ).toBe(0);
    void waConvo;
  });

  it('idempotency conflict rejects mismatched event identity', async () => {
    const waConvo = await seedWaConversation(orgA);
    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: waConvo.id,
        lastActivityAt: new Date(),
      },
    });
    const occurredAt = new Date();
    const event1 = await prisma.communicationEvent.create({
      data: {
        organizationId: orgA,
        conversationId: canonical.id,
        channel: CommunicationChannel.WHATSAPP,
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt,
        providerMessageId: `wamid.e1.${Date.now()}`,
      },
    });
    const event2 = await prisma.communicationEvent.create({
      data: {
        organizationId: orgA,
        conversationId: canonical.id,
        channel: CommunicationChannel.WHATSAPP,
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt,
        providerMessageId: `wamid.e2.${Date.now()}`,
      },
    });

    const nativeId = 'shared-native-id';
    await contentRepository.projectMessageContentIdempotently({
      organizationId: orgA,
      conversationId: canonical.id,
      communicationEventId: event1.id,
      channel: CommunicationChannel.WHATSAPP,
      direction: 'INBOUND',
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      contentType: CommunicationMessageContentType.TEXT,
      text: 'First',
      nativeMessageId: nativeId,
      occurredAt,
    });

    const conflict = await contentService.projectWhatsAppMessage({
      organizationId: orgA,
      conversationId: canonical.id,
      communicationEventId: event2.id,
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      message: {
        id: nativeId,
        content: 'Conflict',
        messageType: 'text',
        direction: 'incoming',
      } as never,
      occurredAt,
    });

    expect(conflict.skipped).toBe(true);
    expect(await prisma.communicationMessageContent.count({ where: { organizationId: orgA } })).toBe(1);
  });

  it('concurrent create converges to one row without failure', async () => {
    const waConvo = await seedWaConversation(orgA);
    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: waConvo.id,
        lastActivityAt: new Date(),
      },
    });
    const occurredAt = new Date();
    const event = await prisma.communicationEvent.create({
      data: {
        organizationId: orgA,
        conversationId: canonical.id,
        channel: CommunicationChannel.WHATSAPP,
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt,
        providerMessageId: `wamid.concurrent.${Date.now()}`,
      },
    });
    const message = {
      id: `concurrent-native-${Date.now()}`,
      content: 'Concurrent',
      messageType: 'text',
      direction: 'incoming',
    };

    const results = await Promise.all([
      contentService.projectWhatsAppMessage({
        organizationId: orgA,
        conversationId: canonical.id,
        communicationEventId: event.id,
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        message: message as never,
        occurredAt,
      }),
      contentService.projectWhatsAppMessage({
        organizationId: orgA,
        conversationId: canonical.id,
        communicationEventId: event.id,
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        message: message as never,
        occurredAt,
      }),
    ]);

    expect(results.some((r) => r.contentId)).toBe(true);
    expect(await prisma.communicationMessageContent.count({ where: { organizationId: orgA } })).toBe(1);
  });

  it('same-timestamp preview tiebreaker is deterministic regardless of order', async () => {
    const waConvo = await seedWaConversation(orgA);
    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: waConvo.id,
        lastActivityAt: new Date(),
      },
    });
    const occurredAt = new Date('2026-08-22T15:00:00Z');
    const contentIdLow = '00000000-0000-4000-8000-000000000001';
    const contentIdHigh = '00000000-0000-4000-8000-000000000099';

    const bump = async (contentId: string, preview: string) => {
      await contentRepository.bumpConversationPreview({
        organizationId: orgA,
        conversationId: canonical.id,
        contentId,
        occurredAt,
        preview,
      });
    };

    await bump(contentIdLow, 'Low id preview');
    await bump(contentIdHigh, 'High id preview');
    let state = await prisma.communicationConversation.findUnique({ where: { id: canonical.id } });
    expect(state?.lastContentId).toBe(contentIdHigh);
    expect(state?.lastMessagePreview).toBe('High id preview');

    await prisma.communicationConversation.update({
      where: { id: canonical.id },
      data: { lastContentAt: null, lastContentId: null, lastMessagePreview: null },
    });

    await bump(contentIdHigh, 'High id preview');
    await bump(contentIdLow, 'Low id preview');
    state = await prisma.communicationConversation.findUnique({ where: { id: canonical.id } });
    expect(state?.lastContentId).toBe(contentIdHigh);
    expect(state?.lastMessagePreview).toBe('High id preview');
  });

  it('null-preview content still advances lastContentAt and lastContentId', async () => {
    const waConvo = await seedWaConversation(orgA);
    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: waConvo.id,
        lastActivityAt: new Date(),
      },
    });
    const occurredAt = new Date();
    const event = await prisma.communicationEvent.create({
      data: {
        organizationId: orgA,
        conversationId: canonical.id,
        channel: CommunicationChannel.WHATSAPP,
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt,
        providerMessageId: `wamid.empty.${Date.now()}`,
      },
    });

    await contentRepository.projectMessageContentIdempotently({
      organizationId: orgA,
      conversationId: canonical.id,
      communicationEventId: event.id,
      channel: CommunicationChannel.WHATSAPP,
      direction: 'INBOUND',
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      contentType: CommunicationMessageContentType.TEXT,
      text: '',
      nativeMessageId: `empty-text-${Date.now()}`,
      occurredAt,
    });

    const updated = await prisma.communicationConversation.findUnique({ where: { id: canonical.id } });
    expect(updated?.lastContentAt).toEqual(occurredAt);
    expect(updated?.lastContentId).toBeTruthy();
  });

  it('I — content failure isolation preserves native and canonical event (WhatsApp)', async () => {
    const waConvo = await seedWaConversation(orgA);
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'Isolation test',
        messageType: 'text',
        providerMessageId: `wamid.iso.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });

    const spy = jest
      .spyOn(contentRepository, 'projectMessageContentIdempotently')
      .mockRejectedValueOnce(new Error('intentional content failure'));

    await expect(
      waIntegration.projectInbound({
        conversation: waConvo,
        message: waMessage,
        webhookExternalEventId: `msg:${waMessage.providerMessageId}`,
      }),
    ).resolves.not.toThrow();

    spy.mockRestore();

    expect(await prisma.whatsAppMessage.count({ where: { id: waMessage.id } })).toBe(1);
    expect(
      await prisma.communicationEvent.count({
        where: { organizationId: orgA, providerMessageId: waMessage.providerMessageId },
      }),
    ).toBe(1);
    expect(await prisma.communicationMessageContent.count({ where: { organizationId: orgA } })).toBe(0);
  });

  it('I — content failure isolation preserves native and canonical event (SMS outbound)', async () => {
    const smsConvo = await seedSmsConversation(orgA);
    const outbound = await prisma.smsMessage.create({
      data: {
        organizationId: orgA,
        conversationId: smsConvo.id,
        direction: 'outgoing',
        senderType: 'user',
        content: 'SMS isolation',
        providerMessageId: `sms.iso.${Date.now()}`,
        businessOperationId: `biz-iso-${Date.now()}`,
        status: SmsMessageDeliveryStatus.QUEUED,
      },
    });

    const spy = jest
      .spyOn(contentRepository, 'projectMessageContentIdempotently')
      .mockRejectedValueOnce(new Error('intentional content failure'));

    await expect(
      smsIntegration.projectOutboundAccepted({ conversation: smsConvo, message: outbound }),
    ).resolves.not.toThrow();

    spy.mockRestore();

    expect(await prisma.smsMessage.count({ where: { id: outbound.id } })).toBe(1);
    expect(
      await prisma.communicationEvent.count({
        where: { organizationId: orgA, eventType: CommunicationEventType.MESSAGE_SENT },
      }),
    ).toBe(1);
    expect(await prisma.communicationMessageContent.count({ where: { organizationId: orgA } })).toBe(0);
  });

  it('M — timeline list uses bounded query count for 50 events with content', async () => {
    const waConvo = await seedWaConversation(orgA);
    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: waConvo.id,
        lastActivityAt: new Date(),
      },
    });
    const base = Date.now();

    for (let i = 0; i < 50; i += 1) {
      const event = await prisma.communicationEvent.create({
        data: {
          organizationId: orgA,
          conversationId: canonical.id,
          channel: CommunicationChannel.WHATSAPP,
          eventType: CommunicationEventType.MESSAGE_RECEIVED,
          occurredAt: new Date(base - i * 1000),
          providerMessageId: `wamid.bulk.${i}.${Date.now()}`,
        },
      });
      await prisma.communicationMessageContent.create({
        data: {
          organizationId: orgA,
          conversationId: canonical.id,
          communicationEventId: event.id,
          channel: CommunicationChannel.WHATSAPP,
          direction: 'INBOUND',
          nativeMessageId: `native-bulk-${i}`,
          contentType: CommunicationMessageContentType.TEXT,
          text: `Bulk ${i}`,
          occurredAt: event.occurredAt,
          idempotencyKey: buildCanonicalContentIdempotencyKey({
            organizationId: orgA,
            channel: CommunicationChannel.WHATSAPP,
            nativeMessageId: `native-bulk-${i}`,
          }),
        },
      });
    }

    const queryLog: string[] = [];
    const loggingPrisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
      log: [{ emit: 'event', level: 'query' }],
    });
    loggingPrisma.$on('query', (event) => {
      queryLog.push(event.query);
    });
    await loggingPrisma.$connect();

    const loggingRepo = new CommunicationReadRepository(loggingPrisma as unknown as PrismaService);
    const loggingService = new CommunicationReadService(loggingRepo);
    await loggingService.listConversationEvents(orgA, canonical!.id, { limit: 50 });

    const eventQueries = queryLog.filter((q) => q.includes('communication_events'));
    expect(eventQueries.length).toBe(1);
    expect(queryLog.length).toBeLessThanOrEqual(8);
    await loggingPrisma.$disconnect();
    void waConvo;
  });

  it('Z — canonical timeline read survives native message removal', async () => {
    const waConvo = await seedWaConversation(orgA);
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'Canonical only body',
        messageType: 'text',
        providerMessageId: `wamid.canon.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    await waIntegration.projectInbound({
      conversation: waConvo,
      message: waMessage,
      webhookExternalEventId: `msg:${waMessage.providerMessageId}`,
    });

    await prisma.whatsAppMessage.delete({ where: { id: waMessage.id } });

    const canonical = await prisma.communicationConversation.findFirst({ where: { organizationId: orgA } });
    const timeline = await readService.listConversationEvents(orgA, canonical!.id, {});
    const messageEvent = timeline.items.find((e) => e.eventType === 'MESSAGE_RECEIVED');
    expect(messageEvent?.content?.text).toBe('Canonical only body');
  });

  it('U — organization delete cascades content without orphans', async () => {
    const waConvo = await seedWaConversation(orgA);
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'Cascade test',
        messageType: 'text',
        providerMessageId: `wamid.cascade.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    await waIntegration.projectInbound({
      conversation: waConvo,
      message: waMessage,
      webhookExternalEventId: `msg:${waMessage.providerMessageId}`,
    });

    expect(await prisma.communicationMessageContent.count({ where: { organizationId: orgA } })).toBe(1);

    await prisma.organization.delete({ where: { id: orgA } });
    orgA = '';

    expect(await prisma.communicationMessageContent.count()).toBe(0);
  });

  it('X — delivery lifecycle does not change preview', async () => {
    const waConvo = await seedWaConversation(orgA);
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'Preview stable',
        messageType: 'text',
        providerMessageId: `wamid.prev.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    await waIntegration.projectInbound({
      conversation: waConvo,
      message: waMessage,
      webhookExternalEventId: `msg:${waMessage.providerMessageId}`,
    });

    const before = await prisma.communicationConversation.findFirst({ where: { organizationId: orgA } });
    await waIntegration.projectStatusUpdate({
      conversation: waConvo,
      message: waMessage,
      status: 'DELIVERED',
      webhookExternalEventId: `del:${waMessage.providerMessageId}`,
      occurredAt: new Date(),
    });
    const after = await prisma.communicationConversation.findFirst({ where: { organizationId: orgA } });
    expect(after?.lastMessagePreview).toBe(before?.lastMessagePreview);
    expect(after?.lastContentId).toBe(before?.lastContentId);
  });

  it('T — backfill without deterministic match stays unresolved', async () => {
    const smsConvo = await seedSmsConversation(orgA);
    await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.SMS,
        nativeConversationId: smsConvo.id,
        lastActivityAt: new Date(),
      },
    });
    await prisma.smsMessage.create({
      data: {
        organizationId: orgA,
        conversationId: smsConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'No provider id',
        providerMessageId: null,
        businessOperationId: `biz-unresolved-${Date.now()}`,
        status: SmsMessageDeliveryStatus.DELIVERED,
      },
    });

    const result = await backfill.backfillOrganization({
      organizationId: orgA,
      channel: 'SMS',
      dryRun: true,
    });
    expect(result.unresolved).toBeGreaterThanOrEqual(1);
    expect(result.wouldCreate).toBe(0);
  });

  it('backfill matches WhatsApp inbound via providerMessageId', async () => {
    const waConvo = await seedWaConversation(orgA);
    const providerMessageId = `wamid.bf.in.${Date.now()}`;
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'BF inbound',
        messageType: 'text',
        providerMessageId,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    await waIntegration.projectInbound({
      conversation: waConvo,
      message: waMessage,
      webhookExternalEventId: `msg:${providerMessageId}`,
    });
    await prisma.communicationMessageContent.deleteMany({ where: { organizationId: orgA } });

    const result = await backfill.backfillOrganization({ organizationId: orgA, dryRun: false });
    expect(result.applied).toBeGreaterThanOrEqual(1);
  });

  it('backfill matches missing canonical event separately from missing conversation', async () => {
    const waConvo = await seedWaConversation(orgA);
    await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: 'No canonical',
        messageType: 'text',
        providerMessageId: `wamid.nocanon.${Date.now()}`,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
      },
    });
    await prisma.communicationConversation.deleteMany({ where: { organizationId: orgA } });
    await prisma.communicationEvent.deleteMany({ where: { organizationId: orgA } });

    const result = await backfill.backfillOrganization({ organizationId: orgA, dryRun: true });
    expect(result.missingCanonicalConversation).toBeGreaterThanOrEqual(1);
  });

  it('N — message text in content is not echoed in event metadata', async () => {
    const waConvo = await seedWaConversation(orgA);
    const piiText = 'Contact me at secret-pii@example.com';
    const waMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'incoming',
        senderType: 'customer',
        content: piiText,
        messageType: 'text',
        providerMessageId: `wamid.pii.${Date.now()}`,
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
    const event = timeline.items[0]!;
    expect(event.content?.text).toBe(piiText);
    expect(JSON.stringify(event.metadata ?? {})).not.toContain('secret-pii@example.com');
  });
});
