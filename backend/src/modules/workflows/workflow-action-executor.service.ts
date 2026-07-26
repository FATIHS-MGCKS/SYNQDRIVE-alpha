import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TaskPriority,
  TaskSource,
  TaskType,
  WorkflowActionRunStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { checklistForType } from '@modules/tasks/task-templates';
import { normalizeTaskPriority } from '@modules/tasks/task-priority.util';
import { normalizeVehicleStatusForPrisma } from './vehicle-status.util';
import type { WorkflowActionDef } from './workflow-definition.validator';
import {
  assertLiveExecution,
  WorkflowExecutionMode,
} from './workflow-execution-mode';
import { WorkflowRuntimeRolloutService } from './rollout/workflow-runtime-rollout.service';
import type { NotificationWorkflowContext } from './workflow-notification-idempotency.util';
import {
  buildNotificationTaskLink,
  mergeNotificationTaskMetadata,
  toNotificationTaskUpsertFields,
} from '@modules/notifications/tasks/notification-task-materializer';

export interface ActionExecutionContext {
  organizationId: string;
  workflowId: string;
  workflowRunId: string;
  actionRunId: string;
  actionIndex: number;
  actionDefinitionId: string;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  payload: Record<string, unknown>;
  /** Workflow-run scoped idempotency key. */
  idempotencyKey: string;
  /** Per-action idempotency key (notification generation scoped when applicable). */
  actionIdempotencyKey: string;
  notificationContext?: NotificationWorkflowContext;
  executionMode: WorkflowExecutionMode;
}

