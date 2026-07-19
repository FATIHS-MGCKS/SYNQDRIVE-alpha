import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { DimoPollJobType, DimoPollStatus } from '@prisma/client';

import { QUEUE_NAMES } from '../queues/queue-names';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import { PrismaService } from '@shared/database/prisma.service';
import { TripDetectionOrchestrationService } from '../../modules/vehicle-intelligence/trips/trip-detection-orchestration.service';
import { BatteryV2SnapshotObservationProducer } from '../../modules/vehicle-intelligence/battery-health/jobs/battery-v2-snapshot-observation.producer';
import { ClickHouseTelemetryService } from '../../modules/clickhouse/clickhouse-telemetry.service';
import { TripMetricsService } from '../../modules/observability/trip-metrics.service';
import { observeQueueLag } from '../../modules/observability/queue-lag.util';
import {
  normalizeDimoSnapshotTirePressures,
  toSynqDriveTirePressureMeta,
} from '@modules/dimo/dimo-tire-pressure.normalizer';
import { capRawPayload } from '@shared/utils/json-payload.util';
import {
  mapDimoBatterySignals,
  resolveLvBatteryObservedAt,
  toVlsBatteryFields,
} from '../../modules/dimo/mappers/dimo-battery-signal.mapper';
import { DeviceConnectionEpisodeResolutionService } from '../../modules/dimo/device-connection-episode-resolution/device-connection-episode-resolution.service';
import {
  buildSnapshotReferenceId,
  extractObdPlugSignalFromSnapshot,
} from '../../modules/dimo/device-connection-episode-resolution/device-connection-episode-resolution.snapshot-evaluator';

export interface DimoSnapshotJobData {
  vehicleId: string;
  dimoTokenId: number;
}

/**
 * BullMQ worker options:
 *  - lockDuration: 60s gives each snapshot up to ~60s of end-to-end work
 *    before BullMQ marks the job "stalled". Previously (default 30s) a
 *    slow GraphQL round-trip plus the follow-up DB upserts and trip-start
 *    evaluation could overrun the lock and flip the job into a permanent
 *    failed state that silently blocked all future enqueues for that
 *    vehicle (shared jobId = snapshot-<vehicleId>).
 *  - concurrency: 5 keeps queue throughput high without hammering DIMO.
 */
@Processor(QUEUE_NAMES.DIMO_SNAPSHOT, {
  lockDuration: 60_000,
  concurrency: 5,
})
export class DimoSnapshotProcessor extends WorkerHost {
  private readonly logger = new Logger(DimoSnapshotProcessor.name);

  constructor(
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
    private readonly prisma: PrismaService,
    private readonly tripOrchestration: TripDetectionOrchestrationService,
    private readonly batteryObservationProducer: BatteryV2SnapshotObservationProducer,
    @Optional() private readonly chTelemetry: ClickHouseTelemetryService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
    @Optional()
    private readonly episodeResolution?: DeviceConnectionEpisodeResolutionService,
  ) {
    super();
  }

