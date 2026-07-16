/**
 * Vehicle-scoped DIMO Available-Signals Preflight (P29).
 *
 * Calls DIMO `availableSignals` + `dataSummary`, classifies probes empirically,
 * and persists rows via VehicleDrivingCapabilityRepository.
 *
 * NOT a 30-second poller — gated by DIMO_PREFLIGHT_MIN_INTERVAL_MS (7 days).
 */
import { Injectable, Logger } from '@nestjs/common';
import { DrivingCapabilityStatus } from '@prisma/client';
import { DimoAuthService } from '../../dimo/dimo-auth.service';
import { DimoTelemetryService } from '../../dimo/dimo-telemetry.service';
import { buildAvailableSignalsQuery } from '../../dimo/queries/available-signals.query';
import {
  buildDataSummaryQuery,
  parseDataSummaryResponse,
  type DimoDataSummaryPayload,
} from '../../dimo/queries/data-summary.query';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleDrivingCapabilityRepository } from './vehicle-driving-capability.repository';
import {
  DRIVING_CAPABILITY_PROVIDER,
  type UpsertVehicleDrivingCapabilityInput,
} from './vehicle-driving-capability.types';
import {
  catalogForHardware,
  DIMO_CAPABILITY_PREFLIGHT_VERSION,
  DIMO_PREFLIGHT_INTERVAL_FLOOR_MS,
  DIMO_PREFLIGHT_MIN_INTERVAL_MS,
} from './dimo-preflight-classifier.config';
import { buildPreflightProbes, type ClassifiedProbe } from './dimo-preflight-classifier';
import type { CapabilityRefreshTrigger } from './vehicle-driving-capability-lifecycle.types';

export type PreflightRunResult = {
  ran: boolean;
  skippedReason?: string;
  probesWritten: number;
  capabilityVersion: string;
  checkedAt: string;
};

@Injectable()
export class DimoAvailableSignalsPreflightService {
  private readonly logger = new Logger(DimoAvailableSignalsPreflightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: VehicleDrivingCapabilityRepository,
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
  ) {}

  /**
   * Run preflight only when the last DIMO_TELEMETRY probe is older than the min interval.
   */
  async runPreflightIfStale(
    organizationId: string,
    vehicleId: string,
    options?: {
      force?: boolean;
      minIntervalMs?: number;
      refreshTrigger?: CapabilityRefreshTrigger;
    },
  ): Promise<PreflightRunResult> {
    if (!options?.force) {
      const stale = await this.isPreflightStale(
        organizationId,
        vehicleId,
        options?.minIntervalMs ?? DIMO_PREFLIGHT_MIN_INTERVAL_MS,
      );
      if (!stale) {
        return {
          ran: false,
          skippedReason: 'preflight_not_stale',
          probesWritten: 0,
          capabilityVersion: DIMO_CAPABILITY_PREFLIGHT_VERSION,
          checkedAt: new Date().toISOString(),
        };
      }
    }
    return this.runPreflight(organizationId, vehicleId, {
      refreshTrigger: options?.refreshTrigger,
    });
  }

  async isPreflightStale(
    organizationId: string,
    vehicleId: string,
    minIntervalMs: number = DIMO_PREFLIGHT_MIN_INTERVAL_MS,
  ): Promise<boolean> {
    const effectiveMin = Math.max(minIntervalMs, DIMO_PREFLIGHT_INTERVAL_FLOOR_MS);
    const rows = await this.repository.findByVehicle(organizationId, vehicleId);
    const dimoRows = rows.filter(
      (r) =>
        r.providerSource === DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY &&
        r.capabilityVersion === DIMO_CAPABILITY_PREFLIGHT_VERSION,
    );
    if (!dimoRows.length) return true;
    const latest = dimoRows.reduce(
      (max, row) => Math.max(max, row.checkedAt.getTime()),
      0,
    );
    return Date.now() - latest >= effectiveMin;
  }

