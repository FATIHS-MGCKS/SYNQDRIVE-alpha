import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  HV_CHARGING_COUNTER_AGGREGATION_MODE,
  HV_CHARGING_COUNTER_BUCKET_WIDTH,
  HV_CHARGING_COUNTER_DIMO_QUERY_KIND,
  HV_CHARGING_COUNTER_SIGNAL_ID,
  M3_3_HV_CHARGING_ADDED_ENERGY_BUCKET_EVIDENCE_V1,
} from './hv-charging-counter-evidence.constants.v1';
import {
  HvChargingCounterEvidenceEmptyWriteError,
  HvChargingCounterEvidencePersistenceConflictError,
} from './hv-charging-counter-evidence.errors.v1';
import {
  buildHvChargingCounterBatchIdempotencyKeyV1,
  buildHvChargingCounterObservationIdempotencyKeyV1,
} from './hv-charging-counter-evidence.fingerprint.v1';
import { upsertRevalidationCheckpointAtomicallyV1 } from './hv-charging-counter-evidence.checkpoint.persistence.v1';
import { isReducedCoverageUnchangedValuesV1 } from './hv-charging-counter-evidence.coverage.v1';
import { buildHvChargingCounterObservationProvenanceV1 } from './hv-charging-counter-evidence.mapper.v1';
import type { HvChargingCounterQualityAssessmentV1 } from './hv-charging-counter-evidence.counter-quality.v1';
import type { HvChargingCounterBucketInputV1 } from './hv-charging-counter-evidence.types.v1';

export interface PersistCounterEvidenceBatchInput {
  organizationId: string;
  vehicleId: string;
  segmentFingerprint: string;
  sourceHvChargeSessionId: string | null;
  dimoTokenId: number | null;
  queryWindowFrom: Date;
  queryWindowTo: Date;
  segmentStartAt: Date;
  segmentEndAt: Date | null;
  providerObservedAt: Date | null;
  observationSetFingerprint: string;
  buckets: HvChargingCounterBucketInputV1[];
  counterQuality?: HvChargingCounterQualityAssessmentV1 | null;
}

export interface PersistCounterEvidenceBatchResult {
  created: boolean;
  batchId: string;
  observationsInserted: number;
  revisionsCreated: number;
}

function bucketMatchesLatestRevision(
  latest: {
    availability: string;
    valueKwh: number | null;
    minKwh: number | null;
    maxKwh: number | null;
  } | null,
  bucket: HvChargingCounterBucketInputV1,
): boolean {
  if (latest == null) return false;
  return (
    latest.availability === bucket.availability &&
    (latest.valueKwh ?? null) === (bucket.valueKwh ?? null) &&
    (latest.minKwh ?? null) === (bucket.minKwh ?? null) &&
    (latest.maxKwh ?? null) === (bucket.maxKwh ?? null)
  );
}

