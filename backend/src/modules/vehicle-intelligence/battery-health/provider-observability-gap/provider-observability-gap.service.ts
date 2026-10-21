import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  BatteryDriveProfile,
  BatteryGeneralizedEvidenceClass,
  BatteryMeasurementType,
  BatteryProviderObservabilityGapStatus,
} from '@prisma/client';
import {
  isBatteryV2GeneralizedEvidenceEnabled,
  isBatteryV2ProviderObservabilityGapEnabled,
  isBatteryV2ProviderObservabilityGapRuntimeReady,
} from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import type { ClassifySnapshotObservationInput } from '../jobs/battery-v2-snapshot-observation.producer';
import type { ClassifySnapshotObservationResult } from '../jobs/battery-v2-snapshot-observation.producer';
import type { BatteryObservationClassifyPayload } from '../jobs/battery-v2-job.types';
import { buildShutdownFieldBundleFromSnapshotIngest } from '../shutdown-evidence/shutdown-evidence-provenance.builder';
import { classifyGeneralizedEvidence } from '../generalized-evidence/generalized-evidence-classification.policy';
import {
  PROVIDER_GAP_CONTRACT_VERSION,
  PROVIDER_GAP_SIGNAL_FAMILY,
} from './provider-observability-gap.constants';
import {
  buildProviderGapOpenIdempotencyKey,
  buildProviderGapResolutionIdempotencyKey,
} from './provider-observability-gap-idempotency.policy';
import {
  canExtendOpenProviderObservabilityGap,
  canOpenNewProviderObservabilityGap,
  isPreGapTrustworthyEngineOffEvidenceClass,
} from './provider-observability-gap-entry.policy';
import { resolveProviderGapFromEvidenceClass } from './provider-observability-gap-resolution.policy';
import { ProviderObservabilityGapRepository } from './provider-observability-gap.repository';
import {
  recordProviderGapExtended,
  recordProviderGapLifecycleFailure,
  recordProviderGapLifecycleFailureFromError,
  recordProviderGapOpened,
} from './provider-observability-gap.metrics';
import { mapProviderGapSemanticFailureReason } from './provider-observability-gap-failure-reason';

const ICE_FUEL_TYPES = new Set(['GASOLINE', 'DIESEL']);

export type ProviderGapHookOutcome =
  | 'skipped_flag_off'
  | 'skipped_invalid_flag_combination'
  | 'skipped_no_lv_decision'
  | 'skipped_outcome'
  | 'skipped_scope'
  | 'skipped_pre_gap_trustworthy_off'
  | 'skipped_no_anchor'
  | 'skipped_duplicate_before_stale_threshold'
  | 'opened'
  | 'extended'
  | 'unchanged';

export type ProviderGapResolveOutcome =
  | 'skipped'
  | 'skipped_missing_provenance'
  | 'resolved'
  | 'remain_open'
  | 'duplicate';

