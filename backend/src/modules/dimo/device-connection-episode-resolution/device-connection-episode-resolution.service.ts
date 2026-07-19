import { Injectable, Logger } from '@nestjs/common';
import {
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DeviceConnectionEpisodeResolutionOutboxService } from './device-connection-episode-resolution-outbox.service';
import {
  buildSnapshotReferenceId,
  evaluateSnapshotPlugResolution,
  type SnapshotPlugSignalInput,
} from './device-connection-episode-resolution.snapshot-evaluator';
import { VehicleConnectivityRuntimeProjectionService } from './vehicle-connectivity-runtime-projection.service';

export type SnapshotPlugResolutionResult =
  | { outcome: 'resolved'; episodeId: string; resolutionSnapshotId: string }
  | { outcome: 'already_resolved'; episodeId?: string }
  | { outcome: 'same_snapshot_applied'; episodeId: string }
  | { outcome: 'no_open_episode' }
  | { outcome: 'rejected'; reason: string };

@Injectable()
export class DeviceConnectionEpisodeResolutionService {
  private readonly logger = new Logger(DeviceConnectionEpisodeResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtimeProjection: VehicleConnectivityRuntimeProjectionService,
    private readonly outbox: DeviceConnectionEpisodeResolutionOutboxService,
  ) {}

  async tryResolveFromSnapshotPlugSignal(
    input: SnapshotPlugSignalInput,
  ): Promise<SnapshotPlugResolutionResult> {
    const openEpisode = await this.prisma.deviceConnectionEpisode.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: input.provider,
        status: DeviceConnectionEpisodeStatus.OPEN,
      },
      orderBy: { openedAt: 'desc' },
    });

    const evaluation = evaluateSnapshotPlugResolution(input, openEpisode);
    if (evaluation.action === 'noop') {
      if (evaluation.reason === 'same_snapshot_already_applied' && openEpisode) {
        return {
          outcome: 'same_snapshot_applied',
          episodeId: openEpisode.id,
        };
      }
      return {
        outcome: 'already_resolved',
        episodeId: openEpisode?.id,
      };
    }
    if (evaluation.action === 'reject') {
      if (evaluation.reason === 'no_open_episode') {
        return { outcome: 'no_open_episode' };
      }
      return { outcome: 'rejected', reason: evaluation.reason };
    }

    const episodeId = openEpisode!.id;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.deviceConnectionEpisode.updateMany({
          where: {
            id: episodeId,
            status: DeviceConnectionEpisodeStatus.OPEN,
          },
          data: {
            status: DeviceConnectionEpisodeStatus.RESOLVED,
            resolvedAt: evaluation.resolvedAt,
            resolutionMethod:
              DeviceConnectionEpisodeResolutionMethod.SNAPSHOT_PLUG_SIGNAL,
            resolutionEvidenceAt: evaluation.providerObservedAt,
            resolutionSnapshotId: input.snapshotReferenceId,
            stateVersion: { increment: 1 },
          },
        });

        if (claimed.count === 0) {
          const current = await tx.deviceConnectionEpisode.findUnique({
            where: { id: episodeId },
          });
          if (current?.resolutionSnapshotId === input.snapshotReferenceId) {
            return {
              outcome: 'same_snapshot_applied',
              episodeId,
            } satisfies SnapshotPlugResolutionResult;
          }
          return {
            outcome: 'already_resolved',
            episodeId,
          } satisfies SnapshotPlugResolutionResult;
        }

        const runtimeState = await this.runtimeProjection.projectForVehicle(
          input.organizationId,
          input.vehicleId,
        );

        await tx.deviceConnectionEpisodeResolutionAudit.create({
          data: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            episodeId,
            resolutionMethod:
              DeviceConnectionEpisodeResolutionMethod.SNAPSHOT_PLUG_SIGNAL,
            resolutionSnapshotId: input.snapshotReferenceId,
            providerObservedAt: evaluation.providerObservedAt,
            receivedAt: input.receivedAt,
            outcome: 'resolved',
            metadata: {
              runtimeOverallState: runtimeState.overallState,
              runtimePhysicalDeviceState: runtimeState.physicalDeviceState,
              runtimeStateVersion: runtimeState.stateVersion,
              obdIsPluggedIn: input.obdIsPluggedIn,
              snapshotSource: input.snapshotSource,
              providerBindingId: input.providerBindingId,
            },
          },
        });

        await this.outbox.enqueuePreparedEvents(tx, {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          episodeId,
          resolutionSnapshotId: input.snapshotReferenceId,
          runtimeStateVersion: runtimeState.stateVersion,
        });

        this.logger.log(
          `Resolved device connection episode ${episodeId} via SNAPSHOT_PLUG_SIGNAL for vehicle ${input.vehicleId}`,
        );

        return {
          outcome: 'resolved',
          episodeId,
          resolutionSnapshotId: input.snapshotReferenceId,
        } satisfies SnapshotPlugResolutionResult;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return {
          outcome: 'same_snapshot_applied',
          episodeId,
        };
      }
      throw err;
    }
  }

  buildSnapshotReference(
    vehicleLatestStateId: string,
    providerObservedAt: Date,
  ): string {
    return buildSnapshotReferenceId({ vehicleLatestStateId, providerObservedAt });
  }
}
