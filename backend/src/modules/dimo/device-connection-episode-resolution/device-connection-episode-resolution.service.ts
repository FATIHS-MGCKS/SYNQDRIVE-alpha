import { Injectable, Logger, Optional } from '@nestjs/common';
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
import {
  evaluateSustainedTelemetryPolicy,
  evaluateTelemetryObservationGuard,
  isProviderConnectionStatusActive,
  type TelemetryRecoverySignalInput,
} from './device-connection-telemetry-recovery.evaluator';
import {
  loadTelemetryRecoveryPolicy,
  type TelemetryRecoveryPolicy,
} from './device-connection-telemetry-recovery.policy';
import { ConnectivityRecoveryPolicyService } from '../connectivity/connectivity-recovery.policy';

export type SnapshotPlugResolutionResult =
  | { outcome: 'resolved'; episodeId: string; resolutionSnapshotId: string }
  | { outcome: 'already_resolved'; episodeId?: string }
  | { outcome: 'same_snapshot_applied'; episodeId: string }
  | { outcome: 'no_open_episode' }
  | { outcome: 'rejected'; reason: string };

export type TelemetryRecoveryResolutionResult =
  | {
      outcome: 'resolved';
      episodeId: string;
      resolutionSnapshotId: string;
      policyVariant: string;
    }
  | { outcome: 'accumulated'; episodeId: string; observationCount: number }
  | { outcome: 'already_resolved'; episodeId?: string }
  | { outcome: 'same_snapshot_applied'; episodeId: string }
  | { outcome: 'no_open_episode' }
  | { outcome: 'rejected'; reason: string };

@Injectable()
export class DeviceConnectionEpisodeResolutionService {
  private readonly logger = new Logger(DeviceConnectionEpisodeResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: DeviceConnectionEpisodeResolutionOutboxService,
    @Optional() private readonly recoveryPolicy?: ConnectivityRecoveryPolicyService,
  ) {}

  private readonly telemetryPolicy: TelemetryRecoveryPolicy = loadTelemetryRecoveryPolicy();

  private isEpisodeRecoveryEnabled(): boolean {
    return this.recoveryPolicy?.isEpisodeRecoveryEnabled() ?? true;
  }

