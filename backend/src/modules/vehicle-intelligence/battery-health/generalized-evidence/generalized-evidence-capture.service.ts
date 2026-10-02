import { randomUUID } from 'crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { BatteryDriveProfile } from '@prisma/client';
import { isBatteryV2GeneralizedEvidenceEnabled } from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import type { BatteryObservationClassifyPayload } from '../jobs/battery-v2-job.types';
import { buildShutdownFieldBundleFromSnapshotIngest } from '../shutdown-evidence/shutdown-evidence-provenance.builder';
import { classifyGeneralizedEvidence } from './generalized-evidence-classification.policy';
import {
  GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION,
  GENERALIZED_EVIDENCE_SOURCE_KINDS,
} from './generalized-evidence.constants';
import { buildGeneralizedEvidenceIdempotencyKey } from './generalized-evidence-idempotency.policy';
import {
  recordCadenceLadderResearchUnqualified,
  recordGeneralizedEvidenceCreated,
  recordGeneralizedEvidenceDuplicate,
  recordRestObservation,
  recordRestWakeQualified,
  recordStaleReplay,
  recordStateAmbiguous,
  recordValidRestObservation,
} from './generalized-evidence.metrics';
import {
  computeActualRestAgeMs,
  resolveSharedVehicleStateObservation,
} from './generalized-evidence-provenance.helpers';
import { evaluateRestCadenceQualification, shouldRecordCadenceLadderResearchUnqualified } from './rest-cadence-qualification.policy';
import { GeneralizedEvidenceRepository } from './generalized-evidence.repository';
import { BatteryRestSessionService } from './battery-rest-session.service';
import { LateTripAssociationService } from './late-trip-association.service';
import type {
  GeneralizedEvidenceCaptureOutcome,
  GeneralizedEvidenceFieldBundle,
} from './generalized-evidence.types';
import type { BatteryGeneralizedEvidenceObservation } from '@prisma/client';
import { ProviderObservabilityGapService } from '../provider-observability-gap/provider-observability-gap.service';
import {
  resolveStateAlignment,
} from '../shutdown-evidence/shutdown-evidence-classification.policy';
import { BatteryGeneralizedEvidenceClass, BatteryShutdownStateAlignmentClass } from '@prisma/client';

