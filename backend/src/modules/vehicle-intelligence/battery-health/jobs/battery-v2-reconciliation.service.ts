import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  getBatteryRest60mDelayMs,
  getBatteryRest6hDelayMs,
  getBatteryRestTargetDelayMs,
  getBatteryV2ObservationStaleMs,
  getBatteryV2ReconciliationBatchSize,
  getBatteryV2StartProxyDelayMs,
  isBatteryV2RestShadowEnabled,
  isStartWindowCollectionEnabled,
} from '@config/battery-health-v2.config';
import {
  buildAssessmentJobIdempotencyKey,
  buildHvSessionJobIdempotencyKey,
  buildRechargeSegmentFingerprint,
  buildRestTargetJobIdempotencyKey,
  buildStartProxyJobIdempotencyKey,
} from './battery-v2-job-idempotency.policy';
import { BATTERY_V2_JOB_MODEL_VERSION_DEFAULT } from './battery-v2-job.types';
import { BatteryV2JobDeadLetterService } from './battery-v2-job-dead-letter.service';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import { BatteryV2RestTargetProducer } from './battery-v2-rest-target.producer';
import { BatteryV2SnapshotObservationProducer } from './battery-v2-snapshot-observation.producer';
import { BatteryCapabilityRefreshService } from '../capability-preflight/battery-capability-refresh.service';
import {
  isLvRestTargetAlreadyScheduled,
  LV_REST_TARGET_TYPES,
  readLvRestWindowSessionMetadata,
} from '../lv-rest-window/lv-rest-window-target.metadata';
import {
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
} from '@prisma/client';
import { LvRestWindowState } from '../battery-v2-domain';
import { measurementTypeForRestTarget } from '../lv-rest-window/battery-rest-target-evaluation';
import { buildStartProxyMeasurementIdempotencyKey } from '../lv-start-proxy/battery-start-proxy.policy';
import { BatteryV2TripStartProducer } from './battery-v2-trip-start.producer';

const TRIP_LOOKBACK_MS = 7 * 24 * 3600_000;
const ASSESSMENT_STALE_MS = 6 * 3600_000;

export interface BatteryV2ReconciliationResult {
  observationClassify: number;
  restTargets: number;
  tripStarts: number;
  rechargeSegments: number;
  assessments: number;
  capabilityRefresh: number;
  capabilitySignalLoss: number;
}

@Injectable()
export class BatteryV2ReconciliationService {
  private readonly logger = new Logger(BatteryV2ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobProducer: BatteryV2JobProducerService,
    private readonly observationProducer: BatteryV2SnapshotObservationProducer,
    private readonly deadLetters: BatteryV2JobDeadLetterService,
    private readonly capabilityRefresh: BatteryCapabilityRefreshService,
    private readonly restTargetProducer: BatteryV2RestTargetProducer,
    private readonly tripStartProducer: BatteryV2TripStartProducer,
  ) {}

  async reconcileAll(): Promise<BatteryV2ReconciliationResult> {
    const batch = getBatteryV2ReconciliationBatchSize();
    const result: BatteryV2ReconciliationResult = {
      observationClassify: 0,
      restTargets: 0,
      tripStarts: 0,
      rechargeSegments: 0,
      assessments: 0,
      capabilityRefresh: 0,
      capabilitySignalLoss: 0,
    };

    result.observationClassify = await this.reconcileMissingObservations(batch);
    result.restTargets = await this.reconcileRestTargets(batch);
    result.tripStarts = await this.reconcileTripStarts(batch);
    result.rechargeSegments = await this.reconcileRechargeSegments(batch);
    result.assessments = await this.reconcilePendingAssessments(batch);
    result.capabilityRefresh =
      await this.capabilityRefresh.reconcilePeriodicRefresh(batch);
    result.capabilitySignalLoss =
      await this.capabilityRefresh.reconcileSignalLossRefresh(batch);

    const total =
      result.observationClassify +
      result.restTargets +
      result.tripStarts +
      result.rechargeSegments +
      result.assessments +
      result.capabilityRefresh +
      result.capabilitySignalLoss;
    if (total > 0) {
      this.logger.log(`Battery V2 reconciliation enqueued ${total} jobs: ${JSON.stringify(result)}`);
    }

    return result;
  }

