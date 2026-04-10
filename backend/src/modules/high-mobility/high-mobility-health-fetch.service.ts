import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { HighMobilityAuthService } from './high-mobility-auth.service';
import type {
  HmHealthDataDto,
  HmHealthSignalDto,
  HmTirePressureDto,
  HmTirePressureStatusesDto,
  HmServiceInfoDto,
  HmSyncType,
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
    private readonly authService: HighMobilityAuthService,
    private readonly configService: ConfigService,
  ) {}

  private get baseUrl(): string {
    return (this.configService.get('highMobility') as any).apiBaseUrl;
  }
  private get timeout(): number {
    return (this.configService.get('highMobility') as any).requestTimeoutMs ?? 15000;
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
    let syncStatus: 'SUCCESS' | 'FAILED' | 'PARTIAL' = 'FAILED';
    let errorMessage: string | null = null;

    const headers = await this.authService.authHeaders();
    if (!headers || !this.authService.isConfigured()) {
      this.logger.warn(`HM not configured — returning empty HEALTH signals for ${hmRecord.vin}`);
      syncStatus = 'FAILED';
      errorMessage = 'HM credentials not configured';
    } else {
      try {
        const hmRef = hmRecord.hmVehicleReference;
        if (!hmRef) throw new Error('No HM vehicle reference available');

        // Fetch OEM data via HM REST API
        const res = await axios.post(
          `${this.baseUrl}/v1/vehicles/${hmRef}/command`,
          {
            command: 'get_vehicle_status',
            properties: PHASE1_SIGNALS,
          },
          { headers, timeout: this.timeout },
        );

        rawPayload = res.data as Record<string, unknown>;
        syncStatus = 'SUCCESS';
        this.logger.log(`HM health data fetched for ${hmRecord.vin}`);
      } catch (err: any) {
        errorMessage = err?.message;
        syncStatus = 'FAILED';
        this.logger.error(`HM health fetch failed for ${hmRecord.vin}: ${err?.message}`);
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

    const v = sig.value as any;
    return {
      frontLeft: v?.front_left?.value ?? v?.frontLeft ?? null,
      frontRight: v?.front_right?.value ?? v?.frontRight ?? null,
      rearLeft: v?.rear_left?.value ?? v?.rearLeft ?? null,
      rearRight: v?.rear_right?.value ?? v?.rearRight ?? null,
      unit: sig.unit ?? 'bar',
    };
  }

  private extractTirePressureStatuses(signals: HmHealthSignalDto[]): HmTirePressureStatusesDto | null {
    const sig = signals.find(s => s.signalId === 'diagnostics.get.tire_pressure_statuses');
    if (!sig || sig.value == null) return null;

    const v = sig.value as any;
    return {
      frontLeft: v?.front_left ?? v?.frontLeft ?? null,
      frontRight: v?.front_right ?? v?.frontRight ?? null,
      rearLeft: v?.rear_left ?? v?.rearLeft ?? null,
      rearRight: v?.rear_right ?? v?.rearRight ?? null,
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
