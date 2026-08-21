import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaClient, SmsMessageDeliveryStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationTenantContextValidation } from '@modules/communication/communication-tenant-context.validation';
import { SmsConversationRepository } from './sms-conversation.repository';
import { SmsMessageRepository } from './sms-message.repository';
import { SENT_DM_IDEMPOTENCY_WINDOW_MS } from '../sms.constants';

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

  async function createOutbound(businessOperationId: string, createdAt?: Date) {
    const convo = await conversations.ensureConversation({
      organizationId: orgId,
      contactPhone: `+49${Date.now().toString().slice(-9)}`,
      contactPhoneNormalized: `49${Date.now().toString().slice(-9)}`,
    });
    const msg = await messages.createOutboundPending({
      organizationId: orgId,
      conversationId: convo.id,
      content: 'dispatch test',
      businessOperationId,
      senderType: 'system',
    });
    if (createdAt && msg) {
      await prisma.smsMessage.update({
        where: { id: msg.id },
        data: { createdAt },
      });
      return prisma.smsMessage.findUniqueOrThrow({ where: { id: msg.id } });
    }
    return msg;
  }

  it('requires aligned PostgreSQL schema', () => {
    if (!schemaReady) {
      console.warn('Skipping SMS dispatch postgres tests: DATABASE_URL schema not aligned');
    }
    expect(schemaReady).toBe(true);
  });

  it('A: PENDING row created 48h ago but never dispatched → initial claim allowed, first anchor = now', async () => {
    if (!schemaReady) return;
    const createdAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const beforeClaim = Date.now();
    const msg = await createOutbound(`biz-a-${Date.now()}`, createdAt);
    if (!msg) throw new Error('message missing');
    expect(msg.firstDispatchAttemptedAt).toBeNull();

    const claim = await messages.claimProviderDispatch(msg.id, orgId);
    expect(claim.outcome).toBe('claimed');
    if (claim.outcome !== 'claimed') return;

    expect(claim.message.firstDispatchAttemptedAt).not.toBeNull();
    expect(claim.message.dispatchAttemptedAt).not.toBeNull();
    expect(claim.message.firstDispatchAttemptedAt!.getTime()).toBeGreaterThanOrEqual(beforeClaim - 1_000);
    expect(claim.message.status).toBe(SmsMessageDeliveryStatus.DISPATCHING);
  });

  it('B: initial claim → firstDispatchAttemptedAt == dispatchAttemptedAt', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-b-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    const claim = await messages.claimProviderDispatch(msg.id, orgId);
    expect(claim.outcome).toBe('claimed');
    if (claim.outcome !== 'claimed') return;

    expect(claim.message.firstDispatchAttemptedAt!.toISOString()).toBe(
      claim.message.dispatchAttemptedAt!.toISOString(),
    );
  });

  it('C: retry after 2h → dispatchAttemptedAt changes, firstDispatchAttemptedAt unchanged', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-c-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    const firstAnchor = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await prisma.smsMessage.update({
      where: { id: msg.id },
      data: {
        status: SmsMessageDeliveryStatus.DISPATCHING,
        firstDispatchAttemptedAt: firstAnchor,
        dispatchAttemptedAt: new Date(firstAnchor.getTime() + 60_000),
      },
    });

    const reclaimed = await messages.claimProviderDispatch(msg.id, orgId);
    expect(reclaimed.outcome).toBe('claimed');
    if (reclaimed.outcome !== 'claimed') return;

    expect(reclaimed.message.firstDispatchAttemptedAt!.toISOString()).toBe(firstAnchor.toISOString());
    expect(reclaimed.message.dispatchAttemptedAt!.getTime()).toBeGreaterThan(firstAnchor.getTime());
  });

  it('D: second retry after 20h → first anchor unchanged', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-d-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    const firstAnchor = new Date(Date.now() - 20 * 60 * 60 * 1000);
    await prisma.smsMessage.update({
      where: { id: msg.id },
      data: {
        status: SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS,
        firstDispatchAttemptedAt: firstAnchor,
        dispatchAttemptedAt: new Date(firstAnchor.getTime() + 19 * 60 * 60 * 1000),
        failureCode: 'HTTP_504',
        failureReason: 'dispatch_ambiguous',
      },
    });

    const reclaimed = await messages.claimProviderDispatch(msg.id, orgId);
    expect(reclaimed.outcome).toBe('claimed');
    if (reclaimed.outcome !== 'claimed') return;

    expect(reclaimed.message.firstDispatchAttemptedAt!.toISOString()).toBe(firstAnchor.toISOString());
  });

  it('E: attempt at first anchor + 24h + epsilon → idempotency_expired despite recent dispatchAttemptedAt', async () => {
    if (!schemaReady) return;
    const businessOperationId = `biz-e-${Date.now()}`;
    const msg = await createOutbound(businessOperationId);
    if (!msg) throw new Error('message missing');

    const firstAnchor = new Date(Date.now() - SENT_DM_IDEMPOTENCY_WINDOW_MS - 60_000);
    const recentLease = new Date(Date.now() - 5 * 60_000);
    await prisma.smsMessage.update({
      where: { id: msg.id },
      data: {
        status: SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS,
        firstDispatchAttemptedAt: firstAnchor,
        dispatchAttemptedAt: recentLease,
        failureCode: 'HTTP_504',
        failureReason: 'dispatch_ambiguous',
      },
    });

    const claim = await messages.claimProviderDispatch(msg.id, orgId);
    expect(claim.outcome).toBe('idempotency_expired');
    if (claim.outcome !== 'idempotency_expired') return;

    const after = await prisma.smsMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(after.dispatchAttemptedAt!.toISOString()).toBe(recentLease.toISOString());
    expect(after.firstDispatchAttemptedAt!.toISOString()).toBe(firstAnchor.toISOString());
    expect(after.businessOperationId).toBe(businessOperationId);
    expect(await prisma.smsMessage.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it('F: ambiguous retry does not extend idempotency window', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-f-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    const first = await messages.claimProviderDispatch(msg.id, orgId);
    expect(first.outcome).toBe('claimed');
    if (first.outcome !== 'claimed') return;
    const firstAnchor = first.message.firstDispatchAttemptedAt!;

    await messages.recordAmbiguousDispatchFailure(msg.id, orgId, 'HTTP_503');
    const reclaimed = await messages.claimProviderDispatch(msg.id, orgId);
    expect(reclaimed.outcome).toBe('claimed');
    if (reclaimed.outcome !== 'claimed') return;

    expect(reclaimed.message.firstDispatchAttemptedAt!.toISOString()).toBe(firstAnchor.toISOString());
    expect(
      reclaimed.message.dispatchAttemptedAt!.getTime() - firstAnchor.getTime(),
    ).toBeLessThanOrEqual(SENT_DM_IDEMPOTENCY_WINDOW_MS);
  });

  it('G: two concurrent PENDING claims → one winner, stable single first anchor', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-g-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    const [a, b] = await Promise.all([
      messages.claimProviderDispatch(msg.id, orgId),
      messages.claimProviderDispatch(msg.id, orgId),
    ]);

    const outcomes = [a.outcome, b.outcome].sort();
    expect(outcomes).toEqual(['claimed', 'held_by_peer']);

    const row = await prisma.smsMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(row.firstDispatchAttemptedAt).not.toBeNull();
    expect(row.dispatchAttemptedAt).not.toBeNull();
    expect(row.firstDispatchAttemptedAt!.toISOString()).toBe(row.dispatchAttemptedAt!.toISOString());
  });

  it('H: QUEUED / SENT / DELIVERED / FAILED → not reclaimable', async () => {
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
      SmsMessageDeliveryStatus.FAILED,
    ]) {
      const providerMessageId = status === SmsMessageDeliveryStatus.FAILED
        ? null
        : `prov-h-${status}-${Date.now()}`;
      const row = await prisma.smsMessage.create({
        data: {
          organizationId: orgId,
          conversationId: convo.id,
          direction: 'outgoing',
          senderType: 'system',
          content: status,
          providerMessageId,
          businessOperationId: `biz-h-${status}-${Date.now()}`,
          status,
          firstDispatchAttemptedAt: new Date(),
        },
      });

      const claim = await messages.claimProviderDispatch(row.id, orgId);
      expect(claim.outcome).toBe('not_claimable');
    }
  });

  it('rejects DISPATCH_AMBIGUOUS without first anchor (conservative reconciliation)', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-missing-anchor-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    await prisma.smsMessage.update({
      where: { id: msg.id },
      data: {
        status: SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS,
        dispatchAttemptedAt: new Date(),
        firstDispatchAttemptedAt: null,
      },
    });

    const claim = await messages.claimProviderDispatch(msg.id, orgId);
    expect(claim.outcome).toBe('not_claimable');
  });

  it('fresh DISPATCHING → second claim rejected', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-peer-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    expect((await messages.claimProviderDispatch(msg.id, orgId)).outcome).toBe('claimed');
    expect((await messages.claimProviderDispatch(msg.id, orgId)).outcome).toBe('held_by_peer');
  });

  it('recovered ambiguous dispatch → acceptance preserves both timestamps', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-accept-${Date.now()}`);
    if (!msg) throw new Error('message missing');

    const first = await messages.claimProviderDispatch(msg.id, orgId);
    expect(first.outcome).toBe('claimed');
    if (first.outcome !== 'claimed') return;
    const firstAnchor = first.message.firstDispatchAttemptedAt!;
    const leaseAt = first.message.dispatchAttemptedAt!;

    await messages.recordAmbiguousDispatchFailure(msg.id, orgId, 'HTTP_504');
    await messages.claimProviderDispatch(msg.id, orgId);

    const accepted = await messages.recordProviderAcceptance({
      messageId: msg.id,
      organizationId: orgId,
      providerMessageId: `prov-accept-${Date.now()}`,
      providerStatus: 'QUEUED',
      acceptedAt: new Date(),
    });

    expect(accepted.status).toBe(SmsMessageDeliveryStatus.QUEUED);
    expect(accepted.firstDispatchAttemptedAt!.toISOString()).toBe(firstAnchor.toISOString());
    expect(accepted.dispatchAttemptedAt!.getTime()).toBeGreaterThanOrEqual(leaseAt.getTime());
  });

  it('recordProviderAcceptance rejects non-DISPATCHING states', async () => {
    if (!schemaReady) return;
    const msg = await createOutbound(`biz-accept-reject-${Date.now()}`);
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
