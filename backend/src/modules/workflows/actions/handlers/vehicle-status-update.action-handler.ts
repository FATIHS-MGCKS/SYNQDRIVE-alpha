import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeVehicleStatusForPrisma } from '../../vehicle-status.util';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult, WorkflowActionValidationResult } from '../workflow-action-registry.types';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class VehicleStatusUpdateActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'vehicle.status.update',
    version: '1.0.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'HIGH',
    requiredPermission: 'WORKFLOW_VEHICLE_WRITE',
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        status: { type: 'string', required: true, description: 'Target VehicleStatus enum' },
      },
    },
    retryPolicy: {
      maxAttempts: 2,
      initialBackoffMs: 15_000,
      maxBackoffMs: 60_000,
      retryableCategories: ['TRANSIENT'],
    },
  });

  constructor(private readonly prisma: PrismaService) {
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
    return [`Update vehicle status to ${String(config.status ?? '?')}`];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const vehicleId = this.vehicleIdFromContext(ctx);
    if (!vehicleId) {
      throw new BadRequestException('vehicle.status.update requires payload.vehicleId');
    }
    const status = normalizeVehicleStatusForPrisma(config.status);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      return {
        status: 'FAILED',
        errorMessage: 'Vehicle not found in organization',
        errorCategory: 'NOT_FOUND',
      };
    }
    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status },
    });
    return { status: 'SUCCESS', output: { vehicleId, status } };
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
    ctx.logger.log('vehicle.status.update compensated', { vehicleId });
    return { compensated: true, summary: `Restored vehicle ${vehicleId} status` };
  }
}