function parseIso(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

@Injectable()
export class GeneralizedEvidenceCaptureService {
  private readonly logger = new Logger(GeneralizedEvidenceCaptureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: GeneralizedEvidenceRepository,
    private readonly batteryPolicy: BatteryPolicyProfileService,
    private readonly restSessions: BatteryRestSessionService,
    private readonly lateTripAssociation: LateTripAssociationService,
    @Optional() private readonly providerGap?: ProviderObservabilityGapService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async captureFromObservationClassify(
    payload: BatteryObservationClassifyPayload,
    sourceMeasurementId: string,
    providerObservationOutcome?: string | null,
  ): Promise<GeneralizedEvidenceCaptureOutcome> {
    if (!isBatteryV2GeneralizedEvidenceEnabled()) {
      return 'skipped_flag_off';
    }

    const ctx = payload.snapshotContext;
    if (!ctx || ctx.lvBatteryVoltage == null) {
      return 'skipped_no_voltage';
    }

    const policy = await this.batteryPolicy.resolveForVehicle(payload.vehicleId);
    if (policy.driveProfile !== BatteryDriveProfile.ICE) {
      return 'skipped_not_ice';
    }

    const ingestedAt = parseIso(ctx.providerFetchedAt) ?? new Date();
    const vehicleRow = await this.prisma.vehicle.findUnique({
      where: { id: payload.vehicleId },
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
      snapshotContext: ctx,
      vls: vehicleRow?.latestState ?? null,
      tripDetection: vehicleRow?.tripDetectionState ?? null,
      ingestedAt,
    });

    const { fields, providerLv, vlsSharedSnapshot } = bundleResult;
    const sharedState = resolveSharedVehicleStateObservation(vlsSharedSnapshot);
    const classificationReferenceAt =
      providerLv.providerObservationAt ??
      sharedState.stateObservedAt ??
      ingestedAt;

    const activeSession = await this.repository.findActiveRestSession(payload.vehicleId);
    const actualRestAgeMs =
      activeSession != null
        ? computeActualRestAgeMs({
            sessionAnchorAt: activeSession.anchorAt,
            voltageObservedAt: fields.voltageObservedAt,
            voltageTimestampSource: fields.voltageTimestampSource,
          })
        : null;

    const preAlignment = resolveStateAlignment(fields, classificationReferenceAt);
    const cadenceQualification = evaluateRestCadenceQualification({
      actualRestAgeMs,
      voltageTimestampSource: fields.voltageTimestampSource,
      providerObservationOutcome,
      stateAlignmentClass: preAlignment.stateAlignmentClass,
      hasActiveRestSession: activeSession != null,
    });

    const classification = classifyGeneralizedEvidence({
      fields,
      referenceAt: classificationReferenceAt,
      providerObservationOutcome,
      actualRestAgeMs,
      restStablePromotionEnabled: false,
      restWakeCadenceQualified: cadenceQualification.restWakeCadenceQualified,
      restWakeSourceSemantic: false,
    });

    const ongoingTripId = vehicleRow?.tripDetectionState?.activeTripId ?? null;

    const idempotencyKey = buildGeneralizedEvidenceIdempotencyKey({
      vehicleId: payload.vehicleId,
      sourceMeasurementId,
    });

    const createResult = await this.repository.createObservationIdempotent({
      id: randomUUID(),
      organization: { connect: { id: payload.organizationId } },
      vehicle: { connect: { id: payload.vehicleId } },
      sourceMeasurement: { connect: { id: sourceMeasurementId } },
      sourceKind: GENERALIZED_EVIDENCE_SOURCE_KINDS.LIVE_VOLTAGE_CLASSIFY,
      voltage: fields.voltage,
      voltageObservedAt: fields.voltageObservedAt,
      providerObservationAt: providerLv.providerObservationAt,
      providerTimestampSource: fields.voltageTimestampSource,
      ingestedAt,
      evidenceClass: classification.evidenceClass,
      evidenceConfidence: classification.evidenceConfidence,
      classificationVersion: GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION,
      trip: ongoingTripId ? { connect: { id: ongoingTripId } } : undefined,
      actualRestAgeMs,
      nominalRestIntervalIndex: cadenceQualification.nominalRestIntervalIndex,
      tolerancePolicyVersion: cadenceQualification.tolerancePolicyVersion,
      speedKmh: fields.speedKmh,
      ignitionOn: fields.ignitionOn,
      engineRunning: fields.engineRunning,
      isLvCharging: fields.isLvCharging,
      isHvCharging: fields.isHvCharging,
      vehicleOnline: fields.vehicleOnline,
      stateObservedAt: sharedState.stateObservedAt,
      stateTimestampSource: sharedState.stateTimestampSource,
      stateTimestampSkewMs: classification.stateTimestampSkewMs,
      maxFieldTimestampSkewMs: classification.maxFieldTimestampSkewMs,
      stateCompleteness: classification.stateCompleteness,
      stateAlignmentClass: classification.stateAlignmentClass,
      atomicClaim: false,
      fieldProvenance: {
        vlsSharedSnapshotTimestamp: {
          observedAt: vlsSharedSnapshot.observedAt?.toISOString() ?? null,
          timestampSource: vlsSharedSnapshot.source,
        },
        voltageTimestampSource: fields.voltageTimestampSource,
        classifyIdempotencyKey: payload.idempotencyKey,
        providerObservationOutcome: providerObservationOutcome ?? null,
      },
      idempotencyKey,
    });

    if (createResult === 'duplicate') {
      recordGeneralizedEvidenceDuplicate(this.metrics);
      const duplicateObservation =
        await this.prisma.batteryGeneralizedEvidenceObservation.findFirst({
          where: {
            organizationId: payload.organizationId,
            vehicleId: payload.vehicleId,
            idempotencyKey,
          },
        });
      if (duplicateObservation) {
        await this.completePostCaptureSideEffects({
          payload,
          sourceMeasurementId,
          providerObservationOutcome,
          classification: {
            evidenceClass: duplicateObservation.evidenceClass,
            stateAlignmentClass: duplicateObservation.stateAlignmentClass,
          },
          fields,
          classificationReferenceAt,
          cadenceQualification,
          actualRestAgeMs,
          observation: duplicateObservation,
        });
      }
      return 'duplicate';
    }

    recordGeneralizedEvidenceCreated(this.metrics, classification.evidenceClass);

    if (classification.evidenceClass === BatteryGeneralizedEvidenceClass.STALE_REPLAY) {
      recordStaleReplay(this.metrics);
    }
    if (classification.evidenceClass === BatteryGeneralizedEvidenceClass.STATE_AMBIGUOUS) {
      recordStateAmbiguous(this.metrics);
    }
    if (
      actualRestAgeMs != null &&
      actualRestAgeMs > 0 &&
      (classification.evidenceClass === BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE ||
        classification.evidenceClass === BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE ||
        classification.evidenceClass === BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION)
    ) {
      recordRestObservation(this.metrics);
      if (cadenceQualification.restWakeCadenceQualified) {
        recordRestWakeQualified(this.metrics);
      } else if (shouldRecordCadenceLadderResearchUnqualified(cadenceQualification)) {
        recordCadenceLadderResearchUnqualified(this.metrics);
      }
    }

    const observation = await this.prisma.batteryGeneralizedEvidenceObservation.findFirst({
      where: {
        organizationId: payload.organizationId,
        vehicleId: payload.vehicleId,
        idempotencyKey,
      },
    });

    if (observation) {
      await this.completePostCaptureSideEffects({
        payload,
        sourceMeasurementId,
        providerObservationOutcome,
        classification,
        fields,
        classificationReferenceAt,
        cadenceQualification,
        actualRestAgeMs,
        observation,
      });
    }

    this.logger.debug(
      `generalized evidence vehicle=${payload.vehicleId} class=${classification.evidenceClass} measurement=${sourceMeasurementId}`,
    );

    return 'created';
  }

  private async completePostCaptureSideEffects(input: {
    payload: BatteryObservationClassifyPayload;
    sourceMeasurementId: string;
    providerObservationOutcome?: string | null;
    classification: {
      evidenceClass: BatteryGeneralizedEvidenceClass;
      stateAlignmentClass: BatteryShutdownStateAlignmentClass;
    };
    fields: GeneralizedEvidenceFieldBundle;
    classificationReferenceAt: Date;
    cadenceQualification: ReturnType<typeof evaluateRestCadenceQualification>;
    actualRestAgeMs: number | null;
    observation: BatteryGeneralizedEvidenceObservation;
  }): Promise<void> {
    await this.restSessions.processObservation({
      organizationId: input.payload.organizationId,
      vehicleId: input.payload.vehicleId,
      observation: input.observation,
      fields: input.fields,
      referenceAt: input.classificationReferenceAt,
      stateAlignmentClass: input.classification.stateAlignmentClass,
    });
    await this.lateTripAssociation.associatePendingSessions(input.payload.vehicleId);

    if (!this.providerGap) {
      return;
    }

    try {
      await this.providerGap.tryResolveAfterFreshLvObservation({
        payload: input.payload,
        sourceMeasurementId: input.sourceMeasurementId,
        providerObservationOutcome: input.providerObservationOutcome,
        evidenceClass: input.observation.evidenceClass,
        firstFreshProviderAt:
          input.observation.voltageObservedAt ??
          input.observation.providerObservationAt,
      });
    } catch (err) {
      this.logger.warn(
        `provider gap resolution failed (capture continues): vehicle=${input.payload.vehicleId} measurement=${input.sourceMeasurementId} error=${(err as Error).message}`,
      );
    }
  }
}
