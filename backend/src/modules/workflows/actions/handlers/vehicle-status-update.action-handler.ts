import { BadRequestException, Injectable } from '@nestjs/common';
import { VehicleStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { normalizeVehicleStatusForPrisma } from '../../vehicle-status.util';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult, WorkflowActionValidationResult } from '../workflow-action-registry.types';
import { WorkflowActionApprovalService } from '../adapters/workflow-action-approval.service';
import { WorkflowActionAuditService } from '../adapters/workflow-action-audit.service';
import {
  isVehicleStatusTransitionAllowed,
  requiresApprovalForVehicleStatusChange,
} from '../adapters/workflow-vehicle-status.policy';
import type { VehicleStatusUpdateActionConfig } from '../adapters/workflow-action-adapter.types';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class VehicleStatusUpdateActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'vehicle.status.update',
    version: '1.1.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'HIGH',
    requiredPermission: 'WORKFLOW_VEHICLE_WRITE',
    requiresApproval: false,
    configSchema: {
      schemaVersion: '1.1.0',
      additionalProperties: false,
      properties: {
        status: { type: 'string', required: true, description: 'Target VehicleStatus enum' },
        force: { type: 'boolean' },
        reason: { type: 'string' },
        vehicleId: { type: 'string' },
      },
    },
    timeoutPolicy: { defaultMs: 90_000, maxMs: 180_000 },
    retryPolicy: {
      maxAttempts: 2,
      initialBackoffMs: 15_000,
      maxBackoffMs: 60_000,
      retryableCategories: ['TRANSIENT'],
    },
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly rentalHealth: RentalHealthService,
    private readonly approvalService: WorkflowActionApprovalService,
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
    const status = normalizeVehicleStatusForPrisma(base.normalizedConfig.status);
    if (!status) {
      return {
        valid: false,
        errors: [`Invalid vehicle status: ${String(base.normalizedConfig.status)}`],
      };
    }
    return {
      valid: true,
      errors: [],
      normalizedConfig: { ...base.normalizedConfig, status },
    };
  }

  protected describePlannedEffects(config: Record<string, unknown>): string[] {
    const force = config.force === true ? ' (force — approval required)' : '';
    return [`Update vehicle status to ${String(config.status ?? '?')}${force}`];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const parsed = config as unknown as VehicleStatusUpdateActionConfig & { status: VehicleStatus };
    const vehicleId = parsed.vehicleId ?? this.vehicleIdFromContext(ctx);
    if (!vehicleId) {
      throw new BadRequestException('vehicle.status.update requires vehicleId');
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: ctx.organizationId },
      select: { id: true, status: true },
    });
    if (!vehicle) {
      return {
        status: 'FAILED',
        errorMessage: 'Vehicle not found in organization',
        errorCategory: 'NOT_FOUND',
      };
    }

    const targetStatus = parsed.status;
    if (vehicle.status === targetStatus) {
      const audit = this.audit.record(ctx, 'vehicle.status.update', 'duplicate', 'Vehicle already at target status', {
        vehicleId,
        status: targetStatus,
      });
      return {
        status: 'SUCCESS',
        idempotentReplay: true,
        output: { vehicleId, status: targetStatus, previousStatus: vehicle.status, auditId: audit.auditId },
      };
    }

    if (!isVehicleStatusTransitionAllowed(vehicle.status, targetStatus)) {
      return {
        status: 'FAILED',
        errorMessage: `Transition ${vehicle.status} → ${targetStatus} is not allowed`,
        errorCategory: 'VALIDATION',
      };
    }

    const rentalGate = await this.rentalHealth.isRentalBlocked(ctx.organizationId, vehicleId);
    const needsApproval = requiresApprovalForVehicleStatusChange({
      from: vehicle.status,
      to: targetStatus,
      rentalBlocked: rentalGate.blocked,
      force: parsed.force,
    });

    if (needsApproval) {
      const approved = await this.approvalService.isApprovedForActionRun(ctx);
      if (!approved) {
        const gate = await this.approvalService.requestApproval({
          ctx,
          actionType: 'vehicle.status.update',
          message:
            parsed.reason
            ?? `Approval required for vehicle status change ${vehicle.status} → ${targetStatus}`,
          approverRoleScope: 'ORG_ADMIN',
        });
        return {
          status: 'WAITING_APPROVAL',
          output: {
            approvalId: gate.approvalId,
            waitingApproval: true,
            auditId: gate.auditId,
            rentalBlocked: rentalGate.blocked,
          },
        };
      }
    }

    if (rentalGate.blocked && targetStatus === VehicleStatus.AVAILABLE && parsed.force !== true) {
      return {
        status: 'FAILED',
        errorMessage: `Vehicle is rental-blocked: ${rentalGate.reasons.join('; ')}`,
        errorCategory: 'PERMANENT',
      };
    }

    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: targetStatus },
    });

    const audit = this.audit.record(ctx, 'vehicle.status.update', 'execute', 'Vehicle status updated', {
      vehicleId,
      previousStatus: vehicle.status,
      status: targetStatus,
      rentalBlocked: rentalGate.blocked,
    });

    return {
      status: 'SUCCESS',
      output: {
        vehicleId,
        status: targetStatus,
        previousStatus: vehicle.status,
        auditId: audit.auditId,
      },
    };
  }

  async compensate(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
    executeOutput: Record<string, unknown>,
  ) {
    const previous = executeOutput.previousStatus;
    const vehicleId = executeOutput.vehicleId;
    if (typeof previous !== 'string' || typeof vehicleId !== 'string') {
      return { compensated: false, summary: 'No previous status captured' };
    }
    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: normalizeVehicleStatusForPrisma(previous) },
    });
    this.audit.record(ctx, 'vehicle.status.update', 'execute', 'Compensated vehicle status rollback', {
      vehicleId,
      restoredStatus: previous,
    });
    return { compensated: true, summary: `Restored vehicle ${vehicleId} status` };
  }
}
