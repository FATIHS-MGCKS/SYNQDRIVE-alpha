import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { WORKFLOW_ACTION_TYPES } from './workflow.constants';
import { normalizeVehicleStatusInput } from './vehicle-status.util';
import type { WorkflowActionDef } from './workflow-definition.validator';
import type { ActionExecutionContext } from './workflow-action-executor.service';
import { actionRequiresApproval, classifyActionRisk } from './workflow-action-risk';
import { maskEmail, sanitizePreviewRecord } from './workflow-preview.util';
import type { WorkflowPlannedAction } from './workflow-execution-plan.types';

export interface ActionPreviewInput {
  action: WorkflowActionDef;
  index: number;
  ctx: Pick<
    ActionExecutionContext,
    'organizationId' | 'payload' | 'entityType' | 'entityId' | 'eventType'
  >;
}

@Injectable()
export class WorkflowActionPreviewService {
  constructor(private readonly prisma: PrismaService) {}

  async previewAction(input: ActionPreviewInput): Promise<WorkflowPlannedAction> {
    const { action, index, ctx } = input;
    const actionType = action.type;
    const riskClass = classifyActionRisk(actionType);
    const requiresApproval = actionRequiresApproval(actionType, action.requiresApproval);
    const validationErrors: string[] = [];
    const policyBlockers: string[] = [];
    let status: WorkflowPlannedAction['status'] = 'PLANNED';
    let preview: Record<string, unknown> = {};
    let resolvedRecipients: WorkflowPlannedAction['resolvedRecipients'];
    let expectedFallback: string | undefined;
    let skipReason: string | undefined;

    if (!(WORKFLOW_ACTION_TYPES as readonly string[]).includes(actionType)) {
      validationErrors.push(`Unknown or unsupported action type: ${actionType}`);
      status = 'ERROR';
      return this.buildPlannedAction({
        index,
        actionType,
        riskClass: 'UNKNOWN',
        requiresApproval,
        status,
        policyBlockers,
        validationErrors,
        preview,
        resolvedRecipients,
        expectedFallback,
        skipReason,
      });
    }

    if (requiresApproval) {
      policyBlockers.push('Human approval required before execution');
    }

    switch (actionType) {
      case 'task.create':
        preview = await this.previewTaskCreate(action, ctx, validationErrors);
        break;
      case 'alert.create':
        preview = this.previewAlertCreate(action, ctx);
        break;
      case 'vehicle.status.update':
        preview = await this.previewVehicleStatusUpdate(action, ctx, validationErrors);
        break;
      case 'notification.prepare':
        preview = this.previewNotificationPrepare(action, ctx);
        resolvedRecipients = this.resolveNotificationRecipients(action);
        break;
      case 'workflow.approval.request':
        preview = {
          waitingApproval: true,
          reason:
            (typeof action.config?.message === 'string' && action.config.message) ||
            'Workflow approval requested',
        };
        status = 'PLANNED';
        expectedFallback = 'Workflow pauses until approver decides';
        break;
      case 'ai.suggest_action':
        preview = {
          suggestionOnly: true,
          summary:
            (typeof action.config?.summary === 'string' && action.config.summary) ||
            'AI suggestion requires human review',
        };
        expectedFallback = 'Creates review task only after approval in LIVE mode';
        break;
      default:
        validationErrors.push(`No preview handler for action type: ${actionType}`);
        status = 'ERROR';
    }

    if (validationErrors.length > 0 && status !== 'ERROR') {
      status = 'ERROR';
    }

    preview = sanitizePreviewRecord(preview);

    return this.buildPlannedAction({
      index,
      actionType,
      riskClass,
      requiresApproval,
      status,
      policyBlockers,
      validationErrors,
      preview,
      resolvedRecipients,
      expectedFallback,
      skipReason,
    });
  }

  private buildPlannedAction(parts: WorkflowPlannedAction): WorkflowPlannedAction {
    return parts;
  }

  private vehicleIdFromContext(
    ctx: ActionPreviewInput['ctx'],
  ): string | undefined {
    const fromPayload = ctx.payload.vehicleId;
    if (typeof fromPayload === 'string' && fromPayload) return fromPayload;
    if (ctx.entityType === 'vehicle' && ctx.entityId) return ctx.entityId;
    return undefined;
  }

