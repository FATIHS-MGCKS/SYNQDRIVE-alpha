import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { HmNormalizedTelemetryDto, HmStreamSyncLogDto } from './dto/high-mobility.dto';

/**
 * HighMobilityTelemetryAppIngestionService
 *
 * Ingests raw MQTT messages from the HM Telemetry-APP consumer.
 * Scope: FULL_TELEMETRY package vehicles with appContainerType = HM_TELEMETRY_APP.
 *
 * DOMAIN RULE: Store and stage only. Telemetry data is routed for further processing
 * by HighMobilityTelemetryRoutingService but never pushed directly into health/trip engines.
 */
@Injectable()
export class HighMobilityTelemetryAppIngestionService {
  private readonly logger = new Logger(HighMobilityTelemetryAppIngestionService.name);

  constructor(private readonly prisma: PrismaService) {}

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
      this.logger.debug(`[HM Telemetry-APP] Duplicate message_id ${messageId} — skipping`);
      return null;
    }

    let parsedPayload: Record<string, unknown> | null = null;
    try {
      const raw = typeof payload === 'string' ? payload : payload.toString('utf-8');
      parsedPayload = JSON.parse(raw);
    } catch (err: any) {
      this.logger.warn(`[HM Telemetry-APP] Failed to parse payload for ${messageId}: ${err?.message}`);
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
            packageType: 'FULL_TELEMETRY',
            OR: [{ appContainerType: 'HM_TELEMETRY_APP' }, { appContainerType: null }],
          },
        }).catch(() => null)
      : null;

    const normalized = this.normalizePayload(messageId, vin, hmRecord?.id ?? null, topic, messageTimestamp, parsedPayload ?? {});

    await this.persistLog({
      messageId, topic, messageTimestamp, ingestStatus: 'STORED', isDuplicate: false,
      payloadJson: parsedPayload, normalizedSummaryJson: this.buildSummary(normalized),
      errorMessage: null, hmVehicleId: hmRecord?.id ?? null, vin,
    });

    if (vin) {
      await this.upsertLatestTelemetryState(vin, hmRecord?.id ?? null, messageId, receivedAt, normalized).catch(err =>
        this.logger.warn(`[HM Telemetry-APP] Failed to upsert latest telemetry state for VIN ${vin}: ${err?.message}`),
      );
    }

    if (hmRecord) {
      this.logger.debug(`[HM Telemetry-APP] Message for VIN=${vin} linked to ${hmRecord.id}`);
    } else if (vin) {
      this.logger.debug(`[HM Telemetry-APP] Message for VIN=${vin} — no approved FULL_TELEMETRY record found`);
    }

    return normalized;
  }

  async getStreamLogs(params?: { limit?: number; offset?: number; hmVehicleId?: string; vin?: string; ingestStatus?: string }): Promise<{ data: HmStreamSyncLogDto[]; total: number }> {
    const where: any = { appContainerType: 'HM_TELEMETRY_APP' };
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
    // Topic structure: live/level13/<app_id>/<vin>/...
    // App-level management messages have only 3 segments (no VIN segment).
    // VIN is always at index 3; index 2 is the app UUID — skip it.
    const parts = topic.split('/');
    if (parts.length >= 4) {
      const candidate = parts[3];
      if (candidate && candidate.length >= 10 && !HighMobilityTelemetryAppIngestionService.UUID_PATTERN.test(candidate)) {
        return candidate.toUpperCase();
      }
    }
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
    const props = (payload?.properties ?? payload?.data ?? {}) as Record<string, any>;
    const getVal = (keys: string[]): any => {
      for (const k of keys) {
        const v = props[k];
        if (v !== undefined && v !== null) return typeof v === 'object' ? v?.value : v;
      }
      return null;
    };
    return {
      messageId, vin: vin ?? '', hmVehicleId, topic,
      messageTimestamp: messageTimestamp.toISOString(),
      latitude: getVal(['location.get.location', 'location']) ? Number(getVal(['location.get.location', 'location'])?.latitude ?? null) : null,
      longitude: getVal(['location.get.location', 'location']) ? Number(getVal(['location.get.location', 'location'])?.longitude ?? null) : null,
      speedKmh: getVal(['vehicle_speed.get.vehicle_speed', 'vehicle_speed']) !== null ? Number(getVal(['vehicle_speed.get.vehicle_speed', 'vehicle_speed'])) : null,
      ignitionOn: getVal(['ignition.get.status', 'ignition_status']) !== null ? Boolean(getVal(['ignition.get.status', 'ignition_status'])) : null,
      odometerId: getVal(['odometer.get.mileage', 'odometer']) !== null ? Number(getVal(['odometer.get.mileage', 'odometer'])) : null,
      fuelLevelPercent: getVal(['fueling.get.fuel_level', 'fuel_level']) !== null ? Number(getVal(['fueling.get.fuel_level', 'fuel_level'])) : null,
      batteryVoltage: getVal(['diagnostics.get.battery_voltage', 'battery_voltage']) !== null ? Number(getVal(['diagnostics.get.battery_voltage', 'battery_voltage'])) : null,
      engineCoolantTemperatureC: getVal(['diagnostics.get.engine_coolant_temperature', 'engine_coolant_temperature']) !== null ? Number(getVal(['diagnostics.get.engine_coolant_temperature', 'engine_coolant_temperature'])) : null,
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

  private async upsertLatestTelemetryState(
    vin: string,
    hmVehicleId: string | null,
    messageId: string,
    receivedAt: Date,
    normalized: HmNormalizedTelemetryDto,
  ): Promise<void> {
    const base = {
      hmVehicleId: hmVehicleId ?? undefined, lastMessageId: messageId, lastReceivedAt: receivedAt,
      latitude: normalized.latitude ?? undefined, longitude: normalized.longitude ?? undefined,
      speedKmh: normalized.speedKmh ?? undefined, ignitionOn: normalized.ignitionOn ?? undefined,
      odometerKm: normalized.odometerId ?? undefined,
      fuelLevelPercent: normalized.fuelLevelPercent ?? undefined,
      batteryVoltage: normalized.batteryVoltage ?? undefined,
      rawSignalsJson: normalized.rawSignals as any ?? undefined,
    };
    await (this.prisma as any).hmLatestTelemetryState.upsert({
      where: { uq_hm_latest_telemetry_vin_app: { vin, appContainerType: 'HM_TELEMETRY_APP' } },
      create: { vin, appContainerType: 'HM_TELEMETRY_APP', ...base },
      update: base,
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
          appContainerType: 'HM_TELEMETRY_APP',
        },
      });
    } catch (err: any) {
      this.logger.warn(`[HM Telemetry-APP] Failed to persist log for ${data.messageId}: ${err?.message}`);
    }
  }
}
