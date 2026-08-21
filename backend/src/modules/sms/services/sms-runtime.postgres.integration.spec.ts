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
import { SENT_DM_IDEMPOTENCY_WINDOW_MS } from '../sms.constants';
import { computeSentDmWebhookSignature } from '../providers/sentdm-webhook-verification';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('SMS C5.2 runtime postgres', () => {
  let prisma: PrismaClient;
  let smsService: SmsService;
  let processor: SmsWebhookProcessorService;
  let security: SmsWebhookSecurityService;
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
        data: { companyName: `SMS C52 ${Date.now()}`, businessType: 'RENTAL', status: 'ACTIVE' },
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

    smsService = moduleRef.get(SmsService);
    processor = moduleRef.get(SmsWebhookProcessorService);
    security = moduleRef.get(SmsWebhookSecurityService);
  });

  beforeEach(async () => {
    if (!schemaReady) return;
    mockAdapter.executeSend.mockReset();
    const org = await prisma.organization.create({
      data: { companyName: `SMS C52 ${Date.now()}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgId = org.id;
    webhookEndpointId = `wh-${orgId}`;
    accountId = `acc-${orgId}`;
    signingSecret = 'whsec_' + Buffer.from('sms-c52-webhook-key!!').toString('base64');
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

  function mockProviderSuccess(messageId = 'prov-msg-1') {
    mockAdapter.executeSend.mockResolvedValue({
      ok: true,
      providerMessageId: messageId,
      providerStatus: 'QUEUED',
      acceptedAt: new Date(),
    });
  }

  it('A: outbound first send → QUEUED + one provider call', async () => {
    if (!schemaReady) return;
    mockProviderSuccess();
    const result = await smsService.sendOutbound({
      organizationId: orgId,
      recipient: '+491701111111',
      content: 'hello runtime',
      businessOperationId: 'biz-a',
      actorUserId: 'user-1',
    });
    expect(result.status).toBe('accepted');
    expect(mockAdapter.executeSend).toHaveBeenCalledTimes(1);
    const row = await prisma.smsMessage.findFirst({ where: { organizationId: orgId } });
    expect(row?.status).toBe(SmsMessageDeliveryStatus.QUEUED);
  });

  it('B/C: duplicate businessOperationId does not create second row', async () => {
    if (!schemaReady) return;
    mockProviderSuccess('prov-biz');
    const input = {
      organizationId: orgId,
      recipient: '+491702222222',
      content: 'dup',
      businessOperationId: 'biz-dup',
      actorUserId: 'user-1',
    };
    await smsService.sendOutbound(input);
    mockAdapter.executeSend.mockClear();
    const replay = await smsService.sendOutbound(input);
    expect(replay.status).toBe('accepted');
    expect(mockAdapter.executeSend).not.toHaveBeenCalled();
    expect(await prisma.smsMessage.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it('D: provider timeout → DISPATCH_AMBIGUOUS', async () => {
    if (!schemaReady) return;
    mockAdapter.executeSend.mockResolvedValue({
      ok: false,
      kind: 'NETWORK_TIMEOUT',
      failureCode: 'NETWORK_TIMEOUT',
      retryable: true,
    });
    await expect(
      smsService.sendOutbound({
        organizationId: orgId,
        recipient: '+491703333333',
        content: 'timeout',
        businessOperationId: 'biz-timeout',
        actorUserId: 'user-1',
      }),
    ).rejects.toBeDefined();
    const row = await prisma.smsMessage.findFirst({
      where: { organizationId: orgId, businessOperationId: 'biz-timeout' },
    });
    expect(row?.status).toBe(SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS);
  });

  it('F: idempotency expired blocks provider call', async () => {
    if (!schemaReady) return;
    const convo = await prisma.smsConversation.create({
      data: {
        organizationId: orgId,
        contactPhone: '+491704444444',
        contactPhoneNormalized: '491704444444',
      },
    });
    const expired = new Date(Date.now() - SENT_DM_IDEMPOTENCY_WINDOW_MS - 60_000);
    await prisma.smsMessage.create({
      data: {
        organizationId: orgId,
        conversationId: convo.id,
        direction: 'outgoing',
        senderType: 'user',
        content: 'old',
        businessOperationId: 'biz-expired',
        status: SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS,
        firstDispatchAttemptedAt: expired,
        dispatchAttemptedAt: expired,
      },
    });
    const result = await smsService.sendOutbound({
      organizationId: orgId,
      recipient: '+491704444444',
      content: 'retry',
      businessOperationId: 'biz-expired',
      actorUserId: 'user-1',
    });
    expect(result.status).toBe('idempotency_expired');
    expect(mockAdapter.executeSend).not.toHaveBeenCalled();
  });

  it('I: delivered webhook → DELIVERED', async () => {
    if (!schemaReady) return;
    mockProviderSuccess('prov-delivered');
    await smsService.sendOutbound({
      organizationId: orgId,
      recipient: '+491705555555',
      content: 'deliver me',
      businessOperationId: 'biz-deliver',
      actorUserId: 'user-1',
    });

    const payload = {
      field: 'message',
      event: 'message.delivered',
      timestamp: '2026-08-21T12:00:00Z',
      payload: {
        message_id: 'prov-delivered',
        message_status: 'DELIVERED',
        account_id: accountId,
        updated_at: '2026-08-21T12:00:01Z',
      },
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = computeSentDmWebhookSignature({
      rawBody,
      webhookId: webhookEndpointId,
      timestamp,
      signingSecret,
    })!;
    const verified = await security.verifyIngress({
      rawBody,
      headers: {
        'x-webhook-id': webhookEndpointId,
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': signature,
      },
    });
    await processor.processVerifiedIngress(verified);
    const row = await prisma.smsMessage.findFirst({
      where: { providerMessageId: 'prov-delivered', organizationId: orgId },
    });
    expect(row?.status).toBe(SmsMessageDeliveryStatus.DELIVERED);
  });
});
