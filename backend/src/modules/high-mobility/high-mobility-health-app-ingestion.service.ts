import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { HmNormalizedTelemetryDto, HmStreamSyncLogDto } from './dto/high-mobility.dto';
import {
  extractHmSignalData,
  extractHmSignalValue,
  resolveHmSignalEntry,
  normalizeHmTirePressures,
  normalizeHmTirePressureStatuses,
} from './high-mobility-mqtt-payload.util';
import { HmSignalUsageService } from './high-mobility-signal-usage.service';
import { capRawPayload } from '@shared/utils/json-payload.util';
import { TelemetryIngestionEnforcementService } from '@modules/data-authorizations/telemetry-ingestion-enforcement/telemetry-ingestion-enforcement.service';
import {
  TELEMETRY_INGEST_DATA_CATEGORY,
  TELEMETRY_INGEST_PATH,
  TELEMETRY_INGEST_PURPOSE,
  TELEMETRY_INGEST_SERVICE_IDENTITY,
  TELEMETRY_INGEST_SOURCE_SYSTEM,
} from '@modules/data-authorizations/telemetry-ingestion-enforcement/telemetry-ingestion-enforcement.constants';

/**
 * HighMobilityHealthAppIngestionService
 *
 * Ingests raw MQTT messages from the HM Health-APP consumer.
 * Scope: HEALTH package vehicles with appContainerType = HM_HEALTH_APP.
 *
 * DOMAIN RULE: Store and stage only. Does not push into calculation pipelines.
 * Downstream signal usage is handled by HmSignalUsageService (health boundary).
 */
@Injectable()
export class HighMobilityHealthAppIngestionService {
  private readonly logger = new Logger(HighMobilityHealthAppIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hmSignalUsageService: HmSignalUsageService,
    @Optional() private readonly ingestGate?: TelemetryIngestionEnforcementService,
  ) {}

