import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  CommunicationConversationStatus,
  WhatsAppTemplateCategory,
  WhatsAppTemplateProviderStatus,
} from '@prisma/client';
import { CommunicationContextLinkService } from '../context/communication-context-link.service';
import { CommunicationQuickActionExecutorService } from './communication-quick-action.executor';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationWriteService } from '../write/communication-write.service';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { WhatsAppMessagePolicyService } from '@modules/whatsapp/whatsapp-message-policy.service';
import { WhatsAppAiRouterService } from '@modules/whatsapp/whatsapp-ai-router.service';
import { WhatsAppAiContextService } from '@modules/whatsapp/whatsapp-ai-context.service';
import { WhatsAppAiToolsService } from '@modules/whatsapp/whatsapp-ai-tools.service';
import { BookingsService } from '@modules/bookings/bookings.service';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { TaskPermissionService } from '@modules/tasks/task-permission.service';
import { CommunicationReplyError } from '../reply/communication-reply.errors';

describe('CommunicationQuickActionExecutorService (C9.1 canonical)', () => {
  const orgId = 'org-1';
  const canonicalId = 'conv-canonical';
  const nativeId = 'wa-native';
  const actor = { userId: 'user-1', displayName: 'Operator' };

  const prisma = {
    whatsAppConversation: { findFirst: jest.fn(), update: jest.fn() },
    orgWhatsAppConfig: { findUnique: jest.fn() },
    whatsAppTemplate: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
  };
  const writeService = {
    resolveConversation: jest.fn(),
    reopenConversation: jest.fn(),
  };
  const readRepository = { findConversationById: jest.fn() };
  const policy = {
    canSendFreeText: jest.fn(),
    canSendTemplate: jest.fn(),
  };
  const aiRouter = { requestHumanReview: jest.fn() };
  const aiContext = { load: jest.fn() };
  const aiTools = {
    getPickupInstructions: jest.fn(),
    getReturnInstructions: jest.fn(),
  };
  const bookings = { findDetail: jest.fn() };
  const documentBundle = { getBundleView: jest.fn() };
  const tasks = { createManualTask: jest.fn() };
  const taskPermissions = { assert: jest.fn() };
  const contextLink = { linkVehicleFromBooking: jest.fn() };

  let service: CommunicationQuickActionExecutorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.whatsAppConversation.findFirst.mockResolvedValue({
      id: nativeId,
      organizationId: orgId,
      bookingId: 'booking-1',
      contactPhone: '+491701234567',
      contactName: 'Test',
      assignedTo: null,
      lastDetectedIntent: null,
      lastCustomerMessageAt: new Date(),
    });
    prisma.orgWhatsAppConfig.findUnique.mockResolvedValue({ isActive: true, isConnected: true });
    policy.canSendFreeText.mockReturnValue({ allowed: true });
    policy.canSendTemplate.mockReturnValue({ allowed: true });
    aiContext.load.mockResolvedValue({ booking: { id: 'booking-1' }, customer: { id: 'cust-1' } });
    taskPermissions.assert.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommunicationQuickActionExecutorService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunicationWriteService, useValue: writeService },
        { provide: CommunicationReadRepository, useValue: readRepository },
        { provide: WhatsAppMessagePolicyService, useValue: policy },
        { provide: WhatsAppAiRouterService, useValue: aiRouter },
        { provide: WhatsAppAiContextService, useValue: aiContext },
        { provide: WhatsAppAiToolsService, useValue: aiTools },
        { provide: BookingsService, useValue: bookings },
        { provide: BookingDocumentBundleService, useValue: documentBundle },
        { provide: TasksService, useValue: tasks },
        { provide: TaskPermissionService, useValue: taskPermissions },
        { provide: CommunicationContextLinkService, useValue: contextLink },
      ],
    }).compile();

    service = moduleRef.get(CommunicationQuickActionExecutorService);
  });

  it('send_pickup_instructions returns COMPOSER_PREFILL without provider send', async () => {
    aiTools.getPickupInstructions.mockResolvedValue({
      ok: true,
      summary: 'Pickup at Station A',
    });

    const result = await service.execute(orgId, canonicalId, nativeId, 'send_pickup_instructions', actor);

    expect(result).toMatchObject({
      actionType: 'COMPOSER_PREFILL',
      actionId: 'send_pickup_instructions',
      text: 'Pickup at Station A',
    });
    expect(aiTools.getPickupInstructions).toHaveBeenCalledTimes(1);
    expect(tasks.createManualTask).not.toHaveBeenCalled();
  });

  it('send_return_instructions returns COMPOSER_PREFILL without provider send', async () => {
    aiTools.getReturnInstructions.mockResolvedValue({
      ok: true,
      summary: 'Return at Station B',
    });

    const result = await service.execute(orgId, canonicalId, nativeId, 'send_return_instructions', actor);

    expect(result.actionType).toBe('COMPOSER_PREFILL');
    expect(result.text).toBe('Return at Station B');
  });

  it('rejects composer prefill outside messaging window with TEMPLATE_REQUIRED', async () => {
    policy.canSendFreeText.mockReturnValue({ allowed: false, reason: 'Use template' });
    aiTools.getPickupInstructions.mockResolvedValue({ ok: true, summary: 'Pickup text' });

    await expect(
      service.execute(orgId, canonicalId, nativeId, 'send_pickup_instructions', actor),
    ).rejects.toMatchObject({ response: { code: 'TEMPLATE_REQUIRED' } });
  });

  it('reminder action prefers TEMPLATE_PREFILL when approved template exists', async () => {
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({
      id: 'tpl-1',
      language: 'de',
      bodyTemplate: 'Hello {{name}}',
      providerStatus: WhatsAppTemplateProviderStatus.APPROVED,
    });
    bookings.findDetail.mockResolvedValue({
      core: { bookingNumber: 'B-1' },
      finance: { depositStatus: 'REQUESTED', paymentStatus: 'OPEN' },
    });

    const result = await service.execute(
      orgId,
      canonicalId,
      nativeId,
      'send_payment_deposit_reminder',
      actor,
    );

    expect(result.actionType).toBe('TEMPLATE_PREFILL');
    expect(result.template?.templateId).toBe('tpl-1');
    expect(bookings.findDetail).toHaveBeenCalled();
  });

  it('close_conversation uses canonical resolve authority', async () => {
    writeService.resolveConversation.mockResolvedValue({
      conversation: { id: canonicalId, status: CommunicationConversationStatus.RESOLVED },
    });

    const result = await service.execute(orgId, canonicalId, nativeId, 'close_conversation', actor);

    expect(writeService.resolveConversation).toHaveBeenCalledWith(orgId, canonicalId, actor);
    expect(result.actionType).toBe('CONVERSATION_MUTATION');
    expect(result.conversation?.status).toBe(CommunicationConversationStatus.RESOLVED);
  });

  it('reopen_conversation uses canonical reopen authority', async () => {
    writeService.reopenConversation.mockResolvedValue({
      conversation: { id: canonicalId, status: CommunicationConversationStatus.HUMAN_REQUIRED },
    });

    const result = await service.execute(orgId, canonicalId, nativeId, 'reopen_conversation', actor);

    expect(writeService.reopenConversation).toHaveBeenCalledWith(orgId, canonicalId, actor);
    expect(result.actionType).toBe('CONVERSATION_MUTATION');
  });

  it('create_task requires tasks.create permission', async () => {
    taskPermissions.assert.mockRejectedValue(new ForbiddenException('Missing permission'));

    await expect(
      service.execute(orgId, canonicalId, nativeId, 'create_task', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tasks.createManualTask).not.toHaveBeenCalled();
  });

  it('create_task creates one task when permitted', async () => {
    tasks.createManualTask.mockResolvedValue({ id: 'task-1' });

    const result = await service.execute(orgId, canonicalId, nativeId, 'create_task', actor);

    expect(tasks.createManualTask).toHaveBeenCalledTimes(1);
    expect(result.taskId).toBe('task-1');
  });

  it('human_review delegates to ai router handoff projection path', async () => {
    aiRouter.requestHumanReview.mockResolvedValue({ ok: true });
    readRepository.findConversationById.mockResolvedValue({
      id: canonicalId,
      status: CommunicationConversationStatus.HUMAN_REQUIRED,
      channel: 'WHATSAPP',
      unreadCount: 1,
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      organizationId: orgId,
      nativeConversationId: nativeId,
      customer: null,
      booking: null,
      vehicle: null,
      station: null,
      assignedUser: null,
      assignedAgentRef: null,
      assignedAgentType: null,
      lastMessagePreview: null,
    });

    const result = await service.execute(orgId, canonicalId, nativeId, 'human_review', actor);

    expect(aiRouter.requestHumanReview).toHaveBeenCalledWith(
      orgId,
      nativeId,
      expect.any(String),
      actor.userId,
      true,
    );
    expect(result.actionType).toBe('HANDOFF');
  });

  it('rejects deferred assign_user action', async () => {
    await expect(
      service.execute(orgId, canonicalId, nativeId, 'assign_user', actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('link_vehicle uses canonical context link authority', async () => {
    contextLink.linkVehicleFromBooking.mockResolvedValue({
      vehicleId: 'vehicle-1',
      changed: true,
      conversation: { id: canonicalId, vehicleId: 'vehicle-1' },
    });

    const result = await service.execute(orgId, canonicalId, nativeId, 'link_vehicle', actor);

    expect(contextLink.linkVehicleFromBooking).toHaveBeenCalledWith({
      organizationId: orgId,
      canonicalConversationId: canonicalId,
      nativeConversationId: nativeId,
      actorUserId: actor.userId,
    });
    expect(result).toMatchObject({
      actionType: 'BUSINESS_MUTATION',
      actionId: 'link_vehicle',
      vehicleId: 'vehicle-1',
      changed: true,
      conversation: { id: canonicalId, vehicleId: 'vehicle-1' },
    });
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
  });
});
