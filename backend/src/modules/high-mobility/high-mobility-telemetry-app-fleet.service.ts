import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { HighMobilityTelemetryAppAuthService } from './high-mobility-telemetry-app-auth.service';
import { HighMobilityAppConfigService } from './high-mobility-app-config.service';
import type {
  HmVehicleDto,
  HmVehicleListDto,
  HmClearanceStatus,
  HmPackageType,
  HmSourceMode,
  HmDeliveryMode,
  HmEligibilityStatus,
  HmRegistrationState,
  HmStreamingState,
} from './dto/high-mobility.dto';
import { getFleetClearanceTags, normalizeToHmBrand } from './high-mobility-oem-routing';

/**
 * HighMobilityTelemetryAppFleetService
 *
 * Fleet management for HM Telemetry-APP (FULL_TELEMETRY package vehicles).
 * Uses HM_TELEMETRY_APP_* credentials only.
 *
 * Approval lifecycle: eligibility → create clearance → CLEARANCE_PENDING → APPROVED
 * Once APPROVED, the vehicle becomes a candidate in the HM Telemetry tab.
 */
@Injectable()
export class HighMobilityTelemetryAppFleetService {
  private readonly logger = new Logger(HighMobilityTelemetryAppFleetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: HighMobilityTelemetryAppAuthService,
    private readonly hmConfig: HighMobilityAppConfigService,
  ) {}

  private get baseUrl(): string {
    return this.hmConfig.telemetryApp.apiBaseUrl;
  }
  private get timeout(): number {
    return this.hmConfig.telemetryApp.requestTimeoutMs;
  }

  // ── Vehicle list ───────────────────────────────────────────────────────────

  async listCandidates(filters?: {
    clearanceStatus?: HmClearanceStatus;
    sourceMode?: HmSourceMode;
  }): Promise<HmVehicleListDto> {
    const where: Record<string, any> = {
      isActive: true,
      packageType: 'FULL_TELEMETRY',
      appContainerType: 'HM_TELEMETRY_APP',
    };
    if (filters?.clearanceStatus) where.clearanceStatus = filters.clearanceStatus;
    if (filters?.sourceMode) where.sourceMode = filters.sourceMode;

    const records = await this.prisma.highMobilityVehicle.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return { health: [], fullTelemetry: records.map(this.mapToDto), total: records.length };
  }

  /** Return only APPROVED vehicles for the HM Telemetry registration candidate tab */
  async listApprovedCandidates(): Promise<HmVehicleDto[]> {
    const records = await this.prisma.highMobilityVehicle.findMany({
      where: {
        isActive: true,
        packageType: 'FULL_TELEMETRY',
        appContainerType: 'HM_TELEMETRY_APP',
        clearanceStatus: 'APPROVED',
      },
      orderBy: { clearanceApprovedAt: 'desc' },
    });
    return records.map(this.mapToDto);
  }

