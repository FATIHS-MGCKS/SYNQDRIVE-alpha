import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { buildAvailableSignalsQuery } from './queries/available-signals.query';
import { buildLatestSnapshotQuery } from './queries/latest-vehicle-snapshot.query';
import { buildLastSeenLocationQuery } from './queries/last-seen-location.query';
import {
  buildBatteryCapabilityPreflightQuery,
  buildRechargeSegmentsProbeQuery,
} from './queries/battery-capability-preflight.query';
import { DimoProviderGateway } from './provider/dimo-provider-gateway.service';
import { DimoProviderOperation } from './provider/dimo-provider-gateway.types';
import type { DimoProviderRequestContext } from './provider/dimo-provider-gateway.types';
import { buildDimoProviderRequestContext } from './provider/dimo-provider-request-context.util';

export interface BatteryCapabilityPreflightSnapshot {
  availableSignals: string[] | null;
  signalsLatest: Record<string, unknown> | null;
  queryError?: string | null;
}

export interface RechargeSegmentProbeRow {
  start?: { timestamp?: string | null } | null;
  end?: { timestamp?: string | null } | null;
}

export interface RechargeSegmentsProbeSnapshot {
  segments: RechargeSegmentProbeRow[];
  queryError?: string | null;
}

export interface VehicleSummary {
  odometerKm: number | null;
  batteryPercent: number | null;
  fuelPercent: number | null;
  lastSignalAt: Date | null;
  powertrainType: string | null;
  speedKmh: number | null;
}

