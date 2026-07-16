import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  BatteryMeasurementQuality,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { DimoSegmentsService } from '../../../dimo/dimo-segments.service';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { isStartProxyAllowedForPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import { BatteryMeasurementSessionService } from '../battery-measurement-session.service';
import { BatteryMeasurementService } from '../battery-measurement.service';
import { BatteryV2ProviderError } from '../jobs/battery-v2-job.errors';
import {
  evaluateStartProxyCadenceGate,
  START_PROXY_CADENCE_GATE_VERSION,
  type StartProxyCadenceGateResult,
} from './battery-start-proxy-cadence-gate';
import {
  buildStartProxyMeasurementPlan,
  START_PROXY_MEASUREMENT_PLAN_VERSION,
  START_PROXY_TARGET_MESSARTS,
} from './battery-start-proxy-measurements';
import {
  buildLvStartProxyDiagnosticProvenance,
  withLvStartProxyDiagnosticContext,
} from './lv-start-proxy-diagnostic.policy';
import {
  buildStartProxySessionIdempotencyKey,
  computeStartProxyWindow,
  detectConfirmedIceStart,
  type BatteryStartProxyCrankPoint,
} from './battery-start-proxy.policy';
import {
  recordBatteryStartInsufficientCoverage,
  recordBatteryStartProxy,
} from '../observability/battery-v2-prometheus.metrics';

export type BatteryStartProxyExtractResult =
  | { ok: true; measurementIds: string[]; skipped: false }
  | { ok: true; skipped: true; skipReason: string }
  | { ok: false; retryable: boolean; reason: string };

@Injectable()
export class BatteryStartProxyExtractService {
  private readonly logger = new Logger(BatteryStartProxyExtractService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoSegments: DimoSegmentsService,
    private readonly policyProfiles: BatteryPolicyProfileService,
    private readonly sessions: BatteryMeasurementSessionService,
    private readonly measurements: BatteryMeasurementService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async extractAndPersist(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    tripStartedAt: Date;
  }): Promise<BatteryStartProxyExtractResult> {
    const policyWithoutIce = await this.policyProfiles.resolveForVehicle(
      input.vehicleId,
    );
    if (!policyWithoutIce.startProxyAllowed) {
      return {
        ok: true,
        skipped: true,
        skipReason: 'unsupported_profile',
      };
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: input.vehicleId,
        organizationId: input.organizationId,
      },
      select: { dimoVehicle: { select: { tokenId: true } } },
    });
    const dimoTokenId = vehicle?.dimoVehicle?.tokenId;
    if (dimoTokenId == null) {
      return {
        ok: true,
        skipped: true,
        skipReason: 'missing_dimo_token',
      };
    }

    const { from, to } = computeStartProxyWindow(input.tripStartedAt);
    const points = await this.fetchCrankWindowStrict(dimoTokenId, from, to);

    const confirmedIceStart = detectConfirmedIceStart(points, input.tripStartedAt);
    const policy = await this.policyProfiles.resolveForVehicle(input.vehicleId, {
      confirmedIceStart,
    });

    if (!isStartProxyAllowedForPolicy(policy, { confirmedIceStart })) {
      return {
        ok: true,
        skipped: true,
        skipReason: 'phev_ice_start_not_confirmed',
      };
    }

    const gate = evaluateStartProxyCadenceGate({
      points,
      tripStartAt: input.tripStartedAt,
    });

    const measurementIds = await this.persistGateOutcome({
      input,
      from,
      to,
      confirmedIceStart,
      pointCount: points.length,
      gate,
    });

    this.logger.debug(
      `START proxy measurements persisted vehicle=${input.vehicleId} trip=${input.tripId} count=${measurementIds.length} gateQuality=${gate.quality}`,
    );

    if (!gate.ok) {
      this.recordStartProxyMetrics('skipped', gate);
      return {
        ok: true,
        skipped: true,
        skipReason: gate.reasonCode,
      };
    }

    this.recordStartProxyMetrics('persisted', gate);
    return {
      ok: true,
      skipped: false,
      measurementIds,
    };
  }

  private async persistGateOutcome(params: {
    input: {
      organizationId: string;
      vehicleId: string;
      tripId: string;
      tripStartedAt: Date;
    };
    from: Date;
    to: Date;
    confirmedIceStart: boolean;
    pointCount: number;
    gate: StartProxyCadenceGateResult;
  }): Promise<string[]> {
    const { input, from, to, confirmedIceStart, pointCount, gate } = params;

    const plan = buildStartProxyMeasurementPlan({
      tripId: input.tripId,
      tripStartedAt: input.tripStartedAt,
      gate,
    });

    const session = await this.sessions.create({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      type: BatteryMeasurementSessionType.ICE_START_PROXY,
      startedAt: input.tripStartedAt,
      tripId: input.tripId,
      idempotencyKey: buildStartProxySessionIdempotencyKey(input.tripId),
      status: BatteryMeasurementSessionStatus.COMPLETED,
      providerSource: 'DIMO',
      sourceEntityType: 'trip',
      sourceEntityId: input.tripId,
      metadata: {
        targetMessarts: [...START_PROXY_TARGET_MESSARTS],
        confirmedIceStart,
        windowFrom: from.toISOString(),
        windowTo: to.toISOString(),
        pointCount,
        cadenceGateVersion: START_PROXY_CADENCE_GATE_VERSION,
        measurementPlanVersion: START_PROXY_MEASUREMENT_PLAN_VERSION,
        cadenceGate: gate.metrics,
        plannedMessarts: plan.map((item) => item.messart),
      },
    });

    const measurementIds: string[] = [];
    for (const item of plan) {
      const measurement = await this.measurements.create({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        sessionId: session.id,
        type: item.type,
        quality: item.quality,
        observedAt: item.observedAt,
        numericValue: item.numericValue,
        unit: item.unit,
        providerTimestamp: item.providerTimestamp,
        providerSource: 'DIMO',
        signalName: 'lowVoltageBatteryCurrentVoltage',
        idempotencyKey: item.idempotencyKey,
        context: withLvStartProxyDiagnosticContext({
          confirmedIceStart,
          ...item.context,
        }),
        provenance: buildLvStartProxyDiagnosticProvenance({
          selectionMethod: 'historical_provider_timeseries',
          tripId: input.tripId,
          messart: item.messart,
          windowFrom: from.toISOString(),
          windowTo: to.toISOString(),
          pointCount,
          cadenceGateVersion: START_PROXY_CADENCE_GATE_VERSION,
          measurementPlanVersion: START_PROXY_MEASUREMENT_PLAN_VERSION,
          cadenceGate: gate.metrics,
          reasonCode: gate.reasonCode,
          reasonLabel: gate.reasonLabel,
        }),
      });
      measurementIds.push(measurement.id);
    }

    return measurementIds;
  }

  private recordStartProxyMetrics(
    outcome: 'persisted' | 'skipped' | 'failed',
    gate?: StartProxyCadenceGateResult,
  ): void {
    if (!this.metrics) return;
    recordBatteryStartProxy(this.metrics, { outcome });
    if (
      gate &&
      (gate.reasonCode === 'insufficient_cadence' ||
        gate.quality === BatteryMeasurementQuality.INSUFFICIENT_COVERAGE)
    ) {
      recordBatteryStartInsufficientCoverage(this.metrics);
    }
  }

  private async fetchCrankWindowStrict(
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<BatteryStartProxyCrankPoint[]> {
    try {
      const points = await this.dimoSegments.fetchCrankWindow(tokenId, from, to);
      return points.map((point) => ({
        timestamp: point.timestamp,
        voltage: point.voltage,
        rpm: point.rpm,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BatteryV2ProviderError(
        `Start proxy crank window fetch failed: ${message}`,
        { retryable: true, jobType: 'BATTERY_START_PROXY_EXTRACT' },
      );
    }
  }
}
