import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TaskPriority,
  TaskType,
  WhatsAppTemplateCategory,
  WhatsAppTemplateProviderStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingsService } from '@modules/bookings/bookings.service';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { TaskPermissionService } from '@modules/tasks/task-permission.service';
import { whatsappConversationTaskDedupKey } from '@modules/tasks/automation/task-automation-rule.util';
import { WhatsAppAiRouterService } from '@modules/whatsapp/whatsapp-ai-router.service';
import { WhatsAppAiContextService } from '@modules/whatsapp/whatsapp-ai-context.service';
import { WhatsAppAiToolsService } from '@modules/whatsapp/whatsapp-ai-tools.service';
import { WhatsAppMessagePolicyService } from '@modules/whatsapp/whatsapp-message-policy.service';
import type { WhatsAppQuickActionId } from '@modules/whatsapp/whatsapp-conversation-context.types';
import type { TaskCategoryFromConversation } from '@modules/whatsapp/whatsapp-quick-actions.service';
import { CommunicationWriteService } from '../write/communication-write.service';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { mapConversationDetail } from '../read/communication-read.mapper';
import { CommunicationReplyError } from '../reply/communication-reply.errors';
import { renderTemplateBodyPreview } from '../reply/communication-template-variables.util';
import type { CommunicationReplyActor } from '../reply/communication-reply.service';
import { CommunicationContextLinkService } from '../context/communication-context-link.service';
import { COMMUNICATION_QUICK_ACTION_CATALOG } from './communication-quick-action.catalog';
import type {
  CommunicationQuickActionResult,
  CommunicationQuickActionTemplatePrefill,
} from './communication-quick-action.types';

