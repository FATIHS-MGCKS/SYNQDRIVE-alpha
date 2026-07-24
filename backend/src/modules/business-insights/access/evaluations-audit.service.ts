import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessAuditService } from '@modules/business-audit/business-audit.service';
import { buildBusinessAuditIdempotencyKey } from '@modules/business-audit/business-audit-idempotency.util';
import { sanitizeBusinessAuditValue } from '@modules/business-audit/business-audit-sanitize.util';
import {
  EVALUATIONS_AUDIT_ENTITY_TYPE,
  EvaluationsAuditAction,
  type EvaluationsAuditActionCode,
  type EvaluationsAuditEntityType,
  type EvaluationsAuditOutcome,
} from './evaluations-audit.constants';

export interface EvaluationsAuditActor {
  actorUserId?: string | null;
  correlationId?: string | null;
  route?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface EvaluationsAuditRecordInput {
  organizationId: string;
  actor: EvaluationsAuditActor;
  action: EvaluationsAuditActionCode;
  entityType: EvaluationsAuditEntityType;
  entityId: string;
  outcome: EvaluationsAuditOutcome;
  description: string;
  changeReason?: string | null;
  before?: unknown;
  after?: unknown;
  diff?: unknown;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class EvaluationsAuditService {
  private readonly logger = new Logger(EvaluationsAuditService.name);

  constructor(private readonly businessAudit: BusinessAuditService) {}

  async record(input: EvaluationsAuditRecordInput): Promise<void> {
    try {
      const correlationId = input.actor.correlationId ?? `eval-audit:${input.entityId}`;
      const outbox = await this.businessAudit.enqueue(
        this.buildEnqueueInput(input, correlationId),
      );
      await this.businessAudit.processOutboxIds([outbox.id]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Evaluations audit enqueue failed org=${input.organizationId} action=${input.action}: ${message}`,
      );
    }
  }

  async recordInTransaction(
    tx: Prisma.TransactionClient,
    input: EvaluationsAuditRecordInput,
  ): Promise<string | null> {
    const correlationId = input.actor.correlationId ?? `eval-audit:${input.entityId}`;
    const outbox = await this.businessAudit.enqueueInTransaction(
      tx,
      this.buildEnqueueInput(input, correlationId),
    );
    return outbox.id;
  }

  async flushOutboxIds(outboxIds: Array<string | null | undefined>): Promise<void> {
    await this.businessAudit.processOutboxIds(outboxIds);
  }

  async flushCritical(outboxIds: Array<string | null | undefined>): Promise<void> {
    await this.businessAudit.flushCritical(outboxIds);
  }

  private buildEnqueueInput(
    input: EvaluationsAuditRecordInput,
    correlationId: string,
  ) {
    const metadata = sanitizeBusinessAuditValue({
      evaluationsAudit: {
        targetType: input.entityType,
        targetId: input.entityId,
        outcome: input.outcome,
        route: input.actor.route ?? null,
        ipAddress: input.actor.ipAddress ?? null,
        userAgent: input.actor.userAgent ?? null,
      },
      ...(input.metadata ?? {}),
    }) as Record<string, unknown>;

    return {
      organizationId: input.organizationId,
      idempotencyKey: buildBusinessAuditIdempotencyKey({
        action: input.action,
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        correlationId,
      }),
      action: input.action,
      actorUserId: input.actor.actorUserId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      correlationId,
      before: input.before,
      after: input.after,
      diff: input.diff,
      changeReason: input.changeReason ?? null,
      outcome: input.outcome,
      description: input.description,
      metadata,
    };
  }

  recordSensitiveDetailAccess(
    organizationId: string,
    actor: EvaluationsAuditActor,
    input: {
      entityId: string;
      surface: string;
      outcome?: EvaluationsAuditOutcome;
      reason?: string;
    },
  ): Promise<void> {
    return this.record({
      organizationId,
      actor,
      action: EvaluationsAuditAction.SENSITIVE_DETAIL_ACCESSED,
      entityType: EVALUATIONS_AUDIT_ENTITY_TYPE.MISUSE_CASE,
      entityId: input.entityId,
      outcome: input.outcome ?? 'SUCCESS',
      description: `Sensitive evaluations detail accessed (${input.surface})`,
      changeReason: input.reason ?? null,
      metadata: { surface: input.surface },
    });
  }

  recordFinanceExport(
    organizationId: string,
    actor: EvaluationsAuditActor,
    input: {
      exportId: string;
      stationId?: string | null;
      outcome?: EvaluationsAuditOutcome;
      reason?: string;
      activeInsightCount?: number;
    },
  ): Promise<void> {
    return this.record({
      organizationId,
      actor,
      action: EvaluationsAuditAction.FINANCE_EXPORT,
      entityType: EVALUATIONS_AUDIT_ENTITY_TYPE.EXPORT,
      entityId: input.exportId,
      outcome: input.outcome ?? 'SUCCESS',
      description: 'Evaluations finance aggregate export',
      changeReason: input.reason ?? null,
      metadata: {
        stationId: input.stationId ?? null,
        activeInsightCount: input.activeInsightCount ?? null,
        format: 'json',
      },
    });
  }

  recordPiiDataAccess(
    organizationId: string,
    actor: EvaluationsAuditActor,
    input: {
      entityId: string;
      tier: string;
      requestedCount: number;
      returnedCount: number;
      outcome?: EvaluationsAuditOutcome;
      reason?: string;
    },
  ): Promise<void> {
    return this.record({
      organizationId,
      actor,
      action: EvaluationsAuditAction.PII_DATA_ACCESSED,
      entityType: EVALUATIONS_AUDIT_ENTITY_TYPE.CUSTOMER_LABELS,
      entityId: input.entityId,
      outcome: input.outcome ?? 'SUCCESS',
      description: 'Evaluations customer label lookup',
      changeReason: input.reason ?? null,
      metadata: {
        tier: input.tier,
        requestedCount: input.requestedCount,
        returnedCount: input.returnedCount,
      },
    });
  }

  recordManualRecalculation(
    organizationId: string,
    actor: EvaluationsAuditActor,
    input: {
      entityId: string;
      jobType: string;
      trigger?: string;
      outcome?: EvaluationsAuditOutcome;
      reason?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    return this.record({
      organizationId,
      actor,
      action: EvaluationsAuditAction.MANUAL_RECALCULATION,
      entityType: EVALUATIONS_AUDIT_ENTITY_TYPE.FORECAST_RUN,
      entityId: input.entityId,
      outcome: input.outcome ?? 'SUCCESS',
      description: `Evaluations manual recalculation: ${input.jobType}`,
      changeReason: input.reason ?? null,
      metadata: {
        jobType: input.jobType,
        trigger: input.trigger ?? 'api',
        ...(input.metadata ?? {}),
      },
    });
  }

  recordDataQualityAction(
    organizationId: string,
    actor: EvaluationsAuditActor,
    input: {
      entityId: string;
      actionKind: string;
      outcome?: EvaluationsAuditOutcome;
      reason?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    return this.record({
      organizationId,
      actor,
      action: EvaluationsAuditAction.DATA_QUALITY_ACTION,
      entityType: EVALUATIONS_AUDIT_ENTITY_TYPE.ADMIN_DIAGNOSTICS,
      entityId: input.entityId,
      outcome: input.outcome ?? 'SUCCESS',
      description: `Evaluations data quality action: ${input.actionKind}`,
      changeReason: input.reason ?? null,
      metadata: {
        actionKind: input.actionKind,
        ...(input.metadata ?? {}),
      },
    });
  }

  recordModelStatusChange(
    organizationId: string,
    actor: EvaluationsAuditActor,
    input: {
      entityId: string;
      modelKey: string;
      modelVersion: string;
      horizonDays: number;
      previousStatus?: string | null;
      nextStatus: string;
      reason?: string | null;
    },
  ): Promise<void> {
    const activated = input.nextStatus === 'APPROVED';
    const deactivated = input.nextStatus === 'DISABLED' || input.nextStatus === 'ROLLED_BACK';

    return this.record({
      organizationId,
      actor,
      action: activated
        ? EvaluationsAuditAction.MODEL_ACTIVATED
        : deactivated
          ? EvaluationsAuditAction.MODEL_DEACTIVATED
          : EvaluationsAuditAction.FORECAST_MODEL_CHANGED,
      entityType: EVALUATIONS_AUDIT_ENTITY_TYPE.MODEL_REGISTRY,
      entityId: input.entityId,
      outcome: 'SUCCESS',
      description: `Forecast model registry status: ${input.previousStatus ?? 'unknown'} → ${input.nextStatus}`,
      changeReason: input.reason ?? null,
      before: { status: input.previousStatus ?? null },
      after: { status: input.nextStatus },
      metadata: {
        modelKey: input.modelKey,
        modelVersion: input.modelVersion,
        horizonDays: input.horizonDays,
      },
    });
  }

  recordKpiDefinitionChange(
    organizationId: string,
    actor: EvaluationsAuditActor,
    input: {
      entityId: string;
      changeSummary: string;
      before?: unknown;
      after?: unknown;
      thresholdKeys?: string[];
    },
  ): Promise<void> {
    const thresholdOnly =
      input.thresholdKeys && input.thresholdKeys.length > 0
        ? input.thresholdKeys.every((key) =>
            ['stationShortageThreshold', 'lowUtilizationDays', 'handoverBufferMin', 'serviceWindowMinHours', 'serviceBeforeBookingHours'].includes(key),
          )
        : false;

    return this.record({
      organizationId,
      actor,
      action: thresholdOnly
        ? EvaluationsAuditAction.THRESHOLD_CHANGED
        : EvaluationsAuditAction.KPI_DEFINITION_CHANGED,
      entityType: EVALUATIONS_AUDIT_ENTITY_TYPE.INSIGHT_POLICY,
      entityId: input.entityId,
      outcome: 'SUCCESS',
      description: thresholdOnly
        ? 'Evaluations KPI threshold updated'
        : 'Evaluations KPI / insight policy updated',
      changeReason: input.changeSummary,
      before: input.before,
      after: input.after,
      metadata: {
        thresholdKeys: input.thresholdKeys ?? null,
      },
    });
  }
}
