import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  HmNormalizedTelemetryDto,
  HmStreamSyncLogDto,
} from './dto/high-mobility.dto';

/**
 * Phase 2: HighMobilityTelemetryIngestionService
 *
 * Accepts raw MQTT messages, validates, deduplicates, normalizes, and persists.
 *
 * DOMAIN RULE: This service stores and stages data.
 * It does NOT push into existing calculation pipelines (Tire/Brake/Battery/Trip).
 * Full downstream activation is deferred to later phases.
 */
@Injectable()
export class HighMobilityTelemetryIngestionService {
  private readonly logger = new Logger(HighMobilityTelemetryIngestionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ingest a raw MQTT message from the High Mobility stream.
   * Returns normalized telemetry DTO or null if deduplicated/invalid.
   */
  async ingest(rawMessage: {
    messageId: string;
    topic: string;
    payload: Buffer | string;
    receivedAt: Date;
  }): Promise<HmNormalizedTelemetryDto | null> {
    const { messageId, topic, payload, receivedAt } = rawMessage;

    // Deduplicate by message_id
    const existing = await this.prisma.highMobilityStreamSyncLog.findUnique({
      where: { messageId },
    }).catch(() => null);

    if (existing) {
      this.logger.debug(`HM stream: duplicate message_id ${messageId} — skipping`);
      return null;
    }

    // Parse payload
    let parsedPayload: Record<string, unknown> | null = null;
    try {
      const raw = typeof payload === 'string' ? payload : payload.toString('utf-8');
      parsedPayload = JSON.parse(raw);
    } catch (err: any) {
      this.logger.warn(`HM stream: failed to parse payload for ${messageId}: ${err?.message}`);
      await this.persistLog({
        messageId, topic, messageTimestamp: null, ingestStatus: 'FAILED',
        isDuplicate: false, payloadJson: null, normalizedSummaryJson: null,
        errorMessage: `Parse failed: ${err?.message}`, hmVehicleId: null, vin: null,
      });
      return null;
    }

    // Extract VIN from topic or payload
    const vin = this.extractVin(topic, parsedPayload);
    const messageTimestamp = this.extractTimestamp(parsedPayload) ?? receivedAt;

    // Find linked HM vehicle by VIN
    const hmRecord = vin
      ? await this.prisma.highMobilityVehicle.findFirst({
          where: { vin, isActive: true, clearanceStatus: 'APPROVED' },
        }).catch(() => null)
      : null;

    // Normalize signals
    const normalized = this.normalizePayload(messageId, vin, hmRecord?.id ?? null, topic, messageTimestamp, parsedPayload ?? {});
    const normalizedSummary = this.buildNormalizedSummary(normalized);

    // Persist raw + normalized log
    await this.persistLog({
      messageId,
      topic,
      messageTimestamp,
      ingestStatus: 'STORED',
      isDuplicate: false,
      payloadJson: parsedPayload,
      normalizedSummaryJson: normalizedSummary,
      errorMessage: null,
      hmVehicleId: hmRecord?.id ?? null,
      vin,
    });

    // Update last_message_at on HM vehicle if found
    if (hmRecord) {
      this.logger.debug(`HM stream: message for VIN=${vin} linked to HM vehicle ${hmRecord.id}`);
    } else if (vin) {
      this.logger.debug(`HM stream: message for VIN=${vin} — no linked HM vehicle found`);
    }

    return normalized;
  }

  /** Get recent stream sync logs for admin inspection */
  async getStreamLogs(params?: {
    limit?: number;
    offset?: number;
    hmVehicleId?: string;
    vin?: string;
    ingestStatus?: string;
  }): Promise<{ data: HmStreamSyncLogDto[]; total: number }> {
    const where: any = {};
    if (params?.hmVehicleId) where.highMobilityVehicleId = params.hmVehicleId;
    if (params?.vin) where.vin = params.vin;
    if (params?.ingestStatus) where.ingestStatus = params.ingestStatus;

    const [logs, total] = await Promise.all([
      this.prisma.highMobilityStreamSyncLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params?.limit ?? 50,
        skip: params?.offset ?? 0,
        select: {
          id: true,
          highMobilityVehicleId: true,
          vin: true,
          messageId: true,
          topic: true,
          messageTimestamp: true,
          ingestStatus: true,
          isDuplicate: true,
          normalizedSummaryJson: true,
          errorMessage: true,
          createdAt: true,
        },
      }),
      this.prisma.highMobilityStreamSyncLog.count({ where }),
    ]);

