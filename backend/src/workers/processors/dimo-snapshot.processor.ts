import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { DimoPollJobType, DimoPollStatus } from '@prisma/client';

import { QUEUE_NAMES } from '../queues/queue-names';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import { PrismaService } from '@shared/database/prisma.service';
import { TripDetectionOrchestrationService } from '../../modules/vehicle-intelligence/trips/trip-detection-orchestration.service';
import { BatteryV2Service } from '../../modules/vehicle-intelligence/battery-health/battery-v2.service';
import { HvBatteryHealthService } from '../../modules/vehicle-intelligence/battery-health/hv-battery-health.service';
import { ClickHouseTelemetryService } from '../../modules/clickhouse/clickhouse-telemetry.service';
import { TripMetricsService } from '../../modules/observability/trip-metrics.service';

export interface DimoSnapshotJobData {
  vehicleId: string;
  dimoTokenId: number;
}

@Processor(QUEUE_NAMES.DIMO_SNAPSHOT)
export class DimoSnapshotProcessor extends WorkerHost {
  private readonly logger = new Logger(DimoSnapshotProcessor.name);

  constructor(
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
    private readonly prisma: PrismaService,
    private readonly tripOrchestration: TripDetectionOrchestrationService,
    private readonly batteryV2: BatteryV2Service,
    private readonly hvBattery: HvBatteryHealthService,
    @Optional() private readonly chTelemetry: ClickHouseTelemetryService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {
    super();
  }

  async process(job: Job<DimoSnapshotJobData>): Promise<void> {
    const { vehicleId, dimoTokenId } = job.data;
    const startedAt = new Date();

    try {
      const previousState =
        await this.prisma.vehicleLatestState.findUnique({
          where: { vehicleId },
        });

      const vehicleJwt = await this.dimoAuth.getVehicleJwt(dimoTokenId);
      const raw = await this.dimoTelemetry.fetchLatestVehicleSnapshot(
        vehicleJwt,
        dimoTokenId,
      );

      const signals = this.extractSignalsLatest(raw);
      if (!signals) {
        this.tripMetrics?.emptySnapshots.inc({ vehicle_profile: 'UNKNOWN' });
        throw new Error('No signalsLatest in DIMO response');
      }

      const normalized = this.normalizeSnapshot(signals);
      const lvBatteryObservedAt =
        this.extractSignalTimestamp(signals.lowVoltageBatteryCurrentVoltage) ??
        normalized.lastSeenAt;

      // Track stale snapshots (data age > 5 min indicates vehicle is not actively sending)
      const STALE_THRESHOLD_MS = 5 * 60_000;
      if (normalized.lastSeenAt && Date.now() - normalized.lastSeenAt.getTime() > STALE_THRESHOLD_MS) {
        this.tripMetrics?.staleSnapshots.inc({ vehicle_profile: 'UNKNOWN' });
      }
      const fetchedAt = new Date();
      await this.prisma.vehicleLatestState.upsert({
        where: { vehicleId },
        create: {
          vehicleId,
          dimoTokenId,
          source: 'dimo',
          // Provenance
          providerSource: 'DIMO',
          providerFetchedAt: fetchedAt,
          sourceTimestamp: normalized.lastSeenAt ?? null,
          ...normalized,
        },
        update: {
          dimoTokenId,
          // Provenance updated on every snapshot
          providerSource: 'DIMO',
          providerFetchedAt: fetchedAt,
          sourceTimestamp: normalized.lastSeenAt ?? null,
          ...normalized,
        },
      });

      // ── ClickHouse dual-write (fire-and-forget, never blocks live pipeline) ──
      if (this.chTelemetry) {
        const chSnap = {
          isIgnitionOn: normalized.isIgnitionOn ?? null,
          speedKmh: normalized.speedKmh,
          odometerKm: normalized.odometerKm,
          latitude: normalized.latitude,
          longitude: normalized.longitude,
          engineLoad: normalized.engineLoad,
          fuelLevelAbsolute: normalized.fuelLevelAbsolute,
          evSoc: normalized.evSoc,
          tractionKw: normalized.tractionBatteryPowerKw,
          recordedAt: normalized.lastSeenAt ?? new Date(),
        };
        this.chTelemetry.insertSnapshot(vehicleId, dimoTokenId, chSnap).catch((err) =>
          this.logger.warn(`CH mirror failed: ${err.message}`),
        );
        this.chTelemetry
          .detectAndInsertStateChanges(
            vehicleId,
            previousState
              ? {
                  isIgnitionOn: previousState.isIgnitionOn,
                  speedKmh: previousState.speedKmh,
                }
              : null,
            chSnap,
          )
          .catch((err) =>
            this.logger.warn(`CH state change failed: ${err.message}`),
          );
      }

      // Battery V2 (12V): evaluate rest window before trip-start detection changes state
      this.batteryV2
        .onSnapshot(vehicleId, normalized.lvBatteryVoltage, lvBatteryObservedAt)
        .catch((err) =>
          this.logger.warn(
            `Battery V2 onSnapshot failed for ${vehicleId}: ${err instanceof Error ? err.message : err}`,
          ),
        );

      // HV Battery: record traction battery snapshot for EV/PHEV vehicles
      if (normalized.evSoc != null) {
        this.hvBattery
          .recordSnapshot({
            vehicleId,
            socPercent: normalized.evSoc,
            energyUsedKwh: normalized.tractionBatteryCurrentEnergyKwh ?? undefined,
            rangeKm: normalized.rangeKm ?? undefined,
            chargingPowerKw:
              normalized.tractionBatteryChargingPowerKw
              ?? normalized.tractionBatteryPowerKw
              ?? undefined,
            isCharging: normalized.tractionBatteryIsCharging ?? undefined,
            odometerKm: normalized.odometerKm ?? undefined,
            temperatureC: normalized.tractionBatteryTemperatureC ?? undefined,
            nominalCapacityKwh:
              normalized.tractionBatteryGrossCapacityKwh ?? undefined,
            providerReportedSohPercent:
              normalized.tractionBatterySohPercent ?? undefined,
            providerSource: 'DIMO',
            observedAt: normalized.lastSeenAt ?? undefined,
          })
          .catch((err) =>
            this.logger.warn(
              `HV Battery snapshot failed for ${vehicleId}: ${err instanceof Error ? err.message : err}`,
            ),
          );
      }

      // V2 Trip Detection: evaluate snapshot for possible trip start
      await this.evaluateTripStart(
        vehicleId,
        dimoTokenId,
        previousState,
        normalized,
      );

      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      // Create poll log and capture its ID for provenance back-reference
      const pollLog = await this.prisma.dimoPollLog.create({
        data: {
          vehicleId,
          jobType: DimoPollJobType.SNAPSHOT,
          status: DimoPollStatus.SUCCESS,
          startedAt,
          finishedAt,
          durationMs,
        },
      });

      // Patch VehicleLatestState.syncJobRef so the state row traces back to this poll run
      await this.prisma.vehicleLatestState.updateMany({
        where: { vehicleId },
        data: { syncJobRef: pollLog.id },
      });

      this.logger.debug(
        `Snapshot completed for vehicle ${vehicleId} in ${durationMs}ms`,
      );
    } catch (err) {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const errorMessage = err instanceof Error ? err.message : String(err);

      await this.prisma.dimoPollLog.create({
        data: {
          vehicleId,
          jobType: DimoPollJobType.SNAPSHOT,
          status: DimoPollStatus.FAILURE,
          startedAt,
          finishedAt,
          durationMs,
          errorMessage,
        },
      });

      this.logger.warn(
        `Snapshot failed for vehicle ${vehicleId}: ${errorMessage}`,
      );
      throw err;
    }
  }

  private async evaluateTripStart(
    vehicleId: string,
    dimoTokenId: number,
    previousState: Awaited<
      ReturnType<PrismaService['vehicleLatestState']['findUnique']>
    >,
    normalized: ReturnType<DimoSnapshotProcessor['normalizeSnapshot']>,
  ): Promise<void> {
    try {
      await this.tripOrchestration.evaluateSnapshotForTripStart(
        vehicleId,
        dimoTokenId,
        previousState,
        {
          isIgnitionOn: normalized.isIgnitionOn ?? null,
          speedKmh: normalized.speedKmh,
          engineLoad: normalized.engineLoad,
          tractionBatteryPowerKw: normalized.tractionBatteryPowerKw,
          latitude: normalized.latitude,
          longitude: normalized.longitude,
          odometerKm: normalized.odometerKm,
          fuelLevelAbsolute: normalized.fuelLevelAbsolute,
          evSoc: normalized.evSoc,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Trip start eval error for ${vehicleId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private extractSignalsLatest(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;

    const signals =
      r.signalsLatest ??
      (r.data as Record<string, unknown> | undefined)?.signalsLatest;

    if (Array.isArray(signals) && signals.length > 0)
      return signals[0] as Record<string, unknown>;
    if (signals && typeof signals === 'object')
      return signals as Record<string, unknown>;
    return null;
  }

  private extractSignalTimestamp(field: unknown): Date | null {
    if (!field || typeof field !== 'object') return null;
    const ts = (field as Record<string, unknown>).timestamp;
    if (typeof ts === 'number' || typeof ts === 'string') {
      const parsed = new Date(ts);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  private normalizeSnapshot(signals: Record<string, unknown>) {
    const numVal = (field: unknown): number | null => {
      if (field == null) return null;
      if (typeof field === 'number') return Number.isNaN(field) ? null : field;
      if (typeof field === 'object') {
        const v = (field as Record<string, unknown>).value;
        return v != null && typeof v === 'number' && !Number.isNaN(v) ? v : null;
      }
      return null;
    };

    const ts = (v: unknown): Date | null => {
      if (v == null) return null;
      if (typeof v === 'number') return new Date(v);
      if (typeof v === 'string') return new Date(v);
      return null;
    };

    const locCoords = signals.currentLocationCoordinates as
      | { value?: { latitude?: number; longitude?: number } }
      | null
      | undefined;

    return {
      lastSeenAt: ts(signals.lastSeen),
      latitude: locCoords?.value?.latitude ?? null,
      longitude: locCoords?.value?.longitude ?? null,
      odometerKm: numVal(signals.powertrainTransmissionTravelledDistance),
      oilLevelRelative: numVal(signals.powertrainCombustionEngineEngineOilRelativeLevel),
      defLevel: numVal(signals.powertrainCombustionEngineDieselExhaustFluidLevel),
      rangeKm: numVal(signals.powertrainTractionBatteryRange),
      tirePressureFl: numVal(signals.chassisAxleRow1WheelLeftTirePressure),
      tirePressureFr: numVal(signals.chassisAxleRow1WheelRightTirePressure),
      tirePressureRl: numVal(signals.chassisAxleRow2WheelLeftTirePressure),
      tirePressureRr: numVal(signals.chassisAxleRow2WheelRightTirePressure),
      evSoc: numVal(signals.powertrainTractionBatteryStateOfChargeCurrent),
      tractionBatteryCurrentEnergyKwh: numVal(
        signals.powertrainTractionBatteryStateOfChargeCurrentEnergy,
      ),
      tractionBatterySohPercent: numVal(
        signals.powertrainTractionBatteryStateOfHealth,
      ),
      tractionBatteryPowerKw: (() => {
        const w = numVal(signals.powertrainTractionBatteryCurrentPower);
        return w != null ? w / 1000 : null;
      })(),
      tractionBatteryCurrentVoltage: numVal(
        signals.powertrainTractionBatteryCurrentVoltage,
      ),
      tractionBatteryTemperatureC: numVal(
        signals.powertrainTractionBatteryTemperatureAverage,
      ),
      tractionBatteryChargingPowerKw: (() => {
        const w = numVal(signals.powertrainTractionBatteryChargingPower);
        return w != null ? w / 1000 : null;
      })(),
      tractionBatteryAddedEnergyKwh: numVal(
        signals.powertrainTractionBatteryChargingAddedEnergy,
      ),
      tractionBatteryIsCharging: (() => {
        const v = numVal(signals.powertrainTractionBatteryChargingIsCharging);
        return v != null ? v >= 0.5 : null;
      })(),
      tractionBatteryChargingCableConnected: (() => {
        const v = numVal(
          signals.powertrainTractionBatteryChargingIsChargingCableConnected,
        );
        return v != null ? v >= 0.5 : null;
      })(),
      tractionBatteryGrossCapacityKwh: numVal(
        signals.powertrainTractionBatteryGrossCapacity,
      ),
      isIgnitionOn: (() => {
        const v = numVal(signals.isIgnitionOn);
        return v != null ? v >= 0.5 : null;
      })(),
      engineLoad: numVal(signals.obdEngineLoad),
      fuelLevelRelative: numVal(signals.powertrainFuelSystemRelativeLevel),
      fuelLevelAbsolute: numVal(signals.powertrainFuelSystemAbsoluteLevel),
      lvBatteryVoltage: numVal(signals.lowVoltageBatteryCurrentVoltage),
      coolantTempC: numVal(signals.powertrainCombustionEngineECT),
      speedKmh: numVal(signals.speed),
      rawPayloadJson: signals as object,
    };
  }
}