@Injectable()
export class ProviderObservabilityGapService {
  private readonly logger = new Logger(ProviderObservabilityGapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ProviderObservabilityGapRepository,
    private readonly batteryPolicy: BatteryPolicyProfileService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async handleSuccessfulPollWithoutPersist(
    input: ClassifySnapshotObservationInput,
    classifyResult: ClassifySnapshotObservationResult,
  ): Promise<ProviderGapHookOutcome> {
    if (!isBatteryV2ProviderObservabilityGapEnabled()) {
      return 'skipped_flag_off';
    }
    if (!isBatteryV2GeneralizedEvidenceEnabled()) {
      this.logger.warn(
        `provider gap entry disabled — generalized evidence flag OFF vehicle=${input.vehicleId} operation=entry`,
      );
      return 'skipped_invalid_flag_combination';
    }
    if (!isBatteryV2ProviderObservabilityGapRuntimeReady()) {
      return 'skipped_invalid_flag_combination';
    }

    try {
      return await this.executeSuccessfulPollGapEntry(input, classifyResult);
    } catch (err) {
      this.logGapEntryFailure(input.vehicleId, err);
      return 'unchanged';
    }
  }

  /**
   * Entry-hook body — must not throw; outer wrapper catches and fail-opens ingestion.
   */
  private async executeSuccessfulPollGapEntry(
    input: ClassifySnapshotObservationInput,
    classifyResult: ClassifySnapshotObservationResult,
  ): Promise<ProviderGapHookOutcome> {
    const lvDecision = classifyResult.lvDecision;
    if (!lvDecision) {
      return 'skipped_no_lv_decision';
    }
    if (classifyResult.shouldEnqueue) {
      return 'skipped_outcome';
    }
    if (!canExtendOpenProviderObservabilityGap(lvDecision.outcome)) {
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

    const openGap = await this.repository.findOpenGap(
      input.vehicleId,
      PROVIDER_GAP_CONTRACT_VERSION,
    );

    if (!openGap && !canOpenNewProviderObservabilityGap(lvDecision.outcome)) {
      return 'skipped_duplicate_before_stale_threshold';
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
      recordProviderGapOpened(this.metrics);
      this.logger.debug(
        `provider gap OPEN vehicle=${input.vehicleId} anchor=${lastFreshProviderAt.toISOString()}`,
      );
      return 'opened';
    }
    if (openResult.outcome === 'extended') {
      recordProviderGapExtended(this.metrics);
      return 'extended';
    }
    return 'unchanged';
  }

  async tryResolveAfterFreshLvObservation(input: {
    payload: BatteryObservationClassifyPayload;
    sourceMeasurementId: string;
    providerObservationOutcome?: string | null;
    evidenceClass?: BatteryGeneralizedEvidenceClass;
    firstFreshProviderAt?: Date | null;
  }): Promise<ProviderGapResolveOutcome> {
    if (!isBatteryV2ProviderObservabilityGapRuntimeReady()) {
      return 'skipped';
    }

    try {
      return await this.executeGapResolution(input);
    } catch (err) {
      this.logGapResolutionFailure(input.payload.vehicleId, err);
      return 'skipped';
    }
  }

  private async executeGapResolution(input: {
    payload: BatteryObservationClassifyPayload;
    sourceMeasurementId: string;
    providerObservationOutcome?: string | null;
    evidenceClass?: BatteryGeneralizedEvidenceClass;
    firstFreshProviderAt?: Date | null;
  }): Promise<ProviderGapResolveOutcome> {
    const open = await this.repository.findOpenGap(
      input.payload.vehicleId,
      PROVIDER_GAP_CONTRACT_VERSION,
    );
    if (!open) {
      return 'skipped';
    }

    let evidenceClass = input.evidenceClass;
    if (!evidenceClass) {
      const persisted = await this.prisma.batteryGeneralizedEvidenceObservation.findFirst({
        where: {
          organizationId: input.payload.organizationId,
          vehicleId: input.payload.vehicleId,
          sourceMeasurementId: input.sourceMeasurementId,
        },
        select: { evidenceClass: true },
      });
      evidenceClass = persisted?.evidenceClass;
    }
    if (!evidenceClass) {
      this.logGapResolutionFailure(
        input.payload.vehicleId,
        'missing_persisted_generalized_evidence',
      );
      return 'skipped_missing_provenance';
    }

    const measurement = await this.prisma.batteryMeasurement.findUnique({
      where: { id: input.sourceMeasurementId },
      select: { observedAt: true, providerTimestamp: true },
    });

    const firstFreshAt =
      input.firstFreshProviderAt ??
      measurement?.providerTimestamp ??
      measurement?.observedAt ??
      null;

    if (!firstFreshAt) {
      this.logGapResolutionFailure(
        input.payload.vehicleId,
        'missing_first_fresh_provider_timestamp',
      );
      return 'skipped_missing_provenance';
    }

    const decision = resolveProviderGapFromEvidenceClass(evidenceClass);
    if (decision.action === 'remain_open') {
      return 'remain_open';
    }

    if (
      decision.status === BatteryProviderObservabilityGapStatus.RESOLVED_OFF &&
      evidenceClass !== BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION
    ) {
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

  private logGapEntryFailure(vehicleId: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    recordProviderGapLifecycleFailureFromError(this.metrics, 'entry', err);
    this.logger.warn(
      `provider gap entry failed vehicle=${vehicleId} operation=entry error=${message}`,
    );
  }

  private logGapResolutionFailure(vehicleId: string, reasonOrErr: string | unknown): void {
    const detail =
      typeof reasonOrErr === 'string'
        ? reasonOrErr
        : reasonOrErr instanceof Error
          ? reasonOrErr.message
          : String(reasonOrErr);
    if (typeof reasonOrErr === 'string') {
      recordProviderGapLifecycleFailure(
        this.metrics,
        'resolution',
        mapProviderGapSemanticFailureReason(reasonOrErr),
      );
    } else {
      recordProviderGapLifecycleFailureFromError(this.metrics, 'resolution', reasonOrErr);
    }
    this.logger.warn(
      `provider gap resolution failed vehicle=${vehicleId} operation=resolution reason=${detail}`,
    );
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

  /**
   * Classify last-fresh bundle physical state — NOT the current stale replay poll.
   */
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
      ingestedAt: referenceAt,
    });

    const classification = classifyGeneralizedEvidence({
      fields: bundleResult.fields,
      referenceAt,
      providerObservationOutcome: 'NEW_OBSERVATION',
      actualRestAgeMs: null,
      restStablePromotionEnabled: false,
      restWakeCadenceQualified: false,
      restWakeSourceSemantic: false,
    });
    return classification.evidenceClass;
  }
}