@Injectable()
export class CommunicationQuickActionExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writeService: CommunicationWriteService,
    private readonly readRepository: CommunicationReadRepository,
    private readonly policy: WhatsAppMessagePolicyService,
    private readonly aiRouter: WhatsAppAiRouterService,
    private readonly aiContext: WhatsAppAiContextService,
    private readonly aiTools: WhatsAppAiToolsService,
    private readonly bookings: BookingsService,
    private readonly documentBundle: BookingDocumentBundleService,
    private readonly tasks: TasksService,
    private readonly taskPermissions: TaskPermissionService,
    private readonly contextLink: CommunicationContextLinkService,
  ) {}

  async execute(
    organizationId: string,
    canonicalConversationId: string,
    nativeConversationId: string,
    actionId: WhatsAppQuickActionId,
    actor: CommunicationReplyActor,
    body: Record<string, unknown> = {},
  ): Promise<CommunicationQuickActionResult> {
    const catalog = COMMUNICATION_QUICK_ACTION_CATALOG[actionId];
    if (catalog.deferred) {
      throw new BadRequestException(`Quick action ${actionId} is not available in Communication Center`);
    }

    if (catalog.requiresTaskCreate) {
      await this.taskPermissions.assert({ id: actor.userId }, organizationId, 'tasks.create');
    }

    switch (actionId) {
      case 'send_pickup_instructions':
        return this.prepareComposerText(
          actionId,
          organizationId,
          nativeConversationId,
          async (orgId, ctx) => this.aiTools.getPickupInstructions(orgId, ctx),
        );
      case 'send_return_instructions':
        return this.prepareComposerText(
          actionId,
          organizationId,
          nativeConversationId,
          async (orgId, ctx) => this.aiTools.getReturnInstructions(orgId, ctx),
        );
      case 'request_missing_documents':
        return this.prepareBookingReminder(
          actionId,
          organizationId,
          nativeConversationId,
          WhatsAppTemplateCategory.MISSING_DOCUMENTS,
          async (orgId, bookingId) => {
            const bundle = await this.documentBundle.getBundleView(orgId, bookingId);
            const missing = [...bundle.missingLegalDocuments, ...bundle.legal.missing];
            if (missing.length === 0) {
              throw new BadRequestException('No missing documents for this booking');
            }
            const detail = await this.bookings.findDetail(orgId, bookingId);
            if (!detail) throw new NotFoundException('Booking not found');
            return `Für deine Buchung ${detail.core.bookingNumber} fehlen noch Dokumente: ${missing.join(', ')}. Bitte reiche diese zeitnah ein.`;
          },
        );
      case 'send_handover_link':
        return this.prepareBookingReminder(
          actionId,
          organizationId,
          nativeConversationId,
          WhatsAppTemplateCategory.HANDOVER_LINK,
          async (_orgId, bookingId) => {
            const url = buildOperatorBookingUrl(bookingId);
            return `Deine Übergabe ist vorbereitet. Operator-App: ${url}`;
          },
        );
      case 'send_return_link':
        return this.prepareBookingReminder(
          actionId,
          organizationId,
          nativeConversationId,
          WhatsAppTemplateCategory.RETURN_LINK,
          async (_orgId, bookingId) => {
            const url = buildOperatorBookingUrl(bookingId);
            return `Für die Rückgabe nutze bitte unsere Operator-App: ${url}`;
          },
        );
      case 'send_payment_deposit_reminder':
        return this.prepareBookingReminder(
          actionId,
          organizationId,
          nativeConversationId,
          WhatsAppTemplateCategory.PAYMENT_REMINDER,
          async (orgId, bookingId) => {
            const detail = await this.bookings.findDetail(orgId, bookingId);
            if (!detail) throw new NotFoundException('Booking not found');
            const parts = [`Erinnerung zu Buchung ${detail.core.bookingNumber}`];
            if (detail.finance.depositStatus === 'REQUESTED') {
              parts.push(`Kaution: ${detail.finance.depositStatus}`);
            }
            if (detail.finance.paymentStatus && detail.finance.paymentStatus !== 'PAID') {
              parts.push(`Zahlung: ${detail.finance.paymentStatus}`);
            }
            return parts.join('. ');
          },
        );
      case 'human_review':
        return this.executeHumanReview(
          organizationId,
          canonicalConversationId,
          nativeConversationId,
          actor,
          typeof body.reason === 'string' ? body.reason : undefined,
        );
      case 'close_conversation':
        return this.executeResolve(organizationId, canonicalConversationId, actor, actionId);
      case 'reopen_conversation':
        return this.executeReopen(organizationId, canonicalConversationId, actor, actionId);
      case 'link_vehicle':
        return this.executeLinkVehicle(
          organizationId,
          canonicalConversationId,
          nativeConversationId,
          actor,
          actionId,
        );
      case 'create_task':
        return this.executeCreateTask(
          organizationId,
          nativeConversationId,
          actor,
          actionId,
          body,
        );
      case 'create_damage_followup_task':
        return this.executeCreateTask(
          organizationId,
          nativeConversationId,
          actor,
          actionId,
          {
            ...body,
            taskCategory: 'DAMAGE',
            taskTitle: 'WhatsApp damage follow-up',
            reason: 'Damage follow-up requested from Communication Center',
          },
        );
      default:
        throw new BadRequestException(`Unknown quick action: ${actionId}`);
    }
  }

  private async requireNativeConversation(organizationId: string, nativeConversationId: string) {
    const convo = await this.prisma.whatsAppConversation.findFirst({
      where: { id: nativeConversationId, organizationId },
    });
    if (!convo) throw CommunicationReplyError.notFound();
    return convo;
  }

  private async requireWhatsAppConfig(organizationId: string) {
    const config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId },
    });
    if (!config?.isActive) {
      throw CommunicationReplyError.channelNotReplyable();
    }
    return config;
  }

  private async prepareComposerText(
    actionId: WhatsAppQuickActionId,
    organizationId: string,
    nativeConversationId: string,
    generator: (
      orgId: string,
      ctx: Awaited<ReturnType<WhatsAppAiContextService['load']>>,
    ) => Promise<{ ok: boolean; summary?: string }>,
  ): Promise<CommunicationQuickActionResult> {
    const convo = await this.requireNativeConversation(organizationId, nativeConversationId);
    const config = await this.requireWhatsAppConfig(organizationId);
    const ctx = await this.aiContext.load(organizationId, convo);
    const result = await generator(organizationId, ctx);
    if (!result.ok || !result.summary?.trim()) {
      throw new BadRequestException(result.summary ?? 'Message content unavailable');
    }

    const freeText = this.policy.canSendFreeText(organizationId, config, convo);
    if (!freeText.allowed) {
      throw CommunicationReplyError.templateRequired();
    }

    return {
      actionType: 'COMPOSER_PREFILL',
      actionId,
      text: result.summary.trim(),
    };
  }

  private async prepareBookingReminder(
    actionId: WhatsAppQuickActionId,
    organizationId: string,
    nativeConversationId: string,
    category: WhatsAppTemplateCategory,
    fallbackBuilder: (orgId: string, bookingId: string) => Promise<string>,
  ): Promise<CommunicationQuickActionResult> {
    const convo = await this.requireNativeConversation(organizationId, nativeConversationId);
    if (!convo.bookingId) {
      throw new BadRequestException('No booking linked');
    }

    const config = await this.requireWhatsAppConfig(organizationId);
    const fallbackText = await fallbackBuilder(organizationId, convo.bookingId);

    const template = await this.findSendableTemplate(organizationId, category);
    if (template) {
      const templateVariables: Record<string, string> = {};
      const previewText = renderTemplateBodyPreview(template.bodyTemplate, templateVariables);
      return {
        actionType: 'TEMPLATE_PREFILL',
        actionId,
        template: {
          templateId: template.id,
          language: template.language,
          templateVariables,
          previewText,
        },
      };
    }

    const freeText = this.policy.canSendFreeText(organizationId, config, convo);
    if (!freeText.allowed) {
      throw CommunicationReplyError.templateRequired();
    }

    return {
      actionType: 'COMPOSER_PREFILL',
      actionId,
      text: fallbackText,
    };
  }

  private async findSendableTemplate(organizationId: string, category: WhatsAppTemplateCategory) {
    const statuses =
      process.env.NODE_ENV === 'production'
        ? [WhatsAppTemplateProviderStatus.APPROVED]
        : [WhatsAppTemplateProviderStatus.APPROVED, WhatsAppTemplateProviderStatus.DRAFT];

    const template = await this.prisma.whatsAppTemplate.findFirst({
      where: {
        organizationId,
        category,
        providerStatus: { in: statuses },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!template) return null;
    const policy = this.policy.canSendTemplate(organizationId, template);
    return policy.allowed ? template : null;
  }

  private async executeHumanReview(
    organizationId: string,
    canonicalConversationId: string,
    nativeConversationId: string,
    actor: CommunicationReplyActor,
    reason?: string,
  ): Promise<CommunicationQuickActionResult> {
    await this.aiRouter.requestHumanReview(
      organizationId,
      nativeConversationId,
      reason ?? 'Marked for human review from Communication Center',
      actor.userId,
      true,
    );

    const row = await this.readRepository.findConversationById(
      organizationId,
      canonicalConversationId,
    );
    if (!row) throw CommunicationReplyError.notFound();

    return {
      actionType: 'HANDOFF',
      actionId: 'human_review',
      changed: true,
      conversation: mapConversationDetail(row),
    };
  }

  private async executeResolve(
    organizationId: string,
    canonicalConversationId: string,
    actor: CommunicationReplyActor,
    actionId: WhatsAppQuickActionId,
  ): Promise<CommunicationQuickActionResult> {
    const response = await this.writeService.resolveConversation(
      organizationId,
      canonicalConversationId,
      actor,
    );
    return {
      actionType: 'CONVERSATION_MUTATION',
      actionId,
      conversation: response.conversation,
      changed: true,
    };
  }

  private async executeReopen(
    organizationId: string,
    canonicalConversationId: string,
    actor: CommunicationReplyActor,
    actionId: WhatsAppQuickActionId,
  ): Promise<CommunicationQuickActionResult> {
    const response = await this.writeService.reopenConversation(
      organizationId,
      canonicalConversationId,
      actor,
    );
    return {
      actionType: 'CONVERSATION_MUTATION',
      actionId,
      conversation: response.conversation,
      changed: true,
    };
  }

  private async executeLinkVehicle(
    organizationId: string,
    canonicalConversationId: string,
    nativeConversationId: string,
    actor: CommunicationReplyActor,
    actionId: WhatsAppQuickActionId,
  ): Promise<CommunicationQuickActionResult> {
    const result = await this.contextLink.linkVehicleFromBooking({
      organizationId,
      canonicalConversationId,
      nativeConversationId,
      actorUserId: actor.userId,
    });

    return {
      actionType: 'BUSINESS_MUTATION',
      actionId,
      vehicleId: result.vehicleId,
      conversation: result.conversation,
      changed: result.changed,
    };
  }

  private async executeCreateTask(
    organizationId: string,
    nativeConversationId: string,
    actor: CommunicationReplyActor,
    actionId: WhatsAppQuickActionId,
    body: Record<string, unknown>,
  ): Promise<CommunicationQuickActionResult> {
    const convo = await this.requireNativeConversation(organizationId, nativeConversationId);
    const ctx = await this.aiContext.load(organizationId, convo);

    const category = (body.taskCategory as TaskCategoryFromConversation | undefined)
      ?? 'CUSTOMER_COMMUNICATION';
    const type = mapCategoryToTaskType(category);
    const priority = inferPriority(convo.lastDetectedIntent);

    const task = await this.tasks.createManualTask(
      organizationId,
      {
        title:
          (typeof body.taskTitle === 'string' && body.taskTitle)
          || `WhatsApp: ${convo.contactName ?? convo.contactPhone}`,
        description:
          (typeof body.reason === 'string' && body.reason)
          || `Follow-up from WhatsApp conversation ${nativeConversationId}`,
        category: category.toLowerCase(),
        type,
        sourceType: 'SYSTEM',
        source: 'WHATSAPP',
        priority,
        customerId: ctx.customer?.id,
        bookingId: ctx.booking?.id,
        vehicleId: ctx.vehicle?.id,
        assignedUserId: convo.assignedTo ?? undefined,
        dedupKey: whatsappConversationTaskDedupKey(nativeConversationId, category),
        metadata: { whatsappConversationId: nativeConversationId },
      },
      actor.userId,
    );

    return {
      actionType: 'BUSINESS_MUTATION',
      actionId,
      taskId: (task as { id: string }).id,
      changed: true,
    };
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

function buildOperatorBookingUrl(bookingId: string): string {
  const base = process.env.FRONTEND_URL?.trim()?.replace(/\/$/, '') ?? '';
  return base ? `${base}/operator/bookings/${bookingId}` : `/operator/bookings/${bookingId}`;
}
