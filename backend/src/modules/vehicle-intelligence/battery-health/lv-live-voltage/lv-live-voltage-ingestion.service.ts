import { Injectable, Logger } from '@nestjs/common';
import {
  BatteryMeasurementQuality,
  BatteryMeasurementType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryMeasurementService } from '../battery-measurement.service';
import {
  evaluateBatteryProviderObservation,
  type BatteryProviderObservationDecision,
  type BatteryProviderStoredObservationContext,
} from '../battery-provider-observation.policy';
import type { BatteryObservationClassifyPayload } from '../jobs/battery-v2-job.types';
import type { BatteryObservationSnapshotContext } from '../jobs/battery-v2-snapshot-context.types';
import {
  DEFAULT_LV_CHARGING_VOLTAGE_THRESHOLD_V,
  isChargingContext,
} from '../lv-rest-window/lv-rest-window.policy';
import type { LvRestWindowSignalContext } from '../lv-rest-window/lv-rest-window.types';
import type { RestTargetObservationContext } from '../lv-rest-window/battery-rest-target-evaluation';

const LV_BATTERY_SIGNAL = 'lowVoltageBatteryCurrentVoltage';
const PROVIDER_SOURCE = 'DIMO';

export interface LvLiveVoltagePersistResult {
  persisted: boolean;
  measurementId?: string;
  skippedReason?: string;
  decision?: BatteryProviderObservationDecision;
}

