import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
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
import { SmsCommunicationProjectionIntegration } from '@modules/communication/adapters/sms/sms-communication-projection.integration';
import { buildSentDmIdempotencyKey } from '../providers/sentdm-idempotency-key';
import { SENT_DM_IDEMPOTENCY_WINDOW_MS, SMS_WEBHOOK_UNKNOWN_PROVIDER_MESSAGE } from '../sms.constants';
import { computeSentDmWebhookSignature } from '../providers/sentdm-webhook-verification';
import { buildSmsWebhookExternalEventId } from '@modules/communication/adapters/sms/sentdm-sms-communication.shared';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('SMS C5.2 runtime postgres', () => {
  let prisma: PrismaClient;
  let smsService: SmsService;
  let processor: SmsWebhookProcessorService;
  let security: SmsWebhookSecurityService;
  let messages: SmsMessageRepository;
  let conversations: SmsConversationRepository;
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
    messages = moduleRef.get(SmsMessageRepository);
    conversations = moduleRef.get(SmsConversationRepository);
    projection = moduleRef.get(SmsCommunicationProjectionIntegration);
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

  function mockProviderSuccess(messageId = 'prov-msg-1', acceptedAt = new Date()) {
    mockAdapter.executeSend.mockResolvedValue({
      ok: true,
      providerMessageId: messageId,
      providerStatus: 'QUEUED',
      acceptedAt,
      acceptedAtSource: 'local_receipt_fallback',
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

  const outboundInput = (overrides: Partial<Parameters<SmsService['sendOutbound']>[0]> = {}) => ({
    organizationId: orgId,
    recipient: '+491701111111',
    content: 'hello runtime',
    businessOperationId: 'biz-a',
    actorUserId: 'user-1',
    ...overrides,
  });

  it('A: outbound first send → QUEUED + one provider call', async () => {
    if (!schemaReady) return;
    mockProviderSuccess();
    const result = await smsService.sendOutbound(outboundInput());
    expect(result.status).toBe('accepted');
    expect(mockAdapter.executeSend).toHaveBeenCalledTimes(1);
    const row = await prisma.smsMessage.findFirst({ where: { organizationId: orgId } });
    expect(row?.status).toBe(SmsMessageDeliveryStatus.QUEUED);
  });

  it('B/C: duplicate businessOperationId does not create second row', async () => {
    if (!schemaReady) return;
    mockProviderSuccess('prov-biz');
    const input = outboundInput({
      recipient: '+491702222222',
      content: 'dup',
      businessOperationId: 'biz-dup',
    });
    await smsService.sendOutbound(input);
    mockAdapter.executeSend.mockClear();
    const replay = await smsService.sendOutbound(input);
    expect(replay.status).toBe('accepted');
    expect(mockAdapter.executeSend).not.toHaveBeenCalled();
    expect(await prisma.smsMessage.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it('concurrent duplicate outbound → one provider invocation', async () => {
    if (!schemaReady) return;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockAdapter.executeSend.mockImplementation(async () => {
      await gate;
      return {
        ok: true,
        providerMessageId: 'prov-concurrent',
        providerStatus: 'QUEUED',
        acceptedAt: new Date(),
        acceptedAtSource: 'local_receipt_fallback',
      };
    });
    const input = outboundInput({ businessOperationId: 'biz-concurrent-dup' });
    const p1 = smsService.sendOutbound(input);
    const p2 = smsService.sendOutbound(input);
    release();
    const results = await Promise.all([p1, p2]);
    expect(results.every((r) => r.status === 'accepted' || r.status === 'in_progress')).toBe(true);
    expect(mockAdapter.executeSend).toHaveBeenCalledTimes(1);
    expect(await prisma.smsMessage.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it('same idempotency key + different recipient → 409 conflict, zero provider calls', async () => {
    if (!schemaReady) return;
    mockProviderSuccess('prov-recipient');
    await smsService.sendOutbound(
      outboundInput({ businessOperationId: 'biz-recipient', recipient: '+491701111111', content: 'same' }),
    );
    mockAdapter.executeSend.mockClear();
    await expect(
      smsService.sendOutbound(
        outboundInput({ businessOperationId: 'biz-recipient', recipient: '+491702222222', content: 'same' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mockAdapter.executeSend).not.toHaveBeenCalled();
  });

  it('same idempotency key + different content → 409 conflict, zero provider calls', async () => {
    if (!schemaReady) return;
    mockProviderSuccess('prov-content');
    await smsService.sendOutbound(
      outboundInput({ businessOperationId: 'biz-content', content: 'alpha' }),
    );
    mockAdapter.executeSend.mockClear();
    await expect(
      smsService.sendOutbound(
        outboundInput({ businessOperationId: 'biz-content', content: 'beta' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mockAdapter.executeSend).not.toHaveBeenCalled();
  });

  it('concurrent conflicting businessOperationId → one winner, loser conflict, no alternate provider payload', async () => {
    if (!schemaReady) return;
    mockProviderSuccess('prov-race');
    const op = 'biz-race-conflict';
    const [r1, r2] = await Promise.allSettled([
      smsService.sendOutbound(outboundInput({ businessOperationId: op, recipient: '+491701111111', content: 'foo' })),
      smsService.sendOutbound(outboundInput({ businessOperationId: op, recipient: '+491702222222', content: 'bar' })),
    ]);
    const statuses = [r1, r2].map((r) => (r.status === 'fulfilled' ? r.value.status : 'rejected'));
    expect(statuses.filter((s) => s === 'accepted' || s === 'in_progress').length).toBe(1);
    expect(statuses.filter((s) => s === 'rejected').length).toBe(1);
    expect(mockAdapter.executeSend).toHaveBeenCalledTimes(1);
    const calls = mockAdapter.executeSend.mock.calls[0]?.[0];
    expect(calls?.body).toBe('foo');
    expect(await prisma.smsMessage.count({ where: { organizationId: orgId, businessOperationId: op } })).toBe(1);
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
      smsService.sendOutbound(outboundInput({ businessOperationId: 'biz-timeout', recipient: '+491703333333', content: 'timeout' })),
    ).rejects.toBeDefined();
    const row = await prisma.smsMessage.findFirst({
      where: { organizationId: orgId, businessOperationId: 'biz-timeout' },
    });
    expect(row?.status).toBe(SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS);
  });

  it('ambiguous retry within 24h reuses same provider idempotency key', async () => {
    if (!schemaReady) return;
    mockAdapter.executeSend
      .mockResolvedValueOnce({
        ok: false,
        kind: 'NETWORK_TIMEOUT',
        failureCode: 'NETWORK_TIMEOUT',
        retryable: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        providerMessageId: 'prov-retry',
        providerStatus: 'QUEUED',
        acceptedAt: new Date(),
        acceptedAtSource: 'local_receipt_fallback',
      });
    const input = outboundInput({ businessOperationId: 'biz-ambiguous-retry', recipient: '+491706666666' });
    await expect(smsService.sendOutbound(input)).rejects.toBeDefined();
    await smsService.sendOutbound(input);
    expect(mockAdapter.executeSend).toHaveBeenCalledTimes(2);
    const key = buildSentDmIdempotencyKey(orgId, 'biz-ambiguous-retry');
    expect(mockAdapter.executeSend.mock.calls.every((c) => c[0].idempotencyKey === key)).toBe(true);
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
    const result = await smsService.sendOutbound(
      outboundInput({ businessOperationId: 'biz-expired', recipient: '+491704444444', content: 'old' }),
    );
    expect(result.status).toBe('idempotency_expired');
    expect(mockAdapter.executeSend).not.toHaveBeenCalled();
  });

  it('accepted + canonical projection failure → no resend on replay', async () => {
    if (!schemaReady) return;
    mockProviderSuccess('prov-proj-fail');
    jest.spyOn(projection, 'projectOutboundAccepted').mockRejectedValueOnce(new Error('projection down'));
    const input = outboundInput({ businessOperationId: 'biz-proj-fail' });
    const first = await smsService.sendOutbound(input);
    expect(first.status).toBe('accepted');
    mockAdapter.executeSend.mockClear();
    const replay = await smsService.sendOutbound(input);
    expect(replay.status).toBe('accepted');
    expect(mockAdapter.executeSend).not.toHaveBeenCalled();
  });

  it('terminal provider reject → no MESSAGE_SENT canonical event', async () => {
    if (!schemaReady) return;
    mockAdapter.executeSend.mockResolvedValue({
      ok: false,
      kind: 'TERMINAL_REJECTION',
      failureCode: 'VALIDATION_001',
      retryable: false,
    });
    await expect(
      smsService.sendOutbound(outboundInput({ businessOperationId: 'biz-terminal' })),
    ).rejects.toBeDefined();
    const events = await prisma.communicationEvent.findMany({ where: { organizationId: orgId } });
    expect(events.some((e) => e.eventType === 'MESSAGE_SENT')).toBe(false);
  });

  it('I: delivered webhook → DELIVERED', async () => {
    if (!schemaReady) return;
    mockProviderSuccess('prov-delivered');
    await smsService.sendOutbound(outboundInput({ businessOperationId: 'biz-deliver', recipient: '+491705555555', content: 'deliver me' }));

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
    const verified = await signAndVerify(payload);
    await processor.processVerifiedIngress(verified);
    const row = await prisma.smsMessage.findFirst({
      where: { providerMessageId: 'prov-delivered', organizationId: orgId },
    });
    expect(row?.status).toBe(SmsMessageDeliveryStatus.DELIVERED);
  });

  it('delivered replay → one canonical MESSAGE_DELIVERED', async () => {
    if (!schemaReady) return;
    mockProviderSuccess('prov-deliver-replay');
    await smsService.sendOutbound(outboundInput({ businessOperationId: 'biz-deliver-replay' }));
    const payload = {
      field: 'message',
      event: 'message.delivered',
      timestamp: '2026-08-21T12:00:00Z',
      payload: {
        message_id: 'prov-deliver-replay',
        message_status: 'DELIVERED',
        account_id: accountId,
      },
    };
    const verified = await signAndVerify(payload);
    await processor.processVerifiedIngress(verified);
    await processor.processVerifiedIngress(verified);
    const events = await prisma.communicationEvent.findMany({
      where: { organizationId: orgId, eventType: 'MESSAGE_DELIVERED' },
    });
    expect(events).toHaveLength(1);
  });

  it('concurrent SENT + DELIVERED → final DELIVERED', async () => {
    if (!schemaReady) return;
    const convo = await prisma.smsConversation.create({
      data: { organizationId: orgId, contactPhone: '+491707777777', contactPhoneNormalized: '491707777777' },
    });
    await prisma.smsMessage.create({
      data: {
        organizationId: orgId,
        conversationId: convo.id,
        direction: 'outgoing',
        senderType: 'user',
        content: 'race',
        businessOperationId: 'biz-delivery-race',
        providerMessageId: 'prov-race-status',
        status: SmsMessageDeliveryStatus.QUEUED,
      },
    });
    const t1 = new Date('2026-08-21T12:00:01Z');
    const t2 = new Date('2026-08-21T12:00:02Z');
    await Promise.all([
      messages.applyDeliveryStatusUpdateByProviderMessageId({
        organizationId: orgId,
        providerMessageId: 'prov-race-status',
        providerStatus: 'SENT',
        occurredAt: t1,
      }),
      messages.applyDeliveryStatusUpdateByProviderMessageId({
        organizationId: orgId,
        providerMessageId: 'prov-race-status',
        providerStatus: 'DELIVERED',
        occurredAt: t2,
      }),
    ]);
    const row = await prisma.smsMessage.findFirst({ where: { providerMessageId: 'prov-race-status' } });
    expect(row?.status).toBe(SmsMessageDeliveryStatus.DELIVERED);
  });

  it('DELIVERED persisted + delayed SENT → stays DELIVERED', async () => {
    if (!schemaReady) return;
    const convo = await prisma.smsConversation.create({
      data: { organizationId: orgId, contactPhone: '+491708888888', contactPhoneNormalized: '491708888888' },
    });
    await prisma.smsMessage.create({
      data: {
        organizationId: orgId,
        conversationId: convo.id,
        direction: 'outgoing',
        senderType: 'user',
        content: 'stale',
        businessOperationId: 'biz-stale-sent',
        providerMessageId: 'prov-stale-sent',
        status: SmsMessageDeliveryStatus.DELIVERED,
        deliveredAt: new Date('2026-08-21T12:00:02Z'),
      },
    });
    await messages.applyDeliveryStatusUpdateByProviderMessageId({
      organizationId: orgId,
      providerMessageId: 'prov-stale-sent',
      providerStatus: 'SENT',
      occurredAt: new Date('2026-08-21T12:00:01Z'),
    });
    const row = await prisma.smsMessage.findFirst({ where: { providerMessageId: 'prov-stale-sent' } });
    expect(row?.status).toBe(SmsMessageDeliveryStatus.DELIVERED);
  });

  it('two concurrent identical DELIVERED webhooks → one native transition + one canonical event', async () => {
    if (!schemaReady) return;
    mockProviderSuccess('prov-concurrent-wh');
    await smsService.sendOutbound(outboundInput({ businessOperationId: 'biz-concurrent-wh' }));
    const payload = {
      field: 'message',
      event: 'message.delivered',
      timestamp: '2026-08-21T12:00:00Z',
      payload: {
        message_id: 'prov-concurrent-wh',
        message_status: 'DELIVERED',
        account_id: accountId,
      },
    };
    const verified = await signAndVerify(payload);
    await Promise.all([
      processor.processVerifiedIngress(verified),
      processor.processVerifiedIngress(verified),
    ]);
    const extId = buildSmsWebhookExternalEventId('prov-concurrent-wh', 'DELIVERED');
    const webhookRows = await prisma.smsWebhookEvent.findMany({ where: { externalEventId: extId } });
    expect(webhookRows).toHaveLength(1);
    expect(webhookRows[0]?.processedAt).not.toBeNull();
    const events = await prisma.communicationEvent.findMany({
      where: { organizationId: orgId, eventType: 'MESSAGE_DELIVERED' },
    });
    expect(events).toHaveLength(1);
  });

  it('unknown delivery providerMessageId → webhook left unprocessed for retry', async () => {
    if (!schemaReady) return;
    const payload = {
      field: 'message',
      event: 'message.delivered',
      timestamp: '2026-08-21T12:00:00Z',
      payload: {
        message_id: 'prov-unknown-orphan',
        message_status: 'DELIVERED',
        account_id: accountId,
      },
    };
    const verified = await signAndVerify(payload);
    await processor.processVerifiedIngress(verified);
    const extId = buildSmsWebhookExternalEventId('prov-unknown-orphan', 'DELIVERED');
    const row = await prisma.smsWebhookEvent.findUnique({ where: { externalEventId: extId } });
    expect(row?.processedAt).toBeNull();
    expect(row?.processingError).toBe(SMS_WEBHOOK_UNKNOWN_PROVIDER_MESSAGE);
  });

  it('invalid webhook signature rejected', async () => {
    if (!schemaReady) return;
    const payload = { field: 'message', event: 'message.delivered', payload: { message_id: 'x' } };
    const rawBody = Buffer.from(JSON.stringify(payload));
    await expect(
      security.verifyIngress({
        rawBody,
        headers: {
          'x-webhook-id': webhookEndpointId,
          'x-webhook-timestamp': String(Math.floor(Date.now() / 1000)),
          'x-webhook-signature': 'v1,invalid',
        },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('missing signing secret fails closed', async () => {
    if (!schemaReady) return;
    delete process.env[`SENT_DM_WEBHOOK_SIGNING_SECRET_${orgId}`];
    const payload = { field: 'message', event: 'message.delivered', payload: { message_id: 'x' } };
    const rawBody = Buffer.from(JSON.stringify(payload));
    await expect(
      security.verifyIngress({
        rawBody,
        headers: {
          'x-webhook-id': webhookEndpointId,
          'x-webhook-timestamp': String(Math.floor(Date.now() / 1000)),
          'x-webhook-signature': 'v1,abc',
        },
      }),
    ).rejects.toBeDefined();
  });

  it('cross-org webhook endpoint mismatch rejected', async () => {
    if (!schemaReady) return;
    const otherOrg = await prisma.organization.create({
      data: { companyName: `Other ${Date.now()}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    await prisma.orgSmsConfig.create({
      data: {
        organizationId: otherOrg.id,
        isActive: true,
        webhookSigningSecretConfigured: true,
        webhookEndpointId: `wh-${otherOrg.id}`,
        sentDmAccountId: `acc-${otherOrg.id}`,
      },
    });
    const payload = { field: 'message', event: 'message.delivered', payload: { message_id: 'x', account_id: accountId } };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = computeSentDmWebhookSignature({
      rawBody,
      webhookId: `wh-${otherOrg.id}`,
      timestamp,
      signingSecret,
    })!;
    await expect(
      security.verifyIngress({
        rawBody,
        headers: {
          'x-webhook-id': `wh-${otherOrg.id}`,
          'x-webhook-timestamp': timestamp,
          'x-webhook-signature': signature,
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await prisma.orgSmsConfig.deleteMany({ where: { organizationId: otherOrg.id } });
    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });

  it('monotonic outbound: T2 activity then delayed T1 does not move lastMessageAt backwards', async () => {
    if (!schemaReady) return;
    const convo = await prisma.smsConversation.create({
      data: {
        organizationId: orgId,
        contactPhone: '+491709999999',
        contactPhoneNormalized: '491709999999',
        lastMessageAt: new Date('2026-08-21T12:00:02Z'),
        lastMessagePreview: 'newer',
      },
    });
    await conversations.recordOutboundActivity({
      conversationId: convo.id,
      organizationId: orgId,
      preview: 'older',
      occurredAt: new Date('2026-08-21T12:00:01Z'),
    });
    const updated = await prisma.smsConversation.findUnique({ where: { id: convo.id } });
    expect(updated?.lastMessageAt?.toISOString()).toBe('2026-08-21T12:00:02.000Z');
    expect(updated?.lastMessagePreview).toBe('newer');
  });

  it('monotonic inbound: T2 then delayed distinct T1 keeps preview at T2 but increments unread twice', async () => {
    if (!schemaReady) return;
    const convo = await prisma.smsConversation.create({
      data: {
        organizationId: orgId,
        contactPhone: '+491710000000',
        contactPhoneNormalized: '491710000000',
        lastMessageAt: new Date('2026-08-21T12:00:02Z'),
        lastCustomerMessageAt: new Date('2026-08-21T12:00:02Z'),
        lastMessagePreview: 'newer-in',
        unreadCount: 0,
      },
    });
    await conversations.recordInboundActivity({
      conversationId: convo.id,
      organizationId: orgId,
      preview: 'older-in',
      occurredAt: new Date('2026-08-21T12:00:01Z'),
      unreadDelta: 1,
    });
    await conversations.recordInboundActivity({
      conversationId: convo.id,
      organizationId: orgId,
      preview: 'newer-in',
      occurredAt: new Date('2026-08-21T12:00:02Z'),
      unreadDelta: 1,
    });
    const updated = await prisma.smsConversation.findUnique({ where: { id: convo.id } });
    expect(updated?.lastMessageAt?.toISOString()).toBe('2026-08-21T12:00:02.000Z');
    expect(updated?.lastCustomerMessageAt?.toISOString()).toBe('2026-08-21T12:00:02.000Z');
    expect(updated?.lastMessagePreview).toBe('newer-in');
    expect(updated?.unreadCount).toBe(2);
  });

  it('inbound replay does not increment unread', async () => {
    if (!schemaReady) return;
    const providerMessageId = 'inbound-replay-1';
    const payload = {
      field: 'message',
      event: 'message.received',
      timestamp: '2026-08-21T12:00:00Z',
      payload: {
        message_id: providerMessageId,
        inbound_number: '+491711111111',
        text: 'hi',
        account_id: accountId,
      },
    };
    const verified = await signAndVerify(payload);
    await processor.processVerifiedIngress(verified);
    await processor.processVerifiedIngress(verified);
    const convo = await prisma.smsConversation.findFirst({ where: { organizationId: orgId } });
    expect(convo?.unreadCount).toBe(1);
  });

  it('PII absent from canonical metadata after outbound send', async () => {
    if (!schemaReady) return;
    mockProviderSuccess('prov-pii');
    await smsService.sendOutbound(
      outboundInput({ businessOperationId: 'biz-pii', recipient: '+491712222222', content: 'secret-body' }),
    );
    const events = await prisma.communicationEvent.findMany({ where: { organizationId: orgId } });
    expect(events.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(events.map((e) => e.metadata));
    expect(serialized).not.toMatch(/491712222222|secret-body/i);
  });
});