  private async reconcileMissingObservations(batch: number): Promise<number> {
    const staleMs = getBatteryV2ObservationStaleMs();
    const lookback = new Date(Date.now() - 24 * 3600_000);
    const staleBefore = new Date(Date.now() - staleMs);

    const rows = await this.prisma.vehicleLatestState.findMany({
      where: {
        providerFetchedAt: { gte: lookback, lte: staleBefore },
        dimoTokenId: { not: null },
        OR: [{ evSoc: { not: null } }, { lvBatteryVoltage: { not: null } }],
      },
      take: batch,
      select: {
        vehicleId: true,
        providerFetchedAt: true,
        sourceTimestamp: true,
        evSoc: true,
        lvBatteryVoltage: true,
        tractionBatteryCurrentEnergyKwh: true,
        tractionBatterySohPercent: true,
        tractionBatteryPowerKw: true,
        tractionBatteryChargingPowerKw: true,
        tractionBatteryAddedEnergyKwh: true,
        tractionBatteryChargeLimitPercent: true,
        tractionBatteryIsCharging: true,
        tractionBatteryChargingCableConnected: true,
        tractionBatteryTemperatureC: true,
        tractionBatteryGrossCapacityKwh: true,
        rangeKm: true,
        odometerKm: true,
        vehicle: { select: { organizationId: true } },
      },
    });

    let enqueued = 0;
    for (const row of rows) {
      const organizationId = row.vehicle.organizationId;
      if (!organizationId || !row.providerFetchedAt) continue;

      const [lastHv, lastLv] = await Promise.all([
        this.prisma.hvBatteryHealthSnapshot.findFirst({
          where: { vehicleId: row.vehicleId },
          orderBy: { recordedAt: 'desc' },
          select: { providerReceivedAt: true, recordedAt: true },
        }),
        this.prisma.batteryHealthSnapshot.findFirst({
          where: { vehicleId: row.vehicleId },
          orderBy: { recordedAt: 'desc' },
          select: { recordedAt: true },
        }),
      ]);

      const lastPersistedAt =
        lastHv?.providerReceivedAt ?? lastHv?.recordedAt ?? lastLv?.recordedAt ?? null;
      if (lastPersistedAt && lastPersistedAt >= row.providerFetchedAt) {
        continue;
      }

      const receivedAt = row.providerFetchedAt;
      const observedAt = row.sourceTimestamp ?? receivedAt;
      const jobId = await this.observationProducer.classifyAndEnqueue({
        organizationId,
        vehicleId: row.vehicleId,
        receivedAt,
        normalized: {
          lvBatteryVoltage: row.lvBatteryVoltage,
          evSoc: row.evSoc,
          tractionBatteryCurrentEnergyKwh: row.tractionBatteryCurrentEnergyKwh,
          tractionBatterySohPercent: row.tractionBatterySohPercent,
          tractionBatteryPowerKw: row.tractionBatteryPowerKw,
          tractionBatteryChargingPowerKw: row.tractionBatteryChargingPowerKw,
          tractionBatteryAddedEnergyKwh: row.tractionBatteryAddedEnergyKwh,
          tractionBatteryChargeLimitPercent: row.tractionBatteryChargeLimitPercent,
          tractionBatteryIsCharging: row.tractionBatteryIsCharging,
          tractionBatteryChargingCableConnected: row.tractionBatteryChargingCableConnected,
          tractionBatteryTemperatureC: row.tractionBatteryTemperatureC,
          tractionBatteryGrossCapacityKwh: row.tractionBatteryGrossCapacityKwh,
          rangeKm: row.rangeKm,
          odometerKm: row.odometerKm,
        },
        batteryMap: this.buildReconciliationBatteryMap(observedAt, row.lvBatteryVoltage),
        lvBatteryObservedAt: observedAt,
        correlationId: `reconcile:obs:${row.vehicleId}:${receivedAt.toISOString()}`,
      });

      if (jobId) enqueued += 1;
    }

    return enqueued;
  }

