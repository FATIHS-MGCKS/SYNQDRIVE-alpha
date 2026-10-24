import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DiV0MotionCoreShadowTripMapReadService } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.service';
import { TIRE_DS4_SHADOW_ADAPTER_VERSION } from './tire-ds4-shadow-adapter.version';
import { coverageFromPayload, mapDs4TripMapToTireShadowInput } from './tire-ds4-shadow-input.mapper';
import { TireDs4ShadowProducerService } from './tire-ds4-shadow-producer.service';
import { TireDs4ShadowRepository } from './tire-ds4-shadow.repository';
import type { TireDs4ShadowJobData } from './tire-ds4-shadow.types';
import tireDs4ShadowConfig from '@config/tire-ds4-shadow.config';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';

export type TireDs4ShadowProcessOutcome =
  | { status: 'skipped'; reason: string }
  | { status: 'deferred'; reason: string; nextAttempt: number }
  | { status: 'persisted'; upsert: 'inserted' | 'unchanged' }
  | { status: 'exhausted'; reason: string; nextAttempt: number };

@Injectable()
export class TireDs4ShadowProcessorService {
  private readonly logger = new Logger(TireDs4ShadowProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripMapRead: DiV0MotionCoreShadowTripMapReadService,
    private readonly repository: TireDs4ShadowRepository,
    private readonly producer: TireDs4ShadowProducerService,
    @Inject(tireDs4ShadowConfig.KEY)
    private readonly config: ConfigType<typeof tireDs4ShadowConfig>,
  ) {}

  async processJob(data: TireDs4ShadowJobData): Promise<TireDs4ShadowProcessOutcome> {
    if (!this.config.enabled) {
      return { status: 'skipped', reason: 'feature_disabled' };
    }

    const ledger = await this.prisma.tireTripUsageLedger.findFirst({
      where: {
        id: data.tireTripUsageLedgerId,
        invalidatedAt: null,
        organizationId: data.organizationId,
        vehicleId: data.vehicleId,
        tripId: data.tripId,
      },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        tripId: true,
        tireSetupId: true,
      },
    });

    if (!ledger) {
      return { status: 'skipped', reason: 'ledger_not_found_or_invalidated' };
    }

    if (
      ledger.organizationId !== data.organizationId ||
      ledger.vehicleId !== data.vehicleId ||
      ledger.tripId !== data.tripId
    ) {
      return { status: 'skipped', reason: 'tenant_scope_mismatch' };
    }

    const read = await this.tripMapRead.readForTrip(
      ledger.organizationId,
      ledger.vehicleId,
      ledger.tripId,
    );

    if (read.status === 'PENDING') {
      return this.defer(data, 'ds4_pending');
    }

    if (read.status === 'FAILED') {
      return this.defer(data, 'ds4_failed_no_succeeded_run');
    }

    if (read.status === 'NOT_AVAILABLE') {
      return { status: 'skipped', reason: 'ds4_not_available' };
    }

    if (read.status !== 'SUCCEEDED' && read.status !== 'SUCCEEDED_EMPTY') {
      return { status: 'skipped', reason: `unexpected_read_status:${read.status}` };
    }

    if (!read.runId || !read.combinedInputIdentity || !read.pinnedSnapshotHash) {
      return this.defer(data, 'ds4_succeeded_missing_identity');
    }

    const runRow = await this.prisma.diV0MotionCoreShadowRunV1.findFirst({
      where: {
        id: read.runId,
        organizationId: ledger.organizationId,
        vehicleId: ledger.vehicleId,
        tripId: ledger.tripId,
      },
      select: { contentFingerprint: true, shadowBundleVersion: true },
    });

    if (!runRow) {
      return this.defer(data, 'ds4_run_row_missing');
    }

    const inputPayload = mapDs4TripMapToTireShadowInput(read);
    const coverage = coverageFromPayload(inputPayload);
    const eventsAlgorithmVersion = read.algorithmVersions?.events ?? 'unknown';
    const speedAuthority = read.speedAuthority ?? 'unknown';
    const shadowBundleVersion = read.algorithmVersions?.bundle ?? runRow.shadowBundleVersion;

    const upsert = await this.repository.upsertShadowInput({
      organizationId: ledger.organizationId,
      vehicleId: ledger.vehicleId,
      tripId: ledger.tripId,
      tireSetupId: ledger.tireSetupId,
      tireTripUsageLedgerId: ledger.id,
      diV0MotionCoreShadowRunId: read.runId,
      workItemId: read.workItemId,
      combinedInputIdentity: read.combinedInputIdentity,
      pinnedSnapshotHash: read.pinnedSnapshotHash,
      contentFingerprint: runRow.contentFingerprint,
      shadowBundleVersion,
      speedAuthority,
      eventsAlgorithmVersion,
      adapterVersion: TIRE_DS4_SHADOW_ADAPTER_VERSION,
      coverage,
      ds4ReadStatus: read.status,
      inputPayload,
    });

    this.logger.log(
      JSON.stringify({
        event: 'tire_ds4_shadow_persisted',
        tripId: ledger.tripId,
        ledgerId: ledger.id,
        runId: read.runId,
        coverage,
        upsert,
      }),
    );

    return { status: 'persisted', upsert };
  }

  private async defer(
    data: TireDs4ShadowJobData,
    reason: string,
  ): Promise<TireDs4ShadowProcessOutcome> {
    const nextAttempt = data.attempt + 1;
    if (nextAttempt >= this.config.maxAttempts) {
      this.logger.warn(
        JSON.stringify({
          event: 'tire_ds4_shadow_retry_exhausted',
          tripId: data.tripId,
          ledgerId: data.tireTripUsageLedgerId,
          reason,
          attempt: data.attempt,
        }),
      );
      return { status: 'exhausted', reason, nextAttempt };
    }

    const delayMs = this.producer.computeRetryDelayMs(data.attempt);
    await this.producer.enqueueMaterialize({
      organizationId: data.organizationId,
      vehicleId: data.vehicleId,
      tripId: data.tripId,
      tireTripUsageLedgerId: data.tireTripUsageLedgerId,
      attempt: nextAttempt,
      delayMs,
    });

    return { status: 'deferred', reason, nextAttempt };
  }
}