  async ingest(rawMessage: {
    messageId: string;
    topic: string;
    payload: Buffer | string;
    receivedAt: Date;
  }): Promise<HmNormalizedTelemetryDto | null> {
    const { messageId, topic, payload, receivedAt } = rawMessage;

    const existing = await this.prisma.highMobilityStreamSyncLog
      .findUnique({ where: { messageId } })
      .catch(() => null);

    if (existing) {
      this.logger.debug(`[HM Health-APP] Duplicate message_id ${messageId} — skipping`);
      return null;
    }

    let parsedPayload: Record<string, unknown> | null = null;
    try {
      const raw = typeof payload === 'string' ? payload : payload.toString('utf-8');
      parsedPayload = JSON.parse(raw);
    } catch (err: any) {
      this.logger.warn(`[HM Health-APP] Failed to parse payload for ${messageId}: ${err?.message}`);
      await this.persistLog({ messageId, topic, messageTimestamp: null, ingestStatus: 'FAILED',
        isDuplicate: false, payloadJson: null, normalizedSummaryJson: null,
        errorMessage: `Parse failed: ${err?.message}`, hmVehicleId: null, vin: null });
      return null;
    }

    const vin = this.extractVin(topic, parsedPayload);
    const messageTimestamp = this.extractTimestamp(parsedPayload) ?? receivedAt;

    const hmRecord = vin
      ? await this.prisma.highMobilityVehicle.findFirst({
          where: {
            vin, isActive: true, clearanceStatus: 'APPROVED',
            packageType: 'HEALTH',
            OR: [{ appContainerType: 'HM_HEALTH_APP' }, { appContainerType: null }],
          },
        }).catch(() => null)
      : null;

    const normalized = this.normalizePayload(messageId, vin, hmRecord?.id ?? null, topic, messageTimestamp, parsedPayload ?? {});

    if (hmRecord?.organizationId && hmRecord.synqdriveVehicleId && this.ingestGate) {
      const gate = await this.ingestGate.evaluateIngest({
        organizationId: hmRecord.organizationId,
        vehicleId: hmRecord.synqdriveVehicleId,
        sourceSystem: TELEMETRY_INGEST_SOURCE_SYSTEM.HIGH_MOBILITY,
        dataCategory: TELEMETRY_INGEST_DATA_CATEGORY.HEALTH_SIGNALS,
        purpose: TELEMETRY_INGEST_PURPOSE.VEHICLE_HEALTH,
        ingestionPath: TELEMETRY_INGEST_PATH.HM_HEALTH_MQTT,
        serviceIdentity: TELEMETRY_INGEST_SERVICE_IDENTITY.HM_HEALTH_INGEST,
        correlationId: `ingest:hm-health:${messageId}`,
        effectiveTimestamp: messageTimestamp,
      });
      if (!gate.mayPersist) {
        await this.persistLog({
          messageId, topic, messageTimestamp, ingestStatus: 'FAILED', isDuplicate: false,
          payloadJson: parsedPayload, normalizedSummaryJson: null,
          errorMessage: `INGEST_DENIED:${gate.reasonCode}`, hmVehicleId: hmRecord.id, vin,
        });
        return null;
      }
    }

    await this.persistLog({
      messageId, topic, messageTimestamp, ingestStatus: 'STORED', isDuplicate: false,
      payloadJson: parsedPayload, normalizedSummaryJson: this.buildSummary(normalized),
      errorMessage: null, hmVehicleId: hmRecord?.id ?? null, vin,
    });

    if (vin) {
      await this.upsertLatestHealthState(vin, hmRecord?.id ?? null, messageId, receivedAt, parsedPayload ?? {}).catch(err =>
        this.logger.warn(`[HM Health-APP] Failed to upsert latest health state for VIN ${vin}: ${err?.message}`),
      );

      // Flip streamingState to CONNECTED on the HM vehicle record the first time
      // a valid MQTT payload arrives. Prevents the UI showing "NOT_CONFIGURED"
      // indefinitely even though messages have been flowing for days.
      if (hmRecord && hmRecord.streamingState !== 'CONNECTED') {
        await this.prisma.highMobilityVehicle.update({
          where: { id: hmRecord.id },
          data: { streamingState: 'CONNECTED', updatedAt: new Date() },
        }).catch(err =>
          this.logger.debug(`[HM Health-APP] Failed to flip streamingState for ${vin}: ${err?.message}`),
        );
      }

      if (hmRecord?.synqdriveVehicleId) {
        await this.hmSignalUsageService
          .ingestMqttHealthSnapshot({
            vehicleId: hmRecord.synqdriveVehicleId,
            hmVehicleId: hmRecord.id,
            payload: parsedPayload ?? {},
            receivedAt,
          })
          .catch(err =>
            this.logger.warn(
              `[HM Health-APP] Failed to bridge MQTT snapshot into HM signal groups for VIN ${vin}: ${err?.message}`,
            ),
          );
      }
    }

    return normalized;
  }

  async getStreamLogs(params?: { limit?: number; offset?: number; hmVehicleId?: string; vin?: string; ingestStatus?: string }): Promise<{ data: HmStreamSyncLogDto[]; total: number }> {
    const where: any = { appContainerType: 'HM_HEALTH_APP' };
    if (params?.hmVehicleId) where.highMobilityVehicleId = params.hmVehicleId;
    if (params?.vin) where.vin = params.vin;
    if (params?.ingestStatus) where.ingestStatus = params.ingestStatus;

    const [logs, total] = await Promise.all([
      this.prisma.highMobilityStreamSyncLog.findMany({
        where, orderBy: { createdAt: 'desc' }, take: params?.limit ?? 50, skip: params?.offset ?? 0,
        select: { id: true, highMobilityVehicleId: true, vin: true, messageId: true, topic: true,
          messageTimestamp: true, ingestStatus: true, isDuplicate: true, normalizedSummaryJson: true,
          errorMessage: true, createdAt: true },
      }),
      this.prisma.highMobilityStreamSyncLog.count({ where }),
    ]);

    return { data: logs.map(l => ({
      id: l.id, highMobilityVehicleId: l.highMobilityVehicleId ?? null, vin: l.vin ?? null,
      messageId: l.messageId, topic: l.topic, messageTimestamp: l.messageTimestamp?.toISOString() ?? null,
      ingestStatus: l.ingestStatus as any, isDuplicate: l.isDuplicate,
      normalizedSummaryJson: l.normalizedSummaryJson as any ?? null,
      errorMessage: l.errorMessage ?? null, createdAt: l.createdAt.toISOString(),
    })), total };
  }

