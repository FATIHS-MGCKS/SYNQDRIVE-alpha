import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WhatsAppConversationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity, TaskPriority, TaskType } from '@prisma/client';
import { TasksService } from '@modules/tasks/tasks.service';
import { whatsappConversationTaskDedupKey } from '@modules/tasks/automation/task-automation-rule.util';
import { WhatsAppAiRouterService } from './whatsapp-ai-router.service';
import { WhatsAppAiToolsService } from './whatsapp-ai-tools.service';
import { WhatsAppAiContextService } from './whatsapp-ai-context.service';
import { WhatsAppBookingReminderService } from './whatsapp-booking-reminder.service';
import { WhatsAppService } from './whatsapp.service';
import type { WhatsAppQuickActionId } from './whatsapp-conversation-context.types';

export type TaskCategoryFromConversation =
  | 'CUSTOMER_COMMUNICATION'
  | 'DAMAGE'
  | 'DOCUMENT'
  | 'PAYMENT'
  | 'BOOKING'
  | 'VEHICLE';

@Injectable()
export class WhatsAppQuickActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    private readonly reminders: WhatsAppBookingReminderService,
    private readonly tasks: TasksService,
    private readonly aiRouter: WhatsAppAiRouterService,
    private readonly aiContext: WhatsAppAiContextService,
    private readonly aiTools: WhatsAppAiToolsService,
    private readonly audit: AuditService,
  ) {}

  async execute(
    orgId: string,
    conversationId: string,
    actionId: WhatsAppQuickActionId,
    body: {
      bookingId?: string;
      customerId?: string;
      assignedUserId?: string;
      taskCategory?: TaskCategoryFromConversation;
      taskTitle?: string;
      reason?: string;
      userId?: string;
    } = {},
  ) {
    switch (actionId) {
      case 'link_booking':
        if (!body.bookingId) throw new BadRequestException('bookingId is required');
        return this.linkBooking(orgId, conversationId, body.bookingId);
      case 'link_customer':
        if (!body.customerId) throw new BadRequestException('customerId is required');
        return this.linkCustomer(orgId, conversationId, body.customerId);
      case 'link_vehicle':
        return this.linkVehicleFromBooking(orgId, conversationId);
      case 'human_review':
        return this.aiRouter.requestHumanReview(
          orgId,
          conversationId,
          body.reason ?? 'Marked for human review from WhatsApp Operations Center',
          body.userId,
          true,
        );
      case 'assign_user':
        if (!body.assignedUserId) throw new BadRequestException('assignedUserId is required');
        return this.assignConversation(orgId, conversationId, body.assignedUserId);
      case 'create_task':
        return this.createTaskFromConversation(orgId, conversationId, body);
      case 'request_missing_documents':
        return this.requestMissingDocuments(orgId, conversationId);
      case 'send_pickup_instructions':
        return this.sendPickupInstructions(orgId, conversationId);
      case 'send_return_instructions':
        return this.sendReturnInstructions(orgId, conversationId);
      case 'send_handover_link':
        return this.sendHandoverLink(orgId, conversationId);
      case 'send_return_link':
        return this.sendReturnLink(orgId, conversationId);
      case 'send_payment_deposit_reminder':
        return this.sendPaymentReminder(orgId, conversationId);
      case 'create_damage_followup_task':
        return this.createDamageFollowupTask(orgId, conversationId, body.userId);
      case 'close_conversation':
        return this.setConversationStatus(orgId, conversationId, WhatsAppConversationStatus.CLOSED);
      case 'reopen_conversation':
        return this.setConversationStatus(orgId, conversationId, WhatsAppConversationStatus.OPEN);
      default:
        throw new BadRequestException(`Unknown action: ${actionId}`);
    }
  }

  async linkBooking(orgId: string, conversationId: string, bookingId: string) {
    const convo = await this.requireConversation(orgId, conversationId);
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: { id: true, customerId: true, vehicleId: true, customer: { select: { firstName: true, lastName: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found in this organization');

    const updated = await this.prisma.whatsAppConversation.update({
      where: { id: convo.id },
      data: {
        bookingId: booking.id,
        customerId: booking.customerId,
        vehicleId: booking.vehicleId,
        status: WhatsAppConversationStatus.OPEN,
        contactName:
          convo.contactName ??
          ([booking.customer?.firstName, booking.customer?.lastName].filter(Boolean).join(' ') || null),
      },
    });

    void this.audit.record({
      actorOrganizationId: orgId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.INTEGRATION,
      entityId: conversationId,
      description: `Linked WhatsApp conversation to booking ${bookingId}`,
    });

    return { ok: true, conversationId: updated.id, bookingId: updated.bookingId };
  }

  async linkCustomer(orgId: string, conversationId: string, customerId: string) {
    const convo = await this.requireConversation(orgId, conversationId);
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    if (!customer) throw new NotFoundException('Customer not found in this organization');

    const updated = await this.prisma.whatsAppConversation.update({
      where: { id: convo.id },
      data: {
        customerId: customer.id,
        contactName:
          [customer.firstName, customer.lastName].filter(Boolean).join(' ') || convo.contactName,
        status:
          convo.status === WhatsAppConversationStatus.PENDING_HUMAN
            ? WhatsAppConversationStatus.OPEN
            : convo.status,
      },
    });

    return { ok: true, conversationId: updated.id, customerId: updated.customerId };
  }

  async linkVehicleFromBooking(orgId: string, conversationId: string) {
    const convo = await this.requireConversation(orgId, conversationId);
    if (!convo.bookingId) throw new BadRequestException('No booking linked');

    const booking = await this.prisma.booking.findFirst({
      where: { id: convo.bookingId, organizationId: orgId },
      select: { vehicleId: true },
    });
    if (!booking?.vehicleId) throw new BadRequestException('Booking has no vehicle');

    const updated = await this.prisma.whatsAppConversation.update({
      where: { id: convo.id },
      data: { vehicleId: booking.vehicleId },
    });

    return { ok: true, conversationId: updated.id, vehicleId: updated.vehicleId };
  }

  async assignConversation(orgId: string, conversationId: string, assignedUserId: string) {
    await this.requireConversation(orgId, conversationId);
    const updated = await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { assignedTo: assignedUserId },
    });
    return { ok: true, conversationId: updated.id, assignedTo: updated.assignedTo };
  }

  async createTaskFromConversation(
    orgId: string,
    conversationId: string,
    body: {
      taskCategory?: TaskCategoryFromConversation;
      taskTitle?: string;
      reason?: string;
      userId?: string;
    },
  ) {
    const convo = await this.requireConversation(orgId, conversationId);
    const ctx = await this.aiContext.load(orgId, convo);

    const category = body.taskCategory ?? 'CUSTOMER_COMMUNICATION';
    const type = mapCategoryToTaskType(category);
    const priority = inferPriority(convo.lastDetectedIntent);

    const task = await this.tasks.createManualTask(
      orgId,
      {
        title: body.taskTitle ?? `WhatsApp: ${convo.contactName ?? convo.contactPhone}`,
        description: body.reason ?? `Follow-up from WhatsApp conversation ${conversationId}`,
        category: category.toLowerCase(),
        type,
        sourceType: 'SYSTEM',
        source: 'WHATSAPP',
        priority,
        customerId: ctx.customer?.id,
        bookingId: ctx.booking?.id,
        vehicleId: ctx.vehicle?.id,
        assignedUserId: convo.assignedTo ?? undefined,
        dedupKey: whatsappConversationTaskDedupKey(conversationId, category),
        metadata: { whatsappConversationId: conversationId },
      },
      body.userId,
    );

    return { ok: true, taskId: (task as { id: string }).id };
  }

  async createDamageFollowupTask(orgId: string, conversationId: string, userId?: string) {
    return this.createTaskFromConversation(orgId, conversationId, {
      taskCategory: 'DAMAGE',
      taskTitle: 'WhatsApp damage follow-up',
      reason: 'Damage follow-up requested from WhatsApp Operations Center',
      userId,
    });
  }

  private async requestMissingDocuments(orgId: string, conversationId: string) {
    const convo = await this.requireConversation(orgId, conversationId);
    if (!convo.bookingId) throw new BadRequestException('No booking linked');
    return this.reminders.sendMissingDocumentsReminderWhatsApp(orgId, convo.bookingId);
  }

  private async sendPickupInstructions(orgId: string, conversationId: string) {
    const convo = await this.requireConversation(orgId, conversationId);
    const ctx = await this.aiContext.load(orgId, convo);
    const result = await this.aiTools.getPickupInstructions(orgId, ctx);
    if (!result.ok || !result.summary) {
      throw new BadRequestException(result.summary ?? 'Pickup instructions unavailable');
    }
    const msg = await this.whatsapp.sendMessage(orgId, conversationId, result.summary, 'SynqDrive');
    return { ok: true, message: msg };
  }

  private async sendReturnInstructions(orgId: string, conversationId: string) {
    const convo = await this.requireConversation(orgId, conversationId);
    const ctx = await this.aiContext.load(orgId, convo);
    const result = await this.aiTools.getReturnInstructions(orgId, ctx);
    if (!result.ok || !result.summary) {
      throw new BadRequestException(result.summary ?? 'Return instructions unavailable');
    }
    const msg = await this.whatsapp.sendMessage(orgId, conversationId, result.summary, 'SynqDrive');
    return { ok: true, message: msg };
  }

  private async sendHandoverLink(orgId: string, conversationId: string) {
    const convo = await this.requireConversation(orgId, conversationId);
    if (!convo.bookingId) throw new BadRequestException('No booking linked');
    return this.reminders.sendHandoverLinkWhatsApp(orgId, convo.bookingId);
  }

  private async sendReturnLink(orgId: string, conversationId: string) {
    const convo = await this.requireConversation(orgId, conversationId);
    if (!convo.bookingId) throw new BadRequestException('No booking linked');
    return this.reminders.sendReturnLinkWhatsApp(orgId, convo.bookingId);
  }

  private async sendPaymentReminder(orgId: string, conversationId: string) {
    const convo = await this.requireConversation(orgId, conversationId);
    if (!convo.bookingId) throw new BadRequestException('No booking linked');
    return this.reminders.sendPaymentDepositReminderWhatsApp(orgId, convo.bookingId);
  }

  private async setConversationStatus(
    orgId: string,
    conversationId: string,
    status: WhatsAppConversationStatus,
  ) {
    await this.requireConversation(orgId, conversationId);
    const updated = await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { status },
    });
    return { ok: true, conversationId: updated.id, status: updated.status };
  }

  private async requireConversation(orgId: string, conversationId: string) {
    const convo = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId: orgId },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    return convo;
  }
}

function mapCategoryToTaskType(category: TaskCategoryFromConversation): TaskType {
  switch (category) {
    case 'DAMAGE':
      return 'REPAIR';
    case 'DOCUMENT':
      return 'DOCUMENT_REVIEW';
    case 'PAYMENT':
      return 'INVOICE_REQUIRED';
    case 'BOOKING':
      return 'BOOKING_PREPARATION';
    case 'VEHICLE':
      return 'VEHICLE_SERVICE';
    default:
      return 'CUSTOMER_FOLLOWUP';
  }
}

function inferPriority(intent: string | null | undefined): TaskPriority {
  if (!intent) return 'NORMAL';
  if (['ACCIDENT', 'PAYMENT', 'COMPLAINT', 'DAMAGE'].includes(intent)) return 'HIGH';
  return 'NORMAL';
}
