import { Injectable, Logger } from '@nestjs/common';
import type { HvChargeSession, Prisma } from '@prisma/client';
import { isBatteryV2HvCapacityShadowEnabled } from '@config/battery-health-v2.config';
import { PrismaService } from '@shared/database/prisma.service';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import {
  buildHvM3CapacityObservationIdempotencyKey,
  HvCapacityObservationRepository,
} from './hv-capacity-observation.repository';
import {
  buildHvM3Estimate,
  evaluateHvM3SessionGate,
  resolveHvM3ObservationQuality,
} from './hv-capacity-m3.policy';
import {
  HV_M3_CAPACITY_METHOD,
  HV_M3_METHOD_ROLE,
  HV_M3_MODEL_VERSION,
  type HvCapacityM3ObservationMetadata,
  type HvCapacityM3SessionInput,
  type HvCapacityM3SessionValidation,
  type HvCapacityM3ValidationResult,
} from './hv-capacity-m3.types';

export interface ValidateHvM3SessionInput {
  organizationId: string;
  vehicleId: string;
  chargeSessionId: string;
  m2MedianCapacityKwh?: number | null;
  /** Test hook — bypass DB session load. */
  sessionOverride?: HvCapacityM3SessionInput;
}

@Injectable()
export class HvCapacityM3ValidationService {
  private readonly logger = new Logger(HvCapacityM3ValidationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly observations: HvCapacityObservationRepository,
  ) {}

