import { PrismaClient, WhatsAppMessageDeliveryStatus } from '@prisma/client';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppCommunicationProjectionIntegration } from '@modules/communication/adapters/whatsapp/whatsapp-communication-projection.integration';
import { WhatsAppSendAmbiguousException } from './utils/whatsapp-errors';
import { buildNativeWhatsAppIdempotencyKey } from '@modules/communication/reply/communication-reply-idempotency';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('WhatsApp outbound dispatch postgres', () => {
  let prisma: PrismaClient;
  let service: WhatsAppService;
  let sendTextMessage: jest.Mock;
  let orgId: string;
  let conversationId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    sendTextMessage = jest.fn().mockResolvedValue({
      status: 'SENT',
      providerMessageId: 'wamid.test.1',
    });

    const ts = Date.now();
    const org = await prisma.organization.create({
      data: { companyName: `WA Dispatch ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgId = org.id;

    await prisma.orgWhatsAppConfig.create({
      data: {
        organizationId: orgId,
        isActive: true,
        isConnected: true,
        accessTokenConfigured: true,
        phoneNumberId: 'phone-dispatch',
        providerStatus: 'CONFIGURED',
        serviceWindowOpen: true,
      },
    });

    const convo = await prisma.whatsAppConversation.create({
      data: {
        organizationId: orgId,
        contactPhone: '+491701234567',
        contactPhoneNormalized: '491701234567',
        status: 'OPEN',
        lastCustomerMessageAt: new Date(),
      },
    });
    conversationId = convo.id;

    const provider = {
      isConfigured: jest.fn().mockReturnValue(true),
      sendTextMessage: (...args: unknown[]) => sendTextMessage(...args),
    };

    service = new WhatsAppService(
      prisma as any,
      { route: jest.fn() } as any,
      { get: jest.fn() } as any,
      provider as any,
      { assertCanSend: jest.fn() } as any,
      { canSendFreeText: jest.fn().mockReturnValue({ allowed: true }) } as any,
      {} as any,
      { record: jest.fn() } as any,
      {
        projectOutboundAccepted: jest.fn(),
        projectOutboundFailed: jest.fn(),
      } as unknown as WhatsAppCommunicationProjectionIntegration,
    );
  });

  afterEach(async () => {
    await prisma.whatsAppMessage.deleteMany({ where: { organizationId: orgId } });
    await prisma.whatsAppConversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgWhatsAppConfig.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  function scopedKey(clientKey: string) {
    return buildNativeWhatsAppIdempotencyKey(orgId, conversationId, clientKey);
  }

  it('claims dispatch atomically — parallel recovery results in one provider call', async () => {
    const key = scopedKey('parallel-dispatch');

    const results = await Promise.allSettled([
      service.sendMessage(orgId, conversationId, 'Hello', 'Op A', { idempotencyKey: key }),
      service.sendMessage(orgId, conversationId, 'Hello', 'Op A', { idempotencyKey: key }),
    ]);

    expect(sendTextMessage).toHaveBeenCalledTimes(1);
    const messages = await prisma.whatsAppMessage.findMany({
      where: { organizationId: orgId, idempotencyKey: key },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.providerDispatchStartedAt).not.toBeNull();

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length + rejected.length).toBe(2);
  });

  it('does not redispatch after durable dispatch marker without provider result', async () => {
    const key = scopedKey('crash-after-dispatch');
    const message = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgId,
        conversationId,
        direction: 'outgoing',
        senderType: 'human',
        content: 'Ambiguous',
        messageType: 'text',
        status: WhatsAppMessageDeliveryStatus.QUEUED,
        idempotencyKey: key,
        providerDispatchStartedAt: new Date(),
        failureReason: 'DISPATCH_UNCERTAIN',
      },
    });

    await expect(
      service.sendMessage(orgId, conversationId, 'Ambiguous', 'Op', { idempotencyKey: key }),
    ).rejects.toBeInstanceOf(WhatsAppSendAmbiguousException);

    expect(sendTextMessage).not.toHaveBeenCalled();

    const rows = await prisma.whatsAppMessage.findMany({
      where: { organizationId: orgId, idempotencyKey: key },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(message.id);
  });

  it('safe resume before dispatch marker claims and sends once', async () => {
    const key = scopedKey('before-dispatch');
    await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgId,
        conversationId,
        direction: 'outgoing',
        senderType: 'human',
        content: 'Resume me',
        messageType: 'text',
        status: WhatsAppMessageDeliveryStatus.QUEUED,
        idempotencyKey: key,
      },
    });

    const result = await service.sendMessage(orgId, conversationId, 'Resume me', 'Op', {
      idempotencyKey: key,
    });

    expect(sendTextMessage).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(WhatsAppMessageDeliveryStatus.SENT);

    const row = await prisma.whatsAppMessage.findFirst({
      where: { organizationId: orgId, idempotencyKey: key },
    });
    expect(row?.providerDispatchStartedAt).not.toBeNull();
    expect(row?.providerMessageId).toBe('wamid.test.1');
  });

  it('reconciles to SENT after provider evidence without another dispatch', async () => {
    const key = scopedKey('reconcile-sent');
    const message = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgId,
        conversationId,
        direction: 'outgoing',
        senderType: 'human',
        content: 'Reconcile',
        messageType: 'text',
        status: WhatsAppMessageDeliveryStatus.QUEUED,
        idempotencyKey: key,
        providerDispatchStartedAt: new Date(),
        failureReason: 'DISPATCH_UNCERTAIN',
      },
    });

    await service.reconcileOutboundProviderResult(orgId, message.id, {
      providerMessageId: 'wamid.reconciled.1',
      status: 'SENT',
    });

    const result = await service.sendMessage(orgId, conversationId, 'Reconcile', 'Op', {
      idempotencyKey: key,
    });

    expect(sendTextMessage).not.toHaveBeenCalled();
    expect(result.status).toBe(WhatsAppMessageDeliveryStatus.SENT);
    expect(result.providerMessageId).toBe('wamid.reconciled.1');

    const count = await prisma.whatsAppMessage.count({
      where: { organizationId: orgId, idempotencyKey: key },
    });
    expect(count).toBe(1);
  });

  it('simulates crash after provider accept before local persist — no redispatch on retry', async () => {
    const key = scopedKey('crash-after-accept');
    let providerCalls = 0;
    sendTextMessage.mockImplementation(async () => {
      providerCalls += 1;
      await prisma.whatsAppMessage.updateMany({
        where: {
          organizationId: orgId,
          idempotencyKey: key,
          providerDispatchStartedAt: { not: null },
        },
        data: { failureReason: 'DISPATCH_UNCERTAIN' },
      });
      throw new Error('simulated crash before persist');
    });

    await expect(
      service.sendMessage(orgId, conversationId, 'Crash window', 'Op', { idempotencyKey: key }),
    ).rejects.toThrow('simulated crash');

    expect(providerCalls).toBe(1);

    const row = await prisma.whatsAppMessage.findFirst({
      where: { organizationId: orgId, idempotencyKey: key },
    });
    expect(row?.providerDispatchStartedAt).not.toBeNull();
    expect(row?.providerMessageId).toBeNull();

    sendTextMessage.mockClear();
    sendTextMessage.mockResolvedValue({ status: 'SENT', providerMessageId: 'wamid.late.1' });

    await expect(
      service.sendMessage(orgId, conversationId, 'Crash window', 'Op', { idempotencyKey: key }),
    ).rejects.toBeInstanceOf(WhatsAppSendAmbiguousException);

    expect(sendTextMessage).not.toHaveBeenCalled();

    const ambiguousRow = await prisma.whatsAppMessage.findFirstOrThrow({
      where: { organizationId: orgId, idempotencyKey: key },
    });

    await service.reconcileOutboundProviderResult(orgId, ambiguousRow.id, {
      providerMessageId: 'wamid.reconciled.crash',
      status: 'SENT',
    });

    const reconciled = await service.sendMessage(orgId, conversationId, 'Crash window', 'Op', {
      idempotencyKey: key,
    });

    expect(sendTextMessage).not.toHaveBeenCalled();
    expect(reconciled.status).toBe(WhatsAppMessageDeliveryStatus.SENT);
    expect(reconciled.providerMessageId).toBe('wamid.reconciled.crash');

    const messageCount = await prisma.whatsAppMessage.count({
      where: { organizationId: orgId, idempotencyKey: key },
    });
    expect(messageCount).toBe(1);
    expect(providerCalls).toBe(1);
  });

  it('marks DISPATCH_UNCERTAIN on ambiguous transport after dispatch claim', async () => {
    const key = scopedKey('ambiguous-transport');
    sendTextMessage.mockRejectedValue(new Error('socket hang up'));

    await expect(
      service.sendMessage(orgId, conversationId, 'Uncertain', 'Op', { idempotencyKey: key }),
    ).rejects.toBeInstanceOf(WhatsAppSendAmbiguousException);

    const row = await prisma.whatsAppMessage.findFirstOrThrow({
      where: { organizationId: orgId, idempotencyKey: key },
    });
    expect(row.providerDispatchStartedAt).not.toBeNull();
    expect(row.failureReason).toBe('DISPATCH_UNCERTAIN');
    expect(row.providerMessageId).toBeNull();
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
  });
});
