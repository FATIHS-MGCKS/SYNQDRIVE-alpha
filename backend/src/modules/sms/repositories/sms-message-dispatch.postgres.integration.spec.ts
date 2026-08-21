import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaClient, SmsMessageDeliveryStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationTenantContextValidation } from '@modules/communication/communication-tenant-context.validation';
import { SmsConversationRepository } from './sms-conversation.repository';
import { SmsMessageRepository } from './sms-message.repository';
import { SMS_DISPATCH_STALE_MS, SENT_DM_IDEMPOTENCY_WINDOW_MS } from '../sms.constants';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

async function probePostgresSchema(prisma: PrismaClient): Promise<boolean> {
  try {
    const org = await prisma.organization.create({
      data: {
        companyName: `SMS dispatch probe ${Date.now()}`,
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

describePg('SMS message dispatch state machine postgres (C5.1)', () => {
  let prisma: PrismaClient;
  let conversations: SmsConversationRepository;
  let messages: SmsMessageRepository;
  let orgId: string;
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
      data: { companyName: `SMS dispatch ${Date.now()}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgId = org.id;
  });

  afterEach(async () => {
    if (!schemaReady || !orgId) {
      return;
    }
    await prisma.smsMessage.deleteMany({ where: { organizationId: orgId } });
    await prisma.smsConversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createOutbound(businessOperationId: string) {
    const convo = await conversations.ensureConversation({
      organizationId: orgId,
      contactPhone: `+49${Date.now().toString().slice(-9)}`,
      contactPhoneNormalized: `49${Date.now().toString().slice(-9)}`,
    });
    return messages.createOutboundPending({
      organizationId: orgId,
      conversationId: convo.id,
      content: 'dispatch test',
      businessOperationId,
      senderType: 'system',
    });
  }

  it('requires aligned PostgreSQL schema', () => {
    if (!schemaReady) {
      console.warn('Skipping SMS dispatch postgres tests: DATABASE_URL schema not aligned');
    }
    expect(schemaReady).toBe(true);
  });

  it('A: PENDING → claim → DISPATCHING', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-a-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    const claim = await messages.claimProviderDispatch(msg.id, orgId);
    expect(claim.outcome).toBe('claimed');
    if (claim.outcome !== 'claimed') return;

    expect(claim.message.status).toBe(SmsMessageDeliveryStatus.DISPATCHING);
    expect(claim.message.dispatchAttemptedAt).not.toBeNull();
  });

  it('B: fresh DISPATCHING → second claim rejected', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-b-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    const first = await messages.claimProviderDispatch(msg.id, orgId);
    expect(first.outcome).toBe('claimed');

    const second = await messages.claimProviderDispatch(msg.id, orgId);
    expect(second.outcome).toBe('held_by_peer');
  });

  it('C: stale DISPATCHING within idempotency window → reclaim succeeds', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-c-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    const first = await messages.claimProviderDispatch(msg.id, orgId);
    expect(first.outcome).toBe('claimed');

    await prisma.smsMessage.update({
      where: { id: msg.id },
      data: { dispatchAttemptedAt: new Date(Date.now() - SMS_DISPATCH_STALE_MS - 1_000) },
    });

    const reclaimed = await messages.claimProviderDispatch(msg.id, orgId);
    expect(reclaimed.outcome).toBe('claimed');
    if (reclaimed.outcome !== 'claimed') return;
    expect(reclaimed.message.status).toBe(SmsMessageDeliveryStatus.DISPATCHING);
  });

  it('D: DISPATCHING → ambiguous transport failure → DISPATCH_AMBIGUOUS', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-d-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    await messages.claimProviderDispatch(msg.id, orgId);
    await messages.recordAmbiguousDispatchFailure(msg.id, orgId, 'HTTP_503');

    const updated = await prisma.smsMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(updated.status).toBe(SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS);
    expect(updated.dispatchAttemptedAt).not.toBeNull();
  });

  it('E: DISPATCH_AMBIGUOUS within idempotency window → reclaim retains businessOperationId', async () => {
    if (!schemaReady) return;
    const businessOperationId = `biz-e-${Date.now()}`;
    const msg = await createOutbound(businessOperationId);
    if (!msg) throw new Error('message missing');

    await messages.claimProviderDispatch(msg.id, orgId);
    await messages.recordAmbiguousDispatchFailure(msg.id, orgId, 'HTTP_504');

    const reclaimed = await messages.claimProviderDispatch(msg.id, orgId);
    expect(reclaimed.outcome).toBe('claimed');
    if (reclaimed.outcome !== 'claimed') return;

    expect(reclaimed.message.businessOperationId).toBe(businessOperationId);
    expect(reclaimed.message.status).toBe(SmsMessageDeliveryStatus.DISPATCHING);
    expect(await prisma.smsMessage.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it('F: DISPATCH_AMBIGUOUS outside idempotency window → claim rejected, no new row', async () => {
    if (!schemaReady) return;
    const businessOperationId = `biz-f-${Date.now()}`;
    const msg = await createOutbound(businessOperationId);
    if (!msg) throw new Error('message missing');

    const expiredAnchor = new Date(Date.now() - SENT_DM_IDEMPOTENCY_WINDOW_MS - 60_000);
    await prisma.smsMessage.update({
      where: { id: msg.id },
      data: {
        status: SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS,
        dispatchAttemptedAt: expiredAnchor,
        failureCode: 'HTTP_504',
        failureReason: 'dispatch_ambiguous',
      },
    });

    const claim = await messages.claimProviderDispatch(msg.id, orgId);
    expect(claim.outcome).toBe('idempotency_expired');
    if (claim.outcome !== 'idempotency_expired') return;

    expect(claim.message.businessOperationId).toBe(businessOperationId);
    expect(claim.message.status).toBe(SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS);
    expect(await prisma.smsMessage.count({ where: { organizationId: orgId } })).toBe(1);

    const retryCreate = await messages.createOutboundPending({
      organizationId: orgId,
      conversationId: msg.conversationId,
      content: 'retry',
      businessOperationId,
      senderType: 'system',
    });
    expect(retryCreate?.id).toBe(msg.id);
  });

  it('G: recovered ambiguous dispatch → acceptance → QUEUED with providerMessageId', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-g-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    await messages.claimProviderDispatch(msg.id, orgId);
    await messages.recordAmbiguousDispatchFailure(msg.id, orgId, 'HTTP_504');

    const reclaimed = await messages.claimProviderDispatch(msg.id, orgId);
    expect(reclaimed.outcome).toBe('claimed');

    const accepted = await messages.recordProviderAcceptance({
      messageId: msg.id,
      organizationId: orgId,
      providerMessageId: `prov-g-${Date.now()}`,
      providerStatus: 'QUEUED',
      acceptedAt: new Date(),
    });

    expect(accepted.id).toBe(msg.id);
    expect(accepted.status).toBe(SmsMessageDeliveryStatus.QUEUED);
    expect(accepted.providerMessageId).toBeTruthy();
  });

  it('H: terminal FAILED → never reclaimable', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-h-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    await messages.claimProviderDispatch(msg.id, orgId);
    await messages.recordTerminalProviderRejection(msg.id, orgId, 'PROVIDER_REJECTED');

    const claim = await messages.claimProviderDispatch(msg.id, orgId);
    expect(claim.outcome).toBe('not_claimable');
    if (claim.outcome !== 'not_claimable') return;
    expect(claim.message?.status).toBe(SmsMessageDeliveryStatus.FAILED);
  });

  it('I: QUEUED/SENT/DELIVERED → never reclaimable', async () => {
    if (!schemaReady) return;
    const convo = await conversations.ensureConversation({
      organizationId: orgId,
      contactPhone: '+491709999999',
      contactPhoneNormalized: '491709999999',
    });

    for (const status of [
      SmsMessageDeliveryStatus.QUEUED,
      SmsMessageDeliveryStatus.SENT,
      SmsMessageDeliveryStatus.DELIVERED,
    ]) {
      const providerMessageId = `prov-i-${status}-${Date.now()}`;
      const row = await prisma.smsMessage.create({
        data: {
          organizationId: orgId,
          conversationId: convo.id,
          direction: 'outgoing',
          senderType: 'system',
          content: status,
          providerMessageId,
          businessOperationId: `biz-i-${status}-${Date.now()}`,
          status,
        },
      });

      const claim = await messages.claimProviderDispatch(row.id, orgId);
      expect(claim.outcome).toBe('not_claimable');
    }
  });

  it('recordProviderAcceptance rejects non-DISPATCHING states', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-accept-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    await expect(
      messages.recordProviderAcceptance({
        messageId: msg.id,
        organizationId: orgId,
        providerMessageId: 'prov-bad',
        providerStatus: 'QUEUED',
        acceptedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
