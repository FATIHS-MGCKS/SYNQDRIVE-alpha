import { Injectable, Logger } from '@nestjs/common';
import {
  VehicleProviderSourceObservationOutcome,
  VehicleProviderSourceObservationRecordPhase,
  VehicleProviderSourceTimestampProvenance,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { isVsi03P2cSourceObservationCaptureEnabled } from './vsi03-p2c.config';
import {
  buildProviderSourceObservationScope,
  counterScopeUniqueWhere,
  type VsiProviderSourceObservationScope,
} from './vsi-provider-source-observation.scope';

export type RecordProviderFetchObservationInput = {
  organizationId: string;
  vehicleId: string;
  provider: string;
  providerBindingId: string | null;
  providerTokenReference: string | null;
  pollJobId: string;
  bullmqAttemptNumber: number;
  fetchCorrelationId: string;
  idempotencyKey: string;
  providerFetchedAt: Date;
  providerSourceTimestamp: Date | null;
  monotonicStaleSkipped: boolean;
};

export type RecordVlsApplicationObservationInput = {
  organizationId: string;
  vehicleId: string;
  provider: string;
  providerBindingId: string | null;
  providerTokenReference: string | null;
  pollJobId: string;
  fetchCorrelationId: string;
  observationIndex: bigint;
  providerFetchedAt: Date;
  providerSourceTimestamp: Date | null;
  idempotencyKey: string;
};

@Injectable()
export class VsiProviderSourceObservationWriterService {
  private readonly logger = new Logger(VsiProviderSourceObservationWriterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Durable index allocation (committed before row insert). Failed inserts leave a PERSISTENCE_FAILED tombstone.
   */
  async allocateObservationIndex(scope: VsiProviderSourceObservationScope): Promise<bigint> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.vehicleProviderSourceObservationCounter.findUnique({
        where: counterScopeUniqueWhere(scope),
      });
      if (!existing) {
        await tx.vehicleProviderSourceObservationCounter.create({
          data: {
            organizationId: scope.organizationId,
            vehicleId: scope.vehicleId,
            provider: scope.provider,
            providerBindingScopeKey: scope.providerBindingScopeKey,
            providerTokenScopeKey: scope.providerTokenScopeKey,
            nextObservationIndex: 2n,
          },
        });
        return 1n;
      }
      const allocated = existing.nextObservationIndex;
      await tx.vehicleProviderSourceObservationCounter.update({
        where: counterScopeUniqueWhere(scope),
        data: { nextObservationIndex: { increment: 1 } },
      });
      return allocated;
    });
  }

  async recordProviderFetch(
    input: RecordProviderFetchObservationInput,
  ): Promise<{ observationIndex: bigint } | null> {
    if (!isVsi03P2cSourceObservationCaptureEnabled()) {
      return null;
    }

    const scope = buildProviderSourceObservationScope(input);
    const provenance =
      input.providerSourceTimestamp != null
        ? VehicleProviderSourceTimestampProvenance.PROVIDER_LAST_SEEN
        : VehicleProviderSourceTimestampProvenance.PROVIDER_MISSING;

    const outcome = input.monotonicStaleSkipped
      ? VehicleProviderSourceObservationOutcome.MONOTONIC_STALE_SKIPPED
      : VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED;

    try {
      const existing = await this.prisma.vehicleProviderSourceObservation.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { observationIndex: true },
      });
      if (existing) {
        return { observationIndex: existing.observationIndex };
      }

      const observationIndex = await this.allocateObservationIndex(scope);
      try {
        await this.prisma.vehicleProviderSourceObservation.create({
          data: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            provider: input.provider,
            providerBindingId: input.providerBindingId,
            providerBindingScopeKey: scope.providerBindingScopeKey,
            providerTokenReference: input.providerTokenReference,
            providerTokenScopeKey: scope.providerTokenScopeKey,
            pollJobId: input.pollJobId,
            bullmqAttemptNumber: input.bullmqAttemptNumber,
            fetchCorrelationId: input.fetchCorrelationId,
            recordPhase: VehicleProviderSourceObservationRecordPhase.PROVIDER_FETCH,
            idempotencyKey: input.idempotencyKey,
            observationIndex,
            providerFetchedAt: input.providerFetchedAt,
            providerSourceTimestamp: input.providerSourceTimestamp,
            sourceTimestampProvenance: provenance,
            observationOutcome: outcome,
          },
        });
        return { observationIndex };
      } catch (insertErr) {
        await this.writePersistenceFailedTombstone({
          scope,
          input,
          observationIndex,
          provenance,
          cause: insertErr,
        });
        return null;
      }
    } catch (err) {
      this.logger.warn(
        `VSI P2C provider fetch observation failed (snapshot continues): vehicle=${input.vehicleId} job=${input.pollJobId} ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async recordVlsApplication(input: RecordVlsApplicationObservationInput): Promise<void> {
    if (!isVsi03P2cSourceObservationCaptureEnabled()) {
      return;
    }

    const scope = buildProviderSourceObservationScope(input);
    const provenance =
      input.providerSourceTimestamp != null
        ? VehicleProviderSourceTimestampProvenance.PROVIDER_LAST_SEEN
        : VehicleProviderSourceTimestampProvenance.PROVIDER_MISSING;

    try {
      const existing = await this.prisma.vehicleProviderSourceObservation.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (existing) {
        return;
      }

      await this.prisma.vehicleProviderSourceObservation.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          provider: input.provider,
          providerBindingId: input.providerBindingId,
          providerBindingScopeKey: scope.providerBindingScopeKey,
          providerTokenReference: input.providerTokenReference,
          providerTokenScopeKey: scope.providerTokenScopeKey,
          pollJobId: input.pollJobId,
          bullmqAttemptNumber: 0,
          fetchCorrelationId: input.fetchCorrelationId,
          recordPhase: VehicleProviderSourceObservationRecordPhase.VLS_APPLICATION,
          idempotencyKey: input.idempotencyKey,
          observationIndex: input.observationIndex,
          providerFetchedAt: input.providerFetchedAt,
          providerSourceTimestamp: input.providerSourceTimestamp,
          sourceTimestampProvenance: provenance,
          observationOutcome: VehicleProviderSourceObservationOutcome.VLS_COMMITTED,
        },
      });
    } catch (err) {
      this.logger.warn(
        `VSI P2C VLS application observation failed (snapshot continues): vehicle=${input.vehicleId} correlation=${input.fetchCorrelationId} ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async writePersistenceFailedTombstone(args: {
    scope: VsiProviderSourceObservationScope;
    input: RecordProviderFetchObservationInput;
    observationIndex: bigint;
    provenance: VehicleProviderSourceTimestampProvenance;
    cause: unknown;
  }): Promise<void> {
    const tombstoneKey = `${args.input.idempotencyKey}:persistence-failed`;
    try {
      await this.prisma.vehicleProviderSourceObservation.create({
        data: {
          organizationId: args.input.organizationId,
          vehicleId: args.input.vehicleId,
          provider: args.input.provider,
          providerBindingId: args.input.providerBindingId,
          providerBindingScopeKey: args.scope.providerBindingScopeKey,
          providerTokenReference: args.input.providerTokenReference,
          providerTokenScopeKey: args.scope.providerTokenScopeKey,
          pollJobId: args.input.pollJobId,
          bullmqAttemptNumber: args.input.bullmqAttemptNumber,
          fetchCorrelationId: args.input.fetchCorrelationId,
          recordPhase: VehicleProviderSourceObservationRecordPhase.PROVIDER_FETCH,
          idempotencyKey: tombstoneKey,
          observationIndex: args.observationIndex,
          providerFetchedAt: args.input.providerFetchedAt,
          providerSourceTimestamp: args.input.providerSourceTimestamp,
          sourceTimestampProvenance: args.provenance,
          observationOutcome: VehicleProviderSourceObservationOutcome.PERSISTENCE_FAILED,
        },
      });
    } catch (tombstoneErr) {
      this.logger.warn(
        `VSI P2C persistence tombstone failed index=${args.observationIndex} vehicle=${args.input.vehicleId}: ` +
          `${tombstoneErr instanceof Error ? tombstoneErr.message : String(tombstoneErr)} ` +
          `(original=${args.cause instanceof Error ? args.cause.message : String(args.cause)})`,
      );
    }
  }
}

export function buildDimoSnapshotFetchObservationIdempotencyKey(
  pollJobId: string,
  bullmqAttemptNumber: number,
): string {
  return `vsi03-p2c:fetch:${pollJobId}:attempt:${bullmqAttemptNumber}`;
}

export function buildDimoSnapshotVlsApplicationIdempotencyKey(fetchCorrelationId: string): string {
  return `vsi03-p2c:vls-application:${fetchCorrelationId}`;
}

/** @deprecated */
export function buildDimoSnapshotSourceObservationIdempotencyKey(pollJobId: string): string {
  return buildDimoSnapshotFetchObservationIdempotencyKey(pollJobId, 0);
}
