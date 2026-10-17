import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { isBatteryV2HvChargingCounterBucketCaptureEnabled } from '@config/battery-health-v2.config';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import type { HvChargeSessionPersistResult } from '../hv-charge-session/hv-charge-session.types';
import { DimoChargingAddedEnergyIntervalClient } from './dimo-charging-added-energy-interval.client';
import {
  buildHvChargingCounterBatchIdempotencyKeyV1,
  computeHvChargingCounterObservationSetFingerprintV1,
} from './hv-charging-counter-evidence.fingerprint.v1';
import { mapDimoIntervalRowsToBucketInputsV1 } from './hv-charging-counter-evidence.mapper.v1';
import { HvChargingCounterEvidenceRepository } from './hv-charging-counter-evidence.repository';
import type { HvChargingCounterCaptureResultV1 } from './hv-charging-counter-evidence.types.v1';

function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

@Injectable()
export class HvChargingCounterEvidenceCaptureService {
  private readonly logger = new Logger(HvChargingCounterEvidenceCaptureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: HvChargingCounterEvidenceRepository,
    private readonly intervalClient: DimoChargingAddedEnergyIntervalClient,
  ) {}

  async captureForPersistResults(input: {
    organizationId: string;
    vehicleId: string;
    results: HvChargeSessionPersistResult[];
  }): Promise<HvChargingCounterCaptureResultV1[]> {
    if (!isBatteryV2HvChargingCounterBucketCaptureEnabled()) {
      return [];
    }

    const outputs: HvChargingCounterCaptureResultV1[] = [];
    for (const row of input.results) {
      outputs.push(
        await this.captureForSession({
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          session: row.session,
        }),
      );
    }
    return outputs;
  }

  async captureForSession(input: {
    organizationId: string;
    vehicleId: string;
    session: HvChargeSessionPersistResult['session'];
  }): Promise<HvChargingCounterCaptureResultV1> {
    if (!isBatteryV2HvChargingCounterBucketCaptureEnabled()) {
      return { skipped: true, skipReason: 'disabled' };
    }

    const session = input.session;
    if (session.source !== HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE) {
      return { skipped: true, skipReason: 'non_native_source' };
    }
    if (session.isOngoing || !session.endAt) {
      return { skipped: true, skipReason: 'ongoing_session' };
    }

    const latest = await this.repository.findLatestBatchForSegment({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segmentFingerprint: session.segmentFingerprint,
    });
    if (
      latest &&
      sameInstant(latest.segmentStartAt, session.startAt) &&
      sameInstant(latest.segmentEndAt, session.endAt) &&
      sameInstant(latest.providerObservedAt, session.providerObservedAt)
    ) {
      return {
        skipped: true,
        skipReason: 'unchanged_session_identity',
        observationSetFingerprint: latest.observationSetFingerprint,
        batchId: latest.id,
      };
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: input.vehicleId,
        organizationId: input.organizationId,
      },
      select: { dimoVehicle: { select: { tokenId: true } } },
    });
    const tokenId = vehicle?.dimoVehicle?.tokenId;
    if (tokenId == null) {
      return { skipped: true, skipReason: 'no_dimo_token' };
    }

    const queryWindowFrom = session.startAt;
    const queryWindowTo = session.endAt;

    let rows;
    try {
      rows = await this.intervalClient.fetchIntervalBuckets({
        tokenId,
        from: queryWindowFrom,
        to: queryWindowTo,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/rate|429|throttl|budget|reject/i.test(message)) {
        return { skipped: true, skipReason: 'rate_limited' };
      }
      this.logger.warn(
        `HV charging counter interval fetch failed vehicle=${input.vehicleId} segment=${session.segmentFingerprint}: ${message}`,
      );
      return { skipped: true, skipReason: 'provider_error' };
    }

    const buckets = mapDimoIntervalRowsToBucketInputsV1(rows);
    const observationSetFingerprint = computeHvChargingCounterObservationSetFingerprintV1(
      buckets,
    );

    const batchIdempotencyKey = buildHvChargingCounterBatchIdempotencyKeyV1({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segmentFingerprint: session.segmentFingerprint,
      observationSetFingerprint,
    });
    const existing = await this.repository.findBatchByIdempotency({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      idempotencyKey: batchIdempotencyKey,
    });
    if (existing) {
      return {
        skipped: true,
        skipReason: 'duplicate_batch',
        batchId: existing.id,
        observationSetFingerprint,
      };
    }

    const persist = await this.repository.persistBatch({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segmentFingerprint: session.segmentFingerprint,
      sourceHvChargeSessionId: session.id,
      dimoTokenId: tokenId,
      queryWindowFrom,
      queryWindowTo,
      segmentStartAt: session.startAt,
      segmentEndAt: session.endAt,
      providerObservedAt: session.providerObservedAt,
      observationSetFingerprint,
      buckets,
    });

    if (!persist.created) {
      return {
        skipped: true,
        skipReason: 'duplicate_batch',
        batchId: persist.batchId,
        observationSetFingerprint,
      };
    }

    return {
      skipped: false,
      batchId: persist.batchId,
      observationSetFingerprint,
      bucketsWritten: buckets.length,
      revisionsCreated: persist.revisionsCreated,
    };
  }
}