  private static readonly UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  private extractVin(topic: string, payload: Record<string, unknown> | null): string | null {
    // Topic structure for vehicle messages: live/level13/<app_id>/<vin>/...
    // App-level management messages have only 3 segments: live/level13/<app_id>
    // We skip the 3rd segment if it is a UUID (= app ID), since VINs are 17 alphanumeric chars with no hyphens.
    const parts = topic.split('/');
    if (parts.length >= 4) {
      const candidate = parts[3];
      if (candidate && candidate.length >= 10 && !HighMobilityHealthAppIngestionService.UUID_PATTERN.test(candidate)) {
        return candidate.toUpperCase();
      }
    }
    // Fall back to payload fields
    return (payload?.vin as string)?.toUpperCase() ?? (payload?.vehicleVin as string)?.toUpperCase() ?? null;
  }

  private extractTimestamp(payload: Record<string, unknown> | null): Date | null {
    if (!payload) return null;
    const ts = payload?.timestamp ?? payload?.messageTimestamp ?? payload?.created_at;
    if (!ts) return null;
    const d = new Date(ts as string);
    return isNaN(d.getTime()) ? null : d;
  }

  private normalizePayload(messageId: string, vin: string | null, hmVehicleId: string | null,
    topic: string, messageTimestamp: Date, payload: Record<string, unknown>): HmNormalizedTelemetryDto {
    // Mercedes Health-APP MQTT V2 payloads use the fully-qualified capability
    // IDs under `data` (e.g. `diagnostics.get.odometer`,
    // `vehicle_location.get.coordinates`). The previous key list was the
    // legacy REST style and silently returned null for every field.
    const props = (payload?.data ?? payload?.properties ?? {}) as Record<string, any>;
    const getVal = (keys: string[]): any => {
      for (const k of keys) {
        const entry = resolveHmSignalEntry(payload, k);
        const v = extractHmSignalValue(entry);
        if (v !== undefined && v !== null) return v;
      }
      return null;
    };
    const getNum = (keys: string[]): number | null => {
      const v = getVal(keys);
      if (v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const locationVal = getVal([
      'vehicle_location.get.coordinates',
      'vehicle_location.coordinates',
      'location.get.location',
      'location',
    ]);
    const latitude = locationVal && typeof locationVal === 'object'
      ? Number(locationVal.latitude ?? locationVal.lat ?? NaN)
      : NaN;
    const longitude = locationVal && typeof locationVal === 'object'
      ? Number(locationVal.longitude ?? locationVal.lng ?? NaN)
      : NaN;

    return {
      messageId, vin: vin ?? '', hmVehicleId, topic,
      messageTimestamp: messageTimestamp.toISOString(),
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      speedKmh: getNum([
        'vehicle_status.get.speed',
        'vehicle_speed.get.vehicle_speed',
        'vehicle_speed',
      ]),
      ignitionOn: (() => {
        const v = getVal([
          'vehicle_status.get.ignition',
          'ignition.get.status',
          'ignition.status',
          'ignition_status',
        ]);
        if (v === null || v === undefined) return null;
        if (typeof v === 'boolean') return v;
        if (typeof v === 'string') return ['on', 'true', 'accessory', 'running'].includes(v.toLowerCase());
        return Boolean(v);
      })(),
      odometerId: getNum([
        'diagnostics.get.odometer',
        'odometer.get.mileage',
        'odometer.mileage',
        'odometer',
      ]),
      fuelLevelPercent: getNum([
        'diagnostics.get.fuel_level',
        'fueling.get.fuel_level',
        'fueling.fuel_level',
        'fuel_level',
      ]),
      batteryVoltage: getNum([
        'diagnostics.get.battery_voltage',
        'diagnostics.battery_voltage',
        'battery_voltage',
      ]),
      engineCoolantTemperatureC: getNum([
        'diagnostics.get.engine_coolant_temperature',
        'diagnostics.engine_coolant_temperature',
        'engine_coolant_temperature',
      ]),
      rawSignals: props,
    };
  }

  private buildSummary(dto: HmNormalizedTelemetryDto): Record<string, unknown> {
    const s: Record<string, unknown> = { messageId: dto.messageId, vin: dto.vin };
    if (dto.latitude !== null) s.lat = dto.latitude;
    if (dto.longitude !== null) s.lng = dto.longitude;
    if (dto.speedKmh !== null) s.speedKmh = dto.speedKmh;
    if (dto.ignitionOn !== null) s.ignition = dto.ignitionOn;
    return s;
  }

  private async upsertLatestHealthState(
    vin: string,
    hmVehicleId: string | null,
    messageId: string,
    receivedAt: Date,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const props = (payload?.data ?? payload?.properties ?? {}) as Record<string, any>;
    const getSignal = (key: string, aliases: string[] = []): unknown =>
      resolveHmSignalEntry(payload, key, aliases);

    const toBooleanOrNull = (entry: unknown): boolean | null => {
      const value = extractHmSignalValue(entry);
      return value === null || value === undefined ? null : Boolean(value);
    };

    const toFiniteNumberOrNull = (entry: unknown): number | null => {
      const value = extractHmSignalValue(entry);
      if (value === null || value === undefined) return null;
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    const oilSig = getSignal('diagnostics.get.engine_oil_level', ['diagnostics.engine_oil_level', 'engine_oil_level']);
    const limpSig = getSignal('engine.get.limp_mode', ['engine.limp_mode', 'limp_mode']);
    const brakeSig = getSignal('diagnostics.get.brake_lining_wear_pre_warning', ['diagnostics.brake_lining_wear_pre_warning', 'brake_lining_wear_pre_warning']);
    const tirePressureStatuses = getSignal('diagnostics.get.tire_pressure_statuses', ['diagnostics.tire_pressure_statuses', 'tire_pressure_statuses']);
    const tirePressures = getSignal('diagnostics.get.tire_pressures', ['diagnostics.tire_pressures', 'tire_pressures']);
    const dashboardLights = getSignal('dashboard_lights.get.dashboard_lights', ['dashboard_lights.dashboard_lights']);
    const distanceSig = getSignal('maintenance.get.distance_to_next_service', ['maintenance.distance_to_next_service', 'distance_to_next_service']);
    const timeSig = getSignal('maintenance.get.time_to_next_service', ['maintenance.time_to_next_service', 'time_to_next_service']);

    const oilPayload = extractHmSignalData(oilSig);
    // Tire payloads need the shared normalizer so we persist canonical
    // { frontLeft, frontRight, rearLeft, rearRight } objects regardless of
    // whether the wire format is the new MQTT V2 per-wheel array or the
    // legacy keyed object. Otherwise we wrote a single `{ location, pressure }`
    // blob (first wheel only) into tirePressuresJson.
    const normalizedTirePressures = tirePressures != null ? normalizeHmTirePressures(tirePressures) : null;
    const normalizedTireStatuses =
      tirePressureStatuses != null ? normalizeHmTirePressureStatuses(tirePressureStatuses) : null;
    const tirePressuresPayload = normalizedTirePressures
      ? {
          frontLeft: normalizedTirePressures.frontLeft,
          frontRight: normalizedTirePressures.frontRight,
          rearLeft: normalizedTirePressures.rearLeft,
          rearRight: normalizedTirePressures.rearRight,
          unit: normalizedTirePressures.unit,
        }
      : null;
    const tirePressureStatusesPayload = normalizedTireStatuses
      ? {
          frontLeft: normalizedTireStatuses.frontLeft,
          frontRight: normalizedTireStatuses.frontRight,
          rearLeft: normalizedTireStatuses.rearLeft,
          rearRight: normalizedTireStatuses.rearRight,
        }
      : null;
    const dashboardLightsPayload = extractHmSignalData(dashboardLights);
    const brakeLiningPreWarning = toBooleanOrNull(brakeSig);
    const engineLimpMode = toBooleanOrNull(limpSig);
    const distanceToNextServiceKm = toFiniteNumberOrNull(distanceSig);
    const timeToNextServiceDays = toFiniteNumberOrNull(timeSig);

    // Read current row so we can merge incoming deltas instead of overwriting
    // with null for every signal the current message didn't carry.
    const existing = await (this.prisma as any).hmLatestHealthState.findUnique({
      where: { uq_hm_latest_health_vin_app: { vin, appContainerType: 'HM_HEALTH_APP' } },
    }).catch(() => null);

    const mergedTirePressures = tirePressuresPayload
      ? {
          ...(existing?.tirePressuresJson ?? {}),
          ...Object.fromEntries(Object.entries(tirePressuresPayload).filter(([, v]) => v !== null)),
        }
      : existing?.tirePressuresJson ?? null;

    const mergedTireStatuses = tirePressureStatusesPayload
      ? {
          ...(existing?.tirePressureStatusesJson ?? {}),
          ...Object.fromEntries(Object.entries(tirePressureStatusesPayload).filter(([, v]) => v !== null)),
        }
      : existing?.tirePressureStatusesJson ?? null;

    // Preserve the accumulated raw signals map so we keep evidence of all past
    // capability groups — a single MQTT message only carries one group.
    const prevRaw = (existing?.rawSignalsJson as Record<string, any> | null) ?? {};
    const mergedRaw = capRawPayload({ ...prevRaw, ...props });

    await (this.prisma as any).hmLatestHealthState.upsert({
      where: { uq_hm_latest_health_vin_app: { vin, appContainerType: 'HM_HEALTH_APP' } },
      create: {
        vin, appContainerType: 'HM_HEALTH_APP', hmVehicleId, lastMessageId: messageId, lastReceivedAt: receivedAt,
        dashboardLightsJson: dashboardLightsPayload ?? undefined,
        brakeLiningPreWarning: brakeLiningPreWarning ?? undefined,
        engineLimpMode: engineLimpMode ?? undefined,
        engineOilLevelJson: oilPayload ?? undefined,
        distanceToNextServiceKm: distanceToNextServiceKm ?? undefined,
        timeToNextServiceDays: timeToNextServiceDays ?? undefined,
        tirePressureStatusesJson: mergedTireStatuses ?? undefined,
        tirePressuresJson: mergedTirePressures ?? undefined,
        rawSignalsJson: mergedRaw as any,
      },
      update: {
        hmVehicleId: hmVehicleId ?? undefined, lastMessageId: messageId, lastReceivedAt: receivedAt,
        ...(dashboardLightsPayload !== null && dashboardLightsPayload !== undefined && { dashboardLightsJson: dashboardLightsPayload }),
        ...(brakeLiningPreWarning !== null && { brakeLiningPreWarning }),
        ...(engineLimpMode !== null && { engineLimpMode }),
        ...(oilPayload !== null && oilPayload !== undefined && { engineOilLevelJson: oilPayload }),
        ...(distanceToNextServiceKm !== null && { distanceToNextServiceKm }),
        ...(timeToNextServiceDays !== null && { timeToNextServiceDays }),
        ...(mergedTireStatuses !== null && { tirePressureStatusesJson: mergedTireStatuses }),
        ...(mergedTirePressures !== null && { tirePressuresJson: mergedTirePressures }),
        rawSignalsJson: mergedRaw as any,
      },
    });
  }

  private async persistLog(data: {
    messageId: string; topic: string; messageTimestamp: Date | null; ingestStatus: string;
    isDuplicate: boolean; payloadJson: Record<string, unknown> | null;
    normalizedSummaryJson: Record<string, unknown> | null; errorMessage: string | null;
    hmVehicleId: string | null; vin: string | null;
  }): Promise<void> {
    try {
      await this.prisma.highMobilityStreamSyncLog.create({
        data: {
          messageId: data.messageId, topic: data.topic,
          messageTimestamp: data.messageTimestamp ?? undefined,
          ingestStatus: data.ingestStatus as any, isDuplicate: data.isDuplicate,
          payloadJson: data.payloadJson ? (data.payloadJson as Prisma.InputJsonValue) : undefined,
          normalizedSummaryJson: data.normalizedSummaryJson ? (data.normalizedSummaryJson as Prisma.InputJsonValue) : undefined,
          errorMessage: data.errorMessage ?? undefined,
          highMobilityVehicleId: data.hmVehicleId ?? undefined,
          vin: data.vin ?? undefined,
          appContainerType: 'HM_HEALTH_APP',
        },
      });
    } catch (err: any) {
      this.logger.warn(`[HM Health-APP] Failed to persist log for ${data.messageId}: ${err?.message}`);
    }
  }
}
