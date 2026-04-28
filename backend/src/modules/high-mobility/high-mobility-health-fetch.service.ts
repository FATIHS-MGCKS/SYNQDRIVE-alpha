import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { HighMobilityHealthAppAuthService } from './high-mobility-health-app-auth.service';
import { HighMobilityAppConfigService } from './high-mobility-app-config.service';
import { extractHmProviderVehicleReference, isUsableHmCommandVehicleReference } from './high-mobility-vehicle-reference.util';
import {
  normalizeHmTirePressures,
  normalizeHmTirePressureStatuses,
} from './high-mobility-mqtt-payload.util';
import type {
  HmHealthDataDto,
  HmHealthSignalDto,
  HmTirePressureDto,
  HmTirePressureStatusesDto,
  HmServiceInfoDto,
  HmSyncType,
  HmSyncStatus,
} from './dto/high-mobility.dto';

/**
 * Phase 1 supported signals (informational / display-grade only).
 * DO NOT inject into existing Tire/Brake/Battery calculation pipelines.
 */
const PHASE1_SIGNALS: string[] = [
  'dashboard_lights.get.dashboard_lights',
  'diagnostics.get.battery_voltage',
  'diagnostics.get.brake_lining_wear_pre_warning',
  'diagnostics.get.engine_coolant_temperature',
  'diagnostics.get.engine_oil_level',
  'engine.get.limp_mode',
  'maintenance.get.distance_to_next_service',
  'maintenance.get.time_to_next_service',
  'seats.get.seatbelts_state',
  'diagnostics.get.tire_pressure_statuses',
  'diagnostics.get.tire_pressures',
];

@Injectable()
export class HighMobilityHealthFetchService {
  private readonly logger = new Logger(HighMobilityHealthFetchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: HighMobilityHealthAppAuthService,
    private readonly hmConfig: HighMobilityAppConfigService,
  ) {}

  private get baseUrl(): string {
    return this.hmConfig.healthApp.apiBaseUrl;
  }
  private get timeout(): number {
    return this.hmConfig.healthApp.requestTimeoutMs;
  }

