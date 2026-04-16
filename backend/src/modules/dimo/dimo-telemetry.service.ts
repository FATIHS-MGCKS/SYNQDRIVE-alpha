import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { buildLatestSnapshotQuery } from './queries/latest-vehicle-snapshot.query';
import { buildLastSeenLocationQuery } from './queries/last-seen-location.query';

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

  constructor(private readonly configService: ConfigService) {
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
  ): Promise<unknown> {
    const query = buildLatestSnapshotQuery(tokenId);
    const response = await this.client.post(
      '',
      { query },
      { headers: { Authorization: `Bearer ${vehicleJwt}` } },
    );
    return response.data?.data ?? response.data;
  }

  async fetchLastSeenLocation(
    vehicleJwt: string,
    tokenId: number,
  ): Promise<unknown> {
    const query = buildLastSeenLocationQuery(tokenId);
    const response = await this.client.post(
      '',
      { query },
      { headers: { Authorization: `Bearer ${vehicleJwt}` } },
    );
    return response.data?.data ?? response.data;
  }

  async queryGraphQL(
    vehicleJwt: string,
    query: string,
    variables?: Record<string, any>,
  ): Promise<any> {
    const body: Record<string, unknown> = { query };
    if (variables) body.variables = variables;
    const response = await this.client.post('', body, {
      headers: { Authorization: `Bearer ${vehicleJwt}` },
      timeout: 30000,
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

    const response = await this.client.post(
      '',
      { query },
      { headers: { Authorization: `Bearer ${vehicleJwt}` } },
    );

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
  ): Promise<string | null> {
    const query = `
      query VehicleVin {
        vinVCLatest(tokenId: ${tokenId}) {
          vin
        }
      }
    `.trim();

    try {
      const response = await this.client.post(
        '',
        { query },
        { headers: { Authorization: `Bearer ${vehicleJwt}` } },
      );
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
