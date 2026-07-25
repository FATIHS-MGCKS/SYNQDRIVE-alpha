import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BOOKING_WORKFLOW_FLAG_SET,
  mergeWorkflowFlag,
  readWorkflowFlags,
} from '../adapters/workflow-booking-flag.util';
import type { BookingFlagActionConfig } from '../adapters/workflow-action-adapter.types';
import { WorkflowActionAuditService } from '../adapters/workflow-action-audit.service';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult, WorkflowActionValidationResult } from '../workflow-action-registry.types';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class BookingFlagActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'booking.flag',
    version: '1.0.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'MEDIUM',
    requiredPermission: 'WORKFLOW_EXECUTE',
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        flag: {
          type: 'string',
          required: true,
          enum: [
            'pickup_overdue',
            'manual_review',
            'complaint_escalated',
            'workflow_hold',
            'payment_attention',
          ],
        },
        reason: { type: 'string' },
        bookingId: { type: 'string' },
      },
    },
  });

  constructor(
    private readonly prisma: PrismaService,
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
    const flag = String(base.normalizedConfig.flag ?? '');
    if (!BOOKING_WORKFLOW_FLAG_SET.has(flag)) {
      return { valid: false, errors: [`Unsupported booking flag: ${flag}`] };
    }
    return base;
  }

  protected describePlannedEffects(config: Record<string, unknown>): string[] {
    return [`Set workflow flag "${String(config.flag)}" on booking (audit trail in extrasJson)`];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const parsed = config as unknown as BookingFlagActionConfig;
    const bookingId = parsed.bookingId ?? this.bookingIdFromContext(ctx);
    if (!bookingId) {
      return {
        status: 'FAILED',
        errorMessage: 'booking.flag requires bookingId',
        errorCategory: 'VALIDATION',
      };
    }

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: ctx.organizationId },
      select: { id: true, extrasJson: true },
    });
    if (!booking) {
      return {
        status: 'FAILED',
        errorMessage: 'Booking not found in organization',
        errorCategory: 'NOT_FOUND',
      };
    }

    const existingFlags = readWorkflowFlags(booking.extrasJson);
    const existing = existingFlags[parsed.flag];
    if (
      existing
      && existing.workflowRunId === ctx.workflowRunId
      && existing.actionRunId === ctx.actionRunId
    ) {
      const audit = this.audit.record(ctx, 'booking.flag', 'duplicate', 'Flag already set for this action run', {
        bookingId,
        flag: parsed.flag,
      });
      return {
        status: 'SUCCESS',
        idempotentReplay: true,
        output: { bookingId, flag: parsed.flag, auditId: audit.auditId },
      };
    }

    const record = {
      setAt: new Date().toISOString(),
      workflowRunId: ctx.workflowRunId,
      actionRunId: ctx.actionRunId,
      reason: parsed.reason,
    };
    const extrasJson = mergeWorkflowFlag(booking.extrasJson, parsed.flag, record);

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { extrasJson: extrasJson as Prisma.InputJsonValue },
    });

    const audit = this.audit.record(ctx, 'booking.flag', 'execute', `Flag ${parsed.flag} set on booking`, {
      bookingId,
      flag: parsed.flag,
      reason: parsed.reason ?? null,
    });

    return {
      status: 'SUCCESS',
      output: { bookingId, flag: parsed.flag, auditId: audit.auditId },
    };
  }
}
