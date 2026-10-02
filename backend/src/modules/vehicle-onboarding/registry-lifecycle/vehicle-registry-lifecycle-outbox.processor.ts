import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { VehicleRegistryLifecycleOutboxStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingVehicleRegistryOffboardProjection } from '@modules/billing/registry-lifecycle/billing-vehicle-registry-offboard.projection';
import {
  validateVehicleOffboardedRegistryEvent,
  VehicleRegistryLifecycleBillingValidationError,
} from '@modules/billing/registry-lifecycle/validate-vehicle-offboarded-registry-event';
import { VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_MAX_RETRIES } from './vehicle-registry-lifecycle-outbox.constants';

export type RegistryLifecycleOutboxProcessOutcome =
  | 'published'
  | 'retry'
  | 'failed'
  | 'skipped';

function formatRegistryLifecycleHandlerError(error: unknown): string {
  if (error instanceof ConflictException || error instanceof BadRequestException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    try {
      return JSON.stringify(response);
    } catch {
      return 'registry_lifecycle_handler_rejected';
    }
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'registry_lifecycle_outbox_handler_failed';
}

@Injectable()
export class VehicleRegistryLifecycleOutboxProcessor {
  private readonly logger = new Logger(VehicleRegistryLifecycleOutboxProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingOffboardProjection: BillingVehicleRegistryOffboardProjection,
  ) {}

  async processPendingBatch(limit: number): Promise<
    Array<{ outboxId: string; outcome: RegistryLifecycleOutboxProcessOutcome }>
  > {
    const now = new Date();
    const rows = await this.prisma.vehicleRegistryLifecycleOutbox.findMany({
      where: {
        status: VehicleRegistryLifecycleOutboxStatus.PENDING,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: { occurredAt: 'asc' },
      take: limit,
    });

    const results: Array<{ outboxId: string; outcome: RegistryLifecycleOutboxProcessOutcome }> = [];
    for (const row of rows) {
      results.push({ outboxId: row.id, outcome: await this.processRow(row.id) });
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

    try {
      if (row.eventType === 'VEHICLE_OFFBOARDED') {
        const validated = validateVehicleOffboardedRegistryEvent(row);
        await this.billingOffboardProjection.onVehicleOffboardedLifecycleEvent(validated);
      } else {
        throw new VehicleRegistryLifecycleBillingValidationError(
          'UNSUPPORTED_EVENT_TYPE',
          `No registered handler for ${row.eventType}`,
        );
      }

      await this.prisma.vehicleRegistryLifecycleOutbox.update({
        where: { id: row.id },
        data: {
          status: VehicleRegistryLifecycleOutboxStatus.PUBLISHED,
          publishedAt: new Date(),
          lastError: null,
          nextRetryAt: null,
        },
      });
      return 'published';
    } catch (error) {
      const message = formatRegistryLifecycleHandlerError(error);
      const validationTerminal =
        error instanceof VehicleRegistryLifecycleBillingValidationError;
      const retryCount = row.retryCount + 1;
      const terminal =
        validationTerminal || retryCount >= VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_MAX_RETRIES;
      const backoffMs = Math.min(60_000 * retryCount, 30 * 60_000);
      await this.prisma.vehicleRegistryLifecycleOutbox.update({
        where: { id: row.id },
        data: {
          status: terminal
            ? VehicleRegistryLifecycleOutboxStatus.FAILED
            : VehicleRegistryLifecycleOutboxStatus.PENDING,
          retryCount,
          lastError: message.slice(0, 2000),
          nextRetryAt: terminal ? null : new Date(Date.now() + backoffMs),
        },
      });
      this.logger.warn(
        `Registry lifecycle outbox ${row.id} handler failed (retry=${retryCount}): ${message}`,
      );
      return terminal ? 'failed' : 'retry';
    }
  }
}
