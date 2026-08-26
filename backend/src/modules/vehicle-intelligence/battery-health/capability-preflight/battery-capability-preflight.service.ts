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
    let usedSnapshotFallback = false;

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

      if (queryError || !signalsLatest) {
        const fallback = await this.fetchCapabilitySnapshotFallback(
          vehicleJwt,
          tokenId,
        );
        if (fallback.signalsLatest) {
          signalsLatest = fallback.signalsLatest;
          availableSignals = fallback.availableSignals ?? availableSignals;
          usedSnapshotFallback = true;
          if (!fallback.queryError) {
            queryError = null;
          } else if (!queryError) {
            queryError = fallback.queryError;
          }
        } else if (!queryError && fallback.queryError) {
          queryError = fallback.queryError;
        }
      }
    } catch (error) {
      queryError =
        error instanceof Error ? error.message : 'DIMO capability preflight failed';
      this.logger.warn(
        `Capability preflight query failed vehicle=${vehicleId}: ${queryError}`,
      );

      try {
        const vehicleJwt = await this.dimoAuth.getVehicleJwt(tokenId);
        const fallback = await this.fetchCapabilitySnapshotFallback(
          vehicleJwt,
          tokenId,
        );
        if (fallback.signalsLatest) {
          signalsLatest = fallback.signalsLatest;
          availableSignals = fallback.availableSignals ?? null;
          usedSnapshotFallback = true;
          if (!fallback.queryError) {
            queryError = null;
          }
        }
      } catch (fallbackError) {
        this.logger.warn(
          `Capability snapshot fallback failed vehicle=${vehicleId}: ${
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          }`,
        );
      }
    }

    const assessedSignals = assessBatteryCapabilityPreflight({
      availableSignals,
      signalsLatest,
      queryError,
      checkedAt,
      metadata: usedSnapshotFallback ? { snapshotFallback: true } : undefined,
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

  private async fetchCapabilitySnapshotFallback(
    vehicleJwt: string,
    tokenId: number,
  ): Promise<{
    availableSignals: string[] | null;
    signalsLatest: Record<string, unknown> | null;
    queryError?: string | null;
  }> {
    try {
      const availableSignals = await this.dimoTelemetry.fetchAvailableSignals(
        vehicleJwt,
        tokenId,
      );
      const raw = await this.dimoTelemetry.fetchLatestVehicleSnapshot(
        vehicleJwt,
        tokenId,
      );
      const record =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : null;
      const signalsLatest = (record?.signalsLatest ?? record) as
        | Record<string, unknown>
        | null;

      return {
        availableSignals,
        signalsLatest:
          signalsLatest && typeof signalsLatest === 'object'
            ? signalsLatest
            : null,
        queryError: null,
      };
    } catch (error) {
      return {
        availableSignals: null,
        signalsLatest: null,
        queryError:
          error instanceof Error
            ? error.message
            : 'DIMO snapshot capability fallback failed',
      };
    }
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
