import { Injectable } from '@nestjs/common';
import {
  BrakeServiceOutboxEventType,
  BrakeServiceOutboxStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BrakeRecalculationOrchestratorService } from './brake-recalculation-orchestrator.service';
import { buildBrakeOutboxIdempotencyKey } from './brake-service-application.domain';

@Injectable()
export class BrakeServiceOutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recalcOrchestrator: BrakeRecalculationOrchestratorService,
  ) {}

  async enqueueInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      vehicleId: string;
      applicationId: string;
      serviceEventId: string;
      eventTypes: BrakeServiceOutboxEventType[];
    },
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const eventType of input.eventTypes) {
      const row = await tx.brakeServiceOutbox.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          applicationId: input.applicationId,
          serviceEventId: input.serviceEventId,
          eventType,
          idempotencyKey: buildBrakeOutboxIdempotencyKey(input.applicationId, eventType),
          payload: { vehicleId: input.vehicleId, applicationId: input.applicationId },
          status: BrakeServiceOutboxStatus.PENDING,
        },
      });
      ids.push(row.id);
    }
    return ids;
  }

  async processForApplication(applicationId: string): Promise<{ processed: number; failed: number }> {
    const entries = await this.prisma.brakeServiceOutbox.findMany({
      where: {
        applicationId,
        status: { in: [BrakeServiceOutboxStatus.PENDING, BrakeServiceOutboxStatus.FAILED] },
      },
      orderBy: { createdAt: 'asc' },
    });

    let processed = 0;
    let failed = 0;
    for (const entry of entries) {
      const claimed = await this.prisma.brakeServiceOutbox.updateMany({
        where: {
          id: entry.id,
          status: { in: [BrakeServiceOutboxStatus.PENDING, BrakeServiceOutboxStatus.FAILED] },
        },
        data: {
          status: BrakeServiceOutboxStatus.PROCESSING,
          attempts: { increment: 1 },
        },
      });
      if (claimed.count === 0) continue;

      try {
        if (
          entry.eventType === BrakeServiceOutboxEventType.RECALCULATE ||
          entry.eventType === BrakeServiceOutboxEventType.RESOLVE_ALERTS
        ) {
          await this.recalcOrchestrator.enqueue({
            vehicleId: entry.vehicleId,
            organizationId: entry.organizationId,
            trigger: 'service',
          });
        }

        await this.prisma.brakeServiceOutbox.update({
          where: { id: entry.id },
          data: {
            status: BrakeServiceOutboxStatus.COMPLETED,
            processedAt: new Date(),
            lastError: null,
          },
        });
        processed += 1;
      } catch (error) {
        failed += 1;
        await this.prisma.brakeServiceOutbox.update({
          where: { id: entry.id },
          data: {
            status: BrakeServiceOutboxStatus.FAILED,
            lastError: error instanceof Error ? error.message : String(error),
            availableAt: new Date(Date.now() + 60_000),
          },
        });
      }
    }

    return { processed, failed };
  }
}
