import { randomUUID } from 'crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  BatteryGeneralizedEvidenceClass,
  BatteryRestSessionAnchorType,
  BatteryRestSessionEndReason,
  BatteryRestSessionStatus,
  type BatteryGeneralizedEvidenceObservation,
} from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  buildRestSessionOpenIdempotencyKey,
} from './generalized-evidence-idempotency.policy';
import {
  DEFAULT_REST_SESSION_MAX_DURATION_MS,
} from './generalized-evidence.constants';
import {
  recordRestSessionInvalidated,
  recordRestSessionOpened,
  recordRestSessionUpdated,
} from './generalized-evidence.metrics';
import { GeneralizedEvidenceRepository } from './generalized-evidence.repository';
import type { GeneralizedEvidenceFieldBundle, RestSessionProcessOutcome } from './generalized-evidence.types';

const TERMINATING_EVIDENCE_CLASSES = new Set<BatteryGeneralizedEvidenceClass>([
  BatteryGeneralizedEvidenceClass.DRIVING_CHARGING,
  BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
  BatteryGeneralizedEvidenceClass.ACTIVE_VEHICLE_CONTAMINATED,
  BatteryGeneralizedEvidenceClass.CHARGING_CONTAMINATED,
]);

const REST_EVIDENCE_CLASSES = new Set<BatteryGeneralizedEvidenceClass>([
  BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
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
  }): Promise<RestSessionProcessOutcome> {
    const { observation, vehicleId, organizationId, referenceAt } = input;

    const active = await this.repository.findActiveRestSession(vehicleId);
    if (active && this.shouldTerminateSession(input.fields, observation.evidenceClass)) {
      await this.endSession(active.id, this.endReasonForClass(observation.evidenceClass), referenceAt);
      recordRestSessionInvalidated(this.metrics);
      if (!REST_EVIDENCE_CLASSES.has(observation.evidenceClass)) {
        return 'session_invalidated';
      }
    }

    if (observation.evidenceClass === BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION) {
      const anchorAt = observation.voltageObservedAt ?? referenceAt;
      const openResult = await this.openCandidateSession({
        organizationId,
        vehicleId,
        anchorAt,
        candidateTripId: observation.tripId,
      });
      if (openResult === 'created') {
        recordRestSessionOpened(this.metrics);
        return 'session_opened';
      }
      return 'noop';
    }

    if (!REST_EVIDENCE_CLASSES.has(observation.evidenceClass)) {
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
      return 'session_ended';
    }

    const actualRestAgeMs =
      observation.voltageObservedAt != null
        ? observation.voltageObservedAt.getTime() - session.anchorAt.getTime()
        : null;

    session = await this.repository.updateRestSession(session.id, {
      sessionStatus: BatteryRestSessionStatus.RESTING,
      firstRestObservationAt: session.firstRestObservationAt ?? observation.voltageObservedAt,
      lastRestObservationAt: observation.voltageObservedAt,
      validRestObservationCount: { increment: 1 },
    });

    await this.repository.linkObservationToSession({
      observationId: observation.id,
      restSessionId: session.id,
      actualRestAgeMs,
      tripId: observation.tripId,
    });

    recordRestSessionUpdated(this.metrics);
    return 'session_updated';
  }

  private async openCandidateSession(input: {
    organizationId: string;
    vehicleId: string;
    anchorAt: Date;
    candidateTripId: string | null;
  }): Promise<'created' | 'duplicate'> {
    const idempotencyKey = buildRestSessionOpenIdempotencyKey({
      vehicleId: input.vehicleId,
      anchorAtMs: input.anchorAt.getTime(),
    });

    return this.repository.createRestSessionIdempotent({
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