  /**
   * Fetch Phase 1 HEALTH signals for an approved + linked HM vehicle.
   * Stores raw payload and sync log.
   * IMPORTANT: returned data is display-grade only — do not pass to score/calc pipelines.
   */
  async fetchHealth(hmVehicleId: string, syncType: HmSyncType = 'MANUAL'): Promise<HmHealthDataDto> {
    const hmRecord = await this.prisma.highMobilityVehicle.findUnique({ where: { id: hmVehicleId } });
    if (!hmRecord) throw new NotFoundException(`HM vehicle ${hmVehicleId} not found`);

    if (hmRecord.clearanceStatus !== 'APPROVED') {
      throw new Error(`Cannot fetch health data — HM vehicle not approved (${hmRecord.clearanceStatus})`);
    }

    const requestedAt = new Date();
    let rawPayload: Record<string, unknown> | null = null;
    let syncStatus: HmSyncStatus = 'FAILED';
    let errorMessage: string | null = null;

    if (!this.authService.isConfigured()) {
      this.logger.warn(`HM Health OAuth credentials missing — returning empty HEALTH signals for ${hmRecord.vin}`);
      syncStatus = 'FAILED';
      errorMessage = 'HM OAuth credentials missing (HM_HEALTH_APP_CLIENT_ID / HM_HEALTH_APP_CLIENT_SECRET)';
    } else {
      const headers = await this.authService.authHeaders();
      if (!headers) {
        const authFailure = this.authService.getLastFailureContext();
        const statusPart = authFailure.status ? ` status=${authFailure.status}` : '';
        this.logger.warn(
          `HM Health auth token unavailable for ${hmRecord.vin}${statusPart} — returning empty HEALTH signals`,
        );
        syncStatus = 'FAILED';
        errorMessage =
          authFailure.reason === 'TOKEN_FETCH_FAILED'
            ? `HM OAuth token fetch failed${statusPart}; check network/DNS/OAuth endpoint`
            : 'HM OAuth token unavailable';
      } else {
        try {
          const payloadVehicleRef = extractHmProviderVehicleReference(hmRecord.providerPayloadJson, hmRecord.vin);

          let hmRef: string | null;
          if (isUsableHmCommandVehicleReference(hmRecord.hmVehicleReference, hmRecord.vin)) {
            hmRef = hmRecord.hmVehicleReference!.trim();
          } else if (payloadVehicleRef) {
            hmRef = payloadVehicleRef;
            await this.prisma.highMobilityVehicle.update({
              where: { id: hmRecord.id },
              data: { hmVehicleReference: hmRef },
            });
          } else if (hmRecord.clearanceStatus === 'APPROVED' && hmRecord.vin) {
            // No provider vehicleId in clearance payload — fall back to VIN for brands
            // where HM uses VIN as the command reference (some brands support this).
            hmRef = hmRecord.vin.trim();
          } else {
            hmRef = null;
          }

          if (!hmRef) {
            throw new Error('No HM command vehicle reference available (clearance not approved or VIN missing)');
          }

          // Fetch OEM data via HM REST API
          const res = await axios.post(
            `${this.baseUrl}/v1/vehicles/${hmRef}/command`,
            { command: 'get_vehicle_status', properties: PHASE1_SIGNALS },
            { headers, timeout: this.timeout },
          );

          rawPayload = res.data as Record<string, unknown>;
          syncStatus = 'SUCCESS';
          this.logger.log(`HM health data fetched for ${hmRecord.vin} via REST command`);
        } catch (err: any) {
          const httpStatus = err?.response?.status;

          // 404 from HM command endpoint means this vehicle uses MQTT push only
          // (OEM Fleet Clearance model — e.g. Mercedes-Benz).
          // The REST /v1/vehicles/{ref}/command API does not exist for fleet-cleared vehicles.
          // Data arrives via MQTT streaming when the car is driven.
          if (httpStatus === 404) {
            syncStatus = 'MQTT_ONLY';
            errorMessage =
              'HM Fleet Clearance vehicle — REST command API not supported. ' +
              'Health data is delivered via MQTT push when the vehicle sends telemetry (car must be in use).';
            // Persist the push-only nature so the scheduler suppresses
            // further REST polling for this vehicle. We mark streamingState
            // as CONFIGURED (channel is live and we are the subscriber)
            // instead of waiting for the first MQTT message, which may never
            // arrive while the car is parked.
            if (hmRecord.streamingState === 'NOT_CONFIGURED') {
              try {
                await this.prisma.highMobilityVehicle.update({
                  where: { id: hmRecord.id },
                  data: { streamingState: 'CONFIGURED' },
                });
                this.logger.log(
                  `[HM Health] ${hmRecord.vin} — marked streamingState=CONFIGURED (fleet-clearance MQTT_ONLY). REST polling suppressed.`,
                );
              } catch (flipErr: any) {
                this.logger.warn(
                  `[HM Health] ${hmRecord.vin} — failed to flip streamingState: ${flipErr?.message}`,
                );
              }
            }
            this.logger.log(
              `[HM Health] ${hmRecord.vin} — MQTT_ONLY: REST command returned 404 (fleet clearance vehicles use MQTT push). ` +
              `Data will arrive when Mercedes-Benz pushes telemetry.`,
            );
          } else {
            errorMessage = err?.message;
            syncStatus = 'FAILED';
            this.logger.error(`HM health fetch failed for ${hmRecord.vin} [${httpStatus ?? 'network'}]: ${err?.message}`);
          }
        }
      }
    }

    // Persist sync log
    const completedAt = new Date();
    try {
      await this.prisma.highMobilityHealthSyncLog.create({
        data: {
          highMobilityVehicleId: hmVehicleId,
          syncType: syncType as any,
          syncStatus: syncStatus as any,
          requestedAt,
          completedAt,
          errorMessage,
          payloadJson: rawPayload ? (rawPayload as Prisma.InputJsonValue) : undefined,
        },
      });
    } catch (logErr: any) {
      this.logger.warn(`Failed to write HM sync log: ${logErr?.message}`);
    }

    // Normalize signals
    const signals = this.normalizeSignals(rawPayload);
    const tirePressures = this.extractTirePressures(signals);
    const tirePressureStatuses = this.extractTirePressureStatuses(signals);
    const serviceInfo = this.extractServiceInfo(signals);

    return {
      hmVehicleId,
      vin: hmRecord.vin,
      fetchedAt: completedAt.toISOString(),
      syncStatus,
      errorMessage,
      signals,
      tirePressures,
      tirePressureStatuses,
      serviceInfo,
    };
  }