  private bookingIdFromContext(ctx: ActionPreviewInput['ctx']): string | undefined {
    if (ctx.entityType === 'booking' && ctx.entityId) return ctx.entityId;
    const fromPayload = ctx.payload.bookingId;
    return typeof fromPayload === 'string' ? fromPayload : undefined;
  }

  private async previewTaskCreate(
    action: WorkflowActionDef,
    ctx: ActionPreviewInput['ctx'],
    validationErrors: string[],
  ): Promise<Record<string, unknown>> {
    const config = action.config ?? {};
    const title =
      (typeof config.title === 'string' && config.title.trim()) || 'Workflow task';
    if (!title.trim()) {
      validationErrors.push('task.create requires a non-empty title');
    }
    return {
      wouldCreate: 'OrgTask',
      title,
      category: typeof config.category === 'string' ? config.category : 'workflow',
      priority: config.priority ?? 'NORMAL',
      vehicleId: this.vehicleIdFromContext(ctx) ?? null,
      bookingId: this.bookingIdFromContext(ctx) ?? null,
    };
  }

  private previewAlertCreate(
    action: WorkflowActionDef,
    ctx: ActionPreviewInput['ctx'],
  ): Record<string, unknown> {
    const config = action.config ?? {};
    const message =
      (typeof config.message === 'string' && config.message) || 'Workflow alert';
    return {
      wouldCreate: 'OrgTask (alert)',
      title: `Alert: ${message.slice(0, 120)}`,
      severity: config.severity ?? 'warning',
      vehicleId: this.vehicleIdFromContext(ctx) ?? null,
      preparedOnly: true,
    };
  }

  private async previewVehicleStatusUpdate(
    action: WorkflowActionDef,
    ctx: ActionPreviewInput['ctx'],
    validationErrors: string[],
  ): Promise<Record<string, unknown>> {
    const vehicleId = this.vehicleIdFromContext(ctx);
    if (!vehicleId) {
      validationErrors.push('vehicle.status.update requires payload.vehicleId');
      return { wouldUpdate: null };
    }

    const status = normalizeVehicleStatusInput(
      typeof action.config?.status === 'string' ? action.config.status : undefined,
    );
    if (!status) {
      validationErrors.push('vehicle.status.update requires a valid VehicleStatus');
      return { vehicleId, wouldUpdate: null };
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: ctx.organizationId },
      select: { id: true, status: true },
    });

    if (!vehicle) {
      validationErrors.push(
        'Vehicle not found in organization (cross-tenant entities are not resolved)',
      );
      return { vehicleId, wouldUpdate: null };
    }

    return {
      vehicleId,
      currentStatus: vehicle.status,
      wouldUpdateTo: status,
    };
  }

  private previewNotificationPrepare(
    action: WorkflowActionDef,
    ctx: ActionPreviewInput['ctx'],
  ): Record<string, unknown> {
    const config = action.config ?? {};
    const message =
      (typeof config.message === 'string' && config.message) ||
      'Notification draft prepared by workflow';
    return {
      wouldCreate: 'draft task (notification.prepare — no send in current LIVE path)',
      target: config.target ?? 'admin',
      message,
      vehicleId: this.vehicleIdFromContext(ctx) ?? null,
      bookingId: this.bookingIdFromContext(ctx) ?? null,
      preparedOnly: true,
    };
  }

  private resolveNotificationRecipients(
    action: WorkflowActionDef,
  ): WorkflowPlannedAction['resolvedRecipients'] {
    const config = action.config ?? {};
    const target = config.target;
    const recipients: Array<{ channel: string; masked: string }> = [];

    if (typeof config.email === 'string' && config.email.includes('@')) {
      recipients.push({ channel: 'email', masked: maskEmail(config.email) });
    }
    if (typeof config.phone === 'string' && config.phone.trim()) {
      recipients.push({ channel: 'phone', masked: '***' });
    }
    if (target === 'admin') {
      recipients.push({ channel: 'in_app', masked: 'org-admins' });
    }

    return recipients.length ? recipients : undefined;
  }
}
