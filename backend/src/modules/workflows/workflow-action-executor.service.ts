import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TaskPriority,
  WorkflowActionRunStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { VehicleRawStatusWriteService } from '@modules/vehicles/vehicle-raw-status-write.service';
import { normalizeTaskPriority } from '@modules/tasks/task-priority.util';
import { normalizeVehicleStatusForPrisma } from './vehicle-status.util';
import { WORKFLOW_WRITABLE_VEHICLE_STATUSES } from '@modules/vehicles/vehicle-operational-status.constants';
import type { WorkflowActionDef } from './workflow-definition.validator';

export interface ActionExecutionContext {
  organizationId: string;
  workflowId: string;
  workflowRunId: string;
  actionRunId: string;
  actionIndex: number;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

@Injectable()
export class WorkflowActionExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly vehicleRawStatusWrite: VehicleRawStatusWriteService,
  ) {}

  async execute(
    action: WorkflowActionDef,
    ctx: ActionExecutionContext,
  ): Promise<{ status: WorkflowActionRunStatus; output?: Record<string, unknown>; errorMessage?: string }> {
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
    const dedupKey = `${ctx.idempotencyKey}:action:${ctx.actionIndex}:task`;
    const task = await this.tasksService.upsertByDedup(ctx.organizationId, dedupKey, {
      title,
      description:
        typeof config.description === 'string' ? config.description : undefined,
      category: typeof config.category === 'string' ? config.category : 'workflow',
      type: 'CUSTOM',
      sourceType: 'SYSTEM',
      source: 'WORKFLOW_AUTOMATION',
      priority: this.mapPriority(config.priority),
      vehicleId: this.vehicleIdFromPayload(ctx) ?? null,
      bookingId: this.bookingIdFromPayload(ctx) ?? null,
      metadata: {
        workflowId: ctx.workflowId,
        workflowRunId: ctx.workflowRunId,
        eventType: ctx.eventType,
      } as Prisma.InputJsonValue,
    });
    return { taskId: task.id };
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
    const dedupKey = `${ctx.idempotencyKey}:action:${ctx.actionIndex}:alert`;
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
        severity,
        workflowRunId: ctx.workflowRunId,
      } as Prisma.InputJsonValue,
    });
    return { alertTaskId: task.id, preparedOnly: true };
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
    if (!WORKFLOW_WRITABLE_VEHICLE_STATUSES.has(status)) {
      throw new BadRequestException(
        `vehicle.status.update may only set admin-writable base states (AVAILABLE, IN_SERVICE, OUT_OF_SERVICE) — got: ${status}`,
      );
    }
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found in organization');
    }
    const result = await this.vehicleRawStatusWrite.applyWorkflowMaintenanceStatus({
      organizationId: ctx.organizationId,
      vehicleId,
      status,
      meta: {
        workflowId: ctx.workflowId,
        workflowRunId: ctx.workflowRunId,
        actionRunId: ctx.actionRunId,
      },
    });
    return { vehicleId, status: result.nextStatus };
  }

  private async execNotificationPrepare(
    action: WorkflowActionDef,
    ctx: ActionExecutionContext,
  ): Promise<Record<string, unknown>> {
    const config = action.config ?? {};
    const message =
      (typeof config.message === 'string' && config.message) ||
      'Notification draft prepared by workflow';
    const dedupKey = `${ctx.idempotencyKey}:action:${ctx.actionIndex}:notification`;
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
        target: config.target ?? 'admin',
        preparedOnly: true,
      } as Prisma.InputJsonValue,
    });
    return { preparedOnly: true, taskId: task.id };
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
    const dedupKey = `${ctx.idempotencyKey}:action:${ctx.actionIndex}:ai_suggest`;
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
