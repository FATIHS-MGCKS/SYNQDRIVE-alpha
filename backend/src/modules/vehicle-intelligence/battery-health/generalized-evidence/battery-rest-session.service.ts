import { randomUUID } from 'crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  BatteryGeneralizedEvidenceClass,
  BatteryRestSessionAnchorType,
  BatteryRestSessionEndReason,
  BatteryRestSessionStatus,
  BatteryShutdownStateAlignmentClass,
  type BatteryGeneralizedEvidenceObservation,
} from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../shutdown-evidence/shutdown-evidence.constants';
import {
  buildRestSessionOpenIdempotencyKey,
} from './generalized-evidence-idempotency.policy';
import {
  DEFAULT_REST_SESSION_MAX_DURATION_MS,
} from './generalized-evidence.constants';
import {
  computeActualRestAgeMs,
  isValidRestLadderObservation,
} from './generalized-evidence-provenance.helpers';
import {
  recordRestSessionInvalidated,
  recordRestSessionOpened,
  recordRestSessionUpdated,
  recordRestSessionEnded,
  recordValidRestObservation,
} from './generalized-evidence.metrics';
import { GeneralizedEvidenceRepository } from './generalized-evidence.repository';
import type { GeneralizedEvidenceFieldBundle, RestSessionProcessOutcome } from './generalized-evidence.types';

const TERMINATING_EVIDENCE_CLASSES = new Set<BatteryGeneralizedEvidenceClass>([
  BatteryGeneralizedEvidenceClass.DRIVING_CHARGING,
  BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
  BatteryGeneralizedEvidenceClass.ACTIVE_VEHICLE_CONTAMINATED,
  BatteryGeneralizedEvidenceClass.CHARGING_CONTAMINATED,
]);

const SESSION_REST_EVIDENCE_CLASSES = new Set<BatteryGeneralizedEvidenceClass>([
  BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
  BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
  BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
]);

@Injectable()
export class BatteryRestSessionService {
  private readonly logger = new Logger(BatteryRestSessionService.name);