@Injectable()
export class WorkflowActionExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly rollout: WorkflowRuntimeRolloutService,
  ) {}

  async execute(
    action: WorkflowActionDef,
    ctx: ActionExecutionContext,
  ): Promise<{ status: WorkflowActionRunStatus; output?: Record<string, unknown>; errorMessage?: string }> {
    assertLiveExecution(ctx.executionMode, 'WorkflowActionExecutorService.execute');

    const rolloutCheck = await this.rollout.canExecuteLiveAction(
      ctx.organizationId,
      action.type,
      ctx.workflowId,
    );
    if (!rolloutCheck.allowed) {
      return {
        status: 'FAILED',
        errorMessage: `Rollout policy blocked action: ${rolloutCheck.reasons.join(', ')}`,
        output: { rolloutBlocked: true, reasons: rolloutCheck.reasons },
      };
    }

    if (action.requiresApproval) {
      await this.prisma.orgWorkflowApproval.create({
        data: {
          organizationId: ctx.organizationId,
          workflowRunId: ctx.workflowRunId,
          actionRunId: ctx.actionRunId,
          status: 'PENDING',
          requestedBySystem: true,
          reason: `Approval required for ${action.type}`,
        },
      });
      return {
        status: 'WAITING_APPROVAL',
        output: { message: 'Awaiting approval before execution' },
      };
    }

    try {
      switch (action.type) {
        case 'task.create':
          return { status: 'SUCCESS', output: await this.execTaskCreate(action, ctx) };
        case 'alert.create':
          return { status: 'SUCCESS', output: await this.execAlertCreate(action, ctx) };
        case 'vehicle.status.update':
          return { status: 'SUCCESS', output: await this.execVehicleStatusUpdate(action, ctx) };
        case 'notification.prepare':
          return { status: 'SUCCESS', output: await this.execNotificationPrepare(action, ctx) };
        case 'workflow.approval.request':
          return {
            status: 'WAITING_APPROVAL',
            output: await this.execApprovalRequest(action, ctx),
          };
        case 'ai.suggest_action':
          return {
            status: 'WAITING_APPROVAL',
            output: await this.execAiSuggest(action, ctx),
          };
        default:
          throw new BadRequestException(`Unsupported action type: ${action.type}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'FAILED', errorMessage: message };
    }
  }

  private triggeringNotificationId(ctx: ActionExecutionContext): string | undefined {
    const fromPayload = ctx.payload.notificationId;
    return typeof fromPayload === 'string' && fromPayload.trim() ? fromPayload.trim() : undefined;
  }

  private workflowActionMetadata(
    ctx: ActionExecutionContext,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const notificationId = this.triggeringNotificationId(ctx);
    return {
      ...extra,
      workflowId: ctx.workflowId,
      workflowRunId: ctx.workflowRunId,
      eventType: ctx.eventType,
      ...(notificationId ? { triggeringNotificationId: notificationId } : {}),
    };
  }

  private vehicleIdFromPayload(ctx: ActionExecutionContext): string | undefined {
    const fromPayload = ctx.payload.vehicleId;
    if (typeof fromPayload === 'string' && fromPayload) return fromPayload;
    if (ctx.entityType === 'vehicle' && ctx.entityId) return ctx.entityId;
    if (ctx.entityType === 'booking' && typeof ctx.payload.vehicleId === 'string') {
      return ctx.payload.vehicleId;
    }
    return undefined;
  }

  private bookingIdFromPayload(ctx: ActionExecutionContext): string | undefined {
    if (ctx.entityType === 'booking' && ctx.entityId) return ctx.entityId;
    const fromPayload = ctx.payload.bookingId;
    return typeof fromPayload === 'string' ? fromPayload : undefined;
  }

  private mapPriority(raw: unknown): TaskPriority {
    return normalizeTaskPriority(String(raw ?? ''));
  }

  private async execTaskCreate(
    action: WorkflowActionDef,
    ctx: ActionExecutionContext,
  ): Promise<Record<string, unknown>> {
    const config = action.config ?? {};
    const title =
      (typeof config.title === 'string' && config.title.trim()) ||
      'Workflow task';
    const catalogDedupKey =
      typeof config.dedupKey === 'string' && config.dedupKey.trim()
        ? config.dedupKey.trim()
        : null;
    const dedupKey = catalogDedupKey ?? ctx.actionIdempotencyKey;

    const existing = await this.tasksService.findActiveByDedup(ctx.organizationId, dedupKey);
    if (existing) {
      return { taskId: existing.id, dedupKey, idempotentReplay: true };
    }

    const vehicleId =
      (typeof config.vehicleId === 'string' && config.vehicleId)
      || this.vehicleIdFromPayload(ctx)
      || null;
    const bookingId =
      (typeof config.bookingId === 'string' && config.bookingId)
      || this.bookingIdFromPayload(ctx)
      || null;
    let customerId =
      typeof config.customerId === 'string' ? config.customerId : null;

    if (bookingId && !customerId) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: bookingId, organizationId: ctx.organizationId },
        select: { customerId: true },
      });
      if (!booking) {
        throw new NotFoundException('Booking not found in organization');
      }
      customerId = booking.customerId;
    }

    if (vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!vehicle) {
        throw new NotFoundException('Vehicle not found in organization');
      }
    }

    const taskType = (typeof config.taskType === 'string' ? config.taskType : 'CUSTOM') as TaskType;
    const sourceType = (typeof config.sourceType === 'string' ? config.sourceType : 'SYSTEM') as TaskSource;
    const source = typeof config.source === 'string' ? config.source : 'WORKFLOW_AUTOMATION';
    const withChecklist = config.withChecklist === true;
    const checklist = withChecklist
      ? checklistForType(taskType)
      : Array.isArray(config.checklist)
        ? config.checklist as Array<{
            title: string;
            description?: string;
            sortOrder?: number;
            isRequired?: boolean;
          }>
        : undefined;

    const taskLink = buildNotificationTaskLink(ctx, dedupKey);

    const task = await this.tasksService.upsertByDedup(ctx.organizationId, dedupKey, {
      title,
      description:
        typeof config.description === 'string' ? config.description : undefined,
      category: typeof config.category === 'string' ? config.category : 'workflow',
      type: taskType,
      sourceType,
      source,
      priority: this.mapPriority(config.priority),
      vehicleId,
      bookingId,
      customerId,
      dueDate: typeof config.dueDate === 'string' ? new Date(config.dueDate) : null,
      activatesAt: typeof config.activatesAt === 'string' ? new Date(config.activatesAt) : new Date(),
      checklist,
      ...(taskLink ? toNotificationTaskUpsertFields(taskLink) : {}),
      metadata: (taskLink
        ? mergeNotificationTaskMetadata(
            taskLink,
            this.workflowActionMetadata(ctx, {
              ...(typeof config.metadata === 'object' && config.metadata ? config.metadata : {}),
              automationRuleId: config.automationRuleId,
              automationCatalogKey: config.automationCatalogKey,
              dedupKey,
              provenance: config.automationCatalogKey ? 'task_automation_workflow' : 'workflow',
            }),
          )
        : this.workflowActionMetadata(ctx, {
            ...(typeof config.metadata === 'object' && config.metadata ? config.metadata : {}),
            automationRuleId: config.automationRuleId,
            automationCatalogKey: config.automationCatalogKey,
            dedupKey,
            provenance: config.automationCatalogKey ? 'task_automation_workflow' : 'workflow',
          })) as Prisma.InputJsonValue,
    });
    return {
      taskId: task.id,
      dedupKey,
      ...(this.triggeringNotificationId(ctx)
        ? { triggeringNotificationId: this.triggeringNotificationId(ctx) }
        : {}),
    };
  }

  private async execAlertCreate(
    action: WorkflowActionDef,
    ctx: ActionExecutionContext,
  ): Promise<Record<string, unknown>> {
    const config = action.config ?? {};
    const message =
      (typeof config.message === 'string' && config.message) ||
      'Workflow alert';
    const severity = String(config.severity ?? 'warning').toLowerCase();
    const priority: TaskPriority =
      severity === 'critical' || severity === 'urgent'
        ? 'CRITICAL'
        : severity === 'high'
          ? 'HIGH'
          : 'NORMAL';
    const dedupKey = ctx.actionIdempotencyKey;
    const existingAlert = await this.tasksService.findActiveByDedup(ctx.organizationId, dedupKey);
    if (existingAlert) {
      return {
        alertTaskId: existingAlert.id,
        preparedOnly: true,
        idempotentReplay: true,
        ...(this.triggeringNotificationId(ctx)
          ? { triggeringNotificationId: this.triggeringNotificationId(ctx) }
          : {}),
      };
    }
    const task = await this.tasksService.upsertByDedup(ctx.organizationId, dedupKey, {
      title: `Alert: ${message.slice(0, 120)}`,
      description: message,
      category: 'workflow_alert',
      type: 'CUSTOM',
      sourceType: 'SYSTEM',
      source: 'WORKFLOW_ALERT',
      priority,
      vehicleId: this.vehicleIdFromPayload(ctx) ?? null,
      bookingId: this.bookingIdFromPayload(ctx) ?? null,
      metadata: {
        ...this.workflowActionMetadata(ctx, { severity }),
      } as Prisma.InputJsonValue,
    });
    return {
      alertTaskId: task.id,
      preparedOnly: true,
      ...(this.triggeringNotificationId(ctx)
        ? { triggeringNotificationId: this.triggeringNotificationId(ctx) }
        : {}),
    };
  }

  private async execVehicleStatusUpdate(
    action: WorkflowActionDef,
    ctx: ActionExecutionContext,
  ): Promise<Record<string, unknown>> {
    const vehicleId = this.vehicleIdFromPayload(ctx);
    if (!vehicleId) {
      throw new BadRequestException('vehicle.status.update requires payload.vehicleId');
    }
    // Never cast config straight to VehicleStatus — workflow configs may carry
    // UI labels ("Maintenance", "In Wartung", …). Normalise defensively so only
    // valid enum values reach Prisma; invalid input fails the action cleanly.
    const status = normalizeVehicleStatusForPrisma(action.config?.status);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found in organization');
    }
    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status },
    });
    return {
      vehicleId,
      status,
      ...(this.triggeringNotificationId(ctx)
        ? { triggeringNotificationId: this.triggeringNotificationId(ctx) }
        : {}),
    };
  }

  private async execNotificationPrepare(
    action: WorkflowActionDef,
    ctx: ActionExecutionContext,
  ): Promise<Record<string, unknown>> {
    const config = action.config ?? {};
    const message =
      (typeof config.message === 'string' && config.message) ||
      'Notification draft prepared by workflow';
    const dedupKey = ctx.actionIdempotencyKey;
    const existingDraft = await this.tasksService.findActiveByDedup(ctx.organizationId, dedupKey);
    if (existingDraft) {
      return {
        preparedOnly: true,
        taskId: existingDraft.id,
        idempotentReplay: true,
        ...(this.triggeringNotificationId(ctx)
          ? { triggeringNotificationId: this.triggeringNotificationId(ctx) }
          : {}),
      };
    }
    const task = await this.tasksService.upsertByDedup(ctx.organizationId, dedupKey, {
      title: 'Notification draft (not sent)',
      description: message,
      category: 'workflow_notification',
      type: 'CUSTOM',
      sourceType: 'SYSTEM',
      source: 'WORKFLOW_NOTIFICATION_PREPARE',
      priority: 'LOW',
      vehicleId: this.vehicleIdFromPayload(ctx) ?? null,
      bookingId: this.bookingIdFromPayload(ctx) ?? null,
      metadata: {
        ...this.workflowActionMetadata(ctx, {
          target: config.target ?? 'admin',
          preparedOnly: true,
        }),
      } as Prisma.InputJsonValue,
    });
    return {
      preparedOnly: true,
      taskId: task.id,
      ...(this.triggeringNotificationId(ctx)
        ? { triggeringNotificationId: this.triggeringNotificationId(ctx) }
        : {}),
    };
  }

  private async execApprovalRequest(
    action: WorkflowActionDef,
    ctx: ActionExecutionContext,
  ): Promise<Record<string, unknown>> {
    await this.prisma.orgWorkflowApproval.create({
      data: {
        organizationId: ctx.organizationId,
        workflowRunId: ctx.workflowRunId,
        actionRunId: ctx.actionRunId,
        status: 'PENDING',
        requestedBySystem: true,
        reason:
          (typeof action.config?.message === 'string' && action.config.message) ||
          'Workflow approval requested',
      },
    });
    return { waitingApproval: true };
  }

  private async execAiSuggest(
    action: WorkflowActionDef,
    ctx: ActionExecutionContext,
  ): Promise<Record<string, unknown>> {
    const dedupKey = ctx.actionIdempotencyKey;
    const task = await this.tasksService.upsertByDedup(ctx.organizationId, dedupKey, {
      title: 'AI action suggestion (approval required)',
      description:
        (typeof action.config?.summary === 'string' && action.config.summary) ||
        'Workflow generated an AI suggestion. Review before any action.',
      category: 'workflow_ai',
      type: 'CUSTOM',
      sourceType: 'SYSTEM',
      source: 'WORKFLOW_AI_SUGGEST',
      priority: 'NORMAL',
      vehicleId: this.vehicleIdFromPayload(ctx) ?? null,
      bookingId: this.bookingIdFromPayload(ctx) ?? null,
      metadata: {
        suggestionOnly: true,
        config: action.config ?? {},
      } as Prisma.InputJsonValue,
    });
    await this.prisma.orgWorkflowApproval.create({
      data: {
        organizationId: ctx.organizationId,
        workflowRunId: ctx.workflowRunId,
        actionRunId: ctx.actionRunId,
        status: 'PENDING',
        requestedBySystem: true,
        reason: 'AI suggestion requires human approval',
      },
    });
    return { suggestionTaskId: task.id, suggestionOnly: true };
  }
}