  async validateSession(
    input: ValidateHvM3SessionInput,
  ): Promise<HvCapacityM3ValidationResult> {
    if (!isBatteryV2HvCapacityShadowEnabled()) {
      return this.skippedResult(input.chargeSessionId, 'shadow_disabled');
    }

    const sessionRow = await this.prisma.hvChargeSession.findFirst({
      where: {
        id: input.chargeSessionId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
    });

    if (!sessionRow) {
      return this.skippedResult(input.chargeSessionId, 'session_not_found');
    }

    const metadata = (sessionRow.metadata ?? {}) as unknown as HvChargeSessionMetadata;
    const sessionInput =
      input.sessionOverride ?? mapHvChargeSessionRowToM3Input(sessionRow, metadata);

    const gate = evaluateHvM3SessionGate(sessionInput);
    if (!gate.eligible) {
      await this.persistSessionValidation(sessionRow.id, metadata, {
        method: HV_M3_CAPACITY_METHOD,
        modelVersion: HV_M3_MODEL_VERSION,
        methodRole: HV_M3_METHOD_ROLE,
        estimatedCapacityKwh: null,
        segmentAddedEnergyKwh: sessionInput.energyAddedKwh,
        deltaSocPercent: sessionInput.deltaSocPercent,
        gateEligible: false,
        gateReasonCodes: gate.reasonCodes,
        methodConflict: false,
        methodConflictDeviationRatio: null,
        m2MedianCapacityKwh: input.m2MedianCapacityKwh ?? null,
        persisted: false,
        validatedAt: new Date().toISOString(),
      });

      return {
        sessionId: sessionRow.id,
        method: HV_M3_CAPACITY_METHOD,
        modelVersion: HV_M3_MODEL_VERSION,
        estimate: null,
        persisted: false,
        skippedReason: gate.reasonCodes.join(','),
      };
    }

    const alreadyProcessed = await this.observations.hasSessionObservations({
      chargeSessionId: sessionRow.id,
      method: HV_M3_CAPACITY_METHOD,
      modelVersion: HV_M3_MODEL_VERSION,
    });

    if (alreadyProcessed) {
      this.logger.debug(`M3 validation already present session=${sessionRow.id}`);
      return {
        sessionId: sessionRow.id,
        method: HV_M3_CAPACITY_METHOD,
        modelVersion: HV_M3_MODEL_VERSION,
        estimate: buildHvM3Estimate({
          session: sessionInput,
          m2MedianCapacityKwh: input.m2MedianCapacityKwh,
        }),
        persisted: false,
        skippedReason: 'already_processed',
      };
    }

    const estimate = buildHvM3Estimate({
      session: sessionInput,
      m2MedianCapacityKwh: input.m2MedianCapacityKwh,
    });

    if (!estimate) {
      return {
        sessionId: sessionRow.id,
        method: HV_M3_CAPACITY_METHOD,
        modelVersion: HV_M3_MODEL_VERSION,
        estimate: null,
        persisted: false,
        skippedReason: 'estimate_unavailable',
      };
    }

    const quality = resolveHvM3ObservationQuality(estimate);
    const observedAt = sessionRow.endAt ?? sessionRow.startAt;
    const observationMetadata: HvCapacityM3ObservationMetadata = {
      validationOnly: true,
      methodRole: HV_M3_METHOD_ROLE,
      segmentAddedEnergyKwh: estimate.segmentAddedEnergyKwh,
      deltaSocPercent: estimate.deltaSocPercent,
      gateReasonCodes: estimate.gate.reasonCodes,
      methodConflict: estimate.methodConflict,
      methodConflictDeviationRatio: estimate.methodConflictDeviationRatio,
      m2MedianCapacityKwh: estimate.m2MedianCapacityKwh,
      segmentAggregateSource: true,
    };

    await this.observations.createIdempotent({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      chargeSessionId: sessionRow.id,
      method: HV_M3_CAPACITY_METHOD,
      estimatedCapacityKwh: estimate.estimatedCapacityKwh,
      quality,
      modelVersion: HV_M3_MODEL_VERSION,
      observedAt,
      deltaSocPercent: estimate.deltaSocPercent,
      deltaEnergyKwh: estimate.segmentAddedEnergyKwh,
      idempotencyKey: buildHvM3CapacityObservationIdempotencyKey({
        chargeSessionId: sessionRow.id,
        modelVersion: HV_M3_MODEL_VERSION,
      }),
      metadata: observationMetadata,
    });

    await this.persistSessionValidation(sessionRow.id, metadata, {
      method: HV_M3_CAPACITY_METHOD,
      modelVersion: HV_M3_MODEL_VERSION,
      methodRole: HV_M3_METHOD_ROLE,
      estimatedCapacityKwh: estimate.estimatedCapacityKwh,
      segmentAddedEnergyKwh: estimate.segmentAddedEnergyKwh,
      deltaSocPercent: estimate.deltaSocPercent,
      gateEligible: true,
      gateReasonCodes: estimate.gate.reasonCodes,
      methodConflict: estimate.methodConflict,
      methodConflictDeviationRatio: estimate.methodConflictDeviationRatio,
      m2MedianCapacityKwh: estimate.m2MedianCapacityKwh,
      persisted: true,
      validatedAt: new Date().toISOString(),
    });

    this.logger.debug(
      `M3 validation persisted session=${sessionRow.id} capacity=${estimate.estimatedCapacityKwh.toFixed(2)} kWh conflict=${estimate.methodConflict}`,
    );

    return {
      sessionId: sessionRow.id,
      method: HV_M3_CAPACITY_METHOD,
      modelVersion: HV_M3_MODEL_VERSION,
      estimate,
      persisted: true,
    };
  }

  private async persistSessionValidation(
    sessionId: string,
    metadata: HvChargeSessionMetadata,
    validation: HvCapacityM3SessionValidation,
  ): Promise<void> {
    const nextMetadata: HvChargeSessionMetadata = {
      ...metadata,
      m3Validation: validation,
    };

    await this.prisma.hvChargeSession.update({
      where: { id: sessionId },
      data: {
        metadata: nextMetadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private skippedResult(
    sessionId: string,
    reason: string,
  ): HvCapacityM3ValidationResult {
    return {
      sessionId,
      method: HV_M3_CAPACITY_METHOD,
      modelVersion: HV_M3_MODEL_VERSION,
      estimate: null,
      persisted: false,
      skippedReason: reason,
    };
  }
}

export function mapHvChargeSessionRowToM3Input(
  session: Pick<
    HvChargeSession,
    | 'source'
    | 'isOngoing'
    | 'startAt'
    | 'endAt'
    | 'startSocPercent'
    | 'endSocPercent'
    | 'startEnergyKwh'
    | 'endEnergyKwh'
    | 'energyAddedKwh'
    | 'deltaSocPercent'
  >,
  metadata: HvChargeSessionMetadata,
): HvCapacityM3SessionInput {
  return {
    source: session.source,
    isOngoing: session.isOngoing,
    startAt: session.startAt,
    endAt: session.endAt,
    startSocPercent: session.startSocPercent,
    endSocPercent: session.endSocPercent,
    startEnergyKwh: session.startEnergyKwh,
    endEnergyKwh: session.endEnergyKwh,
    energyAddedKwh: session.energyAddedKwh,
    deltaSocPercent: session.deltaSocPercent,
    capacityValidationEligible: metadata.capacityValidationEligible === true,
    qualityStatus: metadata.qualityStatus ?? null,
    boundaryStrength: resolveM3BoundaryStrength(session),
  };
}

function resolveM3BoundaryStrength(
  session: Pick<HvChargeSession, 'source' | 'startAt' | 'endAt'>,
): HvCapacityM3SessionInput['boundaryStrength'] {
  if (
    session.source === HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE &&
    session.startAt &&
    session.endAt
  ) {
    return 'strong';
  }
  if (session.startAt && session.endAt) {
    return 'weak';
  }
  return 'invalid';
}
