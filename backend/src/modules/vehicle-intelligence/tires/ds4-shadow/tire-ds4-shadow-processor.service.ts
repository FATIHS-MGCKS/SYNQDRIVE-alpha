import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import tireDs4ShadowConfig, { isTireDs4ShadowVehicleAllowlisted } from '@config/tire-ds4-shadow.config';
import { DiV0MotionCoreShadowTripMapReadService } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.service';
import { TIRE_DS4_SHADOW_ADAPTER_VERSION } from './tire-ds4-shadow-adapter.version';
import {
  eventQualityCoverageFromPayload,
  mapDs4TripMapToTireShadowInput,
} from './tire-ds4-shadow-input.mapper';
import { TireDs4ShadowProducerService } from './tire-ds4-shadow-producer.service';
import { TireDs4ShadowRepository } from './tire-ds4-shadow.repository';
import type { TireDs4ShadowJobData } from './tire-ds4-shadow.types';

export type TireDs4ShadowProcessOutcome =
  | { status: 'skipped'; reason: string }
  | { status: 'deferred'; reason: string; nextAttempt: number }
  | {
      status: 'persisted';
      result: 'inserted' | 'unchanged' | 'evidence_immutable_conflict';
    }
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

    if (!isTireDs4ShadowVehicleAllowlisted(this.config.vehicleAllowlist, data.vehicleId)) {
      return { status: 'skipped', reason: 'vehicle_not_allowlisted' };
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
        distanceKm: true,
        tripStartedAt: true,
        tripEndedAt: true,
      },
    });

    if (!ledger) {
      return { status: 'skipped', reason: 'ledger_not_found_or_invalidated' };
    }

    const read = await this.tripMapRead.readForTrip(
      ledger.organizationId,
      ledger.vehicleId,
      ledger.tripId,
    );

    if (read.status === 'PENDING') {
      return this.defer(data, ledger, 'ds4_pending');
    }

    if (read.status === 'FAILED') {
      return this.defer(data, ledger, 'ds4_failed_no_succeeded_run');
    }

    if (read.status === 'NOT_AVAILABLE') {
      if (read.failureCode === 'TRIP_NOT_FOUND') {
        await this.repository.persistTerminalMarker({
          organizationId: ledger.organizationId,
          vehicleId: ledger.vehicleId,
          tripId: ledger.tripId,
          tireSetupId: ledger.tireSetupId,
          tireTripUsageLedgerId: ledger.id,
          adapterVersion: TIRE_DS4_SHADOW_ADAPTER_VERSION,
          kind: 'ds4_not_available',
          reason: 'trip_not_found',
        });
        return { status: 'skipped', reason: 'ds4_not_available' };
      }
      return this.defer(data, ledger, 'ds4_motion_evidence_not_available_yet');
    }

    if (read.status !== 'SUCCEEDED' && read.status !== 'SUCCEEDED_EMPTY') {
      return { status: 'skipped', reason: `unexpected_read_status:${read.status}` };
    }

    if (!read.runId || !read.combinedInputIdentity || !read.pinnedSnapshotHash) {
      return this.defer(data, ledger, 'ds4_succeeded_missing_identity');
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
      return this.defer(data, ledger, 'ds4_run_row_missing');
    }

    const inputPayload = mapDs4TripMapToTireShadowInput(read, {
      tripDistanceKm: ledger.distanceKm,
      tripStartedAt: ledger.tripStartedAt,
      tripEndedAt: ledger.tripEndedAt,
    });
    const eventQualityCoverage = eventQualityCoverageFromPayload(inputPayload);
    const eventsAlgorithmVersion = read.algorithmVersions?.events ?? 'unknown';
    const speedAuthority = read.speedAuthority ?? 'unknown';
    const shadowBundleVersion = read.algorithmVersions?.bundle ?? runRow.shadowBundleVersion;

    const result = await this.repository.insertShadowInputImmutable({
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
      eventQualityCoverage,
      temporalCoverage: inputPayload.temporalCoverage,
      ds4ReadStatus: read.status,
      inputPayload,
    });

    this.logger.log(
      JSON.stringify({
        event: 'tire_ds4_shadow_persisted',
        tripId: ledger.tripId,
        ledgerId: ledger.id,
        runId: read.runId,
        eventQualityCoverage,
        temporalCoverage: inputPayload.temporalCoverage,
        result,
      }),
    );

    return { status: 'persisted', result };
  }

  private async defer(
    data: TireDs4ShadowJobData,
    ledger: {
      id: string;
      organizationId: string;
      vehicleId: string;
      tripId: string;
      tireSetupId: string;
    },
    reason: string,
  ): Promise<TireDs4ShadowProcessOutcome> {
    if (await this.repository.hasTerminalMarker(ledger.id, TIRE_DS4_SHADOW_ADAPTER_VERSION)) {
      return { status: 'skipped', reason: 'terminal_marker_blocks_retry' };
    }

    const nextAttempt = data.attempt + 1;
    if (nextAttempt >= this.config.maxAttempts) {
      await this.repository.persistTerminalMarker({
        organizationId: ledger.organizationId,
        vehicleId: ledger.vehicleId,
        tripId: ledger.tripId,
        tireSetupId: ledger.tireSetupId,
        tireTripUsageLedgerId: ledger.id,
        adapterVersion: TIRE_DS4_SHADOW_ADAPTER_VERSION,
        kind: 'retry_exhausted',
        reason,
      });
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