  async tryResolveFromSnapshotPlugSignal(
    input: SnapshotPlugSignalInput,
  ): Promise<SnapshotPlugResolutionResult> {
    if (!this.isEpisodeRecoveryEnabled()) {
      return { outcome: 'rejected', reason: 'recovery_disabled' };
    }
    const openEpisode = await this.findOpenEpisode({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider: input.provider,
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
          return this.handleResolutionRace(
            tx,
            episodeId,
            input.snapshotReferenceId,
          );
        }

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
              resolutionEvidenceAt: evaluation.providerObservedAt.toISOString(),
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
          resolutionEvidenceAt: evaluation.providerObservedAt,
          recoverySource: 'snapshot_obd',
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

  async tryResolveFromSustainedTelemetry(
    input: TelemetryRecoverySignalInput,
  ): Promise<TelemetryRecoveryResolutionResult> {
    if (!this.isEpisodeRecoveryEnabled()) {
      return { outcome: 'rejected', reason: 'recovery_disabled' };
    }

    const openEpisode = await this.findOpenEpisode({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider: input.provider,
    });
    const guard = evaluateTelemetryObservationGuard(
      input,
      openEpisode,
      this.telemetryPolicy,
    );

    if (guard.action === 'noop') {
      if (guard.reason === 'same_snapshot_already_applied' && openEpisode) {
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

    if (guard.action === 'reject') {
      if (guard.reason === 'no_open_episode') {
        return { outcome: 'no_open_episode' };
      }
      return { outcome: 'rejected', reason: guard.reason };
    }

    const episodeId = openEpisode!.id;
    const connectionStatusActive = isProviderConnectionStatusActive(
      input.providerConnectionStatus,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.deviceConnectionTelemetryRecoveryObservation.create({
          data: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            episodeId,
            snapshotReferenceId: input.snapshotReferenceId,
            providerObservedAt: guard.providerObservedAt,
            receivedAt: input.receivedAt,
            hasOperationalSignal: input.hasOperationalSignal,
            connectionStatusActive,
            providerBindingId: input.providerBindingId,
          },
        });

        const observations = await tx.deviceConnectionTelemetryRecoveryObservation.findMany({
          where: { episodeId },
          orderBy: { providerObservedAt: 'asc' },
          select: {
            providerObservedAt: true,
            receivedAt: true,
            hasOperationalSignal: true,
            connectionStatusActive: true,
          },
        });

        const tripStartedOrCompletedAfterUnplug = await this.hasTripEvidenceAfter(
          tx,
          input.vehicleId,
          openEpisode!.openedAt,
        );

        const sustained = evaluateSustainedTelemetryPolicy({
          observations,
          tripStartedOrCompletedAfterUnplug,
          referenceReceivedAt: input.receivedAt,
          policy: this.telemetryPolicy,
        });

        if (!sustained.satisfied || !sustained.evidenceAt) {
          return {
            outcome: 'accumulated',
            episodeId,
            observationCount: sustained.observationCount,
          };
        }

        const claimed = await tx.deviceConnectionEpisode.updateMany({
          where: {
            id: episodeId,
            status: DeviceConnectionEpisodeStatus.OPEN,
          },
          data: {
            status: DeviceConnectionEpisodeStatus.RESOLVED,
            resolvedAt: sustained.evidenceAt,
            resolutionMethod:
              DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED,
            resolutionEvidenceAt: sustained.evidenceAt,
            resolutionSnapshotId: input.snapshotReferenceId,
            stateVersion: { increment: 1 },
          },
        });

        if (claimed.count === 0) {
          return this.handleTelemetryResolutionRace(
            tx,
            episodeId,
            input.snapshotReferenceId,
          );
        }

        await tx.deviceConnectionEpisodeResolutionAudit.create({
          data: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            episodeId,
            resolutionMethod:
              DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED,
            resolutionSnapshotId: input.snapshotReferenceId,
            providerObservedAt: sustained.evidenceAt,
            receivedAt: input.receivedAt,
            outcome: 'resolved',
            metadata: {
              resolutionEvidenceAt: sustained.evidenceAt.toISOString(),
              policyVariant: sustained.variant,
              observationCount: sustained.observationCount,
              tripStartedOrCompletedAfterUnplug,
              providerBindingId: input.providerBindingId,
              connectionStatusActive,
            },
          },
        });

        await this.outbox.enqueuePreparedEvents(tx, {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          episodeId,
          resolutionSnapshotId: input.snapshotReferenceId,
          resolutionEvidenceAt: sustained.evidenceAt,
          recoverySource: 'telemetry_resumed',
        });

        this.logger.log(
          `Resolved device connection episode ${episodeId} via TELEMETRY_RESUMED (${sustained.variant}) for vehicle ${input.vehicleId}`,
        );

        return {
          outcome: 'resolved',
          episodeId,
          resolutionSnapshotId: input.snapshotReferenceId,
          policyVariant: sustained.variant!,
        };
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const observations = await this.prisma.deviceConnectionTelemetryRecoveryObservation.count({
          where: { episodeId },
        });
        const resolved = await this.prisma.deviceConnectionEpisode.findUnique({
          where: { id: episodeId },
        });
        if (resolved?.status === DeviceConnectionEpisodeStatus.RESOLVED) {
          if (resolved.resolutionSnapshotId === input.snapshotReferenceId) {
            return {
              outcome: 'same_snapshot_applied',
              episodeId,
            };
          }
          return { outcome: 'already_resolved', episodeId };
        }
        return {
          outcome: 'accumulated',
          episodeId,
          observationCount: observations,
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

  private async findOpenEpisode(input: {
    organizationId: string;
    vehicleId: string;
    provider: string;
  }) {
    return this.prisma.deviceConnectionEpisode.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: input.provider,
        status: DeviceConnectionEpisodeStatus.OPEN,
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  private async hasTripEvidenceAfter(
    tx: Prisma.TransactionClient,
    vehicleId: string,
    openedAt: Date,
  ): Promise<boolean> {
    const trip = await tx.vehicleTrip.findFirst({
      where: {
        vehicleId,
        OR: [
          { startTime: { gt: openedAt } },
          { endTime: { gt: openedAt } },
        ],
      },
      select: { id: true },
    });
    return trip != null;
  }

  private async handleResolutionRace(
    tx: Prisma.TransactionClient,
    episodeId: string,
    snapshotReferenceId: string,
  ): Promise<SnapshotPlugResolutionResult> {
    const current = await tx.deviceConnectionEpisode.findUnique({
      where: { id: episodeId },
    });
    if (current?.resolutionSnapshotId === snapshotReferenceId) {
      return {
        outcome: 'same_snapshot_applied',
        episodeId,
      };
    }
    return {
      outcome: 'already_resolved',
      episodeId,
    };
  }

  private async handleTelemetryResolutionRace(
    tx: Prisma.TransactionClient,
    episodeId: string,
    snapshotReferenceId: string,
  ): Promise<TelemetryRecoveryResolutionResult> {
    const current = await tx.deviceConnectionEpisode.findUnique({
      where: { id: episodeId },
    });
    if (current?.resolutionSnapshotId === snapshotReferenceId) {
      return {
        outcome: 'same_snapshot_applied',
        episodeId,
      };
    }
    return {
      outcome: 'already_resolved',
      episodeId,
    };
  }
}
