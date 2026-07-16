import { Injectable, Logger } from '@nestjs/common';
import {
  BatteryMeasurementQuality,
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSegmentsService } from '../../../dimo/dimo-segments.service';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { isStartProxyAllowedForPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import { BatteryMeasurementSessionService } from '../battery-measurement-session.service';
import { BatteryMeasurementService } from '../battery-measurement.service';
import { START_DIP_PROXY_MEASUREMENT_KIND } from '../battery-crank-policy';
import { BatteryV2ProviderError } from '../jobs/battery-v2-job.errors';
import {
  buildStartProxyMeasurementIdempotencyKey,
  buildStartProxySessionIdempotencyKey,
  computeStartProxyWindow,
  detectConfirmedIceStart,
  extractStartDipProxyValues,
  sanitizeStartProxyVoltages,
  type BatteryStartProxyCrankPoint,
} from './battery-start-proxy.policy';

export type BatteryStartProxyExtractResult =
  | { ok: true; measurementId: string; skipped: false }
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

    if (points.length === 0) {
      await this.persistMissed(input, 'no_provider_points_in_window');
      return {
        ok: true,
        skipped: true,
        skipReason: 'no_provider_points_in_window',
      };
    }

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

    const extracted = sanitizeStartProxyVoltages(
      extractStartDipProxyValues(points, input.tripStartedAt),
    );

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
        targetMessarts: [START_DIP_PROXY_MEASUREMENT_KIND],
        confirmedIceStart,
        windowFrom: from.toISOString(),
        windowTo: to.toISOString(),
        pointCount: points.length,
      },
    });

    const primaryValue = extracted.vMinCrank ?? extracted.vPreCrank;
    const measurement = await this.measurements.create({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      sessionId: session.id,
      type: BatteryMeasurementType.START_DIP_PROXY,
      quality: BatteryMeasurementQuality.SHADOW,
      observedAt: input.tripStartedAt,
      numericValue: primaryValue,
      unit: primaryValue != null ? 'V' : null,
      providerSource: 'DIMO',
      signalName: 'lowVoltageBatteryCurrentVoltage',
      idempotencyKey: buildStartProxyMeasurementIdempotencyKey(input.tripId),
      context: {
        confirmedIceStart,
        tripId: input.tripId,
        vPreCrank: extracted.vPreCrank,
        vMinCrank: extracted.vMinCrank,
        vRecovery5s: extracted.vRecovery5s,
        vRecovery30s: extracted.vRecovery30s,
        diagnosticOnly: true,
      },
      provenance: {
        selectionMethod: 'historical_provider_timeseries',
        tripId: input.tripId,
        windowFrom: from.toISOString(),
        windowTo: to.toISOString(),
        pointCount: points.length,
        evidenceEligible: false,
        publicationEligible: false,
        scoreEffect: false,
      },
    });

    this.logger.debug(
      `START_DIP_PROXY persisted vehicle=${input.vehicleId} trip=${input.tripId} measurement=${measurement.id}`,
    );

    return {
      ok: true,
      skipped: false,
      measurementId: measurement.id,
    };
  }

  private async persistMissed(
    input: {
      organizationId: string;
      vehicleId: string;
      tripId: string;
      tripStartedAt: Date;
    },
    reasonCode: string,
  ): Promise<void> {
    const session = await this.sessions.create({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      type: BatteryMeasurementSessionType.ICE_START_PROXY,
      startedAt: input.tripStartedAt,
      tripId: input.tripId,
      idempotencyKey: buildStartProxySessionIdempotencyKey(input.tripId),
      status: BatteryMeasurementSessionStatus.MISSED,
      providerSource: 'DIMO',
      sourceEntityType: 'trip',
      sourceEntityId: input.tripId,
      metadata: { skipReason: reasonCode },
    });

    await this.measurements.create({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      sessionId: session.id,
      type: BatteryMeasurementType.START_DIP_PROXY,
      quality: BatteryMeasurementQuality.MISSED,
      observedAt: input.tripStartedAt,
      idempotencyKey: buildStartProxyMeasurementIdempotencyKey(input.tripId),
      context: { tripId: input.tripId, reasonCode },
      provenance: {
        selectionMethod: 'historical_provider_timeseries',
        reasonCode,
        evidenceEligible: false,
        publicationEligible: false,
        scoreEffect: false,
      },
    });
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