  constructor(
    private readonly repository: GeneralizedEvidenceRepository,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async processObservation(input: {
    organizationId: string;
    vehicleId: string;
    observation: BatteryGeneralizedEvidenceObservation;
    fields: GeneralizedEvidenceFieldBundle;
    referenceAt: Date;
    stateAlignmentClass: BatteryShutdownStateAlignmentClass;
  }): Promise<RestSessionProcessOutcome> {
    const { observation, vehicleId, organizationId, referenceAt, fields } = input;

    const active = await this.repository.findActiveRestSession(vehicleId);
    if (active && this.shouldTerminateSession(input.fields, observation.evidenceClass)) {
      await this.endSession(active.id, this.endReasonForClass(observation.evidenceClass), referenceAt);
      recordRestSessionInvalidated(this.metrics);
      if (!SESSION_REST_EVIDENCE_CLASSES.has(observation.evidenceClass)) {
        return 'session_invalidated';
      }
    }

    if (observation.evidenceClass === BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION) {
      const anchorAt =
        observation.voltageObservedAt ??
        (fields.voltageTimestampSource === SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP
          ? fields.voltageObservedAt
          : null) ??
        referenceAt;

      const { sessionId, created } = await this.openOrReuseActiveSession({
        organizationId,
        vehicleId,
        anchorAt,
        candidateTripId: observation.tripId,
      });

      const anchorRestAgeMs = computeActualRestAgeMs({
        sessionAnchorAt: anchorAt,
        voltageObservedAt: observation.voltageObservedAt,
        voltageTimestampSource: fields.voltageTimestampSource,
      });

      await this.repository.linkObservationToSession({
        observationId: observation.id,
        restSessionId: sessionId,
        actualRestAgeMs: anchorRestAgeMs != null ? 0 : null,
        tripId: observation.tripId,
      });

      if (created) {
        recordRestSessionOpened(this.metrics);
        return 'session_opened';
      }
      return 'session_updated';
    }

    if (!SESSION_REST_EVIDENCE_CLASSES.has(observation.evidenceClass)) {
      return 'noop';
    }

    let session = await this.repository.findActiveRestSession(vehicleId);
    if (!session) {
      return 'noop';
    }

    if (
      referenceAt.getTime() - session.anchorAt.getTime() >
      DEFAULT_REST_SESSION_MAX_DURATION_MS
    ) {
      await this.endSession(session.id, BatteryRestSessionEndReason.SESSION_TIMEOUT, referenceAt);
      recordRestSessionEnded(this.metrics);
      return 'session_ended';
    }

    const actualRestAgeMs = computeActualRestAgeMs({
      sessionAnchorAt: session.anchorAt,
      voltageObservedAt: observation.voltageObservedAt,
      voltageTimestampSource: fields.voltageTimestampSource,
    });

    const countsAsValid = isValidRestLadderObservation({
      stateAlignmentClass: input.stateAlignmentClass,
      actualRestAgeMs,
    });

    session = await this.repository.updateRestSession(session.id, {
      sessionStatus: BatteryRestSessionStatus.RESTING,
      firstRestObservationAt: session.firstRestObservationAt ?? observation.voltageObservedAt,
      lastRestObservationAt: observation.voltageObservedAt,
      restObservationCount: { increment: 1 },
      ...(countsAsValid ? { validRestObservationCount: { increment: 1 } } : {}),
    });

    await this.repository.linkObservationToSession({
      observationId: observation.id,
      restSessionId: session.id,
      actualRestAgeMs,
      tripId: observation.tripId,
    });

    if (countsAsValid) {
      recordValidRestObservation(this.metrics);
    }

    recordRestSessionUpdated(this.metrics);
    return 'session_updated';
  }

  private async openOrReuseActiveSession(input: {
    organizationId: string;
    vehicleId: string;
    anchorAt: Date;
    candidateTripId: string | null;
  }): Promise<{ sessionId: string; created: boolean }> {
    const idempotencyKey = buildRestSessionOpenIdempotencyKey({
      vehicleId: input.vehicleId,
      anchorAtMs: input.anchorAt.getTime(),
    });

    return this.repository.claimOrCreateActiveRestSession({
      id: randomUUID(),
      organization: { connect: { id: input.organizationId } },
      vehicle: { connect: { id: input.vehicleId } },
      anchorType: BatteryRestSessionAnchorType.PHYSICAL_SHUTDOWN,
      anchorAt: input.anchorAt,
      candidateTrip: input.candidateTripId
        ? { connect: { id: input.candidateTripId } }
        : undefined,
      sessionStatus: BatteryRestSessionStatus.CANDIDATE,
      openedAt: input.anchorAt,
      idempotencyKey,
    });
  }

  private shouldTerminateSession(
    fields: GeneralizedEvidenceFieldBundle,
    evidenceClass: BatteryGeneralizedEvidenceClass,
  ): boolean {
    if (TERMINATING_EVIDENCE_CLASSES.has(evidenceClass)) return true;
    if (fields.activeTrip === true && fields.speedKmh != null && fields.speedKmh > 0.5) {
      return true;
    }
    return false;
  }

  private endReasonForClass(
    evidenceClass: BatteryGeneralizedEvidenceClass,
  ): BatteryRestSessionEndReason {
    if (evidenceClass === BatteryGeneralizedEvidenceClass.CHARGING_CONTAMINATED) {
      return BatteryRestSessionEndReason.CHARGING_DETECTED;
    }
    if (evidenceClass === BatteryGeneralizedEvidenceClass.ACTIVE_VEHICLE_CONTAMINATED) {
      return BatteryRestSessionEndReason.NEW_TRIP;
    }
    return BatteryRestSessionEndReason.VEHICLE_ACTIVITY;
  }

  private async endSession(
    sessionId: string,
    endReason: BatteryRestSessionEndReason,
    endedAt: Date,
  ) {
    await this.repository.updateRestSession(sessionId, {
      sessionStatus:
        endReason === BatteryRestSessionEndReason.INVALIDATED
          ? BatteryRestSessionStatus.INVALIDATED
          : BatteryRestSessionStatus.ENDED,
      endedAt,
      endReason,
    });
  }
}
