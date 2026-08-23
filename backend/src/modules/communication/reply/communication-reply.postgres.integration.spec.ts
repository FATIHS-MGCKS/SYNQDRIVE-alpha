import { Test } from '@nestjs/testing';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationReplySendState,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { CommunicationReplyChannelCapabilityService } from './communication-reply-channel-capability.service';
import { CommunicationReplyService } from './communication-reply.service';
import { SmsCommunicationOutboundAdapter } from './adapters/sms-communication-outbound.adapter';
import { WhatsAppCommunicationOutboundAdapter } from './adapters/whatsapp-communication-outbound.adapter';
import { WhatsAppProviderService } from '@modules/whatsapp/providers/whatsapp-provider.service';
import { CommunicationReplyError } from './communication-reply.errors';
import type { CommunicationOutboundSendResult } from './ports/communication-outbound-channel.port';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('Communication reply postgres', () => {
  let prisma: PrismaClient;
  let service: CommunicationReplyService;
  let whatsappSend: jest.Mock;
  let orgA: string;
  let operatorA: string;
  let operatorB: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    whatsappSend = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        CommunicationReadRepository,
        {
          provide: CommunicationWriteScopeService,
          useValue: { assertConversationMutable: jest.fn().mockResolvedValue(undefined) },
        },
        CommunicationReplyChannelCapabilityService,
        CommunicationReplyService,
        SmsCommunicationOutboundAdapter,
        {
          provide: WhatsAppCommunicationOutboundAdapter,
          useValue: {
            channel: CommunicationChannel.WHATSAPP,
            sendTextReply: (...args: unknown[]) => whatsappSend(...args),
          },
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
        {
          provide: WhatsAppProviderService,
          useValue: { isConfigured: jest.fn().mockReturnValue(true) },
        },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    service = moduleRef.get(CommunicationReplyService);
  });

  beforeEach(async () => {
    whatsappSend.mockReset();
    whatsappSend.mockResolvedValue({
      sendState: CommunicationReplySendState.ACCEPTED,
      nativeMessageId: 'wa-msg-1',
      canonicalEventId: null,
    } satisfies CommunicationOutboundSendResult);

    const ts = Date.now();
    const org = await prisma.organization.create({
      data: { companyName: `Reply Org ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgA = org.id;

    const mkUser = async (suffix: string) => {
      const user = await prisma.user.create({
        data: {
          email: `reply-${suffix}-${ts}@example.com`,
          name: `Reply ${suffix}`,
          status: 'ACTIVE',
        },
      });
      await prisma.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: orgA,
          role: 'WORKER',
          status: 'ACTIVE',
          permissions: { communication: { read: true, write: true, manage: false } },
        },
      });
      return user.id;
    };

    operatorA = await mkUser('a');
    operatorB = await mkUser('b');
  });

  afterEach(async () => {
    await prisma.communicationReplyCommand.deleteMany({ where: { organizationId: orgA } });
    await prisma.communicationEvent.deleteMany({ where: { organizationId: orgA } });
    await prisma.communicationConversation.deleteMany({ where: { organizationId: orgA } });
    await prisma.whatsAppMessage.deleteMany({ where: { organizationId: orgA } });
    await prisma.whatsAppConversation.deleteMany({ where: { organizationId: orgA } });
    await prisma.smsConversation.deleteMany({ where: { organizationId: orgA } });
    await prisma.voiceConversation.deleteMany({ where: { organizationId: orgA } });
    await prisma.orgWhatsAppConfig.deleteMany({ where: { organizationId: orgA } });
    await prisma.orgSmsConfig.deleteMany({ where: { organizationId: orgA } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgA } });
    await prisma.user.deleteMany({ where: { email: { contains: `reply-` } } });
    await prisma.organization.deleteMany({ where: { id: orgA } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedWhatsAppConversation(input?: {
    status?: CommunicationConversationStatus;
    assignedUserId?: string | null;
  }) {
    const waConvo = await prisma.whatsAppConversation.create({
      data: {
        organizationId: orgA,
        contactPhone: '+491701234567',
        contactPhoneNormalized: '491701234567',
        status: 'OPEN',
      },
    });
    await prisma.orgWhatsAppConfig.create({
      data: {
        organizationId: orgA,
        isActive: true,
        isConnected: true,
        accessTokenConfigured: true,
        phoneNumberId: 'phone-1',
        providerStatus: 'CONFIGURED',
      },
    });
    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: waConvo.id,
        status: input?.status ?? CommunicationConversationStatus.HUMAN_ACTIVE,
        assignedUserId: input?.assignedUserId ?? operatorA,
        lastActivityAt: new Date(),
      },
    });
    return { canonical, waConvo };
  }

  async function seedSmsConversation(input?: {
    status?: CommunicationConversationStatus;
    assignedUserId?: string | null;
  }) {
    const smsConvo = await prisma.smsConversation.create({
      data: {
        organizationId: orgA,
        contactPhone: '+491709876543',
        contactPhoneNormalized: '491709876543',
        status: 'OPEN',
      },
    });
    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.SMS,
        nativeConversationId: smsConvo.id,
        status: input?.status ?? CommunicationConversationStatus.HUMAN_REQUIRED,
        assignedUserId: input?.assignedUserId ?? undefined,
        lastActivityAt: new Date(),
      },
    });
    return { canonical, smsConvo };
  }

  async function seedVoiceConversation() {
    const voiceConvo = await prisma.voiceConversation.create({
      data: {
        organizationId: orgA,
        callerNumber: '+491701111111',
        status: 'COMPLETED',
      },
    });
    return prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.VOICE,
        nativeConversationId: voiceConvo.id,
        status: CommunicationConversationStatus.HUMAN_REQUIRED,
        lastActivityAt: new Date(),
      },
    });
  }

  it('deduplicates parallel same-key requests with one provider call', async () => {
    const { canonical } = await seedWhatsAppConversation();
    let resolveSend!: (value: CommunicationOutboundSendResult) => void;
    const sendPromise = new Promise<CommunicationOutboundSendResult>((resolve) => {
      resolveSend = resolve;
    });
    whatsappSend.mockReturnValue(sendPromise);

    const payload = { text: 'Hello', idempotencyKey: 'key-parallel-1' };
    const p1 = service.replyConversation(orgA, canonical.id, { userId: operatorA }, payload);
    const p2 = service.replyConversation(orgA, canonical.id, { userId: operatorA }, payload);

    resolveSend({
      sendState: CommunicationReplySendState.ACCEPTED,
      nativeMessageId: 'wa-msg-1',
      canonicalEventId: null,
    });

    const [r1, r2] = await Promise.allSettled([p1, p2]);
    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
    const rejected = [r1, r2].filter((r) => r.status === 'rejected');
    expect(fulfilled.length + rejected.length).toBe(2);
    expect(whatsappSend).toHaveBeenCalledTimes(1);

    const commands = await prisma.communicationReplyCommand.findMany({
      where: { organizationId: orgA, conversationId: canonical.id },
    });
    expect(commands).toHaveLength(1);
  });

  it('rejects same key with different text', async () => {
    const { canonical } = await seedWhatsAppConversation();
    await service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
      text: 'First',
      idempotencyKey: 'key-conflict',
    });

    await expect(
      service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
        text: 'Second',
        idempotencyKey: 'key-conflict',
      }),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });

    expect(whatsappSend).toHaveBeenCalledTimes(1);
  });

  it('SMS reply does not mutate ownership before CHANNEL_NOT_CONFIGURED', async () => {
    const { canonical } = await seedSmsConversation({ assignedUserId: null });

    await expect(
      service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
        text: 'SMS hello',
        idempotencyKey: 'sms-key-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'CHANNEL_NOT_CONFIGURED' } });

    const refreshed = await prisma.communicationConversation.findUnique({ where: { id: canonical.id } });
    expect(refreshed?.status).toBe(CommunicationConversationStatus.HUMAN_REQUIRED);
    expect(refreshed?.assignedUserId).toBeNull();

    const commands = await prisma.communicationReplyCommand.count({
      where: { organizationId: orgA, conversationId: canonical.id },
    });
    expect(commands).toBe(0);
    expect(whatsappSend).not.toHaveBeenCalled();
  });

  it('Voice reply rejects without ownership mutation or command', async () => {
    const canonical = await seedVoiceConversation();

    await expect(
      service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
        text: 'Voice hello',
        idempotencyKey: 'voice-key-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'CHANNEL_NOT_REPLYABLE' } });

    const refreshed = await prisma.communicationConversation.findUnique({ where: { id: canonical.id } });
    expect(refreshed?.status).toBe(CommunicationConversationStatus.HUMAN_REQUIRED);
    expect(refreshed?.assignedUserId).toBeNull();

    const commands = await prisma.communicationReplyCommand.count({
      where: { organizationId: orgA, conversationId: canonical.id },
    });
    expect(commands).toBe(0);
  });

  it('FAILED replay throws same canonical failure class', async () => {
    const { canonical } = await seedWhatsAppConversation();
    whatsappSend.mockRejectedValueOnce(CommunicationReplyError.sendFailed());

    await expect(
      service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
        text: 'Fail me',
        idempotencyKey: 'key-failed-replay',
      }),
    ).rejects.toMatchObject({ response: { code: 'SEND_FAILED' } });

    await expect(
      service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
        text: 'Fail me',
        idempotencyKey: 'key-failed-replay',
      }),
    ).rejects.toMatchObject({ response: { code: 'SEND_FAILED' } });

    expect(whatsappSend).toHaveBeenCalledTimes(1);
  });

  it('UNKNOWN ambiguous failure persists UNKNOWN not FAILED', async () => {
    const { canonical } = await seedWhatsAppConversation();
    whatsappSend.mockRejectedValueOnce(CommunicationReplyError.sendUnknown());

    await expect(
      service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
        text: 'Ambiguous',
        idempotencyKey: 'key-unknown',
      }),
    ).rejects.toMatchObject({ response: { code: 'SEND_UNKNOWN' } });

    const command = await prisma.communicationReplyCommand.findFirst({
      where: {
        organizationId: orgA,
        conversationId: canonical.id,
        clientIdempotencyKey: 'key-unknown',
      },
    });
    expect(command?.sendState).toBe(CommunicationReplySendState.UNKNOWN);
    expect(command?.sendState).not.toBe(CommunicationReplySendState.FAILED);
  });

  it('reconciles ACCEPTED after provider success when command still PENDING', async () => {
    const { canonical, waConvo } = await seedWhatsAppConversation();
    const nativeMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'outgoing',
        senderType: 'human',
        content: 'Recovered',
        messageType: 'text',
        status: 'SENT',
        idempotencyKey: `comm-reply:${orgA}:${canonical.id}:key-recover`,
      },
    });

    await prisma.communicationReplyCommand.create({
      data: {
        organizationId: orgA,
        conversationId: canonical.id,
        clientIdempotencyKey: 'key-recover',
        text: 'Recovered',
        channel: CommunicationChannel.WHATSAPP,
        sendState: CommunicationReplySendState.PENDING,
        actorUserId: operatorA,
        nativeMessageId: nativeMessage.id,
      },
    });

    const response = await service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
      text: 'Recovered',
      idempotencyKey: 'key-recover',
    });

    expect(response.sendState).toBe('ACCEPTED');
    expect(whatsappSend).not.toHaveBeenCalled();

    const command = await prisma.communicationReplyCommand.findFirst({
      where: { organizationId: orgA, clientIdempotencyKey: 'key-recover' },
    });
    expect(command?.sendState).toBe(CommunicationReplySendState.ACCEPTED);
    expect(command?.nativeMessageId).toBe(nativeMessage.id);
  });

  it('claim+send race allows exactly one winner', async () => {
    const { canonical } = await seedWhatsAppConversation({
      status: CommunicationConversationStatus.HUMAN_REQUIRED,
      assignedUserId: null,
    });

    const results = await Promise.allSettled([
      service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
        text: 'Race A',
        idempotencyKey: 'race-a',
      }),
      service.replyConversation(orgA, canonical.id, { userId: operatorB }, {
        text: 'Race B',
        idempotencyKey: 'race-b',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(whatsappSend).toHaveBeenCalledTimes(1);

    const final = await prisma.communicationConversation.findUnique({ where: { id: canonical.id } });
    expect(final?.assignedUserId).toBeTruthy();
    expect([operatorA, operatorB]).toContain(final?.assignedUserId);
  });
});
