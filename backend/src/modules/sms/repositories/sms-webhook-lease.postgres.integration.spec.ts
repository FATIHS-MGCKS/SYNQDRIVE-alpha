import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaClient, SmsMessageDeliveryStatus } from '@prisma/client';
import smsConfig, { COMMUNICATION_CENTER_SMS_ENABLED_FLAG } from '@config/sms.config';
import communicationProjectionConfig from '@config/communication-projection.config';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationModule } from '@modules/communication/communication.module';
import { CommunicationTenantContextValidation } from '@modules/communication/communication-tenant-context.validation';
import { SmsConversationRepository } from '../repositories/sms-conversation.repository';
import { SmsMessageRepository } from '../repositories/sms-message.repository';
import { SmsWebhookEventRepository } from '../repositories/sms-webhook-event.repository';
import { SmsConfigService } from '../services/sms-config.service';
import { SmsService } from '../services/sms.service';
import { SmsWebhookSecurityService } from '../services/sms-webhook-security.service';
import { SmsWebhookProcessorService } from '../services/sms-webhook-processor.service';
import { SentDmSmsAdapter } from '../providers/sentdm-sms.adapter';
import {
  SMS_WEBHOOK_PROCESSING_LEASE,
  SMS_WEBHOOK_PROCESSING_LEASE_MS,
} from '../sms.constants';
import { computeSentDmWebhookSignature } from '../providers/sentdm-webhook-verification';
import { buildSmsWebhookExternalEventId } from '@modules/communication/adapters/sms/sentdm-sms-communication.shared';
import { SmsCommunicationProjectionIntegration } from '@modules/communication/adapters/sms/sms-communication-projection.integration';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('SMS C5.2 webhook processing lease postgres', () => {
  let prisma: PrismaClient;
  let webhookEvents: SmsWebhookEventRepository;
  let messages: SmsMessageRepository;
  let conversations: SmsConversationRepository;
  let processor: SmsWebhookProcessorService;
  let security: SmsWebhookSecurityService;
  let smsService: SmsService;
  let projection: SmsCommunicationProjectionIntegration;
  let mockAdapter: { executeSend: jest.Mock };
  let orgId: string;
  let webhookEndpointId: string;
  let accountId: string;
  let signingSecret: string;
  let schemaReady = false;

  beforeAll(async () => {
    process.env[COMMUNICATION_CENTER_SMS_ENABLED_FLAG] = 'true';
    process.env.COMMUNICATION_CENTER_SMS_PROJECTION_ENABLED = 'true';
    process.env.COMMUNICATION_CENTER_PROJECTION_ENABLED = 'true';

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    try {
      const org = await prisma.organization.create({
        data: { companyName: `SMS lease ${Date.now()}`, businessType: 'RENTAL', status: 'ACTIVE' },
      });
      await prisma.organization.delete({ where: { id: org.id } });
      schemaReady = true;
    } catch {
      schemaReady = false;
      return;
    }

    mockAdapter = { executeSend: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [smsConfig, communicationProjectionConfig] }),
        CommunicationModule,
      ],
      providers: [
        PrismaService,
        CommunicationTenantContextValidation,
        SmsConversationRepository,
        SmsMessageRepository,
        SmsWebhookEventRepository,
        SmsWebhookSecurityService,
        SmsConfigService,
        SmsWebhookProcessorService,
        SmsService,
        { provide: SentDmSmsAdapter, useValue: mockAdapter },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    webhookEvents = moduleRef.get(SmsWebhookEventRepository);
    messages = moduleRef.get(SmsMessageRepository);
    conversations = moduleRef.get(SmsConversationRepository);
    processor = moduleRef.get(SmsWebhookProcessorService);
    security = moduleRef.get(SmsWebhookSecurityService);
    smsService = moduleRef.get(SmsService);
    projection = moduleRef.get(SmsCommunicationProjectionIntegration);
  });

  beforeEach(async () => {
    if (!schemaReady) return;
    mockAdapter.executeSend.mockReset();
    const org = await prisma.organization.create({
      data: { companyName: `SMS lease ${Date.now()}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgId = org.id;
    webhookEndpointId = `wh-${orgId}`;
    accountId = `acc-${orgId}`;
    signingSecret = 'whsec_' + Buffer.from('sms-lease-webhook-key!!').toString('base64');
    process.env[`SENT_DM_API_KEY_${orgId}`] = 'test-api-key';
    process.env[`SENT_DM_WEBHOOK_SIGNING_SECRET_${orgId}`] = signingSecret;

    await prisma.orgSmsConfig.create({
      data: {
        organizationId: orgId,
        isConnected: true,
        isActive: true,
        apiKeyConfigured: true,
        webhookSigningSecretConfigured: true,
        sentDmAccountId: accountId,
        webhookEndpointId,
        senderProfileId: 'profile-1',
      },
    });
  });

  afterEach(async () => {
    if (!schemaReady || !orgId) return;
    await prisma.communicationEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.communicationConversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.smsWebhookEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.smsMessage.deleteMany({ where: { organizationId: orgId } });
    await prisma.smsConversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSmsConfig.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    delete process.env[`SENT_DM_API_KEY_${orgId}`];
    delete process.env[`SENT_DM_WEBHOOK_SIGNING_SECRET_${orgId}`];
  });

  afterAll(async () => {
    delete process.env[COMMUNICATION_CENTER_SMS_ENABLED_FLAG];
    await prisma.$disconnect();
  });

  async function createWebhookEvent(externalEventId: string) {
    return webhookEvents.beginProcessing({
      organizationId: orgId,
      webhookEndpointId,
      externalEventId,
      eventType: 'message.delivered',
      signatureValid: true,
    });
  }

  async function staleClaim(eventId: string) {
    const staleAt = new Date(Date.now() - SMS_WEBHOOK_PROCESSING_LEASE_MS - 5_000);
    await prisma.smsWebhookEvent.update({
      where: { id: eventId },
      data: {
        processingError: SMS_WEBHOOK_PROCESSING_LEASE,
        processingClaimedAt: staleAt,
      },
    });
  }

  async function signAndVerify(payload: Record<string, unknown>) {
    const rawBody = Buffer.from(JSON.stringify(payload));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = computeSentDmWebhookSignature({
      rawBody,
      webhookId: webhookEndpointId,
      timestamp,
      signingSecret,
    })!;
    return security.verifyIngress({
      rawBody,
      headers: {
        'x-webhook-id': webhookEndpointId,
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': signature,
      },
    });
  }

  function mockProviderSuccess(messageId: string) {
    mockAdapter.executeSend.mockResolvedValue({
      ok: true,
      providerMessageId: messageId,
      providerStatus: 'QUEUED',
      acceptedAt: new Date(),
      acceptedAtSource: 'local_receipt_fallback',
    });
  }

  it('A–F: stale lease reclaim with single winner and terminal processed state', async () => {
    if (!schemaReady) return;
    const externalEventId = 'lease-crash-recovery-1';
    const eventRow = await createWebhookEvent(externalEventId);
    const claimA = await webhookEvents.tryClaimProcessing(eventRow.id);
    expect(claimA.outcome).toBe('claimed');

    const rowAfterA = await prisma.smsWebhookEvent.findUnique({ where: { id: eventRow.id } });
    expect(rowAfterA?.processingError).toBe(SMS_WEBHOOK_PROCESSING_LEASE);
    expect(rowAfterA?.processingClaimedAt).not.toBeNull();

    const claimB = await webhookEvents.tryClaimProcessing(eventRow.id);
    expect(claimB.outcome).toBe('held_by_peer');

    await staleClaim(eventRow.id);
    const [claimC, claimD] = await Promise.all([
      webhookEvents.tryClaimProcessing(eventRow.id),
      webhookEvents.tryClaimProcessing(eventRow.id),
    ]);
    const winners = [claimC, claimD].filter((c) => c.outcome === 'claimed');
    expect(winners).toHaveLength(1);

    await webhookEvents.markProcessed(eventRow.id);
    const claimE = await webhookEvents.tryClaimProcessing(eventRow.id);
    expect(claimE.outcome).toBe('already_processed');
  });

  it('crash after native DELIVERED converges to one canonical MESSAGE_DELIVERED', async () => {
    if (!schemaReady) return;
    const providerMessageId = 'prov-native-crash';
    mockProviderSuccess(providerMessageId);
    await smsService.sendOutbound({
      organizationId: orgId,
      recipient: '+491701111111',
      content: 'native crash',
      businessOperationId: 'biz-native-crash',
      actorUserId: 'user-1',
    });

    const externalEventId = buildSmsWebhookExternalEventId(providerMessageId, 'DELIVERED');
    const eventRow = await createWebhookEvent(externalEventId);
    const claim = await webhookEvents.tryClaimProcessing(eventRow.id);
    expect(claim.outcome).toBe('claimed');

    await messages.applyDeliveryStatusUpdateByProviderMessageId({
      organizationId: orgId,
      providerMessageId,
      providerStatus: 'DELIVERED',
      occurredAt: new Date('2026-08-21T12:00:02Z'),
    });

    await staleClaim(eventRow.id);

    const payload = {
      field: 'message',
      event: 'message.delivered',
      timestamp: '2026-08-21T12:00:02Z',
      payload: {
        message_id: providerMessageId,
        message_status: 'DELIVERED',
        account_id: accountId,
        updated_at: '2026-08-21T12:00:02Z',
      },
    };
    const verified = await signAndVerify(payload);
    await processor.processVerifiedIngress(verified);

    const row = await prisma.smsMessage.findFirst({ where: { providerMessageId } });
    expect(row?.status).toBe(SmsMessageDeliveryStatus.DELIVERED);
    const events = await prisma.communicationEvent.findMany({
      where: { organizationId: orgId, eventType: 'MESSAGE_DELIVERED' },
    });
    expect(events).toHaveLength(1);
    const webhook = await prisma.smsWebhookEvent.findUnique({ where: { id: eventRow.id } });
    expect(webhook?.processedAt).not.toBeNull();
  });

  it('crash after canonical MESSAGE_DELIVERED still converges to exactly one event', async () => {
    if (!schemaReady) return;
    const providerMessageId = 'prov-canonical-crash';
    mockProviderSuccess(providerMessageId);
    await smsService.sendOutbound({
      organizationId: orgId,
      recipient: '+491702222222',
      content: 'canonical crash',
      businessOperationId: 'biz-canonical-crash',
      actorUserId: 'user-1',
    });

    const externalEventId = buildSmsWebhookExternalEventId(providerMessageId, 'DELIVERED');
    const eventRow = await createWebhookEvent(externalEventId);
    await webhookEvents.tryClaimProcessing(eventRow.id);

    const updated = await messages.applyDeliveryStatusUpdateByProviderMessageId({
      organizationId: orgId,
      providerMessageId,
      providerStatus: 'DELIVERED',
      occurredAt: new Date('2026-08-21T12:00:03Z'),
    });
    expect(updated?.status).toBe(SmsMessageDeliveryStatus.DELIVERED);

    await projection.projectStatusUpdate({
      conversation: updated!.conversation,
      message: updated!,
      status: 'DELIVERED',
      webhookExternalEventId: externalEventId,
      occurredAt: new Date('2026-08-21T12:00:03Z'),
    });

    await staleClaim(eventRow.id);

    const payload = {
      field: 'message',
      event: 'message.delivered',
      timestamp: '2026-08-21T12:00:03Z',
      payload: {
        message_id: providerMessageId,
        message_status: 'DELIVERED',
        account_id: accountId,
        updated_at: '2026-08-21T12:00:03Z',
      },
    };
    const verified = await signAndVerify(payload);
    await processor.processVerifiedIngress(verified);

    const events = await prisma.communicationEvent.findMany({
      where: { organizationId: orgId, eventType: 'MESSAGE_DELIVERED' },
    });
    expect(events).toHaveLength(1);
    const webhook = await prisma.smsWebhookEvent.findUnique({ where: { id: eventRow.id } });
    expect(webhook?.processedAt).not.toBeNull();
  });

  it('inbound partial crash: no duplicate message, unread, or MESSAGE_RECEIVED', async () => {
    if (!schemaReady) return;
    const providerMessageId = 'inbound-partial-crash';
    const externalEventId = buildSmsWebhookExternalEventId(providerMessageId, 'RECEIVED');
    const eventRow = await createWebhookEvent(externalEventId);
    await webhookEvents.tryClaimProcessing(eventRow.id);

    const conversation = await conversations.ensureConversation({
      organizationId: orgId,
      contactPhone: '+491703333333',
      contactPhoneNormalized: '491703333333',
    });

    await messages.createInboundMessage({
      organizationId: orgId,
      conversationId: conversation.id,
      content: 'partial inbound',
      providerMessageId,
      businessOperationId: `inbound:${providerMessageId}`,
      deliveredAt: new Date('2026-08-21T12:00:04Z'),
    });
    await conversations.recordInboundActivity({
      conversationId: conversation.id,
      organizationId: orgId,
      preview: 'partial inbound',
      occurredAt: new Date('2026-08-21T12:00:04Z'),
      unreadDelta: 1,
    });

    await staleClaim(eventRow.id);

    const payload = {
      field: 'message',
      event: 'message.received',
      timestamp: '2026-08-21T12:00:04Z',
      payload: {
        message_id: providerMessageId,
        inbound_number: '+491703333333',
        text: 'partial inbound',
        account_id: accountId,
        received_at: '2026-08-21T12:00:04Z',
      },
    };
    const verified = await signAndVerify(payload);
    await processor.processVerifiedIngress(verified);

    expect(await prisma.smsMessage.count({ where: { providerMessageId } })).toBe(1);
    const convo = await prisma.smsConversation.findUnique({ where: { id: conversation.id } });
    expect(convo?.unreadCount).toBe(1);
    const events = await prisma.communicationEvent.findMany({
      where: { organizationId: orgId, eventType: 'MESSAGE_RECEIVED' },
    });
    expect(events).toHaveLength(1);
    const webhook = await prisma.smsWebhookEvent.findUnique({ where: { id: eventRow.id } });
    expect(webhook?.processedAt).not.toBeNull();
  });

  it('stale former owner markProcessed cannot corrupt completed webhook row', async () => {
    if (!schemaReady) return;
    const externalEventId = 'lease-stale-owner-mark';
    const eventRow = await createWebhookEvent(externalEventId);
    await webhookEvents.tryClaimProcessing(eventRow.id);
    await webhookEvents.markProcessed(eventRow.id);

    const before = await prisma.smsWebhookEvent.findUnique({ where: { id: eventRow.id } });
    const processedAt = before!.processedAt!;

    await webhookEvents.markProcessed(eventRow.id);
    const after = await prisma.smsWebhookEvent.findUnique({ where: { id: eventRow.id } });
    expect(after?.processedAt?.getTime()).toBe(processedAt.getTime());
    expect(after?.processingError).toBeNull();
    expect(after?.processingClaimedAt).toBeNull();
  });
});