  /** Get last sync log for display in admin UI */
  async getLastSyncLog(hmVehicleId: string) {
    return this.prisma.highMobilityHealthSyncLog.findFirst({
      where: { highMobilityVehicleId: hmVehicleId },
      orderBy: { requestedAt: 'desc' },
    });
  }

  // ── Signal normalizers ─────────────────────────────────────────────────────

  private normalizeSignals(raw: Record<string, unknown> | null): HmHealthSignalDto[] {
    if (!raw) return [];

    // HM response typically: { properties: { [signalId]: { value, timestamp, unit? } } }
    const properties = (raw?.properties ?? raw?.data ?? raw) as Record<string, unknown>;
    if (!properties || typeof properties !== 'object') return [];

    return PHASE1_SIGNALS.map(signalId => {
      const entry = properties[signalId] as Record<string, unknown> | null;
      return {
        signalId,
        rawKey: signalId,
        value: entry?.value ?? null,
        unit: (entry?.unit as string) ?? null,
        timestamp: (entry?.timestamp as string) ?? null,
      };
    }).filter(s => s.value !== null && s.value !== undefined);
  }

  private extractTirePressures(signals: HmHealthSignalDto[]): HmTirePressureDto | null {
    const sig = signals.find(s => s.signalId === 'diagnostics.get.tire_pressures');
    if (!sig || sig.value == null) return null;

    const norm = normalizeHmTirePressures(sig.value);
    if (!norm) return null;
    return {
      frontLeft: norm.frontLeft,
      frontRight: norm.frontRight,
      rearLeft: norm.rearLeft,
      rearRight: norm.rearRight,
      unit: norm.unit,
    };
  }

  private extractTirePressureStatuses(signals: HmHealthSignalDto[]): HmTirePressureStatusesDto | null {
    const sig = signals.find(s => s.signalId === 'diagnostics.get.tire_pressure_statuses');
    if (!sig || sig.value == null) return null;

    const norm = normalizeHmTirePressureStatuses(sig.value);
    if (!norm) return null;
    return {
      frontLeft: norm.frontLeft,
      frontRight: norm.frontRight,
      rearLeft: norm.rearLeft,
      rearRight: norm.rearRight,
    };
  }

  private extractServiceInfo(signals: HmHealthSignalDto[]): HmServiceInfoDto | null {
    const distSig = signals.find(s => s.signalId === 'maintenance.get.distance_to_next_service');
    const timeSig = signals.find(s => s.signalId === 'maintenance.get.time_to_next_service');

    const distKm = distSig?.value != null ? Number(distSig.value) : null;
    const timeDays = timeSig?.value != null ? Number(timeSig.value) : null;

    if (distKm === null && timeDays === null) return null;
    return {
      distanceToNextServiceKm: Number.isFinite(distKm) ? distKm : null,
      timeToNextServiceDays: Number.isFinite(timeDays) ? timeDays : null,
    };
  }
}
