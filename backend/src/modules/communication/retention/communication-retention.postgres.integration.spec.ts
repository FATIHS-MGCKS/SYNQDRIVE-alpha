import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import {
  CommunicationAttachmentMediaType,
  CommunicationAttachmentState,
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationEventType,
  CommunicationMessageContentType,
  CommunicationReplyContentType,
  CommunicationReplySendState,
  PrismaClient,
  WhatsAppConversationStatus,
} from '@prisma/client';
import communicationRetentionConfig from '@config/communication-retention.config';
import voiceRetentionConfig from '@config/voice-retention.config';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisDistributedLockService } from '@shared/redis/redis-distributed-lock.service';
import { createDocumentStoragePortMock } from '@modules/documents/storage/testing/document-storage-port.mock';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import { VoiceRetentionService } from '@modules/voice-assistant/security/voice-retention.service';
import { CommunicationRetentionService } from './communication-retention.service';
import { CommunicationRetentionMetrics } from './communication-retention.metrics';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationReadService } from '../read/communication-read.service';
import { CommunicationAttachmentService } from '../media/communication-attachment.service';
import { CommunicationAttachmentError } from '../media/communication-attachment.errors';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { COMMUNICATION_RETENTION_SKIP_REASON } from './communication-retention.constants';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('Communication retention postgres (C13.1)', () => {
  let prisma: PrismaClient;
  let retention: CommunicationRetentionService;
  let readService: CommunicationReadService;
  let attachmentService: CommunicationAttachmentService;
  let storageMock: ReturnType<typeof createDocumentStoragePortMock>;
  let orgA = '';
  let orgB = '';

  const frozenNow = new Date('2026-08-23T12:00:00.000Z');

  async function createModule() {
    storageMock = createDocumentStoragePortMock();
    const lockMock = {
      acquire: jest.fn().mockResolvedValue({
        acquired: true,
        handle: { key: 'test-lock', token: 'token', acquiredAt: new Date() },
      }),
      release: jest.fn().mockResolvedValue(true),
      extend: jest.fn().mockResolvedValue(true),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [communicationRetentionConfig, voiceRetentionConfig],
        }),
      ],
      providers: [
        PrismaService,
        VoiceRetentionService,
        CommunicationRetentionMetrics,
        CommunicationRetentionService,
        CommunicationReadRepository,
        CommunicationAttachmentService,
        {
          provide: CommunicationWriteScopeService,
          useValue: { assertConversationReadable: jest.fn(), assertConversationMutable: jest.fn() },
        },
        { provide: DOCUMENTS_STORAGE, useValue: storageMock },
        { provide: RedisDistributedLockService, useValue: lockMock },
        CommunicationReadService,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    retention = moduleRef.get(CommunicationRetentionService);
    readService = moduleRef.get(CommunicationReadService);
    attachmentService = moduleRef.get(CommunicationAttachmentService);
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
  });

  beforeEach(async () => {
    process.env.COMMUNICATION_RETENTION_ENABLED = 'true';
    process.env.COMMUNICATION_RETENTION_DRY_RUN = 'false';
    process.env.COMMUNICATION_RETENTION_MESSAGE_CONTENT_DAYS = '30';
    process.env.COMMUNICATION_RETENTION_ATTACHMENT_DAYS = '30';
    process.env.COMMUNICATION_RETENTION_REPLY_COMMAND_SETTLED_DAYS = '30';
    process.env.COMMUNICATION_RETENTION_BATCH_SIZE = '2';
    process.env.VOICE_RETENTION_ENABLED = 'true';

    await createModule();

    const ts = Date.now();
    orgA = (
      await prisma.organization.create({
        data: { companyName: `C131 A ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
      })
    ).id;
    orgB = (
      await prisma.organization.create({
        data: { companyName: `C131 B ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
      })
    ).id;
  });

  afterEach(async () => {
    for (const orgId of [orgA, orgB].filter(Boolean)) {
      await prisma.communicationRetentionPurgeRun.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationReplyCommand.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationAttachment.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationMessageContent.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationEvent.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.whatsAppMessage.deleteMany({ where: { organizationId: orgId } });
      await prisma.whatsAppConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.voiceProviderWebhookEvent.deleteMany({ where: { organizationId: orgId } });
      await prisma.voiceConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.voiceAgentDeployment.deleteMany({ where: { organizationId: orgId } });
      await prisma.voiceAssistant.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
    delete process.env.COMMUNICATION_RETENTION_ENABLED;
    delete process.env.COMMUNICATION_RETENTION_DRY_RUN;
    delete process.env.COMMUNICATION_RETENTION_MESSAGE_CONTENT_DAYS;
    delete process.env.COMMUNICATION_RETENTION_ATTACHMENT_DAYS;
    delete process.env.COMMUNICATION_RETENTION_REPLY_COMMAND_SETTLED_DAYS;
    delete process.env.COMMUNICATION_RETENTION_BATCH_SIZE;
    delete process.env.VOICE_RETENTION_ENABLED;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedResolvedWhatsAppConversation(
    organizationId: string,
    input: {
      messageText: string;
      occurredAt: Date;
      status?: CommunicationConversationStatus;
      nativeContent?: string;
    },
  ) {
    const waConv = await prisma.whatsAppConversation.create({
      data: {
        organizationId,
        contactPhone: `+4915${Math.floor(Math.random() * 1e8)}`,
        contactPhoneNormalized: `4915${Math.floor(Math.random() * 1e8)}`,
        status: WhatsAppConversationStatus.OPEN,
      },
    });
    const waMsg = await prisma.whatsAppMessage.create({
      data: {
        organizationId,
        conversationId: waConv.id,
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        content: input.nativeContent ?? input.messageText,
        createdAt: input.occurredAt,
      },
    });
    const conv = await prisma.communicationConversation.create({
      data: {
        organizationId,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: waConv.id,
        status: input.status ?? CommunicationConversationStatus.RESOLVED,
        lastActivityAt: input.occurredAt,
      },
    });
    const event = await prisma.communicationEvent.create({
      data: {
        organizationId,
        conversationId: conv.id,
        channel: CommunicationChannel.WHATSAPP,
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt: input.occurredAt,
        idempotencyKey: `evt-${waMsg.id}`,
      },
    });
    const content = await prisma.communicationMessageContent.create({
      data: {
        organizationId,
        conversationId: conv.id,
        communicationEventId: event.id,
        channel: CommunicationChannel.WHATSAPP,
        direction: 'INBOUND',
        nativeMessageId: waMsg.id,
        contentType: CommunicationMessageContentType.TEXT,
        text: input.messageText,
        occurredAt: input.occurredAt,
        idempotencyKey: `content-${waMsg.id}`,
      },
    });
    return { conv, event, content, waMsg, waConv };
  }

  async function seedLegacyNativeOnly(
    organizationId: string,
    input: { content: string; occurredAt: Date },
  ) {
    const waConv = await prisma.whatsAppConversation.create({
      data: {
        organizationId,
        contactPhone: `+4915${Math.floor(Math.random() * 1e8)}`,
        contactPhoneNormalized: `4915${Math.floor(Math.random() * 1e8)}`,
        status: WhatsAppConversationStatus.OPEN,
      },
    });
    const waMsg = await prisma.whatsAppMessage.create({
      data: {
        organizationId,
        conversationId: waConv.id,
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        content: input.content,
        createdAt: input.occurredAt,
      },
    });
    return { waConv, waMsg };
  }

  it('does not purge Org B when purging Org A (tenant isolation)', async () => {
    const oldDate = new Date('2026-06-01T10:00:00.000Z');
    const seedA = await seedResolvedWhatsAppConversation(orgA, {
      messageText: 'Org A secret',
      occurredAt: oldDate,
      nativeContent: 'Org A native secret',
    });
    const seedB = await seedResolvedWhatsAppConversation(orgB, {
      messageText: 'Org B secret',
      occurredAt: oldDate,
      nativeContent: 'Org B native secret',
    });

    await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });

    const contentA = await prisma.communicationMessageContent.findUnique({ where: { id: seedA.content.id } });
    const contentB = await prisma.communicationMessageContent.findUnique({ where: { id: seedB.content.id } });
    expect(contentA?.text).toBeNull();
    expect(contentA?.contentPurgedAt).not.toBeNull();
    expect(contentB?.text).toBe('Org B secret');
    expect(contentB?.contentPurgedAt).toBeNull();
  });

  it('does not purge content before retention threshold', async () => {
    const recent = new Date('2026-08-10T10:00:00.000Z');
    const seed = await seedResolvedWhatsAppConversation(orgA, {
      messageText: 'Recent message',
      occurredAt: recent,
    });

    await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });

    const content = await prisma.communicationMessageContent.findUnique({ where: { id: seed.content.id } });
    expect(content?.text).toBe('Recent message');
  });

  it('skips active conversation canonical and native WhatsApp content until resolved', async () => {
    const oldDate = new Date('2026-06-01T10:00:00.000Z');
    const seed = await seedResolvedWhatsAppConversation(orgA, {
      messageText: 'Active secret',
      occurredAt: oldDate,
      nativeContent: 'Active native secret',
      status: CommunicationConversationStatus.HUMAN_REQUIRED,
    });

    const report = await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });
    const content = await prisma.communicationMessageContent.findUnique({ where: { id: seed.content.id } });
    const waMsg = await prisma.whatsAppMessage.findUnique({ where: { id: seed.waMsg.id } });

    expect(content?.text).toBe('Active secret');
    expect(waMsg?.content).toBe('Active native secret');
    expect(report.phases.find((p) => p.phase === 'message_content')?.affected).toBe(0);

    await prisma.communicationConversation.update({
      where: { id: seed.conv.id },
      data: { status: CommunicationConversationStatus.RESOLVED },
    });
    await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });

    const contentAfter = await prisma.communicationMessageContent.findUnique({ where: { id: seed.content.id } });
    const waMsgAfter = await prisma.whatsAppMessage.findUnique({ where: { id: seed.waMsg.id } });
    expect(contentAfter?.text).toBeNull();
    expect(contentAfter?.contentPurgedAt).not.toBeNull();
    expect(waMsgAfter?.content).toBe('');
    expect(waMsgAfter?.contentPurgedAt).not.toBeNull();
  });

  it('redacts canonical message content while timeline remains loadable', async () => {
    const oldDate = new Date('2026-06-01T10:00:00.000Z');
    const seed = await seedResolvedWhatsAppConversation(orgA, {
      messageText: 'PII body text',
      occurredAt: oldDate,
    });

    await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });

    const events = await readService.listConversationEvents(orgA, seed.conv.id, {});
    expect(events.items).toHaveLength(1);
    expect(events.items[0].content?.text).toBeNull();
    expect(events.items[0].content?.contentAvailability).toBe('PURGED');
    expect(JSON.stringify(events)).not.toContain('PII body text');
  });

  it('purges correlated canonical and native WhatsApp bodies from one message-content policy', async () => {
    const oldDate = new Date('2026-06-01T10:00:00.000Z');
    const seed = await seedResolvedWhatsAppConversation(orgA, {
      messageText: 'Canonical only',
      occurredAt: oldDate,
      nativeContent: 'Native duplicate body',
    });

    await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });

    const waMsg = await prisma.whatsAppMessage.findUnique({ where: { id: seed.waMsg.id } });
    expect(waMsg?.content).toBe('');
    expect(waMsg?.contentPurgedAt).not.toBeNull();
  });

  it('purges expired voice transcript while call metadata remains', async () => {
    const call = await prisma.voiceConversation.create({
      data: {
        organizationId: orgA,
        transcript: 'Customer said hello',
        summary: 'Brief greeting',
        startedAt: new Date('2026-05-01T10:00:00.000Z'),
      },
    });
    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.VOICE,
        nativeConversationId: call.id,
        status: CommunicationConversationStatus.RESOLVED,
        lastActivityAt: new Date('2026-05-01T10:00:00.000Z'),
      },
    });

    await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });

    const refreshed = await prisma.voiceConversation.findUnique({ where: { id: call.id } });
    expect(refreshed?.transcript).toBeNull();
    expect(refreshed?.summary).toBeNull();
    expect(refreshed?.id).toBe(call.id);

    const detail = await readService.getConversation(orgA, canonical.id);
    expect(detail.id).toBe(canonical.id);
  });

  it('retains UNKNOWN reply commands and redacts settled commands after threshold', async () => {
    const conv = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'native-unknown-test',
        status: CommunicationConversationStatus.RESOLVED,
      },
    });
    const oldDate = new Date('2026-05-01T10:00:00.000Z');
    const unknown = await prisma.communicationReplyCommand.create({
      data: {
        organizationId: orgA,
        conversationId: conv.id,
        clientIdempotencyKey: 'unknown-1',
        text: 'unknown payload',
        channel: CommunicationChannel.WHATSAPP,
        sendState: CommunicationReplySendState.UNKNOWN,
        actorUserId: 'user-1',
        createdAt: oldDate,
      },
    });
    const settled = await prisma.communicationReplyCommand.create({
      data: {
        organizationId: orgA,
        conversationId: conv.id,
        clientIdempotencyKey: 'accepted-1',
        text: 'settled payload',
        templateVariables: { name: 'Alice' },
        contentType: CommunicationReplyContentType.TEMPLATE,
        channel: CommunicationChannel.WHATSAPP,
        sendState: CommunicationReplySendState.ACCEPTED,
        actorUserId: 'user-1',
        createdAt: oldDate,
      },
    });

    await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });

    const unknownAfter = await prisma.communicationReplyCommand.findUnique({ where: { id: unknown.id } });
    const settledAfter = await prisma.communicationReplyCommand.findUnique({ where: { id: settled.id } });
    expect(unknownAfter?.text).toBe('unknown payload');
    expect(unknownAfter?.contentPurgedAt).toBeNull();
    expect(settledAfter?.text).toBe('');
    expect(settledAfter?.templateVariables).toBeNull();
    expect(settledAfter?.contentPurgedAt).not.toBeNull();
  });

  it('deletes attachment binary once and marks metadata PURGED; storage failure does not mark purged', async () => {
    const conv = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'attach-native',
        status: CommunicationConversationStatus.RESOLVED,
      },
    });
    const oldDate = new Date('2026-05-01T10:00:00.000Z');
    const attachment = await prisma.communicationAttachment.create({
      data: {
        organizationId: orgA,
        conversationId: conv.id,
        mediaType: CommunicationAttachmentMediaType.IMAGE,
        state: CommunicationAttachmentState.READY,
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        contentHash: 'abc',
        objectKey: 'org-a/photo.jpg',
        storageProvider: 'test',
        createdAt: oldDate,
      },
    });

    await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });
    expect(storageMock.deleteObject).toHaveBeenCalledWith('org-a/photo.jpg');

    const purged = await prisma.communicationAttachment.findUnique({ where: { id: attachment.id } });
    expect(purged?.state).toBe(CommunicationAttachmentState.PURGED);
    expect(purged?.purgedAt).not.toBeNull();

    await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });
    expect(storageMock.deleteObject).toHaveBeenCalledTimes(1);

    const failingStorage = createDocumentStoragePortMock({
      deleteObject: jest.fn().mockRejectedValue(new Error('storage down')),
    });
    const failModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [communicationRetentionConfig, voiceRetentionConfig],
        }),
      ],
      providers: [
        PrismaService,
        VoiceRetentionService,
        CommunicationRetentionMetrics,
        CommunicationRetentionService,
        {
          provide: RedisDistributedLockService,
          useValue: {
            acquire: jest.fn().mockResolvedValue({ acquired: true, handle: { key: 'k', token: 't', acquiredAt: new Date() } }),
            release: jest.fn().mockResolvedValue(true),
          },
        },
        { provide: DOCUMENTS_STORAGE, useValue: failingStorage },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    const failRetention = failModule.get(CommunicationRetentionService);
    const failAttachment = await prisma.communicationAttachment.create({
      data: {
        organizationId: orgA,
        conversationId: conv.id,
        mediaType: CommunicationAttachmentMediaType.DOCUMENT,
        state: CommunicationAttachmentState.READY,
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 200,
        contentHash: 'def',
        objectKey: 'org-a/doc.pdf',
        storageProvider: 'test',
        createdAt: oldDate,
      },
    });
    const failReport = await failRetention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });
    const failRow = await prisma.communicationAttachment.findUnique({ where: { id: failAttachment.id } });
    expect(failRow?.state).toBe(CommunicationAttachmentState.READY);
    expect(failReport.phases.find((p) => p.phase === 'attachment_binary')?.failed).toBeGreaterThan(0);
  });

  it('processes eligible rows in bounded batches across runs', async () => {
    const oldDate = new Date('2026-05-01T10:00:00.000Z');
    for (let i = 0; i < 3; i += 1) {
      await seedResolvedWhatsAppConversation(orgA, {
        messageText: `Message ${i}`,
        occurredAt: new Date(oldDate.getTime() + i * 1000),
      });
    }

    const first = await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });
    const msgPhaseFirst = first.phases.find((p) => p.phase === 'message_content');
    expect(msgPhaseFirst?.affected).toBe(2);

    const second = await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });
    const msgPhaseSecond = second.phases.find((p) => p.phase === 'message_content');
    expect(msgPhaseSecond?.affected).toBe(1);

    const remaining = await prisma.communicationMessageContent.count({
      where: { organizationId: orgA, text: { not: null } },
    });
    expect(remaining).toBe(0);
  });

  it('rolls back canonical purge when correlated native WhatsApp update fails', async () => {
    const oldDate = new Date('2026-06-01T10:00:00.000Z');
    const seed = await seedResolvedWhatsAppConversation(orgA, {
      messageText: 'Rollback body',
      occurredAt: oldDate,
      nativeContent: 'Rollback native',
    });

    const originalTransaction = prisma.$transaction.bind(prisma);
    const transactionSpy = jest.spyOn(prisma, '$transaction').mockImplementation(async (fn) => {
      return originalTransaction(async (tx) => {
        const proxied = new Proxy(tx, {
          get(target, prop, receiver) {
            if (prop === 'whatsAppMessage') {
              return new Proxy(target.whatsAppMessage, {
                get(inner, method) {
                  if (method === 'updateMany') {
                    return () => Promise.reject(new Error('native update failed'));
                  }
                  return Reflect.get(inner, method, inner);
                },
              });
            }
            return Reflect.get(target, prop, receiver);
          },
        });
        return fn(proxied as typeof tx);
      });
    });

    const report = await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });
    transactionSpy.mockRestore();

    const content = await prisma.communicationMessageContent.findUnique({ where: { id: seed.content.id } });
    const waMsg = await prisma.whatsAppMessage.findUnique({ where: { id: seed.waMsg.id } });
    expect(content?.text).toBe('Rollback body');
    expect(content?.contentPurgedAt).toBeNull();
    expect(waMsg?.content).toBe('Rollback native');
    expect(report.phases.find((p) => p.phase === 'message_content')?.failed).toBe(1);
  });

  it('reports UNKNOWN and PENDING reply command skip reasons separately', async () => {
    const conv = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'reply-report-native',
        status: CommunicationConversationStatus.RESOLVED,
      },
    });
    const oldDate = new Date('2026-05-01T10:00:00.000Z');
    await prisma.communicationReplyCommand.createMany({
      data: [
        {
          organizationId: orgA,
          conversationId: conv.id,
          clientIdempotencyKey: 'unknown-report',
          text: 'unknown',
          channel: CommunicationChannel.WHATSAPP,
          sendState: CommunicationReplySendState.UNKNOWN,
          actorUserId: 'user-1',
          createdAt: oldDate,
        },
        {
          organizationId: orgA,
          conversationId: conv.id,
          clientIdempotencyKey: 'pending-report',
          text: 'pending',
          channel: CommunicationChannel.WHATSAPP,
          sendState: CommunicationReplySendState.PENDING,
          actorUserId: 'user-1',
          createdAt: oldDate,
        },
      ],
    });

    const report = await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: true });
    const phase = report.phases.find((p) => p.phase === 'reply_command_content');
    expect(phase?.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.UNKNOWN_SEND_STATE]).toBe(1);
    expect(phase?.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.PENDING_SEND_STATE]).toBe(1);
  });

  it('voice dry-run candidate counts honor per-org VoiceRetentionService policy', async () => {
    const voiceAssistantA = await prisma.voiceAssistant.create({
      data: { organizationId: orgA, name: 'VA A' },
    });
    await prisma.voiceAgentDeployment.create({
      data: {
        organizationId: orgA,
        voiceAssistantId: voiceAssistantA.id,
        provider: 'ELEVENLABS',
        status: 'ACTIVE',
        activatedVersion: 1,
        configSnapshot: {
          privacyRetention: { retentionTranscriptDays: 30, retentionSummaryDays: 30, retentionProviderPayloadDays: 30 },
        },
      },
    });
    const voiceAssistantB = await prisma.voiceAssistant.create({
      data: { organizationId: orgB, name: 'VA B' },
    });
    await prisma.voiceAgentDeployment.create({
      data: {
        organizationId: orgB,
        voiceAssistantId: voiceAssistantB.id,
        provider: 'ELEVENLABS',
        status: 'ACTIVE',
        activatedVersion: 1,
        configSnapshot: {
          privacyRetention: { retentionTranscriptDays: 90, retentionSummaryDays: 90, retentionProviderPayloadDays: 30 },
        },
      },
    });

    const borderlineDate = new Date('2026-07-15T10:00:00.000Z');
    await prisma.voiceConversation.create({
      data: { organizationId: orgA, transcript: 'Org A transcript', startedAt: borderlineDate },
    });
    await prisma.voiceConversation.create({
      data: { organizationId: orgB, transcript: 'Org B transcript', startedAt: borderlineDate },
    });

    const reportA = await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: true });
    const reportB = await retention.runOnce({ organizationId: orgB, now: frozenNow, dryRun: true });
    const phaseA = reportA.phases.find((p) => p.phase === 'voice_delegated');
    const phaseB = reportB.phases.find((p) => p.phase === 'voice_delegated');
    expect(phaseA?.candidates).toBe(1);
    expect(phaseB?.candidates).toBe(0);
  });

  it('does not expose purged attachment via read/download path', async () => {
    const conv = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'attach-read-native',
        status: CommunicationConversationStatus.RESOLVED,
      },
    });
    const oldDate = new Date('2026-05-01T10:00:00.000Z');
    const attachment = await prisma.communicationAttachment.create({
      data: {
        organizationId: orgA,
        conversationId: conv.id,
        mediaType: CommunicationAttachmentMediaType.IMAGE,
        state: CommunicationAttachmentState.READY,
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        contentHash: 'abc',
        objectKey: 'org-a/read-photo.jpg',
        storageProvider: 'test',
        createdAt: oldDate,
      },
    });

    await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });
    await expect(
      attachmentService.streamAttachmentContent(orgA, attachment.id, 'user-1'),
    ).rejects.toMatchObject({ response: { code: 'ATTACHMENT_NOT_FOUND' } });
    expect(storageMock.getObjectStream).not.toHaveBeenCalled();
  });

  it('purges legacy native-only WhatsApp rows in bounded batches without loading full org history', async () => {
    const oldDate = new Date('2026-06-01T10:00:00.000Z');
    const recentDate = new Date('2026-08-10T10:00:00.000Z');
    const projected = await seedResolvedWhatsAppConversation(orgA, {
      messageText: 'Projected body',
      occurredAt: recentDate,
      nativeContent: 'Projected native',
    });

    const legacyMessages = [];
    for (let i = 0; i < 6; i += 1) {
      legacyMessages.push(
        await seedLegacyNativeOnly(orgA, {
          content: `Legacy secret ${i}`,
          occurredAt: new Date(oldDate.getTime() + i * 1000),
        }),
      );
    }

    const contentFindMany = jest.spyOn(prisma.communicationMessageContent, 'findMany');

    const report1 = await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });
    const legacyPhase1 = report1.phases.find((p) => p.phase === 'legacy_native_whatsapp_content');
    expect(legacyPhase1?.affected).toBeLessThanOrEqual(2);
    expect(legacyPhase1?.affected).toBeGreaterThan(0);

    const correlationCalls = contentFindMany.mock.calls
      .map((call) => {
        const where = call[0]?.where as { nativeMessageId?: { in?: string[] } } | undefined;
        return where?.nativeMessageId?.in;
      })
      .filter(Array.isArray);
    expect(correlationCalls.length).toBeGreaterThan(0);
    for (const ids of correlationCalls) {
      expect(ids.length).toBeLessThanOrEqual(10);
    }

    const projectedNative = await prisma.whatsAppMessage.findUnique({ where: { id: projected.waMsg.id } });
    expect(projectedNative?.content).toBe('Projected native');

    await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });

    const purgedLegacyCount = await prisma.whatsAppMessage.count({
      where: {
        organizationId: orgA,
        id: { in: legacyMessages.map((message) => message.waMsg.id) },
        contentPurgedAt: { not: null },
      },
    });
    expect(purgedLegacyCount).toBeGreaterThan(legacyPhase1?.affected ?? 0);

    contentFindMany.mockRestore();
  });

  it('dry run reports candidates without destructive writes', async () => {
    const oldDate = new Date('2026-05-01T10:00:00.000Z');
    const seed = await seedResolvedWhatsAppConversation(orgA, {
      messageText: 'Dry run body',
      occurredAt: oldDate,
    });

    const report = await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: true });
    const content = await prisma.communicationMessageContent.findUnique({ where: { id: seed.content.id } });
    expect(content?.text).toBe('Dry run body');
    const phase = report.phases.find((p) => p.phase === 'message_content');
    expect(phase?.candidates).toBe(1);
    expect(phase?.affected).toBe(0);
    expect(phase?.skipReasons[COMMUNICATION_RETENTION_SKIP_REASON.DRY_RUN]).toBe(1);
  });
});
