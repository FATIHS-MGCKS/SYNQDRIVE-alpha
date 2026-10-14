import { Injectable, Logger } from '@nestjs/common';
import {
  VehicleProviderSourceObservationOutcome,
  VehicleProviderSourceTimestampProvenance,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { isVsi03P2cSourceObservationCaptureEnabled } from './vsi03-p2c.config';

export type RecordProviderSourceObservationInput = {
  organizationId: string;
  vehicleId: string;
  provider: string;
  providerBindingId: string | null;
  providerTokenReference: string | null;
  pollJobId: string;
  idempotencyKey: string;
  providerFetchedAt: Date;
  providerSourceTimestamp: Date | null;
  observationOutcome: VehicleProviderSourceObservationOutcome;
};

@Injectable()
export class VsiProviderSourceObservationWriterService {
  private readonly logger = new Logger(VsiProviderSourceObservationWriterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Best-effort append-only write. Never throws to snapshot pipeline callers.
   */
  async recordObservation(input: RecordProviderSourceObservationInput): Promise<void> {
    if (!isVsi03P2cSourceObservationCaptureEnabled()) {
      return;
    }

    const provenance =
      input.providerSourceTimestamp != null
        ? VehicleProviderSourceTimestampProvenance.PROVIDER_LAST_SEEN
        : VehicleProviderSourceTimestampProvenance.PROVIDER_MISSING;

    const providerBindingScopeKey = input.providerBindingId ?? 'UNRESOLVED';
    const providerTokenScopeKey = input.providerTokenReference ?? 'NONE';

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.vehicleProviderSourceObservation.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: { id: true },
        });
        if (existing) {
          return;
        }

        const agg = await tx.vehicleProviderSourceObservation.aggregate({
          where: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            provider: input.provider,
            providerBindingScopeKey,
            providerTokenScopeKey,
          },
          _max: { observationIndex: true },
        });
        const nextIndex = (agg._max.observationIndex ?? 0n) + 1n;

        await tx.vehicleProviderSourceObservation.create({
          data: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            provider: input.provider,
            providerBindingId: input.providerBindingId,
            providerBindingScopeKey,
            providerTokenReference: input.providerTokenReference,
            providerTokenScopeKey,
            pollJobId: input.pollJobId,
            idempotencyKey: input.idempotencyKey,
            observationIndex: nextIndex,
            providerFetchedAt: input.providerFetchedAt,
            providerSourceTimestamp: input.providerSourceTimestamp,
            sourceTimestampProvenance: provenance,
            observationOutcome: input.observationOutcome,
          },
        });
      });
    } catch (err) {
      this.logger.warn(
        `VSI P2C source observation write failed (snapshot continues): vehicle=${input.vehicleId} job=${input.pollJobId} ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

export function buildDimoSnapshotSourceObservationIdempotencyKey(pollJobId: string): string {
  return `vsi03-p2c:dimo-snapshot:${pollJobId}`;
}
