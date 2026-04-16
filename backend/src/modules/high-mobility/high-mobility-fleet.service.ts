import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { HighMobilityHealthAppAuthService } from './high-mobility-health-app-auth.service';
import { HighMobilityAppConfigService } from './high-mobility-app-config.service';
import type {
  CreateHmVehicleDto,
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
import { HmSignalUsageService } from './high-mobility-signal-usage.service';
import { extractHmProviderVehicleReference, isUsableHmCommandVehicleReference } from './high-mobility-vehicle-reference.util';
import { normalizeToHmBrand, getFleetClearanceTags } from './high-mobility-oem-routing';

/**
 * HighMobilityFleetService
 *
 * Fleet management for HM Health-APP (HEALTH package vehicles, DIMO+HM add-on path).
 * Uses HM_HEALTH_APP_* credentials only.
 */
@Injectable()
export class HighMobilityFleetService {
  private readonly logger = new Logger(HighMobilityFleetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: HighMobilityHealthAppAuthService,
    private readonly hmConfig: HighMobilityAppConfigService,
    private readonly hmSignalUsage: HmSignalUsageService,
  ) {}

  private get baseUrl(): string {
    return this.hmConfig.healthApp.apiBaseUrl;
  }
  private get timeout(): number {
    return this.hmConfig.healthApp.requestTimeoutMs;
  }

  // ── Vehicle list ───────────────────────────────────────────────────────────

  async listVehicles(filters?: {
    packageType?: HmPackageType;
    clearanceStatus?: HmClearanceStatus;
    sourceMode?: HmSourceMode;
    brand?: string;
    eligibilityStatus?: HmEligibilityStatus;
  }): Promise<HmVehicleListDto> {
    const where: Record<string, any> = { isActive: true };
    if (filters?.packageType) where.packageType = filters.packageType;
    if (filters?.clearanceStatus) where.clearanceStatus = filters.clearanceStatus;
    if (filters?.sourceMode) where.sourceMode = filters.sourceMode;
    if (filters?.brand) where.brand = { contains: filters.brand, mode: 'insensitive' };
    if (filters?.eligibilityStatus) where.eligibilityStatus = filters.eligibilityStatus;

    const records = await this.prisma.highMobilityVehicle.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const health = records.filter(r => r.packageType === 'HEALTH').map(this.mapToDto);
    const fullTelemetry = records.filter(r => r.packageType === 'FULL_TELEMETRY').map(this.mapToDto);

    return { health, fullTelemetry, total: records.length };
  }

  async findById(id: string): Promise<HmVehicleDto> {
    const record = await this.prisma.highMobilityVehicle.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`HM vehicle ${id} not found`);
    return this.mapToDto(record);
  }

  // ── Create + clearance flow ────────────────────────────────────────────────

  async createVehicle(dto: CreateHmVehicleDto): Promise<HmVehicleDto> {
    const { vin, brand, packageType, sourceMode = 'DIMO_PLUS_HM', organizationId } = dto;

    // Duplicate guard: one active record per VIN + package + sourceMode
    const existing = await this.prisma.highMobilityVehicle.findFirst({
      where: { vin, packageType: packageType as any, sourceMode: sourceMode as any, isActive: true },
    });
    if (existing) {
      throw new ConflictException(
        `An active HM vehicle record already exists for VIN ${vin} with package ${packageType}`,
      );
    }

    const record = await this.prisma.highMobilityVehicle.create({
      data: {
        vin,
        brand,
        packageType: packageType as any,
        sourceMode: sourceMode as any,
        organizationId: organizationId ?? null,
        clearanceStatus: 'DRAFT',
        eligibilityStatus: 'UNKNOWN',
      },
    });

    // Write initial status history
    await this.writeHistory(record.id, 'CREATED', null, 'DRAFT', null);

    // Attempt to trigger clearance request
    await this.requestClearance(record.id);

    const updated = await this.prisma.highMobilityVehicle.findUnique({ where: { id: record.id } });
    return this.mapToDto(updated!);
  }

  async refreshStatus(id: string): Promise<HmVehicleDto> {
    const record = await this.prisma.highMobilityVehicle.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`HM vehicle ${id} not found`);

    await this.pullClearanceStatus(id, record.vin, record.hmVehicleReference ?? null);
    const updated = await this.prisma.highMobilityVehicle.findUnique({ where: { id } });
    return this.mapToDto(updated!);
  }

  async removeVehicle(id: string): Promise<void> {
    const record = await this.prisma.highMobilityVehicle.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`HM vehicle ${id} not found`);

    const oldStatus = record.clearanceStatus as string;

    // Attempt provider revocation if approved
    if (record.clearanceStatus === 'APPROVED') {
      await this.revokeClearance(id, record.vin);
    }

    // Write audit entry before deletion
    await this.writeHistory(id, 'REMOVED', oldStatus, 'DELETED', null);

    // Deactivate any data source links that reference this HM record.
    // Must be done before hard delete to satisfy FK constraint.
    await this.prisma.vehicleDataSourceLink.deleteMany({
      where: { sourceReferenceId: id },
    });

    // Hard delete the HM vehicle record.
    // Cascades automatically: status_history, health_sync_logs, signal_group_states.
    // stream_sync_logs are SET NULL (preserving message audit trail).
    //
    // Reason for hard delete instead of soft delete (isActive=false):
    // The unique constraint @@unique([vin, packageType, sourceMode, isActive]) prevents
    // more than one inactive record per VIN+package+sourceMode combination.
    // Soft-deleting a second record for the same VIN would always fail with
    // "Unique constraint failed". Hard delete avoids this and allows re-registration.
    await this.prisma.highMobilityVehicle.delete({ where: { id } });

    this.logger.log(`HM vehicle ${id} (VIN=${record.vin}) permanently removed`);
  }

  // ── Provider calls ─────────────────────────────────────────────────────────

  // ── Provider calls (corrected per HM API spec) ────────────────────────────
  //
  // HM Fleet Clearance API:
  //   POST /v1/fleets/vehicles → body: { vehicles: [{ vin, brand }] }
  //                              response: { vehicles: [{ vin, status, description?, tags? }] }
  //   GET  /v1/fleets/vehicles/{vin}  → { vin, status, brand, changelog }
  //   DELETE /v1/fleets/vehicles/{vin} → { vin, status: "revoking"|"canceling" }
  //   Status values: pending, approved, rejected, revoking, revoked, canceling, canceled, error

  private async requestClearance(id: string): Promise<void> {
    const record = await this.prisma.highMobilityVehicle.findUnique({ where: { id } });
    if (!record) return;

    const headers = await this.authService.authHeaders();
    if (!headers) {
      this.logger.warn(`HM not configured — clearance request skipped for ${id}`);
      return;
    }

    const oldStatus = record.clearanceStatus as string;
    const hmBrand = normalizeToHmBrand(record.brand);
    const tags = getFleetClearanceTags(record.brand);

    // Build vehicle entry — include OEM-specific tags for VW Group brands.
    const vehicleEntry: Record<string, unknown> = { vin: record.vin, brand: hmBrand };
    if (tags) vehicleEntry['tags'] = tags;

    const requestPayload: { vehicles: Record<string, unknown>[] } = {
      vehicles: [vehicleEntry],
    };

    // Diagnostic log to verify brand routing payload (especially VW Group tags).
    this.logger.log(
      `HM clearance payload for ${record.vin}: ${JSON.stringify(requestPayload)}`,
    );

    try {
      const res = await axios.post(
        `${this.baseUrl}/v1/fleets/vehicles`,
        requestPayload,
        { headers, timeout: this.timeout },
      );

      const raw = res.data as { vehicles?: any[] };
      const vehicleResult = raw?.vehicles?.[0] ?? {};
      const providerStatus = vehicleResult?.status ?? 'pending';
      const newStatus = this.normalizeClearanceStatus({ status: providerStatus });
      const providerVehicleReference = extractHmProviderVehicleReference(vehicleResult, record.vin);

      await this.prisma.highMobilityVehicle.update({
        where: { id },
        data: {
          clearanceStatus: newStatus as any,
          clearanceRequestedAt: new Date(),
          hmVehicleReference:
            providerVehicleReference ??
            (isUsableHmCommandVehicleReference(record.hmVehicleReference, record.vin)
              ? record.hmVehicleReference
              : null),
          providerPayloadJson: {
            ...((record.providerPayloadJson as Record<string, unknown>) ?? {}),
            clearanceRequestPayload: requestPayload,
            clearanceRequest: vehicleResult,
          } as Prisma.InputJsonValue,
        },
      });
      await this.writeHistory(id, 'CLEARANCE_REQUESTED', oldStatus, newStatus, vehicleResult);
      this.logger.log(`HM clearance requested for ${record.vin}: provider status=${providerStatus} → ${newStatus}`);

      if (newStatus === 'APPROVED' && oldStatus !== 'APPROVED') {
        void this.hmSignalUsage.refreshAllSignalGroupsIfHmHealthLinked(id).catch((e: Error) =>
          this.logger.warn(`Post-approval HM signal poll failed (${record.vin}): ${e?.message}`),
        );
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      this.logger.error(
        `HM clearance request failed for ${record.vin} [${status}] payload=${JSON.stringify(
          requestPayload,
        )} response=${JSON.stringify(body)}`,
      );
      await this.prisma.highMobilityVehicle.update({
        where: { id },
        data: { clearanceStatus: 'ERROR' as any },
      });
      await this.writeHistory(id, 'CLEARANCE_REQUEST_FAILED', oldStatus, 'ERROR', {
        error: err?.message, status, body,
      });
    }
  }

  private async pullClearanceStatus(
    id: string,
    vin: string,
    _hmRef: string | null,
  ): Promise<void> {
    const headers = await this.authService.authHeaders();
    if (!headers) {
      this.logger.warn(`Cannot refresh HM status — no auth token for ${vin}`);
      return;
    }

    const record = await this.prisma.highMobilityVehicle.findUnique({ where: { id } });
    if (!record) return;
    const oldStatus = record.clearanceStatus as string;

    try {
      // HM Fleet API: GET /v1/fleets/vehicles/{vin}
      const res = await axios.get(`${this.baseUrl}/v1/fleets/vehicles/${encodeURIComponent(vin)}`, {
        headers,
        timeout: this.timeout,
      });
      const raw = res.data as Record<string, unknown>;
      const newStatus = this.normalizeClearanceStatus(raw);
      const providerVehicleReference = extractHmProviderVehicleReference(raw, vin);

      await this.prisma.highMobilityVehicle.update({
        where: { id },
        data: {
          clearanceStatus: newStatus as any,
          clearanceLastCheckedAt: new Date(),
          hmVehicleReference:
            providerVehicleReference ??
            (isUsableHmCommandVehicleReference(record.hmVehicleReference, vin)
              ? record.hmVehicleReference
              : null),
          ...(newStatus === 'APPROVED' && !record.clearanceApprovedAt
            ? { clearanceApprovedAt: new Date() }
            : {}),
          providerPayloadJson: {
            ...((record.providerPayloadJson as Record<string, unknown>) ?? {}),
            clearanceStatus: raw,
          } as Prisma.InputJsonValue,
        },
      });

      if (oldStatus !== newStatus) {
        await this.writeHistory(id, 'STATUS_CHANGED', oldStatus, newStatus, raw);
      }
      this.logger.log(`HM status refreshed for ${vin}: ${oldStatus} → ${newStatus}`);

      if (newStatus === 'APPROVED' && oldStatus !== 'APPROVED') {
        void this.hmSignalUsage.refreshAllSignalGroupsIfHmHealthLinked(id).catch((e: Error) =>
          this.logger.warn(`Post-approval HM signal poll failed (${vin}): ${e?.message}`),
        );
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        this.logger.warn(`HM status refresh: VIN ${vin} not found at provider (404) — clearance may not have been submitted`);
      } else {
        this.logger.error(`HM status refresh failed for ${vin} [${status}]: ${err?.message}`);
      }
    }
  }

  private async revokeClearance(id: string, vin: string): Promise<void> {
    const headers = await this.authService.authHeaders();
    if (!headers) return;

    try {
      // HM Fleet API: DELETE /v1/fleets/vehicles/{vin}
      const res = await axios.delete(`${this.baseUrl}/v1/fleets/vehicles/${encodeURIComponent(vin)}`, {
        headers,
        timeout: this.timeout,
      });
      const raw = res.data as Record<string, unknown>;
      const providerStatus = String(raw?.status ?? 'revoking').toLowerCase();
      const newStatus: string = providerStatus === 'canceling' ? 'REVOKING' : 'REVOKING';

      await this.prisma.highMobilityVehicle.update({
        where: { id },
        data: { clearanceStatus: newStatus as any },
      });
      this.logger.log(`HM clearance revocation initiated for ${vin}: provider=${providerStatus}`);
    } catch (err: any) {
      const httpStatus = err?.response?.status;

      if (httpStatus === 409) {
        // 409 = "Clearance is already removed" (rejected/canceled/revoked by provider)
        // Treat as already done — mark as canceled in our records
        this.logger.log(`HM revocation 409 for ${vin} — clearance already removed at provider, marking CANCELED`);
        await this.prisma.highMobilityVehicle.update({
          where: { id },
          data: { clearanceStatus: 'CANCELED' as any },
        });
      } else {
        this.logger.warn(`HM revocation failed for ${vin} [${httpStatus}]: ${err?.message} — marking REVOKING`);
        await this.prisma.highMobilityVehicle.update({
          where: { id },
          data: { clearanceStatus: 'REVOKING' as any },
        });
      }
    }
  }

  // ── Status normalization ───────────────────────────────────────────────────

  /**
   * Map HM provider status values to internal HmClearanceStatus.
   * HM status values: approved, pending, rejected, revoking, revoked, canceling, canceled, error
   */
  private normalizeClearanceStatus(raw: Record<string, unknown>): HmClearanceStatus {
    const s = String(raw?.status || '').toLowerCase().trim();
    if (s === 'approved') return 'APPROVED';
    if (s === 'rejected') return 'REJECTED';
    if (s === 'pending') return 'CLEARANCE_PENDING';
    if (s === 'revoking') return 'REVOKING';
    if (s === 'revoked') return 'REVOKED';
    if (s === 'canceling') return 'REVOKING';  // treat canceling as revoking in our model
    if (s === 'canceled') return 'CANCELED';
    if (s === 'error') return 'ERROR';
    if (s === 'draft' || s === '') return 'DRAFT';
    // Fallback for unexpected values
    this.logger.warn(`Unknown HM clearance status: "${s}" — defaulting to CLEARANCE_PENDING`);
    return 'CLEARANCE_PENDING';
  }

  // ── Status history helper ──────────────────────────────────────────────────

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
      this.logger.warn(`Failed to write HM status history: ${err?.message}`);
    }
  }

  // ── Status history query ───────────────────────────────────────────────────

  async getStatusHistory(hmVehicleId: string) {
    return this.prisma.highMobilityStatusHistory.findMany({
      where: { highMobilityVehicleId: hmVehicleId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ── DTO mapper ─────────────────────────────────────────────────────────────

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
    // Phase 2 fields
    registrationState: (r.registrationState ?? 'NOT_REGISTERED') as HmRegistrationState,
    registeredAt: r.registeredAt?.toISOString() ?? null,
    streamingState: (r.streamingState ?? 'NOT_CONFIGURED') as HmStreamingState,
    providerMode: r.providerMode ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  });
}