  async runPreflight(
    organizationId: string,
    vehicleId: string,
    options?: { refreshTrigger?: CapabilityRefreshTrigger },
  ): Promise<PreflightRunResult> {
    const checkedAt = new Date();
    const refreshTrigger = options?.refreshTrigger ?? 'PERIODIC_STALE';
    const existingRows = await this.repository.findByVehicle(organizationId, vehicleId);
    const existingByKey = new Map(existingRows.map((row) => [row.capabilityKey, row]));
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        hardwareType: true,
        fuelType: true,
        dimoVehicle: { select: { tokenId: true } },
      },
    });

    if (!vehicle) {
      return {
        ran: false,
        skippedReason: 'vehicle_not_found',
        probesWritten: 0,
        capabilityVersion: DIMO_CAPABILITY_PREFLIGHT_VERSION,
        checkedAt: checkedAt.toISOString(),
      };
    }

    const tokenId = vehicle.dimoVehicle?.tokenId;
    if (tokenId == null) {
      return {
        ran: false,
        skippedReason: 'no_dimo_token',
        probesWritten: 0,
        capabilityVersion: DIMO_CAPABILITY_PREFLIGHT_VERSION,
        checkedAt: checkedAt.toISOString(),
      };
    }

    let availableSignals: string[] = [];
    let dataSummary: DimoDataSummaryPayload | null = null;
    let providerError: Record<string, unknown> | null = null;

    try {
      const jwt = await this.dimoAuth.getVehicleJwt(tokenId);
      if (!jwt) {
        providerError = { providerError: true, providerErrorCode: 'NO_VEHICLE_JWT' };
      } else {
        const [signalsResult, summaryResult] = await Promise.all([
          this.dimoTelemetry.queryGraphQL(jwt, buildAvailableSignalsQuery(tokenId)),
          this.dimoTelemetry.queryGraphQL(jwt, buildDataSummaryQuery(tokenId)),
        ]);
        availableSignals = Array.isArray(signalsResult?.data?.availableSignals)
          ? (signalsResult.data.availableSignals as string[])
          : [];
        dataSummary = parseDataSummaryResponse(summaryResult?.data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      providerError = {
        providerError: true,
        providerErrorCode: 'DIMO_PREFLIGHT_FAILED',
        providerErrorMessage: message,
      };
      this.logger.warn(
        `DIMO preflight failed org=${organizationId} vehicle=${vehicleId}: ${message}`,
      );
    }

    const catalog = catalogForHardware(vehicle.hardwareType);
    const probes: ClassifiedProbe[] = providerError
      ? this.buildDegradedProbes(catalog, providerError, checkedAt)
      : buildPreflightProbes({
          availableSignals,
          dataSummary,
          catalog,
          fuelType: vehicle.fuelType,
          checkedAt,
        });

    let written = 0;
    for (const probe of probes) {
      const input: UpsertVehicleDrivingCapabilityInput = {
        organizationId,
        vehicleId,
        hardwareProfile: vehicle.hardwareType,
        providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
        signalName: probe.signalName ?? null,
        detectorName: probe.detectorName ?? null,
        capabilityStatus: probe.capabilityStatus,
        checkedAt,
        lastSeenAt: probe.lastSeenAt ?? checkedAt,
        firstSeenAt: probe.lastSeenAt ?? checkedAt,
        effectiveCadenceMs: probe.effectiveCadenceMs ?? null,
        p95CadenceMs: probe.p95CadenceMs ?? null,
        coverage: probe.coverage ?? null,
        nativeEventAvailable: probe.nativeEventAvailable ?? false,
        metadata: {
          ...probe.metadata,
          ...(providerError ?? {}),
          preflightVersion: DIMO_CAPABILITY_PREFLIGHT_VERSION,
          availableSignalCount: availableSignals.length,
          refreshTrigger,
        },
        capabilityVersion: DIMO_CAPABILITY_PREFLIGHT_VERSION,
        refreshTrigger,
        previousRow: existingByKey.get(probe.capabilityKey) ?? null,
      };
      await this.repository.upsertProbe(input);
      written += 1;
    }

    this.logger.log(
      `DIMO preflight org=${organizationId} vehicle=${vehicleId} probes=${written} ` +
        `signals=${availableSignals.length} degraded=${providerError != null}`,
    );

    return {
      ran: true,
      probesWritten: written,
      capabilityVersion: DIMO_CAPABILITY_PREFLIGHT_VERSION,
      checkedAt: checkedAt.toISOString(),
    };
  }

  private buildDegradedProbes(
    catalog: ReturnType<typeof catalogForHardware>,
    providerError: Record<string, unknown>,
    checkedAt: Date,
  ): ClassifiedProbe[] {
    const degraded = (key: string, signalName?: string | null, detectorName?: string | null): ClassifiedProbe => ({
      capabilityKey: key,
      signalName,
      detectorName,
      capabilityStatus: DrivingCapabilityStatus.DEGRADED,
      metadata: {
        source: 'DIMO_PREFLIGHT',
        reason: 'provider_error',
        ...providerError,
      },
      lastSeenAt: checkedAt,
      effectiveCadenceMs: null,
      p95CadenceMs: null,
      coverage: null,
    });

    return [
      ...catalog.map((def) => degraded(def.dimoSignalName, def.dimoSignalName, null)),
      degraded('behavior.harshAcceleration', 'behavior.harshAcceleration', null),
      degraded('behavior.harshBraking', 'behavior.harshBraking', null),
      degraded('behavior.harshCornering', 'behavior.harshCornering', null),
      degraded('safety.collision', 'safety.collision', null),
      degraded('dimo-trip-segments', null, 'dimo-trip-segments'),
    ];
  }
}
