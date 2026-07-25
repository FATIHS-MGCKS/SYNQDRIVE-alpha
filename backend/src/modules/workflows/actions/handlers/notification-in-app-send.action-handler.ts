import { BadRequestException, Injectable } from '@nestjs/common';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import {
  NotificationActionType,
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
} from '@modules/notifications/notification.enums';
import { DEFAULT_STATE_REOPEN_POLICY } from '@modules/notifications/notification-reopen.policy';
import type { NotificationActionTarget } from '@modules/notifications/notification.types';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult, WorkflowActionValidationResult } from '../workflow-action-registry.types';
import type {
  NotificationInAppSendActionConfig,
  WorkflowInAppNotificationTemplateKey,
  WorkflowRecipientRole,
} from '../adapters/workflow-action-adapter.types';
import { WorkflowActionAuditService } from '../adapters/workflow-action-audit.service';
import {
  resolveWorkflowRecipientRoles,
  validateRecipientRolesForTemplate,
} from '../adapters/workflow-recipient-role.util';
import {
  WORKFLOW_IN_APP_TEMPLATES,
  WORKFLOW_NOTIFICATION_EVENT_KIND,
  WORKFLOW_NOTIFICATION_SOURCE,
} from '../adapters/workflow-notification-templates';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class NotificationInAppSendActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'notification.in_app.send',
    version: '1.0.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'LOW',
    requiredPermission: 'WORKFLOW_EXECUTE',
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        templateKey: {
          type: 'string',
          required: true,
          enum: ['booking_attention', 'vehicle_attention', 'workflow_alert'],
        },
        severity: { type: 'string', enum: ['INFO', 'WARNING', 'CRITICAL'] },
        recipientRoles: { type: 'array', required: true },
        entityType: { type: 'string', enum: ['BOOKING', 'VEHICLE', 'CUSTOMER', 'ORGANIZATION'] },
        entityId: { type: 'string' },
      },
    },
    timeoutPolicy: { defaultMs: 60_000, maxMs: 120_000 },
  });

  constructor(
    private readonly notifications: NotificationCoreService,
    private readonly audit: WorkflowActionAuditService,
  ) {
    super();
  }

  validate(
    config: unknown,
    ctx: WorkflowActionExecutionContext,
  ): WorkflowActionValidationResult {
    const base = super.validate(config, ctx);
    if (!base.valid || !base.normalizedConfig) return base;

    const record = base.normalizedConfig;
    const templateKey = record.templateKey as WorkflowInAppNotificationTemplateKey;
    const template = WORKFLOW_IN_APP_TEMPLATES[templateKey];
    if (!template) {
      return { valid: false, errors: [`Unknown templateKey: ${String(record.templateKey)}`] };
    }

    const roles = this.parseRecipientRoles(record.recipientRoles);
    const roleError = validateRecipientRolesForTemplate(roles, template.supportedRoles);
    if (roleError) {
      return { valid: false, errors: [roleError] };
    }

    return {
      valid: true,
      errors: [],
      normalizedConfig: { ...record, recipientRoles: roles },
    };
  }

  protected describePlannedEffects(config: Record<string, unknown>): string[] {
    const templateKey = String(config.templateKey ?? 'workflow_alert');
    const roles = Array.isArray(config.recipientRoles)
      ? (config.recipientRoles as string[]).join(', ')
      : '?';
    return [
      `Ingest in-app notification via template "${templateKey}"`,
      `Audience roles: ${roles}`,
    ];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const parsed = config as unknown as NotificationInAppSendActionConfig & {
      recipientRoles: WorkflowRecipientRole[];
    };
    const template = WORKFLOW_IN_APP_TEMPLATES[parsed.templateKey];
    const entity = this.resolveEntity(parsed, ctx);
    const membershipRoles = resolveWorkflowRecipientRoles(parsed.recipientRoles);
    const severity = (parsed.severity ?? template.defaultSeverity) as NotificationSeverity;
    const sourceRef = `${ctx.workflowRunId}:${ctx.actionRunId}:${ctx.actionIndex}`;
    const params = parsed.params ?? {};

    const actionTarget = this.buildActionTarget(template.actionType, entity);

    const ingest = await this.notifications.ingestCandidate(
      {
        organizationId: ctx.organizationId,
        eventType: template.eventType,
        eventKind: WORKFLOW_NOTIFICATION_EVENT_KIND,
        domain: template.domain,
        severity,
        entityType: entity.entityType,
        entityId: entity.entityId,
        conditionCode: template.conditionCode,
        scopeVersion: 1,
        sourceType: WORKFLOW_NOTIFICATION_SOURCE,
        sourceRef,
        occurredAt: ctx.event.occurredAt ?? new Date(),
        titleKey: template.titleKey,
        bodyKey: template.bodyKey,
        templateParams: params,
        actionType: template.actionType,
        actionTarget,
        resolutionPolicy: {
          eventKind: NotificationEventKind.EVENT,
          autoResolveWhenConditionClears: false,
          reopenPolicy: { ...DEFAULT_STATE_REOPEN_POLICY, cooldownMs: 0 },
        },
        metadata: {
          workflowId: ctx.workflowId,
          workflowRunId: ctx.workflowRunId,
          actionRunId: ctx.actionRunId,
          templateKey: parsed.templateKey,
          audienceRoles: parsed.recipientRoles,
          resolvedMembershipRoles: membershipRoles,
        },
      },
      { runId: ctx.workflowRunId },
    );

    if (!ingest.enabled) {
      return {
        status: 'FAILED',
        errorMessage: 'Notification engine is disabled',
        errorCategory: 'CAPABILITY',
      };
    }

    const duplicate = ingest.operation === 'updated';
    const audit = this.audit.record(
      ctx,
      'notification.in_app.send',
      duplicate ? 'duplicate' : 'execute',
      duplicate ? 'Notification fingerprint already active' : 'In-app notification ingested',
      {
        operation: ingest.operation,
        notificationId: ingest.notification?.id,
        templateKey: parsed.templateKey,
      },
    );

    return {
      status: 'SUCCESS',
      idempotentReplay: duplicate,
      output: {
        notificationId: ingest.notification?.id,
        operation: ingest.operation,
        auditId: audit.auditId,
      },
    };
  }

  private parseRecipientRoles(value: unknown): WorkflowRecipientRole[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new BadRequestException('recipientRoles must be a non-empty array');
    }
    return value.map((r) => String(r)) as WorkflowRecipientRole[];
  }

  private resolveEntity(
    config: NotificationInAppSendActionConfig,
    ctx: WorkflowActionExecutionContext,
  ): { entityType: NotificationEntityType; entityId: string } {
    const template = WORKFLOW_IN_APP_TEMPLATES[config.templateKey];

    if (config.entityType && config.entityId) {
      return {
        entityType: config.entityType as NotificationEntityType,
        entityId: config.entityId,
      };
    }

    if (config.templateKey === 'booking_attention') {
      const bookingId = config.entityId ?? this.bookingIdFromContext(ctx);
      if (!bookingId) {
        throw new BadRequestException('booking_attention requires booking entity');
      }
      return { entityType: NotificationEntityType.BOOKING, entityId: bookingId };
    }

    if (config.templateKey === 'vehicle_attention') {
      const vehicleId = config.entityId ?? this.vehicleIdFromContext(ctx);
      if (!vehicleId) {
        throw new BadRequestException('vehicle_attention requires vehicle entity');
      }
      return { entityType: NotificationEntityType.VEHICLE, entityId: vehicleId };
    }

    return {
      entityType: template.defaultEntityType,
      entityId: config.entityId ?? ctx.organizationId,
    };
  }

  private buildActionTarget(
    actionType: NotificationActionType,
    entity: { entityType: NotificationEntityType; entityId: string },
  ): NotificationActionTarget {
    switch (actionType) {
      case NotificationActionType.OPEN_BOOKING:
        return { type: actionType, bookingId: entity.entityId };
      case NotificationActionType.OPEN_VEHICLE:
        return { type: actionType, vehicleId: entity.entityId };
      case NotificationActionType.OPEN_RENTAL:
        return { type: actionType };
      default:
        return { type: actionType };
    }
  }
}
