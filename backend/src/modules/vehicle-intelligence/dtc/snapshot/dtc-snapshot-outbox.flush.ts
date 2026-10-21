import { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { NotificationProducerIngestService } from '@modules/notifications/adapters/notification-producer.ingest.service';
import type { DtcService } from '../dtc.service';
import type { DtcSnapshotOutboxPayload } from './dtc-snapshot-outbox.types';

export async function flushDtcSnapshotOutbox(input: {
  prisma: PrismaService;
  dtcService: DtcService;
  notificationIngest?: NotificationProducerIngestService;
  vehicleId?: string;
  limit?: number;
  logger?: { warn: (msg: string) => void };
}): Promise<{ processed: number; failed: number }> {
  const limit = input.limit ?? 50;
  const pending = await input.prisma.vehicleDtcSnapshotOutbox.findMany({
    where: {
      processedAt: null,
      ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let processed = 0;
  let failed = 0;

  for (const row of pending) {
    const payload = row.payload as unknown as DtcSnapshotOutboxPayload;
    try {
      if (payload.kind === 'vehicle_health') {
        if (!input.notificationIngest) {
          failed++;
          continue;
        }
        await input.notificationIngest.ingestVehicleHealthSources(
          payload.organizationId,
          payload.auditRef,
          payload.sources,
        );
      } else if (payload.kind === 'downstream_episode') {
        if (payload.episodeKind === 'upsert') {
          const event = payload.eventId
            ? await input.prisma.vehicleDtcEvent.findUnique({ where: { id: payload.eventId } })
            : await input.prisma.vehicleDtcEvent.findFirst({
                where: {
                  vehicleId: payload.vehicleId,
                  dtcCode: payload.dtcCode,
                  isActive: true,
                },
              });
          await input.dtcService.runEpisodeSideEffectsAfterCommit(
            payload.vehicleId,
            payload.dtcCode,
            'upsert',
            payload.producerContext,
            event ?? undefined,
          );
        } else {
          await input.dtcService.runEpisodeSideEffectsAfterCommit(
            payload.vehicleId,
            payload.dtcCode,
            'clear',
            payload.producerContext,
          );
        }
      } else {
        await input.prisma.vehicleDtcSnapshotOutbox.update({
          where: { id: row.id },
          data: { processedAt: new Date(), lastError: 'UNKNOWN_PAYLOAD_KIND' },
        });
        failed++;
        continue;
      }

      await input.prisma.vehicleDtcSnapshotOutbox.update({
        where: { id: row.id },
        data: { processedAt: new Date(), lastError: null },
      });
      processed++;
    } catch (err) {
      failed++;
      await input.prisma.vehicleDtcSnapshotOutbox.update({
        where: { id: row.id },
        data: { lastError: (err as Error).message.slice(0, 500) },
      });
      input.logger?.warn(
        `DTC outbox flush failed id=${row.id}: ${(err as Error).message}`,
      );
    }
  }

  return { processed, failed };
}

export async function enqueueDtcSnapshotOutbox(
  tx: Prisma.TransactionClient,
  row: {
    vehicleId: string;
    organizationId: string;
    idempotencyKey: string;
    payload: DtcSnapshotOutboxPayload;
  },
): Promise<void> {
  await tx.vehicleDtcSnapshotOutbox.create({
    data: {
      vehicleId: row.vehicleId,
      organizationId: row.organizationId,
      idempotencyKey: row.idempotencyKey,
      payload: row.payload as unknown as Prisma.InputJsonValue,
    },
  });
}
