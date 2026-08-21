import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import {
  CommunicationChannel,
  CommunicationEventType,
  CommunicationProviderIdentity,
  PrismaClient,
  SmsMessageDeliveryStatus,
} from '@prisma/client';
import communicationProjectionConfig from '@config/communication-projection.config';
import smsConfig from '@config/sms.config';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationConversationRepository } from '../../communication-conversation.repository';
import { CommunicationEventRepository } from '../../communication-event.repository';
import { CommunicationProjectionFeatureService } from '../../communication-projection-feature.service';
import { CommunicationProjectionService } from '../../communication-projection.service';
import { CommunicationTenantContextValidation } from '../../communication-tenant-context.validation';
import { SentDmSmsCommunicationAdapter } from './sentdm-sms-communication.adapter';
import { SmsCommunicationProjectionIntegration } from './sms-communication-projection.integration';
import { SmsService } from '@modules/sms/sms.service';
import { SentDmSmsAdapter } from '@modules/sms/providers/sentdm-sms.adapter';
import { SmsWebhookService } from '@modules/sms/sms-webhook.service';
import { computeSentDmWebhookSignature } from '@modules/sms/providers/sentdm-webhook-verification';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('SMS canonical projection postgres integration (C5)', () => {
  let prisma: PrismaClient;
  let smsService: SmsService;
  let webhookService: SmsWebhookService;
  let orgId: string;
  let orgBId: string;
  let signingSecret: string;

  const mockSend = jest.fn();

  beforeAll(async () => {
    process.env.COMMUNICATION_CENTER_SMS_ENABLED = 'true';
    process.env.COMMUNICATION_CENTER_SMS_PROJECTION_ENABLED = 'true';
    signingSecret = 'whsec_' + Buffer.from('sms-c5-test-signing-key!!').toString('base64');

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [communicationProjectionConfig, smsConfig],
        }),
      ],
      providers: [
        PrismaService,
        CommunicationTenantContextValidation,
        CommunicationConversationRepository,
        CommunicationEventRepository,
        CommunicationProjectionService,
        CommunicationProjectionFeatureService,
        SentDmSmsCommunicationAdapter,
        SmsCommunicationProjectionIntegration,
        SentDmSmsAdapter,
        SmsService,
        SmsWebhookService,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(SentDmSmsAdapter)
      .useValue({
        sendMessage: mockSend,
        isConfigured: () => true,
        resolveApiKey: () => 'test-api-key',
        resolveWebhookSigningSecret: () => signingSecret,
      })
      .compile();

    smsService = moduleRef.get(SmsService);
    webhookService = moduleRef.get(SmsWebhookService);
  });

  beforeEach(async () => {
    mockSend.mockReset();
    const org = await prisma.organization.create({
      data: {
        companyName: `SMS C5 PG ${Date.now()}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
    });
    orgId = org.id;
    process.env[`SENT_DM_API_KEY_${orgId}`] = 'test-api-key';
    process.env[`SENT_DM_WEBHOOK_SIGNING_SECRET_${orgId}`] = signingSecret;

    const orgB = await prisma.organization.create({
      data: {
        companyName: `SMS C5 PG B ${Date.now()}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
    });
    orgBId = orgB.id;

    await prisma.orgSmsConfig.create({
      data: {
        organizationId: orgId,
        isConnected: true,
        isActive: true,
        apiKeyConfigured: true,
        webhookSigningSecretConfigured: true,
        webhookEndpointId: `wh-endpoint-${orgId}`,
      },
    });
  });

  afterEach(async () => {
    await prisma.communicationEvent.deleteMany({
      where: { organizationId: { in: [orgId, orgBId] } },
    });
    await prisma.communicationConversation.deleteMany({
      where: { organizationId: { in: [orgId, orgBId] } },
    });
    await prisma.smsWebhookEvent.deleteMany({
      where: { organizationId: { in: [orgId, orgBId] } },
    });
    await prisma.smsMessage.deleteMany({
      where: { organizationId: { in: [orgId, orgBId] } },
    });
    await prisma.smsConversation.deleteMany({
      where: { organizationId: { in: [orgId, orgBId] } },
    });
    await prisma.orgSmsConfig.deleteMany({
      where: { organizationId: { in: [orgId, orgBId] } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, orgBId] } } });
    delete process.env[`SENT_DM_API_KEY_${orgId}`];
    delete process.env[`SENT_DM_WEBHOOK_SIGNING_SECRET_${orgId}`];
  });

  afterAll(async () => {
    delete process.env.COMMUNICATION_CENTER_SMS_ENABLED;
    delete process.env.COMMUNICATION_CENTER_SMS_PROJECTION_ENABLED;
    await prisma.$disconnect();
  });

  it('A: outbound accepted persists canonical SMS conversation/event', async () => {
    const providerMessageId = `pm-${Date.now()}`;
    mockSend.mockResolvedValue({
      providerMessageId,
      providerStatus: 'QUEUED',
      acceptedAt: new Date(),
    });

    await smsService.sendOutbound({
      organizationId: orgId,
      recipientPhone: '+491701111111',
      body: 'Test SMS',
      businessOperationId: `biz-${Date.now()}`,
    });

    const envelope = await prisma.communicationConversation.findFirst({
      where: { organizationId: orgId, channel: CommunicationChannel.SMS },
    });
    expect(envelope).toBeTruthy();

    const events = await prisma.communicationEvent.findMany({
      where: { organizationId: orgId, channel: CommunicationChannel.SMS },
    });
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe(CommunicationEventType.MESSAGE_SENT);
    expect(events[0].providerIdentity).toBe(CommunicationProviderIdentity.SENT_DM);
  });

  it('B: conversation identity is deterministic per org+normalized phone', async () => {
    mockSend.mockResolvedValue({
      providerMessageId: `pm-b-${Date.now()}`,
      providerStatus: 'QUEUED',
      acceptedAt: new Date(),
    });

    const op = `biz-b-${Date.now()}`;
    await smsService.sendOutbound({
      organizationId: orgId,
      recipientPhone: '+49 170 1111111',
      body: 'One',
      businessOperationId: op,
    });

    mockSend.mockResolvedValue({
      providerMessageId: `pm-b2-${Date.now()}`,
      providerStatus: 'QUEUED',
      acceptedAt: new Date(),
    });

    await smsService.sendOutbound({
      organizationId: orgId,
      recipientPhone: '01701111111',
      body: 'Two',
      businessOperationId: `${op}-second`,
    });

    const conversations = await prisma.smsConversation.findMany({ where: { organizationId: orgId } });
    expect(conversations).toHaveLength(1);
  });

  it('C: same business operation replay does not invoke provider twice', async () => {
    const providerMessageId = `pm-c-${Date.now()}`;
    mockSend.mockResolvedValue({
      providerMessageId,
      providerStatus: 'QUEUED',
      acceptedAt: new Date(),
    });

    const businessOperationId = `biz-c-${Date.now()}`;
    const first = await smsService.sendOutbound({
      organizationId: orgId,
      recipientPhone: '+491702222222',
      body: 'Replay test',
      businessOperationId,
    });
    const second = await smsService.sendOutbound({
      organizationId: orgId,
      recipientPhone: '+491702222222',
      body: 'Replay test',
      businessOperationId,
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(second.replayed).toBe(true);
    expect(second.providerMessageId).toBe(first.providerMessageId);
  });

  it('D/E: delivery webhook creates MESSAGE_DELIVERED and replays idempotently', async () => {
    const providerMessageId = `pm-d-${Date.now()}`;
    mockSend.mockResolvedValue({
      providerMessageId,
      providerStatus: 'QUEUED',
      acceptedAt: new Date(),
    });

    await smsService.sendOutbound({
      organizationId: orgId,
      recipientPhone: '+491703333333',
      body: 'Delivery',
      businessOperationId: `biz-d-${Date.now()}`,
    });

    const payload = {
      field: 'message',
      event: 'message.delivered',
      payload: { message_id: providerMessageId, message_status: 'DELIVERED', channel: 'sms' },
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const webhookId = `wh-endpoint-${orgId}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = computeSentDmWebhookSignature({
      rawBody,
      webhookId,
      timestamp,
      signingSecret,
    })!;

    await webhookService.receiveWebhook(rawBody, payload, {
      'x-webhook-id': webhookId,
      'x-webhook-timestamp': timestamp,
      'x-webhook-signature': signature,
      'x-webhook-event-type': 'message.delivered',
    });
    await webhookService.receiveWebhook(rawBody, payload, {
      'x-webhook-id': webhookId,
      'x-webhook-timestamp': timestamp,
      'x-webhook-signature': signature,
      'x-webhook-event-type': 'message.delivered',
    });

    const deliveredEvents = await prisma.communicationEvent.findMany({
      where: {
        organizationId: orgId,
        eventType: CommunicationEventType.MESSAGE_DELIVERED,
      },
    });
    expect(deliveredEvents).toHaveLength(1);
  });

  it('F: failure webhook creates MESSAGE_FAILED', async () => {
    const providerMessageId = `pm-f-${Date.now()}`;
    mockSend.mockResolvedValue({
      providerMessageId,
      providerStatus: 'QUEUED',
      acceptedAt: new Date(),
    });

    await smsService.sendOutbound({
      organizationId: orgId,
      recipientPhone: '+491704444444',
      body: 'Fail me',
      businessOperationId: `biz-f-${Date.now()}`,
    });

    const payload = {
      field: 'message',
      event: 'message.failed',
      payload: {
        message_id: providerMessageId,
        message_status: 'FAILED',
        channel: 'sms',
        failure_code: 'UNDELIVERABLE',
      },
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const webhookId = `wh-endpoint-${orgId}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = computeSentDmWebhookSignature({
      rawBody,
      webhookId,
      timestamp,
      signingSecret,
    })!;

    await webhookService.receiveWebhook(rawBody, payload, {
      'x-webhook-id': webhookId,
      'x-webhook-timestamp': timestamp,
      'x-webhook-signature': signature,
    });

    const failed = await prisma.communicationEvent.findMany({
      where: {
        organizationId: orgId,
        eventType: CommunicationEventType.MESSAGE_FAILED,
      },
    });
    expect(failed).toHaveLength(1);
  });

  it('G/H/I: cross-org isolation, no phone in canonical metadata, no raw webhook payload table column', async () => {
    const providerMessageId = `pm-g-${Date.now()}`;
    mockSend.mockResolvedValue({
      providerMessageId,
      providerStatus: 'QUEUED',
      acceptedAt: new Date(),
    });

    await smsService.sendOutbound({
      organizationId: orgId,
      recipientPhone: '+491705555555',
      body: 'PII boundary',
      businessOperationId: `biz-g-${Date.now()}`,
    });

    const payload = {
      field: 'message',
      event: 'message.delivered',
      payload: { message_id: providerMessageId, message_status: 'DELIVERED' },
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const webhookId = `wh-endpoint-${orgBId}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = computeSentDmWebhookSignature({
      rawBody,
      webhookId,
      timestamp,
      signingSecret,
    })!;

    await webhookService.receiveWebhook(rawBody, payload, {
      'x-webhook-id': webhookId,
      'x-webhook-timestamp': timestamp,
      'x-webhook-signature': signature,
    });

    const orgBEvents = await prisma.communicationEvent.count({ where: { organizationId: orgBId } });
    expect(orgBEvents).toBe(0);

    const events = await prisma.communicationEvent.findMany({ where: { organizationId: orgId } });
    for (const event of events) {
      const meta = JSON.stringify(event.metadata ?? {});
      expect(meta).not.toMatch(/49170|phone|body|payload/i);
      expect(event.redactedPayloadRef).toBeNull();
    }

    const webhookRows = await prisma.smsWebhookEvent.findMany({ where: { organizationId: orgId } });
    expect(webhookRows.length).toBeGreaterThan(0);
    for (const row of webhookRows) {
      expect((row as Record<string, unknown>).payload).toBeUndefined();
    }
  });

  it('J: providerMessageId cannot attach to wrong org conversation', async () => {
    const providerMessageId = `pm-j-${Date.now()}`;
    mockSend.mockResolvedValue({
      providerMessageId,
      providerStatus: 'QUEUED',
      acceptedAt: new Date(),
    });

    await smsService.sendOutbound({
      organizationId: orgId,
      recipientPhone: '+491706666666',
      body: 'Org bound',
      businessOperationId: `biz-j-${Date.now()}`,
    });

    const foreignMessage = await prisma.smsMessage.findFirst({
      where: { providerMessageId },
    });
    expect(foreignMessage?.organizationId).toBe(orgId);

    await prisma.orgSmsConfig.create({
      data: {
        organizationId: orgBId,
        isConnected: true,
        isActive: true,
        apiKeyConfigured: true,
        webhookSigningSecretConfigured: true,
        webhookEndpointId: `wh-endpoint-${orgBId}`,
      },
    });

    const payload = {
      field: 'message',
      event: 'message.delivered',
      payload: { message_id: providerMessageId, message_status: 'DELIVERED' },
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const webhookId = `wh-endpoint-${orgBId}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = computeSentDmWebhookSignature({
      rawBody,
      webhookId,
      timestamp,
      signingSecret,
    })!;

    await webhookService.receiveWebhook(rawBody, payload, {
      'x-webhook-id': webhookId,
      'x-webhook-timestamp': timestamp,
      'x-webhook-signature': signature,
    });

    const orgBDelivered = await prisma.communicationEvent.count({
      where: { organizationId: orgBId, eventType: CommunicationEventType.MESSAGE_DELIVERED },
    });
    expect(orgBDelivered).toBe(0);
  });

  it('concurrency: parallel same business operation invokes provider once', async () => {
    const providerMessageId = `pm-conc-${Date.now()}`;
    let resolveSend: (value: unknown) => void = () => undefined;
    const sendGate = new Promise((resolve) => {
      resolveSend = resolve;
    });

    mockSend.mockImplementation(async () => {
      await sendGate;
      return {
        providerMessageId,
        providerStatus: 'QUEUED',
        acceptedAt: new Date(),
      };
    });

    const businessOperationId = `biz-conc-${Date.now()}`;
    const input = {
      organizationId: orgId,
      recipientPhone: '+491707777777',
      body: 'Concurrent',
      businessOperationId,
    };

    const p1 = smsService.sendOutbound(input);
    const p2 = smsService.sendOutbound(input);
    resolveSend(true);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(r1.providerMessageId).toBe(r2.providerMessageId);
  });

  it('provider acceptance then replay after persistence does not resend', async () => {
    const providerMessageId = `pm-post-${Date.now()}`;
    mockSend.mockResolvedValueOnce({
      providerMessageId,
      providerStatus: 'QUEUED',
      acceptedAt: new Date(),
    });

    const businessOperationId = `biz-post-${Date.now()}`;
    await smsService.sendOutbound({
      organizationId: orgId,
      recipientPhone: '+491708888888',
      body: 'Post accept',
      businessOperationId,
    });

    mockSend.mockClear();
    const replay = await smsService.sendOutbound({
      organizationId: orgId,
      recipientPhone: '+491708888888',
      body: 'Post accept',
      businessOperationId,
    });

    expect(mockSend).not.toHaveBeenCalled();
    expect(replay.replayed).toBe(true);
    expect(replay.providerMessageId).toBe(providerMessageId);

    const native = await prisma.smsMessage.findFirst({
      where: { businessOperationId, organizationId: orgId },
    });
    expect(native?.status).toBe(SmsMessageDeliveryStatus.QUEUED);
  });
});
