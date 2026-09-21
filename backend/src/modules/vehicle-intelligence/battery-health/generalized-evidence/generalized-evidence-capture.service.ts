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
  INITIAL_REST_TOLERANCE_POLICY_VERSION,
} from './generalized-evidence.constants';
import { buildGeneralizedEvidenceIdempotencyKey } from './generalized-evidence-idempotency.policy';
import {
  recordGeneralizedEvidenceCreated,
  recordGeneralizedEvidenceDuplicate,
} from './generalized-evidence.metrics';
import { GeneralizedEvidenceRepository } from './generalized-evidence.repository';
import { BatteryRestSessionService } from './battery-rest-session.service';
import { LateTripAssociationService } from './late-trip-association.service';
import type { GeneralizedEvidenceCaptureOutcome } from './generalized-evidence.types';

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
    const referenceAt = providerLv.effectiveCaptureReferenceAt;

    const activeSession = await this.repository.findActiveRestSession(payload.vehicleId);
    const actualRestAgeMs =
      activeSession && referenceAt
        ? referenceAt.getTime() - activeSession.anchorAt.getTime()
        : null;

    const classification = classifyGeneralizedEvidence({
      fields,
      referenceAt,
      providerObservationOutcome,
      actualRestAgeMs,
      restStablePromotionEnabled: false,
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
      nominalRestIntervalIndex: null,
      tolerancePolicyVersion: INITIAL_REST_TOLERANCE_POLICY_VERSION,
      speedKmh: fields.speedKmh,
      ignitionOn: fields.ignitionOn,
      engineRunning: fields.engineRunning,
      isLvCharging: fields.isLvCharging,
      isHvCharging: fields.isHvCharging,
      vehicleOnline: fields.vehicleOnline,
      stateObservedAt: referenceAt,
      stateTimestampSource: fields.voltageTimestampSource,
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
        classifyIdempotencyKey: payload.idempotencyKey,
        providerObservationOutcome: providerObservationOutcome ?? null,
      },
      idempotencyKey,
    });

    if (createResult === 'duplicate') {
      recordGeneralizedEvidenceDuplicate(this.metrics);
      return 'duplicate';
    }

    recordGeneralizedEvidenceCreated(this.metrics, classification.evidenceClass);

    const observation = await this.prisma.batteryGeneralizedEvidenceObservation.findFirst({
      where: {
        organizationId: payload.organizationId,
        vehicleId: payload.vehicleId,
        idempotencyKey,
      },
    });

    if (observation) {
      await this.restSessions.processObservation({
        organizationId: payload.organizationId,
        vehicleId: payload.vehicleId,
        observation,
        fields,
        referenceAt,
      });
      await this.lateTripAssociation.associatePendingSessions(payload.vehicleId);
    }

    this.logger.debug(
      `generalized evidence vehicle=${payload.vehicleId} class=${classification.evidenceClass} measurement=${sourceMeasurementId}`,
    );

    return 'created';
  }
}