  private buildReconciliationBatteryMap(
    observedAt: Date,
    lvVoltage: number | null,
  ): Parameters<BatteryV2SnapshotObservationProducer['classifyAndEnqueue']>[0]['batteryMap'] {
    const field = {
      dimoSignalName: 'reconciliation',
      value: lvVoltage ?? 0,
      sourceUnit: 'V' as const,
      targetUnit: 'V',
      status: 'valid' as const,
      observedAt,
    };
    return {
      collectionLastSeenAt: observedAt,
      lvBatteryVoltage: field,
      evSoc: { ...field, value: 0, sourceUnit: 'percent' as const, targetUnit: 'percent' },
      tractionBatteryCurrentEnergyKwh: field,
      tractionBatterySohPercent: field,
      tractionBatteryPowerKw: field,
      tractionBatteryChargingPowerKw: field,
      tractionBatteryAddedEnergyKwh: field,
      tractionBatteryChargeLimitPercent: field,
      tractionBatteryCurrentVoltage: field,
      tractionBatteryTemperatureC: field,
      tractionBatteryGrossCapacityKwh: field,
      tractionBatteryIsCharging: {
        dimoSignalName: 'reconciliation',
        value: false,
        status: 'valid' as const,
        observedAt,
      },
      tractionBatteryChargingCableConnected: {
        dimoSignalName: 'reconciliation',
        value: false,
        status: 'valid' as const,
        observedAt,
      },
    };
  }

  private async reconcileRestTargets(batch: number): Promise<number> {
    const lvSessions = await this.reconcileLvRestWindowTargets(batch);
    const legacy = await this.reconcileLegacyRestTargets(batch);
    return lvSessions + legacy;
  }

  private async reconcileLvRestWindowTargets(batch: number): Promise<number> {
    if (!isBatteryV2RestShadowEnabled()) {
      return 0;
    }

    const now = Date.now();
    const dueBefore60m = new Date(now - getBatteryRest60mDelayMs());
    const dueBefore6h = new Date(now - getBatteryRest6hDelayMs());

    const sessions = await this.prisma.batteryMeasurementSession.findMany({
      where: {
        type: BatteryMeasurementSessionType.LV_REST_WINDOW,
        status: {
          in: [
            BatteryMeasurementSessionStatus.ACTIVE,
            BatteryMeasurementSessionStatus.COMPLETED,
          ],
        },
        startedAt: { lte: dueBefore60m },
      },
      take: batch,
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        startedAt: true,
        idempotencyKey: true,
        metadata: true,
        status: true,
      },
    });

    let enqueued = 0;
    for (const session of sessions) {
      const metadata = readLvRestWindowSessionMetadata(session.metadata);
      const fsmState = metadata.lvRestWindowState;
      if (
        fsmState === LvRestWindowState.INVALIDATED ||
        fsmState === LvRestWindowState.EXPIRED
      ) {
        continue;
      }

      const targetTypes = [
        LV_REST_TARGET_TYPES.REST_60M,
        LV_REST_TARGET_TYPES.REST_6H,
      ] as const;

      for (const targetType of targetTypes) {
        const dueBefore =
          targetType === LV_REST_TARGET_TYPES.REST_6H ? dueBefore6h : dueBefore60m;
        if (session.startedAt.getTime() > dueBefore.getTime()) {
          continue;
        }
        if (isLvRestTargetAlreadyScheduled(session.metadata, targetType)) {
          continue;
        }

        const hasMeasurement = await this.prisma.batteryMeasurement.findFirst({
          where: {
            organizationId: session.organizationId,
            sessionId: session.id,
            type: measurementTypeForRestTarget(targetType),
          },
          select: { id: true },
        });
        if (hasMeasurement) continue;

        const scheduleResult =
          targetType === LV_REST_TARGET_TYPES.REST_60M
            ? await this.restTargetProducer.scheduleRest60m({
                organizationId: session.organizationId,
                vehicleId: session.vehicleId,
                sessionId: session.id,
                restWindowId: session.idempotencyKey,
                restWindowStartedAt: session.startedAt,
                now: new Date(now),
              })
            : await this.restTargetProducer.scheduleRest6h({
                organizationId: session.organizationId,
                vehicleId: session.vehicleId,
                sessionId: session.id,
                restWindowId: session.idempotencyKey,
                restWindowStartedAt: session.startedAt,
                now: new Date(now),
              });
        if (scheduleResult.scheduled || scheduleResult.bullJobId) {
          enqueued += 1;
        }
      }
    }

