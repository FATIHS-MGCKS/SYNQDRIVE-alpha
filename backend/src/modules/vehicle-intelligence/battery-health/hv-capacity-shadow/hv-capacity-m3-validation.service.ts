import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isBatteryV2HvCapacityShadowEnabled } from '@config/battery-health-v2.config';
import { PrismaService } from '@shared/database/prisma.service';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import {
  buildHvCapacityShadowEvidenceFingerprint,
  shadowEvidenceFromChargeSessionRow,
} from './hv-capacity-shadow-evidence.policy';
import { mapHvChargeSessionRowToM3Input } from './hv-capacity-m3-session-input.mapper';
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

    const evidenceFingerprint = buildHvCapacityShadowEvidenceFingerprint(
      shadowEvidenceFromChargeSessionRow(sessionRow, metadata),
    );

    const gate = evaluateHvM3SessionGate(sessionInput);
    if (!gate.eligible) {
      await this.invalidatePersistedM3Observations(sessionRow.id);
      await this.persistSessionValidation(
        sessionRow,
        metadata,
        {
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
        },
        evidenceFingerprint,
      );

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

    const m3ValidationStale =
      metadata.m3Validation == null ||
      metadata.shadowEvidenceFingerprint !== evidenceFingerprint ||
      metadata.m3Validation.deltaSocPercent !== sessionInput.deltaSocPercent ||
      metadata.m3Validation.segmentAddedEnergyKwh !== sessionInput.energyAddedKwh;

    if (alreadyProcessed && !m3ValidationStale) {
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

    if (alreadyProcessed && m3ValidationStale) {
      await this.invalidatePersistedM3Observations(sessionRow.id);
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

    await this.persistSessionValidation(
      sessionRow,
      metadata,
      {
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
      },
      evidenceFingerprint,
    );

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
    session: {
      id: string;
      startAt: Date;
      endAt: Date | null;
      startSocPercent: number | null;
      endSocPercent: number | null;
      startEnergyKwh: number | null;
      endEnergyKwh: number | null;
      energyAddedKwh: number | null;
      deltaSocPercent: number | null;
    },
    metadata: HvChargeSessionMetadata,
    validation: HvCapacityM3SessionValidation,
    evidenceFingerprint?: string,
  ): Promise<void> {
    const fingerprint =
      evidenceFingerprint ??
      buildHvCapacityShadowEvidenceFingerprint(
        shadowEvidenceFromChargeSessionRow(session, metadata),
      );
    const nextMetadata: HvChargeSessionMetadata = {
      ...metadata,
      m3Validation: validation,
      shadowEvidenceFingerprint: fingerprint,
    };

    await this.prisma.hvChargeSession.update({
      where: { id: session.id },
      data: {
        metadata: nextMetadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async invalidatePersistedM3Observations(
    chargeSessionId: string,
  ): Promise<void> {
    await this.observations.deleteSessionObservations({
      chargeSessionId,
      methods: [HV_M3_CAPACITY_METHOD],
      modelVersion: HV_M3_MODEL_VERSION,
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

export { mapHvChargeSessionRowToM3Input } from './hv-capacity-m3-session-input.mapper';