  async findById(id: string): Promise<HmVehicleDto> {
    const record = await this.prisma.highMobilityVehicle.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`HM Telemetry vehicle ${id} not found`);
    return this.mapToDto(record);
  }

  // ── Create + clearance flow ────────────────────────────────────────────────

  async createVehicle(dto: {
    vin: string;
    brand: string;
    sourceMode?: HmSourceMode;
    organizationId?: string;
  }): Promise<HmVehicleDto> {
    const { vin, brand, sourceMode = 'HM_ONLY', organizationId } = dto;

    const existing = await this.prisma.highMobilityVehicle.findFirst({
      where: { vin, packageType: 'FULL_TELEMETRY', isActive: true },
    });
    if (existing) {
      throw new ConflictException(`Active HM Telemetry-APP vehicle already exists for VIN ${vin}`);
    }

    const record = await this.prisma.highMobilityVehicle.create({
      data: {
        vin,
        brand,
        packageType: 'FULL_TELEMETRY' as any,
        sourceMode: sourceMode as any,
        appContainerType: 'HM_TELEMETRY_APP' as any,
        organizationId: organizationId ?? null,
        clearanceStatus: 'DRAFT' as any,
        eligibilityStatus: 'UNKNOWN' as any,
      },
    });

    await this.writeHistory(record.id, 'CREATED', null, 'DRAFT', null);
    await this.requestClearance(record.id);

    const updated = await this.prisma.highMobilityVehicle.findUnique({ where: { id: record.id } });
    return this.mapToDto(updated!);
  }

  async refreshStatus(id: string): Promise<HmVehicleDto> {
    const record = await this.prisma.highMobilityVehicle.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`HM Telemetry vehicle ${id} not found`);
    await this.pullClearanceStatus(id, record.vin);
    const updated = await this.prisma.highMobilityVehicle.findUnique({ where: { id } });
    return this.mapToDto(updated!);
  }

  // ── Provider calls ─────────────────────────────────────────────────────────

  private async requestClearance(id: string): Promise<void> {
    const record = await this.prisma.highMobilityVehicle.findUnique({ where: { id } });
    if (!record) return;

    const headers = await this.authService.authHeaders();
    if (!headers) {
      this.logger.warn(`[HM Telemetry-APP] Not configured — clearance skipped for ${id}`);
      return;
    }

    const oldStatus = record.clearanceStatus as string;
    const hmBrand = normalizeToHmBrand(record.brand);
    const tags = getFleetClearanceTags(record.brand);

    try {
      const res = await axios.post(
        `${this.baseUrl}/v1/fleets/vehicles`,
        { vehicles: [{ vin: record.vin, brand: hmBrand, ...(tags ? { tags } : {}) }] },
        { headers, timeout: this.timeout },
      );

      const vehicleResult = (res.data as any)?.vehicles?.[0] ?? {};
      const newStatus = this.normalizeClearanceStatus({ status: vehicleResult?.status ?? 'pending' });

      await this.prisma.highMobilityVehicle.update({
        where: { id },
        data: {
          clearanceStatus: newStatus as any,
          clearanceRequestedAt: new Date(),
          hmVehicleReference: record.vin,
          providerPayloadJson: {
            ...((record.providerPayloadJson as Record<string, unknown>) ?? {}),
            clearanceRequest: vehicleResult,
          } as Prisma.InputJsonValue,
        },
      });
      await this.writeHistory(id, 'CLEARANCE_REQUESTED', oldStatus, newStatus, vehicleResult);
      this.logger.log(`[HM Telemetry-APP] Clearance requested for ${record.vin}: → ${newStatus}`);
    } catch (err: any) {
      this.logger.error(`[HM Telemetry-APP] Clearance failed for ${record.vin}: ${err?.message}`);
      await this.prisma.highMobilityVehicle.update({
        where: { id },
        data: { clearanceStatus: 'ERROR' as any },
      });
      await this.writeHistory(id, 'CLEARANCE_REQUEST_FAILED', oldStatus, 'ERROR', { error: err?.message });
    }
  }

  private async pullClearanceStatus(id: string, vin: string): Promise<void> {
    const headers = await this.authService.authHeaders();
    if (!headers) return;

    const record = await this.prisma.highMobilityVehicle.findUnique({ where: { id } });
    if (!record) return;
    const oldStatus = record.clearanceStatus as string;

    try {
      const res = await axios.get(`${this.baseUrl}/v1/fleets/vehicles/${encodeURIComponent(vin)}`, {
        headers, timeout: this.timeout,
      });
      const raw = res.data as Record<string, unknown>;
      const newStatus = this.normalizeClearanceStatus(raw);

      await this.prisma.highMobilityVehicle.update({
        where: { id },
        data: {
          clearanceStatus: newStatus as any,
          clearanceLastCheckedAt: new Date(),
          ...(newStatus === 'APPROVED' && !record.clearanceApprovedAt ? { clearanceApprovedAt: new Date() } : {}),
        },
      });

      if (oldStatus !== newStatus) {
        await this.writeHistory(id, 'STATUS_CHANGED', oldStatus, newStatus, raw);
      }
      this.logger.log(`[HM Telemetry-APP] Status refreshed for ${vin}: ${oldStatus} → ${newStatus}`);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        this.logger.warn(`[HM Telemetry-APP] VIN ${vin} not found at provider (404)`);
      } else {
        this.logger.error(`[HM Telemetry-APP] Status refresh failed for ${vin}: ${err?.message}`);
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private normalizeClearanceStatus(raw: Record<string, unknown>): HmClearanceStatus {
    const s = String(raw?.status || '').toLowerCase().trim();
    if (s === 'approved') return 'APPROVED';
    if (s === 'rejected') return 'REJECTED';
    if (s === 'pending') return 'CLEARANCE_PENDING';
    if (s === 'revoking' || s === 'canceling') return 'REVOKING';
    if (s === 'revoked') return 'REVOKED';
    if (s === 'canceled') return 'CANCELED';
    if (s === 'error') return 'ERROR';
    return 'CLEARANCE_PENDING';
  }

  private async writeHistory(
    hmVehicleId: string,
    eventType: string,
    oldStatus: string | null,
    newStatus: string | null,
    payload: Record<string, unknown> | null,
  ): Promise<void> {
    try {
      await this.prisma.highMobilityStatusHistory.create({
        data: {
          highMobilityVehicleId: hmVehicleId,
          eventType,
          oldStatus,
          newStatus,
          payloadJson: payload ? (payload as Prisma.InputJsonValue) : undefined,
        },
      });
    } catch (err: any) {
      this.logger.warn(`[HM Telemetry-APP] Failed to write history: ${err?.message}`);
    }
  }

  async getStatusHistory(hmVehicleId: string) {
    return this.prisma.highMobilityStatusHistory.findMany({
      where: { highMobilityVehicleId: hmVehicleId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private mapToDto = (r: any): HmVehicleDto => ({
    id: r.id,
    organizationId: r.organizationId ?? null,
    synqdriveVehicleId: r.synqdriveVehicleId ?? null,
    vin: r.vin,
    brand: r.brand,
    packageType: r.packageType as HmPackageType,
    sourceMode: r.sourceMode as HmSourceMode,
    eligibilityStatus: r.eligibilityStatus as HmEligibilityStatus,
    eligibilityDeliveryMode: (r.eligibilityDeliveryMode as HmDeliveryMode) ?? null,
    eligibilityCheckedAt: r.eligibilityCheckedAt?.toISOString() ?? null,
    clearanceStatus: r.clearanceStatus as HmClearanceStatus,
    clearanceRequestedAt: r.clearanceRequestedAt?.toISOString() ?? null,
    clearanceApprovedAt: r.clearanceApprovedAt?.toISOString() ?? null,
    clearanceLastCheckedAt: r.clearanceLastCheckedAt?.toISOString() ?? null,
    hmVehicleReference: r.hmVehicleReference ?? null,
    isLinked: r.isLinked,
    linkedAt: r.linkedAt?.toISOString() ?? null,
    isActive: r.isActive,
    registrationState: (r.registrationState ?? 'NOT_REGISTERED') as HmRegistrationState,
    registeredAt: r.registeredAt?.toISOString() ?? null,
    streamingState: (r.streamingState ?? 'NOT_CONFIGURED') as HmStreamingState,
    providerMode: r.providerMode ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  });
}
