import { Test } from '@nestjs/testing';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationReplyContentType,
  CommunicationReplySendState,
  Prisma,
  PrismaClient,
  WhatsAppTemplateCategory,
  WhatsAppTemplateProviderStatus,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationEventRepository } from '../communication-event.repository';
import { CommunicationHumanTakeoverService } from '../write/communication-human-takeover.service';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { CommunicationAttachmentService } from '../media/communication-attachment.service';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import { CommunicationReplyChannelCapabilityService } from './communication-reply-channel-capability.service';
import { CommunicationReplyService } from './communication-reply.service';
import { SmsCommunicationOutboundAdapter } from './adapters/sms-communication-outbound.adapter';
import { WhatsAppCommunicationOutboundAdapter } from './adapters/whatsapp-communication-outbound.adapter';
import { WhatsAppProviderService } from '@modules/whatsapp/providers/whatsapp-provider.service';
import { CommunicationReplyError } from './communication-reply.errors';
import type { CommunicationOutboundSendResult } from './ports/communication-outbound-channel.port';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('Communication template reply postgres (C9.1)', () => {
  let prisma: PrismaClient;
  let service: CommunicationReplyService;
  let whatsappSendTemplate: jest.Mock;
  let orgA: string;
  let orgB: string;
  let operatorA: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    whatsappSendTemplate = jest.fn();

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
          useValue: { putObject: jest.fn(), getObject: jest.fn(), getObjectStream: jest.fn() },
        },
        SmsCommunicationOutboundAdapter,
        {
          provide: WhatsAppCommunicationOutboundAdapter,
          useValue: {
            channel: CommunicationChannel.WHATSAPP,
            sendTextReply: jest.fn(),
            sendMediaReply: jest.fn(),
            sendTemplateReply: (...args: unknown[]) => whatsappSendTemplate(...args),
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
    whatsappSendTemplate.mockReset();
    whatsappSendTemplate.mockResolvedValue({
      sendState: CommunicationReplySendState.ACCEPTED,
      nativeMessageId: 'wa-template-msg-1',
      canonicalEventId: null,
    } satisfies CommunicationOutboundSendResult);

    const ts = Date.now();
    const org = await prisma.organization.create({
      data: { companyName: `Tpl Org A ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgA = org.id;
    const orgOther = await prisma.organization.create({
      data: { companyName: `Tpl Org B ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgB = orgOther.id;

    const user = await prisma.user.create({
      data: {
        email: `tpl-op-${ts}@example.com`,
        name: 'Template Operator',
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
    operatorA = user.id;
  });

  afterEach(async () => {
    for (const orgId of [orgA, orgB]) {
      if (!orgId) continue;
      await prisma.communicationReplyCommand.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationEvent.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.whatsAppMessage.deleteMany({ where: { organizationId: orgId } });
      await prisma.whatsAppConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.whatsAppTemplate.deleteMany({ where: { organizationId: orgId } });
      await prisma.orgWhatsAppConfig.deleteMany({ where: { organizationId: orgId } });
    }
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgA } });
    await prisma.user.deleteMany({ where: { email: { contains: 'tpl-op-' } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedApprovedTemplate(
    organizationId: string,
    input?: {
      name?: string;
      variableSchema?: Record<string, unknown>;
      providerStatus?: WhatsAppTemplateProviderStatus;
    },
  ) {
    return prisma.whatsAppTemplate.create({
      data: {
        organizationId,
        name: input?.name ?? `hello_${Date.now()}`,
        language: 'de',
        category: WhatsAppTemplateCategory.BOOKING_CONFIRMATION,
        bodyTemplate: input?.variableSchema
          ? 'Hallo {{name}}, Ihre Buchung ist bestätigt.'
          : 'Hallo, Ihre Buchung ist bestätigt.',
        ...(input?.variableSchema
          ? { variableSchema: input.variableSchema as Prisma.InputJsonValue }
          : {}),
        providerStatus: input?.providerStatus ?? WhatsAppTemplateProviderStatus.APPROVED,
        providerTemplateId: 'meta-tpl-1',
      },
    });
  }

  async function seedWhatsAppConversation() {
    const waConvo = await prisma.whatsAppConversation.create({
      data: {
        organizationId: orgA,
        contactPhone: '+491701234567',
        contactPhoneNormalized: '491701234567',
        status: 'OPEN',
        lastCustomerMessageAt: new Date(),
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
        status: CommunicationConversationStatus.HUMAN_ACTIVE,
        assignedUserId: operatorA,
        lastActivityAt: new Date(),
      },
    });
    return { canonical, waConvo };
  }

  function templatePayload(templateId: string, idempotencyKey: string, variables?: Record<string, string>) {
    return {
      contentType: CommunicationReplyContentType.TEMPLATE,
      templateId,
      templateVariables: variables,
      idempotencyKey,
    };
  }

  it('deduplicates same key + same template with one provider dispatch', async () => {
    const { canonical } = await seedWhatsAppConversation();
    const template = await seedApprovedTemplate(orgA);
    const payload = templatePayload(template.id, 'tpl-key-same', { name: 'Max' });

    await service.replyConversation(orgA, canonical.id, { userId: operatorA }, payload);
    await service.replyConversation(orgA, canonical.id, { userId: operatorA }, payload);

    expect(whatsappSendTemplate).toHaveBeenCalledTimes(1);
    const commands = await prisma.communicationReplyCommand.findMany({
      where: { organizationId: orgA, conversationId: canonical.id },
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]?.contentType).toBe(CommunicationReplyContentType.TEMPLATE);
  });

  it('rejects same key with different template as IDEMPOTENCY_CONFLICT', async () => {
    const { canonical } = await seedWhatsAppConversation();
    const templateA = await seedApprovedTemplate(orgA, { name: 'tpl_a' });
    const templateB = await seedApprovedTemplate(orgA, { name: 'tpl_b' });

    await service.replyConversation(
      orgA,
      canonical.id,
      { userId: operatorA },
      templatePayload(templateA.id, 'tpl-key-diff-template'),
    );

    await expect(
      service.replyConversation(
        orgA,
        canonical.id,
        { userId: operatorA },
        templatePayload(templateB.id, 'tpl-key-diff-template'),
      ),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });

    expect(whatsappSendTemplate).toHaveBeenCalledTimes(1);
  });

  it('rejects same key with different template variables as IDEMPOTENCY_CONFLICT', async () => {
    const { canonical } = await seedWhatsAppConversation();
    const template = await seedApprovedTemplate(orgA, {
      name: 'tpl_vars',
      variableSchema: { name: { required: true } },
    });

    await service.replyConversation(
      orgA,
      canonical.id,
      { userId: operatorA },
      templatePayload(template.id, 'tpl-key-diff-vars', { name: 'Anna' }),
    );

    await expect(
      service.replyConversation(
        orgA,
        canonical.id,
        { userId: operatorA },
        templatePayload(template.id, 'tpl-key-diff-vars', { name: 'Ben' }),
      ),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });

    expect(whatsappSendTemplate).toHaveBeenCalledTimes(1);
  });

  it('deduplicates parallel same-key template requests with one provider call', async () => {
    const { canonical } = await seedWhatsAppConversation();
    const template = await seedApprovedTemplate(orgA);
    let resolveSend!: (value: CommunicationOutboundSendResult) => void;
    const sendPromise = new Promise<CommunicationOutboundSendResult>((resolve) => {
      resolveSend = resolve;
    });
    whatsappSendTemplate.mockReturnValue(sendPromise);

    const payload = templatePayload(template.id, 'tpl-key-parallel');
    const p1 = service.replyConversation(orgA, canonical.id, { userId: operatorA }, payload);
    const p2 = service.replyConversation(orgA, canonical.id, { userId: operatorA }, payload);

    resolveSend({
      sendState: CommunicationReplySendState.ACCEPTED,
      nativeMessageId: 'wa-template-msg-parallel',
      canonicalEventId: null,
    });

    await Promise.allSettled([p1, p2]);
    expect(whatsappSendTemplate).toHaveBeenCalledTimes(1);
  });

  it('persists UNKNOWN when template dispatch is ambiguous', async () => {
    const { canonical } = await seedWhatsAppConversation();
    const template = await seedApprovedTemplate(orgA);
    whatsappSendTemplate.mockRejectedValueOnce(CommunicationReplyError.sendUnknown());

    await expect(
      service.replyConversation(
        orgA,
        canonical.id,
        { userId: operatorA },
        templatePayload(template.id, 'tpl-key-unknown'),
      ),
    ).rejects.toMatchObject({ response: { code: 'SEND_UNKNOWN' } });

    const command = await prisma.communicationReplyCommand.findFirst({
      where: { organizationId: orgA, clientIdempotencyKey: 'tpl-key-unknown' },
    });
    expect(command?.sendState).toBe(CommunicationReplySendState.UNKNOWN);
    expect(whatsappSendTemplate).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-org template id', async () => {
    const { canonical } = await seedWhatsAppConversation();
    const foreignTemplate = await seedApprovedTemplate(orgB, { name: 'foreign_tpl' });

    await expect(
      service.replyConversation(
        orgA,
        canonical.id,
        { userId: operatorA },
        templatePayload(foreignTemplate.id, 'tpl-key-cross-org'),
      ),
    ).rejects.toMatchObject({ response: { code: 'TEMPLATE_NOT_FOUND' } });

    expect(whatsappSendTemplate).not.toHaveBeenCalled();
  });

  it('rejects non-approved template status', async () => {
    const { canonical } = await seedWhatsAppConversation();
    const template = await seedApprovedTemplate(orgA, {
      name: 'rejected_tpl',
      providerStatus: WhatsAppTemplateProviderStatus.REJECTED,
    });

    await expect(
      service.replyConversation(
        orgA,
        canonical.id,
        { userId: operatorA },
        templatePayload(template.id, 'tpl-key-rejected'),
      ),
    ).rejects.toMatchObject({ response: { code: 'TEMPLATE_NOT_APPROVED' } });

    expect(whatsappSendTemplate).not.toHaveBeenCalled();
  });

  it('rejects missing required template variables before provider dispatch', async () => {
    const { canonical } = await seedWhatsAppConversation();
    const template = await seedApprovedTemplate(orgA, {
      name: 'needs_vars',
      variableSchema: { name: { required: true } },
    });

    await expect(
      service.replyConversation(
        orgA,
        canonical.id,
        { userId: operatorA },
        templatePayload(template.id, 'tpl-key-missing-vars', {}),
      ),
    ).rejects.toMatchObject({ response: { code: 'TEMPLATE_VARIABLES_INVALID' } });

    expect(whatsappSendTemplate).not.toHaveBeenCalled();
  });
});