@Injectable()
export class HvChargingCounterEvidenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findLatestBatchForSegment(input: {
    organizationId: string;
    vehicleId: string;
    segmentFingerprint: string;
  }) {
    return this.prisma.batteryHvChargingCounterIngestionBatch.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        segmentFingerprint: input.segmentFingerprint,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findRevalidationCheckpoint(input: {
    organizationId: string;
    vehicleId: string;
    segmentFingerprint: string;
  }) {
    return this.prisma.batteryHvChargingCounterRevalidationCheckpoint.findUnique({
      where: {
        organizationId_vehicleId_segmentFingerprint: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          segmentFingerprint: input.segmentFingerprint,
        },
      },
    });
  }

  async recordProviderRevalidationCheckpoint(input: {
    organizationId: string;
    vehicleId: string;
    segmentFingerprint: string;
    segmentStartAt: Date;
    segmentEndAt: Date | null;
    providerObservedAt: Date | null;
    queriedAt: Date;
    observationSetFingerprint: string;
  }) {
    return this.prisma.$transaction((tx) => upsertRevalidationCheckpointAtomicallyV1(tx, input));
  }

  findBatchByIdempotency(input: {
    organizationId: string;
    vehicleId: string;
    idempotencyKey: string;
  }) {
    return this.prisma.batteryHvChargingCounterIngestionBatch.findUnique({
      where: {
        organizationId_vehicleId_idempotencyKey: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
  }

  async persistBatch(input: PersistCounterEvidenceBatchInput): Promise<PersistCounterEvidenceBatchResult> {
    const batchIdempotencyKey = buildHvChargingCounterBatchIdempotencyKeyV1({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segmentFingerprint: input.segmentFingerprint,
      observationSetFingerprint: input.observationSetFingerprint,
    });

    const existingBatch = await this.findBatchByIdempotency({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      idempotencyKey: batchIdempotencyKey,
    });
    if (existingBatch) {
      return {
        created: false,
        batchId: existingBatch.id,
        observationsInserted: 0,
        revisionsCreated: 0,
      };
    }

    const availableBucketCount = input.buckets.filter(
      (b) => b.availability === 'AVAILABLE',
    ).length;
    const missingBucketCount = input.buckets.length - availableBucketCount;

    try {
      return await this.prisma.$transaction(async (tx) => {
      const batch = await tx.batteryHvChargingCounterIngestionBatch.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          segmentFingerprint: input.segmentFingerprint,
          sourceHvChargeSessionId: input.sourceHvChargeSessionId,
          dimoTokenId: input.dimoTokenId,
          evidenceContractVersion: M3_3_HV_CHARGING_ADDED_ENERGY_BUCKET_EVIDENCE_V1,
          queryWindowFrom: input.queryWindowFrom,
          queryWindowTo: input.queryWindowTo,
          segmentStartAt: input.segmentStartAt,
          segmentEndAt: input.segmentEndAt,
          providerObservedAt: input.providerObservedAt,
          observationSetFingerprint: input.observationSetFingerprint,
          bucketWidth: HV_CHARGING_COUNTER_BUCKET_WIDTH,
          aggregationMode: HV_CHARGING_COUNTER_AGGREGATION_MODE,
          bucketCount: input.buckets.length,
          availableBucketCount,
          missingBucketCount,
          dimoQueryKind: HV_CHARGING_COUNTER_DIMO_QUERY_KIND,
          idempotencyKey: batchIdempotencyKey,
          counterQualityJson: input.counterQuality
            ? (input.counterQuality as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        },
      });

      let observationsInserted = 0;
      let revisionsCreated = 0;
      const provenance = buildHvChargingCounterObservationProvenanceV1();

      for (const bucket of input.buckets) {
        const latest = await tx.batteryHvChargingCounterObservation.findFirst({
          where: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            segmentFingerprint: input.segmentFingerprint,
            bucketStartAt: bucket.bucketStartAt,
          },
          orderBy: { revisionNumber: 'desc' },
        });

        if (bucketMatchesLatestRevision(latest, bucket)) {
          continue;
        }

        const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
        const idempotencyKey = buildHvChargingCounterObservationIdempotencyKeyV1({
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          segmentFingerprint: input.segmentFingerprint,
          bucketStartAt: bucket.bucketStartAt,
          revisionNumber,
          valueKwh: bucket.valueKwh,
          availability: bucket.availability,
        });

        try {
          await tx.batteryHvChargingCounterObservation.create({
            data: {
              organizationId: input.organizationId,
              vehicleId: input.vehicleId,
              segmentFingerprint: input.segmentFingerprint,
              batchId: batch.id,
              bucketStartAt: bucket.bucketStartAt,
              bucketEndAt: bucket.bucketEndAt,
              bucketWidth: HV_CHARGING_COUNTER_BUCKET_WIDTH,
              aggregationMode: HV_CHARGING_COUNTER_AGGREGATION_MODE,
              signalName: HV_CHARGING_COUNTER_SIGNAL_ID,
              unit: 'kWh',
              valueKwh: bucket.valueKwh,
              minKwh: bucket.minKwh,
              maxKwh: bucket.maxKwh,
              availability: bucket.availability,
              evidenceContractVersion: M3_3_HV_CHARGING_ADDED_ENERGY_BUCKET_EVIDENCE_V1,
              providerSource: 'DIMO',
              providerTimestampUncertainty: true,
              provenance: provenance as Prisma.InputJsonValue,
              revisionNumber,
              supersedesObservationId: latest?.id ?? null,
              idempotencyKey,
            },
          });
          observationsInserted += 1;
          revisionsCreated += 1;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            throw error;
          }
          throw error;
        }
      }

      if (input.buckets.length > 0 && observationsInserted === 0) {
        const reducedCoverage = await isReducedCoverageUnchangedValuesV1(tx, {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          segmentFingerprint: input.segmentFingerprint,
          buckets: input.buckets,
        });
        if (!reducedCoverage) {
          throw new HvChargingCounterEvidenceEmptyWriteError(
            'refusing empty observation write for non-empty bucket set',
          );
        }
      }

      return {
        created: true,
        batchId: batch.id,
        observationsInserted,
        revisionsCreated,
      };
    });
    } catch (error) {
      if (
        error instanceof HvChargingCounterEvidenceEmptyWriteError ||
        error instanceof HvChargingCounterEvidencePersistenceConflictError
      ) {
        throw error;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.findBatchByIdempotency({
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          idempotencyKey: batchIdempotencyKey,
        });
        if (raced) {
          return {
            created: false,
            batchId: raced.id,
            observationsInserted: 0,
            revisionsCreated: 0,
          };
        }
      }
      throw error;
    }
  }
}
