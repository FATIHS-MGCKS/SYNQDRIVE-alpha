import { Injectable, Logger } from '@nestjs/common';
import {
  BatteryDriveProfile,
  BatteryGeneralizedEvidenceClass,
  BatteryMeasurementType,
  BatteryProviderObservabilityGapStatus,
} from '@prisma/client';
import {
  isBatteryV2ProviderObservabilityGapEnabled,
} from '@config/battery-health-v2.config';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import type { BatteryProviderObservationDecision } from '../battery-provider-observation.policy';
import type { ClassifySnapshotObservationInput } from '../jobs/battery-v2-snapshot-observation.producer';
import type { ClassifySnapshotObservationResult } from '../jobs/battery-v2-snapshot-observation.producer';
import type { BatteryObservationClassifyPayload } from '../jobs/battery-v2-job.types';
import { buildShutdownFieldBundleFromSnapshotIngest } from '../shutdown-evidence/shutdown-evidence-provenance.builder';
import { classifyGeneralizedEvidence } from '../generalized-evidence/generalized-evidence-classification.policy';
import { resolveStateAlignment } from '../shutdown-evidence/shutdown-evidence-classification.policy';
import {
  PROVIDER_GAP_CONTRACT_VERSION,
  PROVIDER_GAP_SIGNAL_FAMILY,
} from './provider-observability-gap.constants';
import {
  buildProviderGapOpenIdempotencyKey,
  buildProviderGapResolutionIdempotencyKey,
} from './provider-observability-gap-idempotency.policy';
import {
  isPreGapTrustworthyEngineOffEvidenceClass,
  isSuccessfulPollGapEntryOutcome,
} from './provider-observability-gap-entry.policy';
import { resolveProviderGapFromEvidenceClass } from './provider-observability-gap-resolution.policy';
import { ProviderObservabilityGapRepository } from './provider-observability-gap.repository';

const ICE_FUEL_TYPES = new Set(['GASOLINE', 'DIESEL']);

export type ProviderGapHookOutcome =
  | 'skipped_flag_off'
  | 'skipped_no_lv_decision'
  | 'skipped_outcome'
  | 'skipped_scope'
  | 'skipped_pre_gap_trustworthy_off'
  | 'skipped_no_anchor'
  | 'opened'
  | 'extended'
  | 'unchanged';

@Injectable()
export class ProviderObservabilityGapService {
  private readonly logger = new Logger(ProviderObservabilityGapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ProviderObservabilityGapRepository,
    private readonly batteryPolicy: BatteryPolicyProfileService,
  ) {}

