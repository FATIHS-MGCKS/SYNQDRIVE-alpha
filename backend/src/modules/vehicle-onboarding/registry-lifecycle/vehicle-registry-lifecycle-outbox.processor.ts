import { Injectable, Logger } from '@nestjs/common';
import { VehicleRegistryLifecycleOutboxStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingQuantityVehicleIntegration } from '@modules/billing/billing-quantity-vehicle.integration';
import { BillingVehicleRegistryOffboardProjection } from '@modules/billing/registry-lifecycle/billing-vehicle-registry-offboard.projection';
import { isRegistryBillingPermanentIntegrityError } from '@modules/billing/registry-lifecycle/registry-billing-permanent-integrity.error';
import {
  buildRegistryActivateBillingIdempotencyKey,
  validateVehicleActivatedRegistryEvent,
  type ValidatedVehicleActivatedRegistryEvent,
} from '@modules/billing/registry-lifecycle/validate-vehicle-activated-registry-event';
import {
  validateVehicleOffboardedRegistryEvent,
  VehicleRegistryLifecycleBillingValidationError,
} from '@modules/billing/registry-lifecycle/validate-vehicle-offboarded-registry-event';
import {
  SUPPORTED_REGISTRY_LIFECYCLE_HANDLER_EVENT_TYPES,
  VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_MAX_RETRIES,
} from './vehicle-registry-lifecycle-outbox.constants';
import { VehicleRegistryLifecycleOutboxRepository } from './vehicle-registry-lifecycle-outbox.repository';

export type RegistryLifecycleOutboxProcessOutcome =
  | 'published'
  | 'retry'
  | 'failed'
  | 'skipped'
  | 'deferred';

function formatRegistryLifecycleHandlerError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'registry_lifecycle_outbox_handler_failed';
}

function isPermanentHandlerFailure(error: unknown): boolean {
  if (error instanceof VehicleRegistryLifecycleBillingValidationError) return true;
  if (isRegistryBillingPermanentIntegrityError(error)) return true;
  return false;
}