@Injectable()
export class DimoTelemetryService {
  private readonly logger = new Logger(DimoTelemetryService.name);
  private readonly client: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,
    private readonly providerGateway: DimoProviderGateway,
  ) {
    const telemetryApiUrl =
      this.configService.get<string>('dimo.telemetryApiUrl') ??
      'https://telemetry-api.dimo.zone/query';
    const timeout =
      this.configService.get<number>('dimo.requestTimeoutMs') ?? 10000;

    this.client = axios.create({
      baseURL: telemetryApiUrl,
      timeout,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async fetchLatestVehicleSnapshot(
    vehicleJwt: string,
    tokenId: number,
    requestContext?: DimoProviderRequestContext,
  ): Promise<unknown> {
    const query = buildLatestSnapshotQuery(tokenId);
    const result = await this.queryGraphQL(
      vehicleJwt,
      query,
      undefined,
      buildDimoProviderRequestContext(tokenId, requestContext),
    );
    return result?.data ?? result;
  }

  async fetchAvailableSignals(
    vehicleJwt: string,
    tokenId: number,
    requestContext?: DimoProviderRequestContext,
  ): Promise<string[]> {
    const query = buildAvailableSignalsQuery(tokenId);
    const result = await this.queryGraphQL(
      vehicleJwt,
      query,
      undefined,
      buildDimoProviderRequestContext(tokenId, requestContext),
    );
    const list = result?.data?.availableSignals;
    return Array.isArray(list)
      ? list.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

  async fetchBatteryCapabilityPreflightSnapshot(
    vehicleJwt: string,
    tokenId: number,
    requestContext?: DimoProviderRequestContext,
  ): Promise<BatteryCapabilityPreflightSnapshot> {
    const query = buildBatteryCapabilityPreflightQuery(tokenId);
    const context = buildDimoProviderRequestContext(tokenId, requestContext);
    try {
      const result = await this.queryGraphQL(vehicleJwt, query, undefined, context);
      const available = result?.data?.availableSignals;
      const availableSignals = Array.isArray(available)
        ? available.filter((entry): entry is string => typeof entry === 'string')
        : null;
      const signalsLatest = (result?.data?.signalsLatest ?? null) as
        | Record<string, unknown>
        | null;

      const gqlErrors = result?.errors;
      const queryError =
        Array.isArray(gqlErrors) && gqlErrors.length > 0
          ? gqlErrors
              .map((entry: { message?: string }) => entry?.message ?? 'GraphQL error')
              .join('; ')
          : null;

      return {
        availableSignals,
        signalsLatest,
        queryError,
      };
    } catch (error) {
      return {
        availableSignals: null,
        signalsLatest: null,
        queryError:
          error instanceof Error
            ? error.message
            : 'DIMO battery capability preflight failed',
      };
    }
  }

  async probeRechargeSegments(
    vehicleJwt: string,
    tokenId: number,
    from: Date,
    to: Date,
    requestContext?: DimoProviderRequestContext,
  ): Promise<RechargeSegmentsProbeSnapshot> {
    const query = buildRechargeSegmentsProbeQuery(
      tokenId,
      from.toISOString(),
      to.toISOString(),
    );
    const context = buildDimoProviderRequestContext(tokenId, requestContext);
    try {
      const result = await this.queryGraphQL(vehicleJwt, query, undefined, context);
      const segments = Array.isArray(result?.data?.segments)
        ? (result.data.segments as RechargeSegmentProbeRow[])
        : [];
      const gqlErrors = result?.errors;
      const queryError =
        Array.isArray(gqlErrors) && gqlErrors.length > 0
          ? gqlErrors
              .map((entry: { message?: string }) => entry?.message ?? 'GraphQL error')
              .join('; ')
          : null;
      return { segments, queryError };
    } catch (error) {
      return {
        segments: [],
        queryError:
          error instanceof Error
            ? error.message
            : 'DIMO recharge segments probe failed',
      };
    }
  }

  async fetchLastSeenLocation(
    vehicleJwt: string,
    tokenId: number,
    requestContext?: DimoProviderRequestContext,
  ): Promise<unknown> {
    const query = buildLastSeenLocationQuery(tokenId);
    const result = await this.queryGraphQL(
      vehicleJwt,
      query,
      undefined,
      buildDimoProviderRequestContext(tokenId, requestContext),
    );
    return result?.data ?? result;
  }

  async queryGraphQL(
    vehicleJwt: string,
    query: string,
    variables?: Record<string, any>,
    requestContext?: DimoProviderRequestContext,
  ): Promise<any> {
    const tokenId =
      requestContext?.tokenId ??
      (typeof variables?.tokenId === 'number' ? variables.tokenId : undefined);
    return this.providerGateway.execute({
      operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
      requestContext: buildDimoProviderRequestContext(tokenId, requestContext),
      invoke: () => this.postGraphQL(vehicleJwt, query, variables),
    });
  }

  private async postGraphQL(
    vehicleJwt: string,
    query: string,
    variables?: Record<string, any>,
  ): Promise<any> {
    const body: Record<string, unknown> = { query };
    if (variables) body.variables = variables;
    // Keep this tighter than the BullMQ lockDuration on the snapshot worker
    // (60s) so that a single hung DIMO round-trip can never outlive the
    // worker lock and cause a "job stalled" failure that later blocks the
    // per-vehicle jobId.
    const response = await this.client.post('', body, {
      headers: { Authorization: `Bearer ${vehicleJwt}` },
      timeout: 15000,
    });

    const gqlErrors = response.data?.errors;
    if (Array.isArray(gqlErrors) && gqlErrors.length > 0) {
      const messages = gqlErrors
        .map((e: any) => e?.message ?? JSON.stringify(e))
        .join('; ');
      this.logger.warn(`GraphQL response contains errors: ${messages}`);

      if (!response.data?.data) {
        throw new Error(`DIMO GraphQL error: ${messages}`);
      }
    }

    return response.data;
  }

  /**
   * Fetch a lightweight summary of key vehicle signals for list-view display.
   * Returns odometer (km), battery SoC (%), fuel level (%), last signal
   * timestamp, powertrain type, and current speed.
   */
  async fetchVehicleSummary(
    vehicleJwt: string,
    tokenId: number,
    requestContext?: DimoProviderRequestContext,
  ): Promise<VehicleSummary> {
    const query = `
      query VehicleSummary {
        signalsLatest(tokenId: ${tokenId}) {
          lastSeen
          powertrainTransmissionTravelledDistance { value }
          powertrainTractionBatteryStateOfChargeCurrent { value }
          powertrainFuelSystemRelativeLevel { value }
          powertrainType { value }
          speed { value }
        }
      }
    `.trim();

    const response = await this.providerGateway.execute({
      operation: DimoProviderOperation.TELEMETRY_VEHICLE_SUMMARY,
      requestContext: buildDimoProviderRequestContext(tokenId, requestContext),
      invoke: () =>
        this.client.post(
          '',
          { query },
          { headers: { Authorization: `Bearer ${vehicleJwt}` } },
        ),
    });

    const signals = response.data?.data?.signalsLatest as
      | Record<string, unknown>
      | null
      | undefined;

    if (!signals) {
      return {
        odometerKm: null,
        batteryPercent: null,
        fuelPercent: null,
        lastSignalAt: null,
        powertrainType: null,
        speedKmh: null,
      };
    }

    return {
      odometerKm: this.numVal(signals.powertrainTransmissionTravelledDistance),
      batteryPercent: this.numVal(
        signals.powertrainTractionBatteryStateOfChargeCurrent,
      ),
      fuelPercent: this.numVal(signals.powertrainFuelSystemRelativeLevel),
      lastSignalAt: signals.lastSeen
        ? new Date(signals.lastSeen as string)
        : null,
      powertrainType: this.strVal(signals.powertrainType),
      speedKmh: this.numVal(signals.speed),
    };
  }

  /**
   * Fetch VIN from the VIN Verifiable Credential (attestation).
   * Requires VEHICLE_VIN_CREDENTIAL privilege in the vehicle JWT.
   * Returns null if not available or if the privilege is missing.
   */
  async fetchVehicleVin(
    vehicleJwt: string,
    tokenId: number,
    requestContext?: DimoProviderRequestContext,
  ): Promise<string | null> {
    const query = `
      query VehicleVin {
        vinVCLatest(tokenId: ${tokenId}) {
          vin
        }
      }
    `.trim();

    try {
      const response = await this.providerGateway.execute({
        operation: DimoProviderOperation.TELEMETRY_VEHICLE_VIN,
        requestContext: buildDimoProviderRequestContext(tokenId, requestContext),
        invoke: () =>
          this.client.post(
            '',
            { query },
            { headers: { Authorization: `Bearer ${vehicleJwt}` } },
          ),
      });
      const vin = response.data?.data?.vinVCLatest?.vin as string | undefined;
      return vin ?? null;
    } catch {
      return null;
    }
  }

  private numVal(field: unknown): number | null {
    if (field == null) return null;
    if (typeof field === 'number') return Number.isNaN(field) ? null : field;
    if (typeof field === 'object') {
      const v = (field as Record<string, unknown>).value;
      return v != null && typeof v === 'number' && !Number.isNaN(v) ? v : null;
    }
    return null;
  }

  private strVal(field: unknown): string | null {
    if (field == null) return null;
    if (typeof field === 'string') return field;
    if (typeof field === 'object') {
      const v = (field as Record<string, unknown>).value;
      return typeof v === 'string' ? v : null;
    }
    return null;
  }
}