  async process(job: Job<DimoSnapshotJobData>): Promise<void> {
    const { vehicleId, dimoTokenId } = job.data;
    const startedAt = new Date();
    observeQueueLag(this.tripMetrics, QUEUE_NAMES.DIMO_SNAPSHOT, job);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        organizationId: true,
        hardwareType: true,
        dataSourceLinks: {
          where: { isActive: true, provider: 'DIMO' },
          orderBy: { activatedAt: 'desc' },
          take: 1,
          select: { id: true, sourceSubtype: true },
        },
      },
    });
    if (!vehicle?.organizationId) {
      throw new Error(`Vehicle ${vehicleId} missing organizationId — cannot process snapshot`);
    }

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
      const batteryMap = mapDimoBatterySignals(signals);
      const lvBatteryObservedAt = resolveLvBatteryObservedAt(batteryMap);

      // Track stale snapshots (data age > 5 min indicates vehicle is not actively sending)
      const STALE_THRESHOLD_MS = 5 * 60_000;
      if (normalized.lastSeenAt && Date.now() - normalized.lastSeenAt.getTime() > STALE_THRESHOLD_MS) {
        this.tripMetrics?.staleSnapshots.inc({ vehicle_profile: 'UNKNOWN' });
      }
      const fetchedAt = new Date();
      const latestState = await this.prisma.vehicleLatestState.upsert({
        where: { vehicleId },
        create: {
          vehicleId,
          dimoTokenId,
          source: 'dimo',
          // Provenance
          providerSource: 'DIMO',
          providerFetchedAt: fetchedAt,
          sourceTimestamp: normalized.lastSeenAt ?? null,
          providerBindingId: vehicle.dataSourceLinks[0]?.id ?? null,
          ...normalized,
        },
        update: {
          dimoTokenId,
          // Provenance updated on every snapshot
          providerSource: 'DIMO',
          providerFetchedAt: fetchedAt,
          sourceTimestamp: normalized.lastSeenAt ?? null,
          providerBindingId: vehicle.dataSourceLinks[0]?.id ?? null,
          ...normalized,
        },
      });

      await this.tryResolveOpenEpisodeFromSnapshot({
        organizationId: vehicle.organizationId,
        vehicleId,
        hardwareType: vehicle.hardwareType,
        dimoTokenId,
        fetchedAt,
        signals,
        vehicleLatestStateId: latestState.id,
        providerBindingId: vehicle.dataSourceLinks[0]?.id ?? null,
        sourceSubtype: vehicle.dataSourceLinks[0]?.sourceSubtype ?? null,
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

      // Battery V2: classify provider observations and enqueue durable job (awaited).
      // Snapshot may complete once follow-up job is durably enqueued — handler failures are isolated.
      const batteryFollowUpJobId = await this.batteryObservationProducer.classifyAndEnqueue({
        organizationId: vehicle.organizationId,
        vehicleId,
        receivedAt: fetchedAt,
        normalized: {
          lvBatteryVoltage: normalized.lvBatteryVoltage,
          evSoc: normalized.evSoc,
          tractionBatteryCurrentEnergyKwh: normalized.tractionBatteryCurrentEnergyKwh,
          tractionBatterySohPercent: normalized.tractionBatterySohPercent,
          tractionBatteryPowerKw: normalized.tractionBatteryPowerKw,
          tractionBatteryChargingPowerKw: normalized.tractionBatteryChargingPowerKw,
          tractionBatteryAddedEnergyKwh: normalized.tractionBatteryAddedEnergyKwh,
          tractionBatteryChargeLimitPercent: normalized.tractionBatteryChargeLimitPercent,
          tractionBatteryIsCharging: normalized.tractionBatteryIsCharging,
          tractionBatteryChargingCableConnected:
            normalized.tractionBatteryChargingCableConnected,
          tractionBatteryTemperatureC: normalized.tractionBatteryTemperatureC,
          tractionBatteryGrossCapacityKwh: normalized.tractionBatteryGrossCapacityKwh,
          rangeKm: normalized.rangeKm,
          odometerKm: normalized.odometerKm,
        },
        batteryMap,
        lvBatteryObservedAt,
        correlationId: `snapshot:${vehicleId}:${fetchedAt.toISOString()}`,
      });

      if (batteryFollowUpJobId) {
        this.logger.debug(
          `Battery V2 follow-up enqueued for vehicle ${vehicleId}: ${batteryFollowUpJobId}`,
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
      this.tripMetrics?.dimoSnapshotPollTotal.inc({ result: 'success' });
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
      this.tripMetrics?.dimoSnapshotPollTotal.inc({ result: 'failure' });
      throw err;
    }
  }

  private async tryResolveOpenEpisodeFromSnapshot(input: {
    organizationId: string;
    vehicleId: string;
    hardwareType: string;
    dimoTokenId: number;
    fetchedAt: Date;
    signals: Record<string, unknown>;
    vehicleLatestStateId: string;
    providerBindingId: string | null;
    sourceSubtype: string | null;
  }): Promise<void> {
    if (!this.episodeResolution) return;

    const obd = extractObdPlugSignalFromSnapshot(input.signals);
    if (obd.obdIsPluggedIn == null) return;

    const providerObservedAt = obd.providerObservedAt;
    if (!providerObservedAt) return;

    const snapshotReferenceId = buildSnapshotReferenceId({
      vehicleLatestStateId: input.vehicleLatestStateId,
      providerObservedAt,
    });

    try {
      await this.episodeResolution.tryResolveFromSnapshotPlugSignal({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: 'DIMO',
        hardwareType: input.hardwareType,
        obdIsPluggedIn: obd.obdIsPluggedIn,
        providerObservedAt,
        receivedAt: input.fetchedAt,
        snapshotSource: 'dimo',
        providerBindingId: input.providerBindingId,
        snapshotReferenceId,
        sourceSubtype: input.sourceSubtype,
      });
    } catch (err) {
      this.logger.warn(
        `Episode snapshot resolution skipped for ${input.vehicleId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
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

    const batteryFields = toVlsBatteryFields(mapDimoBatterySignals(signals));

    const locCoords = signals.currentLocationCoordinates as
      | { value?: { latitude?: number; longitude?: number } }
      | null
      | undefined;

    const tirePressures = normalizeDimoSnapshotTirePressures(signals);
    const tpmsWarningField = signals.chassisTireSystemIsWarningOn as
      | { value?: number; timestamp?: number | string }
      | null
      | undefined;
    const tpmsWarningSignalPresent =
      tpmsWarningField != null &&
      typeof tpmsWarningField === 'object' &&
      tpmsWarningField.value != null &&
      typeof tpmsWarningField.value === 'number' &&
      Number.isFinite(tpmsWarningField.value);
    const tpmsWarningValue = tpmsWarningSignalPresent
      ? numVal(tpmsWarningField) != null && numVal(tpmsWarningField)! >= 0.5
      : null;
    const tpmsWarningTimestamp = this.extractSignalTimestamp(tpmsWarningField);

    return {
      lastSeenAt: ts(signals.lastSeen),
      latitude: locCoords?.value?.latitude ?? null,
      longitude: locCoords?.value?.longitude ?? null,
      odometerKm: numVal(signals.powertrainTransmissionTravelledDistance),
      oilLevelRelative: numVal(signals.powertrainCombustionEngineEngineOilRelativeLevel),
      defLevel: numVal(signals.powertrainCombustionEngineDieselExhaustFluidLevel),
      rangeKm: numVal(signals.powertrainTractionBatteryRange),
      tirePressureFl: tirePressures.fl.normalizedValue,
      tirePressureFr: tirePressures.fr.normalizedValue,
      tirePressureRl: tirePressures.rl.normalizedValue,
      tirePressureRr: tirePressures.rr.normalizedValue,
      evSoc: batteryFields.evSoc,
      tractionBatteryCurrentEnergyKwh: batteryFields.tractionBatteryCurrentEnergyKwh,
      tractionBatterySohPercent: batteryFields.tractionBatterySohPercent,
      tractionBatteryPowerKw: batteryFields.tractionBatteryPowerKw,
      tractionBatteryCurrentVoltage: batteryFields.tractionBatteryCurrentVoltage,
      tractionBatteryTemperatureC: batteryFields.tractionBatteryTemperatureC,
      tractionBatteryChargingPowerKw: batteryFields.tractionBatteryChargingPowerKw,
      tractionBatteryAddedEnergyKwh: batteryFields.tractionBatteryAddedEnergyKwh,
      tractionBatteryChargeLimitPercent: batteryFields.tractionBatteryChargeLimitPercent,
      tractionBatteryIsCharging: batteryFields.tractionBatteryIsCharging,
      tractionBatteryChargingCableConnected:
        batteryFields.tractionBatteryChargingCableConnected,
      tractionBatteryGrossCapacityKwh: batteryFields.tractionBatteryGrossCapacityKwh,
      isIgnitionOn: (() => {
        const v = numVal(signals.isIgnitionOn);
        return v != null ? v >= 0.5 : null;
      })(),
      engineLoad: numVal(signals.obdEngineLoad),
      fuelLevelRelative: numVal(signals.powertrainFuelSystemRelativeLevel),
      fuelLevelAbsolute: numVal(signals.powertrainFuelSystemAbsoluteLevel),
      lvBatteryVoltage: batteryFields.lvBatteryVoltage,
      coolantTempC: numVal(signals.powertrainCombustionEngineECT),
      speedKmh: numVal(signals.speed),
      rawPayloadJson: capRawPayload({
        ...(signals as object),
        _synqdrive: {
          tirePressure: {
            fl: toSynqDriveTirePressureMeta(tirePressures.fl),
            fr: toSynqDriveTirePressureMeta(tirePressures.fr),
            rl: toSynqDriveTirePressureMeta(tirePressures.rl),
            rr: toSynqDriveTirePressureMeta(tirePressures.rr),
          },
          tpmsWarning: {
            signalPresent: tpmsWarningSignalPresent,
            value: tpmsWarningValue,
            sourceProvider: 'DIMO',
            sourceTimestamp: tpmsWarningTimestamp?.toISOString() ?? null,
          },
        },
      }) as object,
    };
  }
}