@Injectable()
export class VehicleRegistryLifecycleOutboxProcessor {
  private readonly logger = new Logger(VehicleRegistryLifecycleOutboxProcessor.name);
  private readonly workerId = `registry-lifecycle-${process.pid}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: VehicleRegistryLifecycleOutboxRepository,
    private readonly billingOffboardProjection: BillingVehicleRegistryOffboardProjection,
    private readonly billingQuantityVehicle: BillingQuantityVehicleIntegration,
  ) {}

  async processPendingBatch(limit: number): Promise<
    Array<{ outboxId: string; outcome: RegistryLifecycleOutboxProcessOutcome }>
  > {
    const claimed = await this.repository.claimPendingHandledEvents(limit, this.workerId);
    const results: Array<{ outboxId: string; outcome: RegistryLifecycleOutboxProcessOutcome }> = [];
    for (const row of claimed) {
      results.push({ outboxId: row.id, outcome: await this.processClaimedRow(row.id) });
    }
    return results;
  }

  async processRow(outboxId: string): Promise<RegistryLifecycleOutboxProcessOutcome> {
    const row = await this.prisma.vehicleRegistryLifecycleOutbox.findUnique({
      where: { id: outboxId },
    });
    if (!row) {
      return 'skipped';
    }
    if (row.status === VehicleRegistryLifecycleOutboxStatus.PUBLISHED) {
      return 'skipped';
    }
    if (
      !(SUPPORTED_REGISTRY_LIFECYCLE_HANDLER_EVENT_TYPES as readonly string[]).includes(row.eventType)
    ) {
      return 'deferred';
    }
    const claimed = await this.repository.claimRowById(outboxId, this.workerId);
    if (!claimed) {
      return 'skipped';
    }
    return this.processClaimedRow(outboxId);
  }

  private async processClaimedRow(outboxId: string): Promise<RegistryLifecycleOutboxProcessOutcome> {
    const row = await this.prisma.vehicleRegistryLifecycleOutbox.findUnique({
      where: { id: outboxId },
    });
    if (!row) {
      return 'skipped';
    }
    if (row.status === VehicleRegistryLifecycleOutboxStatus.PUBLISHED) {
      return 'skipped';
    }

    try {
      if (row.eventType === 'VEHICLE_ACTIVATED') {
        const validated = validateVehicleActivatedRegistryEvent(row);
        await this.assertVehicleTenantForActivation(validated);
        const quantityResult = await this.billingQuantityVehicle.onVehicleProvisioned({
          organizationId: validated.organizationId,
          vehicleId: validated.vehicleId,
          effectiveAt: validated.occurredAt,
          idempotencyKey: buildRegistryActivateBillingIdempotencyKey(validated.eventId),
          retroactiveAuthorized: true,
        });
        this.logger.log({
          msg: 'registry_lifecycle.billing_activate_processed',
          outboxId: row.id,
          eventId: validated.eventId,
          eventType: row.eventType,
          organizationId: validated.organizationId,
          vehicleId: validated.vehicleId,
          billingAction: 'VEHICLE_CONNECTED',
          quantityEventCreated: quantityResult?.created ?? false,
        });
      } else if (row.eventType === 'VEHICLE_OFFBOARDED') {
        const validated = validateVehicleOffboardedRegistryEvent(row);
        await this.billingOffboardProjection.onVehicleOffboardedLifecycleEvent(validated);
        this.logger.log({
          msg: 'registry_lifecycle.billing_offboard_processed',
          outboxId: row.id,
          eventId: validated.eventId,
          eventType: row.eventType,
          organizationId: validated.organizationId,
          vehicleId: validated.vehicleId,
          billingAction: 'VEHICLE_DISCONNECTED',
        });
      } else {
        return 'deferred';
      }

      const published = await this.repository.markPublishedFromPending(row.id);
      if (!published) {
        const current = await this.prisma.vehicleRegistryLifecycleOutbox.findUnique({
          where: { id: row.id },
        });
        if (current?.status === VehicleRegistryLifecycleOutboxStatus.PUBLISHED) {
          return 'skipped';
        }
        return 'retry';
      }
      return 'published';
    } catch (error) {
      const message = formatRegistryLifecycleHandlerError(error);
      const retryCount = row.retryCount + 1;
      const permanent = isPermanentHandlerFailure(error);
      const terminal = permanent || retryCount >= VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_MAX_RETRIES;
      const backoffMs = Math.min(60_000 * retryCount, 30 * 60_000);

      if (terminal) {
        const failed = await this.repository.markFailedFromPending(row.id, {
          retryCount,
          lastError: message,
        });
        if (!failed) {
          const current = await this.prisma.vehicleRegistryLifecycleOutbox.findUnique({
            where: { id: row.id },
          });
          if (current?.status === VehicleRegistryLifecycleOutboxStatus.PUBLISHED) {
            return 'skipped';
          }
        }
        this.logger.warn(
          `Registry lifecycle outbox ${row.id} terminal failure (retry=${retryCount}): ${message}`,
        );
        return 'failed';
      }

      const retried = await this.repository.markRetryFromPending(row.id, {
        retryCount,
        lastError: message,
        nextRetryAt: new Date(Date.now() + backoffMs),
      });
      if (!retried) {
        const current = await this.prisma.vehicleRegistryLifecycleOutbox.findUnique({
          where: { id: row.id },
        });
        if (current?.status === VehicleRegistryLifecycleOutboxStatus.PUBLISHED) {
          return 'skipped';
        }
      }
      this.logger.warn(
        `Registry lifecycle outbox ${row.id} handler failed (retry=${retryCount}): ${message}`,
      );
      return 'retry';
    }
  }

  private async assertVehicleTenantForActivation(
    event: ValidatedVehicleActivatedRegistryEvent,
  ): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: event.vehicleId,
        organizationId: event.organizationId,
      },
      select: { id: true, registryLifecycle: true },
    });
    if (!vehicle) {
      throw new VehicleRegistryLifecycleBillingValidationError(
        'VEHICLE_ORG_MISMATCH',
        'Vehicle not found for organization',
      );
    }
    if (vehicle.registryLifecycle !== 'ACTIVE') {
      throw new VehicleRegistryLifecycleBillingValidationError(
        'INVALID_REGISTRY_LIFECYCLE',
        'Vehicle registry lifecycle must be ACTIVE for activation billing',
      );
    }
  }
}