    return enqueued;
  }

  private async reconcileLegacyRestTargets(batch: number): Promise<number> {
    if (!isBatteryV2RestShadowEnabled()) {
      return 0;
    }

    const now = Date.now();
    const REST_60M_MS = getBatteryRest60mDelayMs();
    const REST_6H_MS = 6 * 60 * 60_000;
    const features = await this.prisma.batteryFeatures.findMany({
      where: { restWindowStartedAt: { not: null } },
      take: batch,
      select: {
        vehicleId: true,
        restWindowStartedAt: true,
        rest60mCapturedAt: true,
        rest6hCapturedAt: true,
        vehicle: { select: { organizationId: true } },
      },
    });

    let enqueued = 0;
    for (const row of features) {
      const organizationId = row.vehicle.organizationId;
      const startedAt = row.restWindowStartedAt;
      if (!organizationId || !startedAt) continue;

      const targets: Array<'REST_60M' | 'REST_6H'> = [];
      if (!row.rest60mCapturedAt && now - startedAt.getTime() >= REST_60M_MS) {
        targets.push('REST_60M');
      }
      if (!row.rest6hCapturedAt && now - startedAt.getTime() >= REST_6H_MS) {
        targets.push('REST_6H');
      }

      for (const restTargetType of targets) {
        const idempotencyKey = buildRestTargetJobIdempotencyKey({
          vehicleId: row.vehicleId,
          restWindowStartedAt: startedAt,
          restTargetType,
        });
        if (await this.deadLetters.isDeadLetter('BATTERY_REST_TARGET_EVALUATE', idempotencyKey)) {
          continue;
        }

        const jobId = await this.jobProducer.enqueue('BATTERY_REST_TARGET_EVALUATE', {
          organizationId,
          vehicleId: row.vehicleId,
          idempotencyKey,
          restWindowStartedAt: startedAt.toISOString(),
          restTargetType,
          correlationId: `reconcile:rest:${row.vehicleId}:${restTargetType}`,
        });
        if (jobId) enqueued += 1;
      }
    }

    return enqueued;
  }

  private async reconcileTripStarts(batch: number): Promise<number> {
    if (!isStartWindowCollectionEnabled()) {
      return 0;
    }

    const proxyReadyBefore = new Date(Date.now() - getBatteryV2StartProxyDelayMs());
    const lookback = new Date(Date.now() - TRIP_LOOKBACK_MS);

    const trips = await this.prisma.vehicleTrip.findMany({
      where: {
        startTime: { gte: lookback, lte: proxyReadyBefore },
        tripStatus: { in: ['ONGOING', 'COMPLETED'] },
      },
      take: batch,
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        vehicle: {
          select: {
            organizationId: true,
          },
        },
      },
    });

    let enqueued = 0;
    for (const trip of trips) {
      const organizationId = trip.vehicle.organizationId;
      if (!organizationId) continue;

      const existingMeasurement = await this.prisma.batteryMeasurement.findFirst({
        where: {
          organizationId,
          vehicleId: trip.vehicleId,
          idempotencyKey: buildStartProxyMeasurementIdempotencyKey(trip.id),
        },
        select: { id: true },
      });
      if (existingMeasurement) continue;

      const idempotencyKey = buildStartProxyJobIdempotencyKey({
        tripId: trip.id,
        modelVersion: BATTERY_V2_JOB_MODEL_VERSION_DEFAULT,
      });
      if (await this.deadLetters.isDeadLetter('BATTERY_START_PROXY_EXTRACT', idempotencyKey)) {
        continue;
      }

      const jobId = await this.tripStartProducer.enqueueStartProxy({
        organizationId,
        vehicleId: trip.vehicleId,
        tripId: trip.id,
        tripStartedAt: trip.startTime,
      });
      if (jobId) enqueued += 1;
    }

    return enqueued;
  }

  private async reconcileRechargeSegments(batch: number): Promise<number> {
    const lookback = new Date(Date.now() - 31 * 24 * 3600_000);
    const events = await this.prisma.vehicleEnergyEvent.findMany({
      where: { kind: 'RECHARGE', startTime: { gte: lookback } },
      take: batch,
      orderBy: { startTime: 'desc' },
      select: {
        dimoSegmentId: true,
        vehicleId: true,
        vehicle: { select: { organizationId: true } },
      },
    });

    let enqueued = 0;
    for (const event of events) {
      const organizationId = event.vehicle.organizationId;
      if (!organizationId) continue;

      const segmentFingerprint = buildRechargeSegmentFingerprint(event.dimoSegmentId);
      const existing = await this.prisma.hvChargeSession.findUnique({
        where: {
          vehicleId_segmentFingerprint: {
            vehicleId: event.vehicleId,
            segmentFingerprint,
          },
        },
        select: { id: true },
      });
      if (existing) continue;

      const idempotencyKey = buildHvSessionJobIdempotencyKey({
        vehicleId: event.vehicleId,
        segmentFingerprint,
      });
      if (await this.deadLetters.isDeadLetter('HV_RECHARGE_SESSION_RECONCILE', idempotencyKey)) {
        continue;
      }

      const jobId = await this.jobProducer.enqueue('HV_RECHARGE_SESSION_RECONCILE', {
        organizationId,
        vehicleId: event.vehicleId,
        idempotencyKey,
        segmentFingerprint,
        sourceEntityId: event.dimoSegmentId,
        correlationId: `reconcile:recharge:${event.dimoSegmentId}`,
      });
      if (jobId) enqueued += 1;
    }

    return enqueued;
  }

  private async reconcilePendingAssessments(batch: number): Promise<number> {
    const staleBefore = new Date(Date.now() - ASSESSMENT_STALE_MS);
    const features = await this.prisma.batteryFeatures.findMany({
      where: {
        updatedAt: { lte: staleBefore },
        OR: [
          { crankObservationCount: { gt: 0 } },
          { restObservationCount: { gt: 0 } },
        ],
      },
      take: batch,
      select: {
        vehicleId: true,
        updatedAt: true,
        vehicle: { select: { organizationId: true } },
      },
    });

    let enqueued = 0;
    for (const row of features) {
      const organizationId = row.vehicle.organizationId;
      if (!organizationId || !row.updatedAt) continue;

      const recentAssessment = await this.prisma.batteryAssessment.findFirst({
        where: {
          vehicleId: row.vehicleId,
          computedAt: { gte: row.updatedAt },
        },
        select: { id: true },
      });
      if (recentAssessment) continue;

      const inputVersion = row.updatedAt.getTime();
      const idempotencyKey = buildAssessmentJobIdempotencyKey({
        vehicleId: row.vehicleId,
        assessmentType: 'LV_HEALTH',
        inputVersion,
      });
      if (await this.deadLetters.isDeadLetter('BATTERY_ASSESSMENT_RECOMPUTE', idempotencyKey)) {
        continue;
      }

      const jobId = await this.jobProducer.enqueue('BATTERY_ASSESSMENT_RECOMPUTE', {
        organizationId,
        vehicleId: row.vehicleId,
        idempotencyKey,
        assessmentType: 'LV_HEALTH',
        inputVersion,
        correlationId: `reconcile:assess:${row.vehicleId}:${inputVersion}`,
      });
      if (jobId) enqueued += 1;
    }

    return enqueued;
  }
}
