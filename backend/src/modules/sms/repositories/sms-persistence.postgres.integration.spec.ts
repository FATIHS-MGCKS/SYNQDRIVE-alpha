import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaClient, SmsMessageDeliveryStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationTenantContextValidation } from '@modules/communication/communication-tenant-context.validation';
import { SmsConversationRepository } from '../repositories/sms-conversation.repository';
import { SmsMessageRepository } from '../repositories/sms-message.repository';
import { SMS_DISPATCH_STALE_MS } from '../sms.constants';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

async function probePostgresSchema(prisma: PrismaClient): Promise<boolean> {
  try {
    const org = await prisma.organization.create({
      data: {
        companyName: `SMS schema probe ${Date.now()}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
    });
    await prisma.organization.delete({ where: { id: org.id } });
    return true;
  } catch {
    return false;
  }
}

describePg('SMS persistence postgres (C5.1)', () => {
  let prisma: PrismaClient;
  let conversations: SmsConversationRepository;
  let messages: SmsMessageRepository;
  let orgId: string;
  let orgBId: string;
  let customerAId: string;
  let customerBId: string;
  let schemaReady = false;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    schemaReady = await probePostgresSchema(prisma);
    if (!schemaReady) {
      return;
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        CommunicationTenantContextValidation,
        SmsConversationRepository,
        SmsMessageRepository,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    conversations = moduleRef.get(SmsConversationRepository);
    messages = moduleRef.get(SmsMessageRepository);
  });

  beforeEach(async () => {
    if (!schemaReady) {
      return;
    }
    const org = await prisma.organization.create({
      data: { companyName: `SMS persist ${Date.now()}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgId = org.id;
    const orgB = await prisma.organization.create({
      data: { companyName: `SMS persist B ${Date.now()}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgBId = orgB.id;

    const customerA = await prisma.customer.create({
      data: { organizationId: orgId, firstName: 'A', lastName: 'Test', email: `a-${Date.now()}@example.com` },
    });
    customerAId = customerA.id;
    const customerB = await prisma.customer.create({
      data: { organizationId: orgBId, firstName: 'B', lastName: 'Test', email: `b-${Date.now()}@example.com` },
    });
    customerBId = customerB.id;
  });

  afterEach(async () => {
    if (!schemaReady || !orgId || !orgBId) {
      return;
    }
    await prisma.smsMessage.deleteMany({ where: { organizationId: { in: [orgId, orgBId] } } });
    await prisma.smsConversation.deleteMany({ where: { organizationId: { in: [orgId, orgBId] } } });
    await prisma.customer.deleteMany({ where: { organizationId: { in: [orgId, orgBId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, orgBId] } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('requires aligned PostgreSQL schema', () => {
    if (!schemaReady) {
      console.warn('Skipping SMS persistence postgres tests: DATABASE_URL schema not aligned with Prisma client');
    }
    expect(schemaReady).toBe(true);
  });

  it('rejects cross-org customer on conversation ensure', async () => {
    if (!schemaReady) return;
    await expect(
      conversations.ensureConversation({
        organizationId: orgId,
        contactPhone: '+491701111111',
        contactPhoneNormalized: '491701111111',
        customerId: customerBId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enriches existing conversation with same-org customerId', async () => {
    const first = await conversations.ensureConversation({
      organizationId: orgId,
      contactPhone: '+491701111111',
      contactPhoneNormalized: '491701111111',
    });
    expect(first.customerId).toBeNull();

    const enriched = await conversations.ensureConversation({
      organizationId: orgId,
      contactPhone: '+491701111111',
      contactPhoneNormalized: '491701111111',
      customerId: customerAId,
    });
    expect(enriched.id).toBe(first.id);
    expect(enriched.customerId).toBe(customerAId);
  });

  it('businessOperationId replay creates one outbound row', async () => {
    const convo = await conversations.ensureConversation({
      organizationId: orgId,
      contactPhone: '+491702222222',
      contactPhoneNormalized: '491702222222',
    });
    const op = `biz-${Date.now()}`;
    const first = await messages.createOutboundPending({
      organizationId: orgId,
      conversationId: convo.id,
      content: 'hello',
      businessOperationId: op,
      senderType: 'user',
    });
    const second = await messages.createOutboundPending({
      organizationId: orgId,
      conversationId: convo.id,
      content: 'hello',
      businessOperationId: op,
      senderType: 'user',
    });
    expect(first?.id).toBe(second?.id);
  });

  it('stale DISPATCHING reclaim allows idempotent retry claim', async () => {
    const convo = await conversations.ensureConversation({
      organizationId: orgId,
      contactPhone: '+491703333333',
      contactPhoneNormalized: '491703333333',
    });
    const msg = await messages.createOutboundPending({
      organizationId: orgId,
      conversationId: convo.id,
      content: 'retry',
      businessOperationId: `biz-stale-${Date.now()}`,
      senderType: 'system',
    });
    if (!msg) throw new Error('message missing');

    const claimed = await messages.claimProviderDispatch(msg.id, orgId);
    expect(claimed.outcome).toBe('claimed');
    if (claimed.outcome === 'claimed') {
      expect(claimed.message.status).toBe(SmsMessageDeliveryStatus.DISPATCHING);
    }

    await prisma.smsMessage.update({
      where: { id: msg.id },
      data: { dispatchAttemptedAt: new Date(Date.now() - SMS_DISPATCH_STALE_MS - 1_000) },
    });

    const reclaimed = await messages.claimProviderDispatch(msg.id, orgId);
    expect(reclaimed.outcome).toBe('claimed');
  });

  it('ambiguous failure does not mark terminal FAILED', async () => {
    const convo = await conversations.ensureConversation({
      organizationId: orgId,
      contactPhone: '+491704444444',
      contactPhoneNormalized: '491704444444',
    });
    const msg = await messages.createOutboundPending({
      organizationId: orgId,
      conversationId: convo.id,
      content: 'ambiguous',
      businessOperationId: `biz-amb-${Date.now()}`,
      senderType: 'system',
    });
    if (!msg) throw new Error('message missing');
    const claim = await messages.claimProviderDispatch(msg.id, orgId);
    expect(claim.outcome).toBe('claimed');
    await messages.recordAmbiguousDispatchFailure(msg.id, orgId, 'HTTP_503');
    const updated = await prisma.smsMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(updated.status).toBe(SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS);
  });

  it('inbound providerMessageId concurrent duplicate creates one message', async () => {
    const convo = await conversations.ensureConversation({
      organizationId: orgId,
      contactPhone: '+491705555555',
      contactPhoneNormalized: '491705555555',
    });
    const providerMessageId = `in-${Date.now()}`;
    const input = {
      organizationId: orgId,
      conversationId: convo.id,
      content: 'inbound',
      providerMessageId,
      businessOperationId: `inbound:${providerMessageId}`,
      deliveredAt: new Date('2026-08-21T10:00:00Z'),
    };
    const [a, b] = await Promise.all([
      messages.createInboundMessage(input),
      messages.createInboundMessage(input),
    ]);
    expect(a?.id).toBe(b?.id);
    expect(await prisma.smsMessage.count({ where: { providerMessageId } })).toBe(1);
  });

  it('two concurrent first conversations same contact → one conversation', async () => {
    const phone = `49170666${Date.now()}`;
    const [a, b] = await Promise.all([
      conversations.ensureConversation({
        organizationId: orgId,
        contactPhone: `+${phone}`,
        contactPhoneNormalized: phone,
      }),
      conversations.ensureConversation({
        organizationId: orgId,
        contactPhone: `+${phone}`,
        contactPhoneNormalized: phone,
      }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await prisma.smsConversation.count({ where: { organizationId: orgId, contactPhoneNormalized: phone } })).toBe(1);
  });
});
