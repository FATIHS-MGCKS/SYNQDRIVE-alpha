import { Injectable } from '@nestjs/common';
import {
  DeviceConnectionEpisodeResolutionOutboxEventType,
  DeviceConnectionEpisodeResolutionOutboxStatus,
  Prisma,
} from '@prisma/client';

@Injectable()
export class DeviceConnectionEpisodeResolutionOutboxService {
  async enqueuePreparedEvents(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      vehicleId: string;
      episodeId: string;
      resolutionSnapshotId: string;
      runtimeStateVersion: number;
    },
  ): Promise<string[]> {
    const events: Array<{
      eventType: DeviceConnectionEpisodeResolutionOutboxEventType;
      idempotencyKey: string;
      payload: Record<string, unknown>;
    }> = [
      {
        eventType: DeviceConnectionEpisodeResolutionOutboxEventType.CONNECTIVITY_RUNTIME_RECALCULATE,
        idempotencyKey: `episode:${input.episodeId}:runtime:${input.resolutionSnapshotId}`,
        payload: {
          vehicleId: input.vehicleId,
          episodeId: input.episodeId,
          runtimeStateVersion: input.runtimeStateVersion,
          resolutionSnapshotId: input.resolutionSnapshotId,
        },
      },
      {
        eventType:
          DeviceConnectionEpisodeResolutionOutboxEventType.DEVICE_ALERT_RESOLVE_PREPARED,
        idempotencyKey: `episode:${input.episodeId}:alert:${input.resolutionSnapshotId}`,
        payload: {
          vehicleId: input.vehicleId,
          episodeId: input.episodeId,
          alertPhase: 'recovered',
          recoverySource: 'snapshot_obd',
          resolutionSnapshotId: input.resolutionSnapshotId,
        },
      },
    ];

    const ids: string[] = [];
    for (const event of events) {
      const row = await tx.deviceConnectionEpisodeResolutionOutbox.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          episodeId: input.episodeId,
          eventType: event.eventType,
          idempotencyKey: event.idempotencyKey,
          payload: event.payload as Prisma.InputJsonValue,
          status: DeviceConnectionEpisodeResolutionOutboxStatus.PENDING,
        },
      });
      ids.push(row.id);
    }
    return ids;
  }
}