function parseIso(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function isPlausibleLvVoltage(value: number | null | undefined): value is number {
  return value != null && value >= 9.0 && value <= 16.0;
}

@Injectable()
export class LvLiveVoltageIngestionService {
  private readonly logger = new Logger(LvLiveVoltageIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly measurements: BatteryMeasurementService,
  ) {}

  /**
   * Persist canonical LIVE_VOLTAGE from a classified DIMO snapshot observation.
   * Uses the same provider observation policy as poll classification (bounded writes).
   */
  async persistFromObservationClassify(
    payload: BatteryObservationClassifyPayload,
  ): Promise<LvLiveVoltagePersistResult> {
    const ctx = payload.snapshotContext;
    if (!ctx) {
      return { persisted: false, skippedReason: 'missing_snapshot_context' };
    }

    const voltage = ctx.lvBatteryVoltage;
    if (!isPlausibleLvVoltage(voltage)) {
      return { persisted: false, skippedReason: 'no_plausible_voltage' };
    }

    const receivedAt = parseIso(ctx.providerFetchedAt) ?? new Date();
    const observedAt = parseIso(ctx.lvBatteryObservedAt) ?? receivedAt;

    const lastStored = await this.resolveLastStoredObservation(
      payload.organizationId,
      payload.vehicleId,
    );

    const decision = evaluateBatteryProviderObservation({
      organizationId: payload.organizationId,
      vehicleId: payload.vehicleId,
      signalName: LV_BATTERY_SIGNAL,
      providerSource: PROVIDER_SOURCE,
      normalizedValue: voltage,
      observedAt,
      receivedAt,
      lastStored,
    });

    if (!decision.shouldPersist || !decision.idempotencyKey || !decision.observedAt) {
      return {
        persisted: false,
        skippedReason: decision.outcome,
        decision,
      };
    }

    const restContext = await this.buildRestTargetContext(
      payload.vehicleId,
      ctx,
      voltage,
    );

    const measurement = await this.measurements.create({
      organizationId: payload.organizationId,
      vehicleId: payload.vehicleId,
      type: BatteryMeasurementType.LIVE_VOLTAGE,
      quality: BatteryMeasurementQuality.VALID,
      observedAt: decision.observedAt,
      receivedAt,
      numericValue: voltage,
      unit: 'V',
      providerTimestamp: observedAt,
      providerSource: PROVIDER_SOURCE,
      signalName: LV_BATTERY_SIGNAL,
      idempotencyKey: decision.idempotencyKey,
      context: this.toMeasurementContext(restContext, decision.outcome) as Record<
        string,
        unknown
      >,
      provenance: {
        selectionMethod: 'provider_observation_classify',
        providerObservationOutcome: decision.outcome,
        evidenceEligible: true,
        publicationEligible: false,
        classifyIdempotencyKey: payload.idempotencyKey,
        ...(payload.correlationId ? { correlationId: payload.correlationId } : {}),
      },
    });

    this.logger.debug(
      `LIVE_VOLTAGE persisted vehicle=${payload.vehicleId} id=${measurement.id} v=${voltage}V outcome=${decision.outcome}`,
    );

    return {
      persisted: true,
      measurementId: measurement.id,
      decision,
    };
  }

  private toMeasurementContext(
    signal: LvRestWindowSignalContext,
    outcome: string,
  ): RestTargetObservationContext {
    return {
      speedKmh: signal.speedKmh,
      ignitionOn: signal.ignitionOn,
      engineRunning: signal.engineRunning,
      hasActiveTrip: signal.hasActiveTrip,
      isLvCharging: signal.isLvCharging,
      isHvCharging: signal.isHvCharging,
      lvVoltage: signal.lvVoltage,
      tripId: signal.tripId,
      providerObservationOutcome: outcome,
      providerError: false,
    };
  }

  private async resolveLastStoredObservation(
    organizationId: string,
    vehicleId: string,
  ): Promise<BatteryProviderStoredObservationContext | null> {
    const lastMeasurement = await this.prisma.batteryMeasurement.findFirst({
      where: {
        organizationId,
        vehicleId,
        type: BatteryMeasurementType.LIVE_VOLTAGE,
      },
      orderBy: { observedAt: 'desc' },
      select: {
        observedAt: true,
        numericValue: true,
        receivedAt: true,
        idempotencyKey: true,
      },
    });

    if (lastMeasurement?.numericValue != null) {
      return {
        observedAt: lastMeasurement.observedAt,
        normalizedValue: lastMeasurement.numericValue,
        receivedAt: lastMeasurement.receivedAt,
        idempotencyKey: lastMeasurement.idempotencyKey,
      };
    }

    const lastLegacy = await this.prisma.batteryHealthSnapshot.findFirst({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      select: { recordedAt: true, voltageV: true },
    });

    if (!lastLegacy?.voltageV) {
      return null;
    }

    return {
      observedAt: lastLegacy.recordedAt,
      normalizedValue: lastLegacy.voltageV,
    };
  }

  private async buildRestTargetContext(
    vehicleId: string,
    ctx: BatteryObservationSnapshotContext,
    voltage: number,
  ): Promise<LvRestWindowSignalContext> {
    const row = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        latestState: {
          select: {
            speedKmh: true,
            isIgnitionOn: true,
            engineLoad: true,
            tractionBatteryIsCharging: true,
            tractionBatteryChargingPowerKw: true,
          },
        },
        tripDetectionState: {
          select: { activeTripId: true, lastActivityAt: true },
        },
      },
    });

    const observedAt = parseIso(ctx.lvBatteryObservedAt) ?? new Date();
    const engineLoad = row?.latestState?.engineLoad;

    const signal: LvRestWindowSignalContext = {
      observedAt,
      providerObservedAt: observedAt,
      providerError: false,
      speedKmh: row?.latestState?.speedKmh ?? null,
      ignitionOn: row?.latestState?.isIgnitionOn ?? null,
      engineRunning:
        engineLoad != null && engineLoad > 5
          ? true
          : engineLoad != null
            ? false
            : null,
      hasActiveTrip: row?.tripDetectionState?.activeTripId != null,
      isLvCharging: voltage >= DEFAULT_LV_CHARGING_VOLTAGE_THRESHOLD_V,
      isHvCharging:
        row?.latestState?.tractionBatteryIsCharging === true ||
        (row?.latestState?.tractionBatteryChargingPowerKw ?? 0) > 0,
      lvVoltage: voltage,
      lastActivityAt: row?.tripDetectionState?.lastActivityAt ?? null,
      tripEndAt: row?.tripDetectionState?.lastActivityAt ?? null,
      tripId: row?.tripDetectionState?.activeTripId ?? null,
    };

    if (isChargingContext(signal)) {
      signal.isLvCharging = true;
    }

    return signal;
  }
}
