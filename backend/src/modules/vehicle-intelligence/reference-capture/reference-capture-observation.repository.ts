import { Injectable } from '@nestjs/common';
import type { ReferenceCaptureObservation } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { NormalizedReferenceCaptureObservation } from './reference-capture.types';

export type PhysicalSampleDbRow = {
  physicalSampleFingerprint: string;
  normalizedValueJson: unknown;
  providerField: string | null;
  providerTimestamp: Date | null;
};

export type AppendManyIdempotentResult = {
  /** Rows actually inserted by createMany (skipDuplicates). */
  insertedCount: number;
  /** Fingerprints durably present in DB after append (inserted or pre-existing). */
  durablyRepresentedFingerprints: string[];
};

@Injectable()
export class ReferenceCaptureObservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  appendMany(observations: NormalizedReferenceCaptureObservation[]): Promise<{ count: number }> {
    return this.appendManyIdempotent(observations).then((r) => ({ count: r.insertedCount }));
  }

  /**
   * Idempotent append — DATABASE is physical bucket idempotency authority.
   * Uses PostgreSQL ON CONFLICT DO NOTHING via createMany skipDuplicates.
   */
  async appendManyIdempotent(
    observations: NormalizedReferenceCaptureObservation[],
  ): Promise<AppendManyIdempotentResult> {
    if (observations.length === 0) {
      return { insertedCount: 0, durablyRepresentedFingerprints: [] };
    }

    const inserted = await this.prisma.referenceCaptureObservation.createMany({
      data: observations.map((o) => this.toCreateData(o)),
      skipDuplicates: true,
    });

    const fingerprints = [
      ...new Set(
        observations
          .map((o) => o.physicalSampleFingerprint)
          .filter((fp): fp is string => typeof fp === 'string' && fp.length > 0),
      ),
    ];

    if (fingerprints.length === 0) {
      return { insertedCount: inserted.count, durablyRepresentedFingerprints: [] };
    }

    const sessionId = observations[0].sessionId;
    const durablyRepresentedFingerprints = await this.findExistingPhysicalSampleFingerprints(
      sessionId,
      fingerprints,
    );

    return { insertedCount: inserted.count, durablyRepresentedFingerprints };
  }

  async findExistingPhysicalSampleFingerprints(
    sessionId: string,
    fingerprints: string[],
  ): Promise<string[]> {
    if (!fingerprints.length) return [];
    const rows = await this.prisma.referenceCaptureObservation.findMany({
      where: {
        sessionId,
        physicalSampleFingerprint: { in: fingerprints },
      },
      select: { physicalSampleFingerprint: true },
    });
    return rows
      .map((r) => r.physicalSampleFingerprint)
      .filter((fp): fp is string => fp !== null);
  }

  async findPhysicalSamplesByFingerprints(
    sessionId: string,
    fingerprints: string[],
  ): Promise<Map<string, PhysicalSampleDbRow>> {
    if (!fingerprints.length) return new Map();
    const rows = await this.prisma.referenceCaptureObservation.findMany({
      where: {
        sessionId,
        physicalSampleFingerprint: { in: fingerprints },
      },
      select: {
        physicalSampleFingerprint: true,
        normalizedValueJson: true,
        providerField: true,
        providerTimestamp: true,
      },
    });
    const map = new Map<string, PhysicalSampleDbRow>();
    for (const row of rows) {
      if (!row.physicalSampleFingerprint) continue;
      map.set(row.physicalSampleFingerprint, {
        physicalSampleFingerprint: row.physicalSampleFingerprint,
        normalizedValueJson: row.normalizedValueJson,
        providerField: row.providerField,
        providerTimestamp: row.providerTimestamp,
      });
    }
    return map;
  }

  countPhysicalSampleFingerprints(sessionId: string, fingerprints: string[]): Promise<number> {
    if (!fingerprints.length) return Promise.resolve(0);
    return this.prisma.referenceCaptureObservation.count({
      where: {
        sessionId,
        physicalSampleFingerprint: { in: fingerprints },
      },
    });
  }

  private toCreateData(o: NormalizedReferenceCaptureObservation) {
    return {
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
      providerEventFingerprint: o.providerEventFingerprint ?? null,
      physicalSampleFingerprint: o.physicalSampleFingerprint ?? null,
      provenanceJson: o.provenance ? (o.provenance as Prisma.InputJsonValue) : undefined,
    };
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
