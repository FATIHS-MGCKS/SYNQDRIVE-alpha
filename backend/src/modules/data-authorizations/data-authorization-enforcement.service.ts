import { Injectable } from '@nestjs/common';
import {
  DataAuthorizationProcessorType,
  DataAuthorizationSourceType,
  OrgDataAuthorization,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DataAuthorizationDeniedException } from './data-authorization.exceptions';
import { normalizeDataCategories } from './data-authorization-risk.util';

export interface AssertDataAuthorizationParams {
  orgId: string;
  vehicleId?: string;
  customerId?: string;
  bookingId?: string;
  sourceType: DataAuthorizationSourceType | string;
  dataCategory: string;
  purpose: string;
  processorType?: DataAuthorizationProcessorType | string;
  /** When true, increments accessCount / lastAccessAt on success. */
  trackAccess?: boolean;
}

type AuthorizationRow = OrgDataAuthorization;

/**
 * Enforcement layer for org-level data consent records.
 *
 * Integration status (2026-06):
 * - WIRED: VehiclesService.getLiveGps (DIMO / GPS_LOCATION / LIVE_MAP)
 * - TODO: DIMO telemetry ingestion workers — TELEMETRY_DATA before persist
 * - TODO: Trip behavior enrichment — TRIP_DATA / DRIVING_BEHAVIOR
 * - TODO: Vehicle health signal reads — HEALTH_SIGNALS / DTC_CODES
 * - TODO: Alerts pipeline — ALERTS purpose
 * - TODO: Misuse-case aggregator — ABUSE_MISUSE_DETECTION
 * Use isAuthorized() for gradual rollout; assertDataAuthorization() for hard enforcement.
 */
@Injectable()
export class DataAuthorizationEnforcementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifies an active, non-expired org authorization covers the requested access.
   * Throws {@link DataAuthorizationDeniedException} when denied.
   */
  async assertDataAuthorization(
    params: AssertDataAuthorizationParams,
  ): Promise<AuthorizationRow> {
    const match = await this.findMatchingAuthorization(params);
    if (!match) {
      throw new DataAuthorizationDeniedException(
        'No active data authorization covers this access',
        'DATA_AUTHORIZATION_DENIED',
        {
          orgId: params.orgId,
          sourceType: params.sourceType,
          dataCategory: params.dataCategory,
          purpose: params.purpose,
          vehicleId: params.vehicleId,
        },
      );
    }

    if (params.trackAccess) {
      await this.prisma.orgDataAuthorization.update({
        where: { id: match.id },
        data: {
          accessCount: { increment: 1 },
          lastAccessAt: new Date(),
        },
      });
    }

    return match;
  }

  /** Non-throwing check for gradual rollout in read paths. */
  async isAuthorized(params: AssertDataAuthorizationParams): Promise<boolean> {
    const match = await this.findMatchingAuthorization(params);
    return !!match;
  }

  private async findMatchingAuthorization(
    params: AssertDataAuthorizationParams,
  ): Promise<AuthorizationRow | null> {
    const now = new Date();
    const normalizedCategory = normalizeDataCategories([
      params.dataCategory,
    ])[0];

    const rows = await this.prisma.orgDataAuthorization.findMany({
      where: {
        organizationId: params.orgId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        sourceType: params.sourceType as DataAuthorizationSourceType,
      },
    });

    for (const row of rows) {
      if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) continue;
      if (!this.coversProcessor(row, params.processorType)) continue;
      if (!this.coversCategory(row, normalizedCategory)) continue;
      if (!this.coversPurpose(row, params.purpose)) continue;
      if (!this.coversScope(row, params)) continue;
      return row;
    }

    return null;
  }

  private coversProcessor(
    row: AuthorizationRow,
    processorType?: string,
  ): boolean {
    if (!processorType) return true;
    if (!row.processorType) return true;
    return row.processorType === processorType;
  }

  private coversCategory(row: AuthorizationRow, category: string): boolean {
    const stored = this.jsonStringArray(row.dataCategories);
    const normalized = new Set(normalizeDataCategories(stored));
    return normalized.has(category);
  }

  private coversPurpose(row: AuthorizationRow, purpose: string): boolean {
    const purposes = this.resolvePurposes(row);
    if (purposes.length === 0) return true;
    return purposes.includes(purpose);
  }

  private coversScope(
    row: AuthorizationRow,
    params: AssertDataAuthorizationParams,
  ): boolean {
    switch (row.scope) {
      case 'ORGANIZATION':
        return true;
      case 'CONNECTED_VEHICLES': {
        if (!params.vehicleId) return false;
        const ids = this.jsonStringArray(row.vehicleIds);
        if (ids.length === 0) return false;
        return ids.includes(params.vehicleId);
      }
      case 'VEHICLE': {
        if (!params.vehicleId) return false;
        const ids = this.jsonStringArray(row.vehicleIds);
        return ids.includes(params.vehicleId);
      }
      case 'CUSTOMER': {
        if (!params.customerId) return false;
        const ids = this.jsonStringArray(row.customerIds);
        return ids.includes(params.customerId);
      }
      case 'BOOKING': {
        if (!params.bookingId) return false;
        const ids = this.jsonStringArray(row.bookingIds);
        return ids.includes(params.bookingId);
      }
      default:
        return false;
    }
  }

  private resolvePurposes(row: AuthorizationRow): string[] {
    const fromJson = this.jsonStringArray(row.purposes);
    if (fromJson.length > 0) return fromJson;
    return row.purpose ? [row.purpose] : [];
  }

  private jsonStringArray(value: Prisma.JsonValue | null | undefined): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string');
  }
}
