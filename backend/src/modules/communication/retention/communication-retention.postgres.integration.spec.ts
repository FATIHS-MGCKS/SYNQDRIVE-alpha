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
import { PrismaService } from '@shared/database/prisma.service';
import { createDocumentStoragePortMock } from '@modules/documents/storage/testing/document-storage-port.mock';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import { VoiceRetentionService } from '@modules/voice-assistant/security/voice-retention.service';
import { CommunicationRetentionService } from './communication-retention.service';
import { CommunicationRetentionMetrics } from './communication-retention.metrics';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationReadService } from '../read/communication-read.service';
import { CommunicationAttachmentService } from '../media/communication-attachment.service';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { COMMUNICATION_RETENTION_SKIP_REASON } from './communication-retention.constants';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('Communication retention postgres (C13.1)', () => {
  let prisma: PrismaClient;
  let retention: CommunicationRetentionService;
  let readService: CommunicationReadService;
  let storageMock: ReturnType<typeof createDocumentStoragePortMock>;
  let orgA = '';
  let orgB = '';

  const frozenNow = new Date('2026-08-23T12:00:00.000Z');

  async function createModule() {
    storageMock = createDocumentStoragePortMock();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [communicationRetentionConfig] })],
      providers: [
        PrismaService,
        VoiceRetentionService,
        CommunicationRetentionMetrics,
        CommunicationRetentionService,
        CommunicationReadRepository,
        CommunicationAttachmentService,
        {
          provide: CommunicationWriteScopeService,
          useValue: { assertConversationReadable: jest.fn() },
        },
        { provide: DOCUMENTS_STORAGE, useValue: storageMock },
        CommunicationReadService,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    retention = moduleRef.get(CommunicationRetentionService);
    readService = moduleRef.get(CommunicationReadService);
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
  });

  beforeEach(async () => {
    process.env.COMMUNICATION_RETENTION_ENABLED = 'true';
    process.env.COMMUNICATION_RETENTION_DRY_RUN = 'false';
    process.env.COMMUNICATION_RETENTION_MESSAGE_CONTENT_DAYS = '30';
    process.env.COMMUNICATION_RETENTION_NATIVE_WHATSAPP_CONTENT_DAYS = '30';
    process.env.COMMUNICATION_RETENTION_ATTACHMENT_DAYS = '30';
    process.env.COMMUNICATION_RETENTION_REPLY_COMMAND_SETTLED_DAYS = '30';
    process.env.COMMUNICATION_RETENTION_BATCH_SIZE = '2';

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
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
    delete process.env.COMMUNICATION_RETENTION_ENABLED;
    delete process.env.COMMUNICATION_RETENTION_DRY_RUN;
    delete process.env.COMMUNICATION_RETENTION_MESSAGE_CONTENT_DAYS;
    delete process.env.COMMUNICATION_RETENTION_NATIVE_WHATSAPP_CONTENT_DAYS;
    delete process.env.COMMUNICATION_RETENTION_ATTACHMENT_DAYS;
    delete process.env.COMMUNICATION_RETENTION_REPLY_COMMAND_SETTLED_DAYS;
    delete process.env.COMMUNICATION_RETENTION_BATCH_SIZE;
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

  it('skips active conversation content even when message age exceeds threshold', async () => {
    const oldDate = new Date('2026-06-01T10:00:00.000Z');
    const seed = await seedResolvedWhatsAppConversation(orgA, {
      messageText: 'Active secret',
      occurredAt: oldDate,
      status: CommunicationConversationStatus.HUMAN_REQUIRED,
    });

    const report = await retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false });
    const content = await prisma.communicationMessageContent.findUnique({ where: { id: seed.content.id } });

    expect(content?.text).toBe('Active secret');
    const phase = report.phases.find((p) => p.phase === 'message_content');
    expect(phase?.affected).toBe(0);
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

  it('purges native WhatsApp content in parity with canonical purge phase', async () => {
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
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [communicationRetentionConfig] })],
      providers: [
        PrismaService,
        VoiceRetentionService,
        CommunicationRetentionMetrics,
        CommunicationRetentionService,
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

  it('overlapping runs are idempotent-safe via in-process guard', async () => {
    const oldDate = new Date('2026-05-01T10:00:00.000Z');
    await seedResolvedWhatsAppConversation(orgA, {
      messageText: 'Concurrent test',
      occurredAt: oldDate,
    });

    const [first, second] = await Promise.all([
      retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false }),
      retention.runOnce({ organizationId: orgA, now: frozenNow, dryRun: false }),
    ]);

    const totalAffected =
      first.totals.affected
      + second.totals.affected;
    expect(totalAffected).toBeGreaterThanOrEqual(1);

    const purgedCount = await prisma.communicationMessageContent.count({
      where: { organizationId: orgA, contentPurgedAt: { not: null } },
    });
    expect(purgedCount).toBe(1);
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
