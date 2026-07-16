import { Injectable } from '@nestjs/common';
import {
  BatteryMeasurementQuality,
  BatteryMeasurementSession,
  BatteryMeasurementType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  getBatteryRest60mDelayMs,
  getBatteryRest6hDelayMs,
  getBatteryRestTargetRetryGraceMs,
} from '@config/battery-health-v2.config';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { isMeasurementAllowedForPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import { buildLvRestWindowPolicyContext } from './lv-rest-window.policy';
import { BatteryMeasurementService } from '../battery-measurement.service';
import {
  buildRestMeasurementIdempotencyKey,
  buildRestMissedMeasurementIdempotencyKey,
  getRestTargetQualityWindowMs,
  measurementTypeForRestTarget,
  parseRestTargetObservationContext,
  restTargetAt,
  type RestTargetObservationCandidate,
} from './battery-rest-target-evaluation';
import {
  classifyLvRestSessionOutcome,
  evaluateClassifiedRestTargetOutcome,
  isLvRestMeasurementEvidenceEligible,
  isLvRestMeasurementPublicationEligible,
} from './lv-rest-measurement-quality';
import {
  LV_REST_TARGET_TYPES,
  type LvRestTargetType,
} from './lv-rest-window-target.metadata';

@Injectable()
export class BatteryRestTargetEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly measurements: BatteryMeasurementService,
    private readonly policyProfiles: BatteryPolicyProfileService,
  ) {}

  async listLvVoltageCandidates(input: {
    organizationId: string;
    vehicleId: string;
    restWindowStartedAt: Date;
    restTargetType: Extract<LvRestTargetType, 'REST_60M' | 'REST_6H'>;
  }): Promise<RestTargetObservationCandidate[]> {
    const qualityWindowMs = getRestTargetQualityWindowMs(input.restTargetType);
    const retryGraceMs = getBatteryRestTargetRetryGraceMs();
    const targetAt = restTargetAt(
      input.restWindowStartedAt,
      input.restTargetType,
      getBatteryRest60mDelayMs(),
      getBatteryRest6hDelayMs(),
    );
    const from = new Date(input.restWindowStartedAt.getTime() - qualityWindowMs);
    const to = new Date(
      targetAt.getTime() + qualityWindowMs + retryGraceMs,
    );

    const rows = await this.prisma.batteryMeasurement.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        type: BatteryMeasurementType.LIVE_VOLTAGE,
        observedAt: { gte: from, lte: to },
        quality: { in: [BatteryMeasurementQuality.VALID, BatteryMeasurementQuality.SHADOW] },
        numericValue: { not: null },
      },
      orderBy: { observedAt: 'asc' },
      select: {
        id: true,
        observedAt: true,
        numericValue: true,
        providerTimestamp: true,
        context: true,
        provenance: true,
      },
    });

    return rows
      .filter((row) => row.numericValue != null)
      .map((row) => ({
        measurementId: row.id,
        observedAt: row.observedAt,
        numericValue: row.numericValue as number,
        providerTimestamp: row.providerTimestamp,
        context: parseRestTargetObservationContext(row.context, row.provenance),
      }));
  }

  async resolveTripStartsAfterAnchor(
    vehicleId: string,
    anchorAt: Date,
    until: Date,
  ): Promise<Date[]> {
    const trips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId,
        startTime: {
          gt: anchorAt,
          lte: until,
        },
      },
      select: { startTime: true },
      orderBy: { startTime: 'asc' },
    });
    return trips.map((trip) => trip.startTime);
  }

  async resolveExcludedSourceObservationIds(
    organizationId: string,
    sessionId: string,
    restTargetType: Extract<LvRestTargetType, 'REST_60M' | 'REST_6H'>,
  ): Promise<string[]> {
    if (restTargetType !== LV_REST_TARGET_TYPES.REST_6H) {
      return [];
    }

    const rest60m = await this.prisma.batteryMeasurement.findFirst({
      where: {
        organizationId,
        sessionId,
        type: BatteryMeasurementType.REST_60M,
      },
      select: { provenance: true },
    });
    if (!rest60m?.provenance || typeof rest60m.provenance !== 'object') {
      return [];
    }
    const sourceObservationId = (rest60m.provenance as Record<string, unknown>)
      .sourceObservationId;
    return typeof sourceObservationId === 'string' ? [sourceObservationId] : [];
  }

  async evaluateAndPersist(input: {
    organizationId: string;
    vehicleId: string;
    session: BatteryMeasurementSession;
    restTargetType: Extract<LvRestTargetType, 'REST_60M' | 'REST_6H'>;
    now?: Date;
  }): Promise<
    | {
        ok: true;
        measurementId: string;
        sourceObservationId: string;
        quality: BatteryMeasurementQuality;
        evidenceEligible: boolean;
      }
    | {
        ok: false;
        reason: string;
        retryable: boolean;
        missed: boolean;
        measurementId?: string;
        quality?: BatteryMeasurementQuality;
      }
  > {
    const policyProfile = buildLvRestWindowPolicyContext(
      await this.policyProfiles.resolveForVehicle(input.vehicleId),
    );
    const resolvedPolicy = await this.policyProfiles.resolveForVehicle(
      input.vehicleId,
    );
    const measurementType = measurementTypeForRestTarget(input.restTargetType);

    if (!isMeasurementAllowedForPolicy(resolvedPolicy, measurementType)) {
      const unsupported = classifyLvRestSessionOutcome({ unsupportedProfile: true });
      const measurement = await this.persistStatusMeasurement({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        session: input.session,
        restTargetType: input.restTargetType,
        targetAt: restTargetAt(
          input.session.startedAt,
          input.restTargetType,
          getBatteryRest60mDelayMs(),
          getBatteryRest6hDelayMs(),
        ),
        quality: unsupported.quality,
        reasonCode: unsupported.reasonCode,
        reasonLabel: unsupported.reasonLabel,
        driveProfile: resolvedPolicy.driveProfile,
        chemistry: resolvedPolicy.chemistry,
      });
      return {
        ok: false,
        reason: unsupported.reasonCode,
        retryable: false,
        missed: false,
        measurementId: measurement.id,
        quality: unsupported.quality,
      };
    }

    const qualityWindowMs = getRestTargetQualityWindowMs(input.restTargetType);
    const retryGraceMs = getBatteryRestTargetRetryGraceMs();
    const targetAt = restTargetAt(
      input.session.startedAt,
      input.restTargetType,
      getBatteryRest60mDelayMs(),
      getBatteryRest6hDelayMs(),
    );
    const now = input.now ?? new Date();
    const candidates = await this.listLvVoltageCandidates({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      restWindowStartedAt: input.session.startedAt,
      restTargetType: input.restTargetType,
    });
    const excludedSourceObservationIds =
      await this.resolveExcludedSourceObservationIds(
        input.organizationId,
        input.session.id,
        input.restTargetType,
      );
    const tripStartsAfterAnchor = await this.resolveTripStartsAfterAnchor(
      input.vehicleId,
      input.session.startedAt,
      new Date(targetAt.getTime() + qualityWindowMs + retryGraceMs),
    );

    const policy = {
      targetAt,
      windowBeforeMs: qualityWindowMs,
      windowAfterMs: qualityWindowMs,
      wakeVoltageThreshold: policyProfile.wakeVoltageThreshold,
      maxRestingVoltage: policyProfile.maxRestingVoltage,
      restRequiresEngineOff: policyProfile.restRequiresEngineOff,
    };

    const outcome = evaluateClassifiedRestTargetOutcome({
      candidates,
      policy,
      constraints: {
        excludedSourceMeasurementIds: excludedSourceObservationIds,
        tripStartsAfterAnchor,
      },
      now,
      retryGraceMs,
    });

    if (outcome.ok) {
      const selected = outcome.selected;
      const includeNumeric = outcome.quality !== BatteryMeasurementQuality.MISSED;
      const measurement = await this.measurements.create({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        sessionId: input.session.id,
        type: measurementType,
        quality: outcome.quality,
        observedAt: selected.observedAt,
        numericValue: includeNumeric ? selected.numericValue : null,
        unit: includeNumeric ? 'V' : null,
        providerTimestamp: selected.providerTimestamp,
        providerSource: 'DIMO',
        signalName: 'lowVoltageBatteryCurrentVoltage',
        idempotencyKey: buildRestMeasurementIdempotencyKey({
          sessionId: input.session.id,
          restTargetType: input.restTargetType,
          sourceObservationId: selected.measurementId,
        }),
        provenance: {
          selectionMethod: 'historical_provider_observation',
          sourceObservationId: selected.measurementId,
          restTargetType: input.restTargetType,
          targetAt: targetAt.toISOString(),
          qualityWindowMs,
          qualityReasonCode: outcome.reasonCode,
          qualityReasonLabel: outcome.reasonLabel,
          evidenceEligible: outcome.evidenceEligible,
          publicationEligible: isLvRestMeasurementPublicationEligible(),
          distanceToTargetMs: Math.abs(
            selected.observedAt.getTime() - targetAt.getTime(),
          ),
          driveProfile: resolvedPolicy.driveProfile,
          chemistry: resolvedPolicy.chemistry,
        },
        context: {
          restTargetType: input.restTargetType,
          targetAt: targetAt.toISOString(),
          restWindowStartedAt: input.session.startedAt.toISOString(),
          qualityReasonCode: outcome.reasonCode,
          qualityReasonLabel: outcome.reasonLabel,
          sourceObservationContext: selected.context ?? {},
          tripStartsAfterAnchor: tripStartsAfterAnchor.map((d) => d.toISOString()),
        },
      });

      return {
        ok: true,
        measurementId: measurement.id,
        sourceObservationId: selected.measurementId,
        quality: outcome.quality,
        evidenceEligible: outcome.evidenceEligible,
      };
    }

    if (outcome.missed) {
      const missed = await this.persistMissedMeasurement({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        session: input.session,
        restTargetType: input.restTargetType,
        targetAt,
        qualityWindowMs,
        retryGraceMs,
        reasonCode: outcome.reasonCode ?? 'missed_no_valid_observation',
        reasonLabel: outcome.reasonLabel ?? 'Keine gültige Ruhemessung im Zielzeitfenster',
        driveProfile: resolvedPolicy.driveProfile,
        chemistry: resolvedPolicy.chemistry,
        candidateCount: candidates.length,
        tripStartsAfterAnchor,
      });
      return {
        ok: false,
        reason: outcome.reason,
        retryable: false,
        missed: true,
        measurementId: missed.id,
        quality: BatteryMeasurementQuality.MISSED,
      };
    }

    return {
      ok: false,
      reason: outcome.reason,
      retryable: outcome.retryable,
      missed: false,
      quality: outcome.sessionQuality,
    };
  }

  private async persistStatusMeasurement(input: {
    organizationId: string;
    vehicleId: string;
    session: BatteryMeasurementSession;
    restTargetType: Extract<LvRestTargetType, 'REST_60M' | 'REST_6H'>;
    targetAt: Date;
    quality: BatteryMeasurementQuality;
    reasonCode: string;
    reasonLabel: string;
    driveProfile: string;
    chemistry: string;
  }) {
    return this.measurements.create({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      sessionId: input.session.id,
      type: measurementTypeForRestTarget(input.restTargetType),
      quality: input.quality,
      observedAt: input.targetAt,
      idempotencyKey: buildRestMissedMeasurementIdempotencyKey({
        sessionId: input.session.id,
        restTargetType: input.restTargetType,
      }),
      provenance: {
        selectionMethod: 'historical_provider_observation',
        restTargetType: input.restTargetType,
        targetAt: input.targetAt.toISOString(),
        qualityReasonCode: input.reasonCode,
        qualityReasonLabel: input.reasonLabel,
        evidenceEligible: isLvRestMeasurementEvidenceEligible(input.quality),
        publicationEligible: isLvRestMeasurementPublicationEligible(),
        driveProfile: input.driveProfile,
        chemistry: input.chemistry,
      },
      context: {
        restTargetType: input.restTargetType,
        targetAt: input.targetAt.toISOString(),
        restWindowStartedAt: input.session.startedAt.toISOString(),
        qualityReasonCode: input.reasonCode,
        qualityReasonLabel: input.reasonLabel,
      },
    });
  }

  private async persistMissedMeasurement(input: {
    organizationId: string;
    vehicleId: string;
    session: BatteryMeasurementSession;
    restTargetType: Extract<LvRestTargetType, 'REST_60M' | 'REST_6H'>;
    targetAt: Date;
    qualityWindowMs: number;
    retryGraceMs: number;
    reasonCode: string;
    reasonLabel: string;
    driveProfile: string;
    chemistry: string;
    candidateCount: number;
    tripStartsAfterAnchor: Date[];
  }) {
    return this.measurements.create({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      sessionId: input.session.id,
      type: measurementTypeForRestTarget(input.restTargetType),
      quality: BatteryMeasurementQuality.MISSED,
      observedAt: input.targetAt,
      idempotencyKey: buildRestMissedMeasurementIdempotencyKey({
        sessionId: input.session.id,
        restTargetType: input.restTargetType,
      }),
      provenance: {
        selectionMethod: 'historical_provider_observation',
        restTargetType: input.restTargetType,
        targetAt: input.targetAt.toISOString(),
        qualityWindowMs: input.qualityWindowMs,
        retryGraceMs: input.retryGraceMs,
        qualityReasonCode: input.reasonCode,
        qualityReasonLabel: input.reasonLabel,
        evidenceEligible: false,
        publicationEligible: false,
        driveProfile: input.driveProfile,
        chemistry: input.chemistry,
        candidateCount: input.candidateCount,
      },
      context: {
        restTargetType: input.restTargetType,
        targetAt: input.targetAt.toISOString(),
        restWindowStartedAt: input.session.startedAt.toISOString(),
        qualityReasonCode: input.reasonCode,
        qualityReasonLabel: input.reasonLabel,
        tripStartsAfterAnchor: input.tripStartsAfterAnchor.map((d) =>
          d.toISOString(),
        ),
      },
    });
  }
}
