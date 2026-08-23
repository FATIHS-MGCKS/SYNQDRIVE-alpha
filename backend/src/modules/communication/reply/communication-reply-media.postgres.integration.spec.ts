import { Test } from '@nestjs/testing';
import {
  CommunicationAttachmentMediaType,
  CommunicationAttachmentState,
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationReplyContentType,
  CommunicationReplySendState,
  PrismaClient,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationEventRepository } from '../communication-event.repository';
import { CommunicationHumanTakeoverService } from '../write/communication-human-takeover.service';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { CommunicationAttachmentService } from '../media/communication-attachment.service';
import { CommunicationReplyChannelCapabilityService } from './communication-reply-channel-capability.service';
import { CommunicationReplyService } from './communication-reply.service';
import { SmsCommunicationOutboundAdapter } from './adapters/sms-communication-outbound.adapter';
import { WhatsAppCommunicationOutboundAdapter } from './adapters/whatsapp-communication-outbound.adapter';
import { WhatsAppProviderService } from '@modules/whatsapp/providers/whatsapp-provider.service';
import { CommunicationReplyError } from './communication-reply.errors';
import { buildReplyPayloadHash } from './communication-reply-payload';
import type { CommunicationOutboundSendResult } from './ports/communication-outbound-channel.port';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('Communication reply media postgres', () => {
  let prisma: PrismaClient;
  let service: CommunicationReplyService;
  let whatsappTextSend: jest.Mock;
  let whatsappMediaSend: jest.Mock;
  let orgA: string;
  let orgB: string;
  let operatorA: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    whatsappTextSend = jest.fn();
    whatsappMediaSend = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        CommunicationReadRepository,
        CommunicationEventRepository,
        CommunicationHumanTakeoverService,
        {
          provide: CommunicationWriteScopeService,
          useValue: { assertConversationMutable: jest.fn().mockResolvedValue(undefined) },
        },
        CommunicationReplyChannelCapabilityService,
        CommunicationReplyService,
        CommunicationAttachmentService,
        {
          provide: DOCUMENTS_STORAGE,
          useValue: {
            putObject: jest.fn().mockResolvedValue({
              objectKey: 'obj-key',
              mimeType: 'image/jpeg',
              sizeBytes: 128,
              storageProvider: 'test',
            }),
            getObject: jest.fn().mockResolvedValue(Buffer.from('jpeg')),
            getObjectStream: jest.fn(),
          },
        },
        SmsCommunicationOutboundAdapter,
        {
          provide: WhatsAppCommunicationOutboundAdapter,
          useValue: {
            channel: CommunicationChannel.WHATSAPP,
            sendTextReply: (...args: unknown[]) => whatsappTextSend(...args),
            sendMediaReply: (...args: unknown[]) => whatsappMediaSend(...args),
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
    whatsappTextSend.mockReset();
    whatsappMediaSend.mockReset();
    whatsappTextSend.mockResolvedValue({
      sendState: CommunicationReplySendState.ACCEPTED,
      nativeMessageId: 'wa-text-1',
      canonicalEventId: null,
    } satisfies CommunicationOutboundSendResult);
    whatsappMediaSend.mockResolvedValue({
      sendState: CommunicationReplySendState.ACCEPTED,
      nativeMessageId: 'wa-media-1',
      canonicalEventId: null,
    } satisfies CommunicationOutboundSendResult);

    const ts = Date.now();
    const org = await prisma.organization.create({
      data: { companyName: `Media Org A ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgA = org.id;
    const org2 = await prisma.organization.create({
      data: { companyName: `Media Org B ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgB = org2.id;

    const user = await prisma.user.create({
      data: { email: `media-op-${ts}@example.com`, name: 'Media Op', status: 'ACTIVE' },
    });
    operatorA = user.id;
    await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: orgA,
        role: 'WORKER',
        status: 'ACTIVE',
        permissions: { communication: { read: true, write: true, manage: false } },
      },
    });
  });

  afterEach(async () => {
    await prisma.communicationAttachment.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await prisma.communicationReplyCommand.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await prisma.communicationEvent.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await prisma.communicationConversation.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await prisma.whatsAppMessage.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await prisma.whatsAppConversation.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await prisma.orgWhatsAppConfig.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'media-op-' } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedWhatsAppConversation(orgId = orgA, phoneSuffix = '4567') {
    const normalized = `4917012${phoneSuffix}`;
    const waConvo = await prisma.whatsAppConversation.create({
      data: {
        organizationId: orgId,
        contactPhone: `+${normalized}`,
        contactPhoneNormalized: normalized,
        status: 'OPEN',
      },
    });
    await prisma.orgWhatsAppConfig.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        isActive: true,
        isConnected: true,
        accessTokenConfigured: true,
        phoneNumberId: 'phone-1',
        providerStatus: 'CONFIGURED',
      },
      update: {},
    });
    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: orgId,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: waConvo.id,
        status: CommunicationConversationStatus.HUMAN_ACTIVE,
        assignedUserId: operatorA,
        lastActivityAt: new Date(),
      },
    });
    return { canonical, waConvo };
  }

  async function seedAttachment(conversationId: string, orgId = orgA) {
    return prisma.communicationAttachment.create({
      data: {
        organizationId: orgId,
        conversationId,
        mediaType: CommunicationAttachmentMediaType.IMAGE,
        state: CommunicationAttachmentState.READY,
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 128,
        contentHash: 'abc123',
        objectKey: 'obj-key',
        storageProvider: 'test',
      },
    });
  }

  it('legacy null payloadHash same-text replay succeeds and backfills hash', async () => {
    const { canonical } = await seedWhatsAppConversation();
    const specialText = 'Hello "team"\nPath \\\\ test\nÄÖÜ 🚗';

    await prisma.communicationReplyCommand.create({
      data: {
        organizationId: orgA,
        conversationId: canonical.id,
        clientIdempotencyKey: 'legacy-key-1',
        text: specialText,
        contentType: CommunicationReplyContentType.TEXT,
        channel: CommunicationChannel.WHATSAPP,
        sendState: CommunicationReplySendState.ACCEPTED,
        actorUserId: operatorA,
        payloadHash: null,
      },
    });

    const response = await service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
      text: specialText,
      idempotencyKey: 'legacy-key-1',
    });

    expect(response.sendState).toBe('ACCEPTED');
    expect(whatsappTextSend).not.toHaveBeenCalled();

    const command = await prisma.communicationReplyCommand.findFirst({
      where: { organizationId: orgA, clientIdempotencyKey: 'legacy-key-1' },
    });
    expect(command?.payloadHash).toBe(
      buildReplyPayloadHash({
        contentType: CommunicationReplyContentType.TEXT,
        text: specialText,
        attachmentId: null,
      }),
    );
  });

  it('legacy null payloadHash different text conflicts', async () => {
    const { canonical } = await seedWhatsAppConversation();
    await prisma.communicationReplyCommand.create({
      data: {
        organizationId: orgA,
        conversationId: canonical.id,
        clientIdempotencyKey: 'legacy-conflict',
        text: 'Hello',
        contentType: CommunicationReplyContentType.TEXT,
        channel: CommunicationChannel.WHATSAPP,
        sendState: CommunicationReplySendState.ACCEPTED,
        actorUserId: operatorA,
        payloadHash: null,
      },
    });

    await expect(
      service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
        text: 'Different',
        idempotencyKey: 'legacy-conflict',
      }),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });

    expect(whatsappTextSend).not.toHaveBeenCalled();
  });

  it('same key + same IMAGE replays without second provider call', async () => {
    const { canonical } = await seedWhatsAppConversation();
    const attachment = await seedAttachment(canonical.id);
    const payload = {
      contentType: CommunicationReplyContentType.IMAGE,
      attachmentId: attachment.id,
      text: 'caption',
      idempotencyKey: 'media-same-key',
    };

    await service.replyConversation(orgA, canonical.id, { userId: operatorA }, payload);
    await service.replyConversation(orgA, canonical.id, { userId: operatorA }, payload);

    expect(whatsappMediaSend).toHaveBeenCalledTimes(1);
    const commands = await prisma.communicationReplyCommand.count({
      where: { organizationId: orgA, clientIdempotencyKey: 'media-same-key' },
    });
    expect(commands).toBe(1);
  });

  it('same key + different attachment conflicts', async () => {
    const { canonical } = await seedWhatsAppConversation();
    const attachmentA = await seedAttachment(canonical.id);
    const attachmentB = await seedAttachment(canonical.id);

    await service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
      contentType: CommunicationReplyContentType.IMAGE,
      attachmentId: attachmentA.id,
      idempotencyKey: 'media-att-conflict',
    });

    await expect(
      service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
        contentType: CommunicationReplyContentType.IMAGE,
        attachmentId: attachmentB.id,
        idempotencyKey: 'media-att-conflict',
      }),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });

    expect(whatsappMediaSend).toHaveBeenCalledTimes(1);
  });

  it('same key + different caption conflicts', async () => {
    const { canonical } = await seedWhatsAppConversation();
    const attachment = await seedAttachment(canonical.id);

    await service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
      contentType: CommunicationReplyContentType.IMAGE,
      attachmentId: attachment.id,
      text: 'cap-a',
      idempotencyKey: 'media-cap-conflict',
    });

    await expect(
      service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
        contentType: CommunicationReplyContentType.IMAGE,
        attachmentId: attachment.id,
        text: 'cap-b',
        idempotencyKey: 'media-cap-conflict',
      }),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });

    expect(whatsappMediaSend).toHaveBeenCalledTimes(1);
  });

  it('parallel same key + same attachment allows one provider call', async () => {
    const { canonical } = await seedWhatsAppConversation();
    const attachment = await seedAttachment(canonical.id);
    let resolveSend!: (value: CommunicationOutboundSendResult) => void;
    whatsappMediaSend.mockReturnValue(
      new Promise<CommunicationOutboundSendResult>((resolve) => {
        resolveSend = resolve;
      }),
    );

    const payload = {
      contentType: CommunicationReplyContentType.IMAGE,
      attachmentId: attachment.id,
      idempotencyKey: 'media-parallel',
    };
    const p1 = service.replyConversation(orgA, canonical.id, { userId: operatorA }, payload);
    const p2 = service.replyConversation(orgA, canonical.id, { userId: operatorA }, payload);

    resolveSend({
      sendState: CommunicationReplySendState.ACCEPTED,
      nativeMessageId: 'wa-media-parallel',
      canonicalEventId: null,
    });

    await Promise.allSettled([p1, p2]);
    expect(whatsappMediaSend).toHaveBeenCalledTimes(1);
    const commands = await prisma.communicationReplyCommand.count({
      where: { organizationId: orgA, clientIdempotencyKey: 'media-parallel' },
    });
    expect(commands).toBe(1);
  });

  it('two keys same attachment allows only one send owner', async () => {
    const { canonical } = await seedWhatsAppConversation();
    const attachment = await seedAttachment(canonical.id);

    await service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
      contentType: CommunicationReplyContentType.IMAGE,
      attachmentId: attachment.id,
      idempotencyKey: 'media-key-a',
    });

    await expect(
      service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
        contentType: CommunicationReplyContentType.IMAGE,
        attachmentId: attachment.id,
        idempotencyKey: 'media-key-b',
      }),
    ).rejects.toMatchObject({ response: { code: 'ATTACHMENT_NOT_ALLOWED' } });

    expect(whatsappMediaSend).toHaveBeenCalledTimes(1);
    const reserved = await prisma.communicationAttachment.findUnique({ where: { id: attachment.id } });
    expect(reserved?.reservedCommandId).toBeTruthy();
  });

  it('dispatch marker crash path returns SEND_UNKNOWN without redispatch', async () => {
    const { canonical, waConvo } = await seedWhatsAppConversation();
    const attachment = await seedAttachment(canonical.id);
    const nativeMessage = await prisma.whatsAppMessage.create({
      data: {
        organizationId: orgA,
        conversationId: waConvo.id,
        direction: 'outgoing',
        senderType: 'human',
        content: '',
        messageType: 'image',
        status: 'QUEUED',
        providerDispatchStartedAt: new Date(),
        mediaAttachmentId: attachment.id,
        idempotencyKey: `comm-reply:${orgA}:${canonical.id}:media-dispatch-crash`,
      },
    });

    await prisma.communicationReplyCommand.create({
      data: {
        organizationId: orgA,
        conversationId: canonical.id,
        clientIdempotencyKey: 'media-dispatch-crash',
        text: '',
        contentType: CommunicationReplyContentType.IMAGE,
        attachmentId: attachment.id,
        payloadHash: buildReplyPayloadHash({
          contentType: CommunicationReplyContentType.IMAGE,
          text: '',
          attachmentId: attachment.id,
        }),
        channel: CommunicationChannel.WHATSAPP,
        sendState: CommunicationReplySendState.PENDING,
        actorUserId: operatorA,
        nativeMessageId: nativeMessage.id,
      },
    });
    await prisma.communicationAttachment.update({
      where: { id: attachment.id },
      data: { reservedCommandId: (await prisma.communicationReplyCommand.findFirst({
        where: { clientIdempotencyKey: 'media-dispatch-crash', organizationId: orgA },
      }))!.id },
    });

    await expect(
      service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
        contentType: CommunicationReplyContentType.IMAGE,
        attachmentId: attachment.id,
        idempotencyKey: 'media-dispatch-crash',
      }),
    ).rejects.toMatchObject({ response: { code: 'SEND_UNKNOWN' } });

    expect(whatsappMediaSend).not.toHaveBeenCalled();
  });

  it('rejects cross-org attachment usage', async () => {
    const { canonical: convA } = await seedWhatsAppConversation(orgA);
    const { canonical: convB } = await seedWhatsAppConversation(orgB);
    const attachmentOnB = await seedAttachment(convB.id, orgB);

    await expect(
      service.replyConversation(orgA, convA.id, { userId: operatorA }, {
        contentType: CommunicationReplyContentType.IMAGE,
        attachmentId: attachmentOnB.id,
        idempotencyKey: 'cross-org-media',
      }),
    ).rejects.toMatchObject({ response: { code: 'ATTACHMENT_NOT_FOUND' } });

    expect(whatsappMediaSend).not.toHaveBeenCalled();
  });

  it('rejects attachment from another conversation in same org', async () => {
    const { canonical: convA } = await seedWhatsAppConversation(orgA, '4567');
    const { canonical: convB } = await seedWhatsAppConversation(orgA, '4568');
    const attachmentOnB = await seedAttachment(convB.id, orgA);

    await expect(
      service.replyConversation(orgA, convA.id, { userId: operatorA }, {
        contentType: CommunicationReplyContentType.IMAGE,
        attachmentId: attachmentOnB.id,
        idempotencyKey: 'cross-conv-media',
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });

    expect(whatsappMediaSend).not.toHaveBeenCalled();
  });

  it('legacy FAILED command same-key replay surfaces failure without provider call', async () => {
    const { canonical } = await seedWhatsAppConversation();
    await prisma.communicationReplyCommand.create({
      data: {
        organizationId: orgA,
        conversationId: canonical.id,
        clientIdempotencyKey: 'legacy-failed',
        text: 'Hello',
        contentType: CommunicationReplyContentType.TEXT,
        channel: CommunicationChannel.WHATSAPP,
        sendState: CommunicationReplySendState.FAILED,
        failureCode: 'SEND_FAILED',
        actorUserId: operatorA,
        payloadHash: null,
      },
    });

    await expect(
      service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
        text: 'Hello',
        idempotencyKey: 'legacy-failed',
      }),
    ).rejects.toMatchObject({ response: { code: 'SEND_FAILED' } });

    expect(whatsappTextSend).not.toHaveBeenCalled();
  });

  it('legacy PENDING command same-key replay returns SEND_UNKNOWN when lease active', async () => {
    const { canonical } = await seedWhatsAppConversation();
    await prisma.communicationReplyCommand.create({
      data: {
        organizationId: orgA,
        conversationId: canonical.id,
        clientIdempotencyKey: 'legacy-pending',
        text: 'Hello',
        contentType: CommunicationReplyContentType.TEXT,
        channel: CommunicationChannel.WHATSAPP,
        sendState: CommunicationReplySendState.PENDING,
        processingLeaseExpiresAt: new Date(Date.now() + 60_000),
        actorUserId: operatorA,
        payloadHash: null,
      },
    });

    await expect(
      service.replyConversation(orgA, canonical.id, { userId: operatorA }, {
        text: 'Hello',
        idempotencyKey: 'legacy-pending',
      }),
    ).rejects.toMatchObject({ response: { code: 'SEND_UNKNOWN' } });

    expect(whatsappTextSend).not.toHaveBeenCalled();
  });
});
