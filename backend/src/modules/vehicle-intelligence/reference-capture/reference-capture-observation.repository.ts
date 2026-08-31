import { Injectable } from '@nestjs/common';
import type { ReferenceCaptureObservation } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { NormalizedReferenceCaptureObservation } from './reference-capture.types';

@Injectable()
export class ReferenceCaptureObservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  appendMany(observations: NormalizedReferenceCaptureObservation[]): Promise<{ count: number }> {
    if (observations.length === 0) return Promise.resolve({ count: 0 });

    return this.prisma.referenceCaptureObservation.createMany({
      data: observations.map((o) => ({
        sessionId: o.sessionId,
        organizationId: o.organizationId,
        vehicleId: o.vehicleId,
        envelopeVersion: o.envelopeVersion,
        observationKind: o.observationKind,
        provider: o.provider,
        connectionProfile: o.connectionProfile,
        powertrainProfile: o.powertrainProfile ?? null,
        providerField: o.providerField ?? null,
        canonicalKey: o.canonicalKey ?? null,
        rawIdentity: o.rawIdentity,
        acquisitionSurface: o.acquisitionSurface ?? null,
        acquisitionTier: o.acquisitionTier ?? null,
        temporalClass: o.temporalClass ?? null,
        rawValueJson: o.rawValue as Prisma.InputJsonValue,
        rawUnit: o.rawUnit ?? null,
        normalizedValueJson:
          o.normalizedValue === undefined || o.normalizedValue === null
            ? undefined
            : (o.normalizedValue as Prisma.InputJsonValue),
        normalizedUnit: o.normalizedUnit ?? null,
        providerTimestamp: o.providerTimestamp ?? null,
        synqReceivedAt: o.synqReceivedAt,
        requestStartedAt: o.requestStartedAt ?? null,
        requestCompletedAt: o.requestCompletedAt ?? null,
        requestCorrelationId: o.requestCorrelationId ?? null,
        sequenceNumber: o.sequenceNumber ?? null,
        capabilityState: o.capabilityState ?? null,
        provenanceJson: o.provenance ? (o.provenance as Prisma.InputJsonValue) : undefined,
      })),
    });
  }

  countBySession(sessionId: string): Promise<number> {
    return this.prisma.referenceCaptureObservation.count({ where: { sessionId } });
  }

  findBySession(
    organizationId: string,
    sessionId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<ReferenceCaptureObservation[]> {
    return this.prisma.referenceCaptureObservation.findMany({
      where: { sessionId, organizationId },
      orderBy: [{ synqReceivedAt: 'asc' }, { sequenceNumber: 'asc' }],
      take: options?.limit,
      skip: options?.offset,
    });
  }

  deleteOlderThan(cutoff: Date): Promise<{ count: number }> {
    return this.prisma.referenceCaptureObservation.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
  }
}