    return {
      data: logs.map(l => ({
        id: l.id,
        highMobilityVehicleId: l.highMobilityVehicleId ?? null,
        vin: l.vin ?? null,
        messageId: l.messageId,
        topic: l.topic,
        messageTimestamp: l.messageTimestamp?.toISOString() ?? null,
        ingestStatus: l.ingestStatus as any,
        isDuplicate: l.isDuplicate,
        normalizedSummaryJson: l.normalizedSummaryJson as any ?? null,
        errorMessage: l.errorMessage ?? null,
        createdAt: l.createdAt.toISOString(),
      })),
      total,
    };
  }

  async getStreamLogById(id: string) {
    return this.prisma.highMobilityStreamSyncLog.findUnique({ where: { id } });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private extractVin(topic: string, payload: Record<string, unknown> | null): string | null {
    // HM MQTT topic format: <prefix>/<appId>/<vin>/<signalGroup>
    const parts = topic.split('/');
    // VIN is typically at index 2
    if (parts.length >= 3) {
      const candidate = parts[2];
      if (candidate && candidate.length >= 10) return candidate.toUpperCase();
    }
    // Fallback: check payload
    return (payload?.vin as string)?.toUpperCase() ?? (payload?.vehicleVin as string)?.toUpperCase() ?? null;
  }

  private extractTimestamp(payload: Record<string, unknown> | null): Date | null {
    if (!payload) return null;
    const ts = payload?.timestamp ?? payload?.messageTimestamp ?? payload?.created_at;
    if (!ts) return null;
    const d = new Date(ts as string);
    return isNaN(d.getTime()) ? null : d;
  }

  private normalizePayload(
    messageId: string,
    vin: string | null,
    hmVehicleId: string | null,
    topic: string,
    messageTimestamp: Date,
    payload: Record<string, unknown>,
  ): HmNormalizedTelemetryDto {
    // Best-effort signal extraction from HM payload structure.
    // HM messages typically: { properties: { [signalId]: { value, timestamp } } }
    const props = (payload?.properties ?? payload?.data ?? {}) as Record<string, any>;

    const getVal = (keys: string[]): any => {
      for (const k of keys) {
        const v = props[k];
        if (v !== undefined && v !== null) return typeof v === 'object' ? v?.value : v;
      }
      return null;
    };

    return {
      messageId,
      vin: vin ?? '',
      hmVehicleId,
      topic,
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

  private buildNormalizedSummary(dto: HmNormalizedTelemetryDto): Record<string, unknown> {
    const summary: Record<string, unknown> = { messageId: dto.messageId, vin: dto.vin };
    if (dto.latitude !== null) summary.lat = dto.latitude;
    if (dto.longitude !== null) summary.lng = dto.longitude;
    if (dto.speedKmh !== null) summary.speedKmh = dto.speedKmh;
    if (dto.ignitionOn !== null) summary.ignition = dto.ignitionOn;
    if (dto.odometerId !== null) summary.odo = dto.odometerId;
    if (dto.batteryVoltage !== null) summary.battV = dto.batteryVoltage;
    return summary;
  }

  private async persistLog(data: {
    messageId: string;
    topic: string;
    messageTimestamp: Date | null;
    ingestStatus: string;
    isDuplicate: boolean;
    payloadJson: Record<string, unknown> | null;
    normalizedSummaryJson: Record<string, unknown> | null;
    errorMessage: string | null;
    hmVehicleId: string | null;
    vin: string | null;
  }): Promise<void> {
    try {
      await this.prisma.highMobilityStreamSyncLog.create({
        data: {
          messageId: data.messageId,
          topic: data.topic,
          messageTimestamp: data.messageTimestamp ?? undefined,
          ingestStatus: data.ingestStatus as any,
          isDuplicate: data.isDuplicate,
          payloadJson: data.payloadJson ? (data.payloadJson as Prisma.InputJsonValue) : undefined,
          normalizedSummaryJson: data.normalizedSummaryJson ? (data.normalizedSummaryJson as Prisma.InputJsonValue) : undefined,
          errorMessage: data.errorMessage ?? undefined,
          highMobilityVehicleId: data.hmVehicleId ?? undefined,
          vin: data.vin ?? undefined,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to persist stream log for ${data.messageId}: ${err?.message}`);
    }
  }
}