  /**
   * Successful DIMO snapshot poll path when LV would not persist (stale replay).
   * MUST NOT create measurements, generalized evidence, ENGINE_OFF, or rest sessions.
   */
  async handleSuccessfulPollWithoutPersist(
    input: ClassifySnapshotObservationInput,
    classifyResult: ClassifySnapshotObservationResult,
  ): Promise<ProviderGapHookOutcome> {
    if (!isBatteryV2ProviderObservabilityGapEnabled()) {
      return 'skipped_flag_off';
    }

    const lvDecision = classifyResult.lvDecision;
    if (!lvDecision) {
      return 'skipped_no_lv_decision';
    }
    if (!isSuccessfulPollGapEntryOutcome(lvDecision.outcome)) {
      return 'skipped_outcome';
    }
    if (classifyResult.shouldEnqueue) {
      return 'skipped_outcome';
    }

    const scopeOk = await this.isIceR1GeneralizedScope(input.vehicleId);
    if (!scopeOk) {
      return 'skipped_scope';
    }

    const lastFreshProviderAt = lvDecision.observedAt;
    if (!lastFreshProviderAt) {
      return 'skipped_no_anchor';
    }

    const preGapClass = await this.classifyPreGapBundle(
      input,
      classifyResult.snapshotContext,
      lastFreshProviderAt,
    );
    if (
      preGapClass &&
      isPreGapTrustworthyEngineOffEvidenceClass(preGapClass)
    ) {
      return 'skipped_pre_gap_trustworthy_off';
    }

    const lastMeasurement = await this.prisma.batteryMeasurement.findFirst({
      where: {
        vehicleId: input.vehicleId,
        type: BatteryMeasurementType.LIVE_VOLTAGE,
        observedAt: lastFreshProviderAt,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const idempotencyKey = buildProviderGapOpenIdempotencyKey({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      lastFreshProviderAt,
    });

    const openResult = await this.repository.openOrExtendGap({
      organization: { connect: { id: input.organizationId } },
      vehicle: { connect: { id: input.vehicleId } },
      contractVersion: PROVIDER_GAP_CONTRACT_VERSION,
      signalFamily: PROVIDER_GAP_SIGNAL_FAMILY,
      status: BatteryProviderObservabilityGapStatus.OPEN,
      gapDetectedAt: input.receivedAt,
      lastFreshProviderAt,
      lastFreshObservation: lastMeasurement
        ? { connect: { id: lastMeasurement.id } }
        : undefined,
      lastKnownEvidenceClass: preGapClass ?? undefined,
      idempotencyKey,
    });

    if (openResult.outcome === 'created') {
      this.logger.debug(
        `provider gap OPEN vehicle=${input.vehicleId} anchor=${lastFreshProviderAt.toISOString()}`,
      );
      return 'opened';
    }
    if (openResult.outcome === 'extended') {
      return 'extended';
    }
    return 'unchanged';
  }

  async tryResolveAfterFreshLvObservation(input: {
    payload: BatteryObservationClassifyPayload;
    sourceMeasurementId: string;
    providerObservationOutcome: string | null | undefined;
    evidenceClass?: BatteryGeneralizedEvidenceClass;
    firstFreshProviderAt?: Date;
  }): Promise<'skipped' | 'resolved' | 'remain_open' | 'duplicate'> {
    if (!isBatteryV2ProviderObservabilityGapEnabled()) {
      return 'skipped';
    }

    const open = await this.repository.findOpenGap(
      input.payload.vehicleId,
      PROVIDER_GAP_CONTRACT_VERSION,
    );
    if (!open) {
      return 'skipped';
    }

    const measurement = await this.prisma.batteryMeasurement.findUnique({
      where: { id: input.sourceMeasurementId },
      select: { observedAt: true },
    });
    const firstFreshAt =
      input.firstFreshProviderAt ??
      measurement?.observedAt ??
      new Date();

    let evidenceClass = input.evidenceClass;
    if (!evidenceClass) {
      evidenceClass =
        (await this.classifyFreshObservationForGap(input)) ??
        BatteryGeneralizedEvidenceClass.UNKNOWN;
    }

    const decision = resolveProviderGapFromEvidenceClass(evidenceClass);
    if (decision.action === 'remain_open') {
      return 'remain_open';
    }

    const resolutionKey = buildProviderGapResolutionIdempotencyKey({
      gapId: open.id,
      resolutionStatus: decision.status,
      firstFreshProviderAt: firstFreshAt,
    });

    const result = await this.repository.resolveGapIdempotent({
      gapId: open.id,
      resolutionStatus: decision.status,
      resolutionAt: new Date(),
      resolutionIdempotencyKey: resolutionKey,
      firstFreshObservationAfterGapId: input.sourceMeasurementId,
    });

    if (result.outcome === 'resolved') {
      this.logger.debug(
        `provider gap ${decision.status} vehicle=${input.payload.vehicleId} measurement=${input.sourceMeasurementId}`,
      );
      return 'resolved';
    }
    return 'duplicate';
  }

  private async isIceR1GeneralizedScope(vehicleId: string): Promise<boolean> {
    const [policy, vehicle] = await Promise.all([
      this.batteryPolicy.resolveForVehicle(vehicleId),
      this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { fuelType: true, hardwareType: true },
      }),
    ]);
    if (policy.driveProfile !== BatteryDriveProfile.ICE) {
      return false;
    }
    if (!vehicle?.fuelType || !ICE_FUEL_TYPES.has(vehicle.fuelType)) {
      return false;
    }
    return vehicle.hardwareType === 'LTE_R1';
  }

  private async classifyPreGapBundle(
    input: ClassifySnapshotObservationInput,
    snapshotContext: ClassifySnapshotObservationResult['snapshotContext'],
    referenceAt: Date,
  ): Promise<BatteryGeneralizedEvidenceClass | null> {
    const vehicleRow = await this.prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: {
        latestState: {
          select: {
            speedKmh: true,
            isIgnitionOn: true,
            engineLoad: true,
            tractionBatteryIsCharging: true,
            tractionBatteryChargingPowerKw: true,
            online: true,
            lastSeenAt: true,
            sourceTimestamp: true,
            providerFetchedAt: true,
            syncJobRef: true,
          },
        },
        tripDetectionState: {
          select: { activeTripId: true, lastActivityAt: true },
        },
      },
    });

    const bundleResult = buildShutdownFieldBundleFromSnapshotIngest({
      snapshotContext,
      vls: vehicleRow?.latestState ?? null,
      tripDetection: vehicleRow?.tripDetectionState ?? null,
      ingestedAt: input.receivedAt,
    });

    const alignment = resolveStateAlignment(bundleResult.fields, referenceAt);
    const classification = classifyGeneralizedEvidence({
      fields: bundleResult.fields,
      referenceAt,
      providerObservationOutcome: 'STALE_REPLAY',
      actualRestAgeMs: null,
      restStablePromotionEnabled: false,
      restWakeCadenceQualified: false,
      restWakeSourceSemantic: false,
    });
    void alignment;
    return classification.evidenceClass;
  }

  private async classifyFreshObservationForGap(input: {
    payload: BatteryObservationClassifyPayload;
    providerObservationOutcome: string | null | undefined;
  }): Promise<BatteryGeneralizedEvidenceClass | null> {
    const ctx = input.payload.snapshotContext;
    if (!ctx) return null;

    const vehicleRow = await this.prisma.vehicle.findUnique({
      where: { id: input.payload.vehicleId },
      select: {
        latestState: {
          select: {
            speedKmh: true,
            isIgnitionOn: true,
            engineLoad: true,
            tractionBatteryIsCharging: true,
            tractionBatteryChargingPowerKw: true,
            online: true,
            lastSeenAt: true,
            sourceTimestamp: true,
            providerFetchedAt: true,
            syncJobRef: true,
          },
        },
        tripDetectionState: {
          select: { activeTripId: true, lastActivityAt: true },
        },
      },
    });

    const ingestedAt = new Date(ctx.providerFetchedAt ?? Date.now());
    const bundleResult = buildShutdownFieldBundleFromSnapshotIngest({
      snapshotContext: ctx,
      vls: vehicleRow?.latestState ?? null,
      tripDetection: vehicleRow?.tripDetectionState ?? null,
      ingestedAt,
    });

    const referenceAt =
      bundleResult.providerLv.providerObservationAt ??
      ingestedAt;

    const classification = classifyGeneralizedEvidence({
      fields: bundleResult.fields,
      referenceAt,
      providerObservationOutcome: input.providerObservationOutcome,
      actualRestAgeMs: null,
      restStablePromotionEnabled: false,
      restWakeCadenceQualified: false,
      restWakeSourceSemantic: false,
    });
    return classification.evidenceClass;
  }
}
