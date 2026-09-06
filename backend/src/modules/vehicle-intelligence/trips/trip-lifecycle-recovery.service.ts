import { forwardRef, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import {
  TripDetectionState,
  TripStatus,
  type VehicleTripDetectionState as DetState,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import {
  evaluateTripLifecycleInvariant,
  type TripLifecycleInvariantInput,
  type TripLifecycleInvariantResult,
  type TripLifecycleRecoveryAction,
} from './trip-lifecycle-invariant';

export interface LifecycleRecoveryContext {
  expectedStartAt?: Date | null;
  expectedDimoSegmentId?: string | null;
  mergeTargetTripId?: string | null;
}

export interface LifecycleRecoveryOutcome {
  evaluated: TripLifecycleInvariantResult;
  recovered: boolean;
  blocked: boolean;
}

@Injectable()
export class TripLifecycleRecoveryService {
  private readonly logger = new Logger(TripLifecycleRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TripDetectionOrchestrationService))
    private readonly orchestration: TripDetectionOrchestrationService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  async buildInvariantInput(
    det: DetState,
    context: LifecycleRecoveryContext = {},
  ): Promise<TripLifecycleInvariantInput> {
    const ongoingTrips = await this.prisma.vehicleTrip.findMany({
      where: { vehicleId: det.vehicleId, tripStatus: TripStatus.ONGOING },
      select: {
        id: true,
        tripStatus: true,
        startTime: true,
        endTime: true,
        dimoSegmentId: true,
        tripSource: true,
        rawDetectionMeta: true,
      },
    });

    let referencedTrip: TripLifecycleInvariantInput['referencedTrip'] = null;
    if (det.activeTripId) {
      referencedTrip = await this.prisma.vehicleTrip.findUnique({
        where: { id: det.activeTripId },
        select: {
          id: true,
          tripStatus: true,
          startTime: true,
          endTime: true,
          dimoSegmentId: true,
          tripSource: true,
          rawDetectionMeta: true,
        },
      });
    }

    return {
      vehicleId: det.vehicleId,
      fsmState: det.state,
      activeTripId: det.activeTripId,
      possibleStartAt: det.possibleStartAt,
      expectedStartAt: context.expectedStartAt ?? null,
      expectedDimoSegmentId: context.expectedDimoSegmentId ?? null,
      mergeTargetTripId: context.mergeTargetTripId ?? null,
      ongoingTrips,
      referencedTrip,
    };
  }

  evaluate(input: TripLifecycleInvariantInput): TripLifecycleInvariantResult {
    return evaluateTripLifecycleInvariant(input);
  }

  private recordRecoveryMetrics(
    result: TripLifecycleInvariantResult,
    recovered: boolean,
  ): void {
    if (result.action === 'NO_SAFE_REPAIR') {
      this.tripMetrics?.tripLifecycleInvariantConflict.inc({
        type: result.classification,
      });
      return;
    }

    if (recovered && result.action !== 'NONE') {
      this.tripMetrics?.tripLifecycleInvariantRecovery.inc({
        type: result.classification,
      });
    }

    if (
      result.classification === 'RECOVERABLE_END_ORPHAN' ||
      result.classification === 'RECOVERABLE_START_ORPHAN' ||
      result.classification === 'RECOVERABLE_MERGE_ORPHAN'
    ) {
      if (result.classification.includes('END')) {
        this.tripMetrics?.completedFsmDivergence.inc();
      } else {
        this.tripMetrics?.ongoingFsmDivergence.inc();
      }
    }
  }

  async attemptRecovery(params: {
    det: DetState;
    organizationId: string | null;
    dimoTokenId: number;
    context?: LifecycleRecoveryContext;
  }): Promise<LifecycleRecoveryOutcome> {
    const input = await this.buildInvariantInput(params.det, params.context);
    const evaluated = this.evaluate(input);

    if (evaluated.action === 'NONE') {
      return { evaluated, recovered: false, blocked: false };
    }

    if (evaluated.action === 'NO_SAFE_REPAIR') {
      this.logger.error(
        `Lifecycle invariant conflict for vehicle=${params.det.vehicleId}: ` +
          `${evaluated.classification} — ${evaluated.reason} ` +
          `evidence=${JSON.stringify(evaluated.evidence)}`,
      );
      this.recordRecoveryMetrics(evaluated, false);
      return { evaluated, recovered: false, blocked: true };
    }

    await this.orchestration.executeLifecycleRecoveryAction({
      vehicleId: params.det.vehicleId,
      organizationId: params.organizationId,
      dimoTokenId: params.dimoTokenId,
      det: params.det,
      action: evaluated.action,
      tripId: evaluated.tripId!,
      classification: evaluated.classification,
      referencedTrip: input.referencedTrip ?? null,
    });

    this.logger.warn(
      `Lifecycle invariant recovered vehicle=${params.det.vehicleId} ` +
        `classification=${evaluated.classification} action=${evaluated.action} trip=${evaluated.tripId}`,
    );
    this.recordRecoveryMetrics(evaluated, true);

    return { evaluated, recovered: true, blocked: false };
  }

  /** Idempotent recovery entry for scheduler/orchestration preflight. */
  async attemptRecoveryForDetectionState(params: {
    vehicleId: string;
    organizationId: string | null;
    dimoTokenId: number;
    context?: LifecycleRecoveryContext;
  }): Promise<LifecycleRecoveryOutcome | null> {
    const det = await this.prisma.vehicleTripDetectionState.findUnique({
      where: { vehicleId: params.vehicleId },
    });
    if (!det) return null;
    return this.attemptRecovery({
      det,
      organizationId: params.organizationId,
      dimoTokenId: params.dimoTokenId,
      context: params.context,
    });
  }
}

export type ExecuteLifecycleRecoveryParams = {
  vehicleId: string;
  organizationId: string | null;
  dimoTokenId: number;
  det: DetState;
  action: Exclude<TripLifecycleRecoveryAction, 'NONE' | 'NO_SAFE_REPAIR'>;
  tripId: string;
  classification: TripLifecycleInvariantResult['classification'];
  referencedTrip: TripLifecycleInvariantInput['referencedTrip'];
};
