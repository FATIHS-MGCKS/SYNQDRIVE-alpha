import { Injectable } from '@nestjs/common';
import {
  BatteryMeasurementQuality,
  BatteryMeasurementSession,
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  getBatteryRest60mDelayMs,
  getBatteryRest6hDelayMs,
} from '@config/battery-health-v2.config';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { buildLvRestWindowPolicyContext } from './lv-rest-window.policy';
import { BatteryMeasurementService } from '../battery-measurement.service';
import {
  buildRestMeasurementIdempotencyKey,
  DEFAULT_REST_TARGET_OBSERVATION_WINDOW_MS,
  measurementTypeForRestTarget,
  restTargetAt,
  selectRestTargetObservation,
  type RestTargetObservationCandidate,
} from './battery-rest-target-evaluation';
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
    const targetAt = restTargetAt(
      input.restWindowStartedAt,
      input.restTargetType,
      getBatteryRest60mDelayMs(),
      getBatteryRest6hDelayMs(),
    );
    const from = new Date(
      input.restWindowStartedAt.getTime() - DEFAULT_REST_TARGET_OBSERVATION_WINDOW_MS,
    );
    const to = new Date(targetAt.getTime() + DEFAULT_REST_TARGET_OBSERVATION_WINDOW_MS);

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
      },
    });

    return rows
      .filter((row) => row.numericValue != null)
      .map((row) => ({
        measurementId: row.id,
        observedAt: row.observedAt,
        numericValue: row.numericValue as number,
        providerTimestamp: row.providerTimestamp,
      }));
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
  }): Promise<
    | { ok: true; measurementId: string; sourceObservationId: string }
    | { ok: false; reason: string; retryable: boolean }
  > {
    const policyProfile = buildLvRestWindowPolicyContext(
      await this.policyProfiles.resolveForVehicle(input.vehicleId),
    );
    const targetAt = restTargetAt(
      input.session.startedAt,
      input.restTargetType,
      getBatteryRest60mDelayMs(),
      getBatteryRest6hDelayMs(),
    );
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

    const selection = selectRestTargetObservation({
      candidates,
      excludedSourceMeasurementIds: excludedSourceObservationIds,
      policy: {
        targetAt,
        windowBeforeMs: DEFAULT_REST_TARGET_OBSERVATION_WINDOW_MS,
        windowAfterMs: DEFAULT_REST_TARGET_OBSERVATION_WINDOW_MS,
        wakeVoltageThreshold: policyProfile.wakeVoltageThreshold,
        maxRestingVoltage: policyProfile.maxRestingVoltage,
      },
    });

    if (!selection.ok || !selection.selected) {
      const now = Date.now();
      const windowEnd = targetAt.getTime() + DEFAULT_REST_TARGET_OBSERVATION_WINDOW_MS;
      return {
        ok: false,
        reason: selection.reason,
        retryable: now < windowEnd,
      };
    }

    const selected = selection.selected;
    const measurement = await this.measurements.create({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      sessionId: input.session.id,
      type: measurementTypeForRestTarget(input.restTargetType),
      quality: BatteryMeasurementQuality.VALID,
      observedAt: selected.observedAt,
      numericValue: selected.numericValue,
      unit: 'V',
      providerTimestamp: selected.providerTimestamp,
      providerSource: 'DIMO',
      signalName: 'lowVoltageBatteryCurrentVoltage',
      idempotencyKey: buildRestMeasurementIdempotencyKey({
        sessionId: input.session.id,
        restTargetType: input.restTargetType,
        sourceObservationId: selected.measurementId,
      }),
      provenance: {
        sourceObservationId: selected.measurementId,
        restTargetType: input.restTargetType,
        targetAt: targetAt.toISOString(),
      },
      context: {
        restTargetType: input.restTargetType,
        targetAt: targetAt.toISOString(),
      },
    });

    return {
      ok: true,
      measurementId: measurement.id,
      sourceObservationId: selected.measurementId,
    };
  }
}
