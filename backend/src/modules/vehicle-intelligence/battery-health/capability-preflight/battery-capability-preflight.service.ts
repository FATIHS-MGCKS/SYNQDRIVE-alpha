import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import {
  assessBatteryCapabilityPreflight,
  assessRechargeSegmentsCapability,
} from './battery-capability-preflight.assess';
import { BatteryCapabilityPreflightRepository } from './battery-capability-preflight.repository';
import type { BatteryCapabilityPreflightResult } from './battery-capability-preflight.types';
import type { BatteryCapabilityRefreshTrigger } from './battery-capability-lifecycle.policy';
import { recordBatteryCapabilitySignal } from '../observability/battery-v2-prometheus.metrics';

const RECHARGE_PROBE_LOOKBACK_DAYS = 31;

export interface RunBatteryCapabilityPreflightOptions {
  refreshTrigger?: BatteryCapabilityRefreshTrigger | null;
  correlationId?: string | null;
}

@Injectable()
export class BatteryCapabilityPreflightService {
  private readonly logger = new Logger(BatteryCapabilityPreflightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
    private readonly repository: BatteryCapabilityPreflightRepository,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async runForVehicle(
    organizationId: string,
    vehicleId: string,
    options?: RunBatteryCapabilityPreflightOptions,
  ): Promise<BatteryCapabilityPreflightResult | null> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        organizationId: true,
        dimoVehicle: { select: { tokenId: true } },
      },
    });

    if (!vehicle?.dimoVehicle?.tokenId) {
      this.logger.debug(
        `Skipping capability preflight: no DIMO token for vehicle=${vehicleId}`,
      );
      return null;
    }

    const tokenId = vehicle.dimoVehicle.tokenId;
    const checkedAt = new Date();
    let queryError: string | null = null;
    let availableSignals: string[] | null = null;
    let signalsLatest: Record<string, unknown> | null = null;

    try {
      const vehicleJwt = await this.dimoAuth.getVehicleJwt(tokenId);
      const snapshot =
        await this.dimoTelemetry.fetchBatteryCapabilityPreflightSnapshot(
          vehicleJwt,
          tokenId,
        );
      availableSignals = snapshot.availableSignals;
      signalsLatest = snapshot.signalsLatest;
      if (snapshot.queryError) {
        queryError = snapshot.queryError;
      }
    } catch (error) {
      queryError =
        error instanceof Error ? error.message : 'DIMO capability preflight failed';
      this.logger.warn(
        `Capability preflight query failed vehicle=${vehicleId}: ${queryError}`,
      );
    }

    const assessedSignals = assessBatteryCapabilityPreflight({
      availableSignals,
      signalsLatest,
      queryError,
      checkedAt,
    });

    const rechargeProbe = await this.probeRechargeSegments(tokenId, checkedAt);
    assessedSignals.push(assessRechargeSegmentsCapability(rechargeProbe, checkedAt));

    await this.repository.upsertMany(
      organizationId,
      vehicleId,
      checkedAt,
      assessedSignals,
      {
        refreshTrigger: options?.refreshTrigger,
        correlationId: options?.correlationId,
      },
    );

    if (this.metrics) {
      for (const signal of assessedSignals) {
        recordBatteryCapabilitySignal(this.metrics, {
          signal: signal.signalKey,
          status: signal.preflightStatus,
        });
      }
    }

    return {
      organizationId,
      vehicleId,
      provider: 'DIMO',
      checkedAt,
      signals: assessedSignals,
      queryError,
    };
  }

  private async probeRechargeSegments(
    tokenId: number,
    checkedAt: Date,
  ): Promise<{
    segmentCount: number;
    queryError?: string;
    firstSeenAt?: Date | null;
    lastSeenAt?: Date | null;
  }> {
    const to = checkedAt;
    const from = new Date(
      to.getTime() - RECHARGE_PROBE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );

    try {
      const vehicleJwt = await this.dimoAuth.getVehicleJwt(tokenId);
      const probe = await this.dimoTelemetry.probeRechargeSegments(
        vehicleJwt,
        tokenId,
        from,
        to,
      );

      const timestamps = probe.segments
        .flatMap((segment) => [segment.start?.timestamp, segment.end?.timestamp])
        .filter((value): value is string => typeof value === 'string')
        .map((value) => new Date(value))
        .filter((date) => !Number.isNaN(date.getTime()));

      return {
        segmentCount: probe.segments.length,
        firstSeenAt:
          timestamps.length > 0
            ? new Date(Math.min(...timestamps.map((date) => date.getTime())))
            : null,
        lastSeenAt:
          timestamps.length > 0
            ? new Date(Math.max(...timestamps.map((date) => date.getTime())))
            : null,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Recharge segments probe failed';
      return { segmentCount: 0, queryError: message };
    }
  }
}
